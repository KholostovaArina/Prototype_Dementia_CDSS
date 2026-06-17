from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

_ML = Path(__file__).resolve().parent.parent / "ml"
if str(_ML) not in sys.path:
    sys.path.insert(0, str(_ML))

from domain_scores import calculate_domain_preservation_pct, load_test_config  # noqa: E402
from predict import PREDICTION_HORIZON_YEARS, estimate_conversion_risk  # noqa: E402


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _parse_float(x: Any) -> Optional[float]:
    if x is None or x == "":
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def form_tests_to_model_columns(flat: Dict[str, Any]) -> Dict[str, float]:
    out: Dict[str, float] = {}

    pvpl = _parse_float(flat.get("12w_pvpl"))
    if pvpl is not None:
        out["двсловНВ"] = float(int(round(_clamp(pvpl * 12.0 / 24.0, 0.0, 12.0))))

    ovtot = _parse_float(flat.get("12w_ov"))
    if ovtot is not None:
        out["двсловОВ"] = float(int(round(_clamp(ovtot * 12.0 / 24.0, 0.0, 12.0))))

    nf = _parse_float(flat.get("5w_nv"))
    if nf is not None:
        out["пятьслНВ"] = nf
    nw = _parse_float(flat.get("5w_ov"))
    if nw is not None:
        out["пятьслОВ"] = nw

    clock = _parse_float(flat.get("clock"))
    if clock is not None:
        out["часы"] = _clamp(clock, 0.0, 10.0)

    cube = _parse_float(flat.get("cube"))
    if cube is not None:
        out["кубик"] = cube

    assoc_c = _parse_float(flat.get("assoc_c"))
    if assoc_c is not None:
        out["асс1"] = _clamp(assoc_c, 0.0, 20.0)

    assoc_animals = _parse_float(flat.get("assoc_animals"))
    if assoc_animals is not None:
        out["Асс2"] = _clamp(assoc_animals, 0.0, 20.0)

    benton = _parse_float(flat.get("benton_total"))
    if benton is not None:
        out["Бентон"] = benton

    graph = _parse_float(flat.get("graphomotor"))
    if graph is not None:
        out["забор"] = graph

    tmt = _parse_float(flat.get("tmt_a_seconds"))
    if tmt is not None:
        out["тмт1"] = _clamp(tmt, 0.0, 180.0)

    tmt_b = _parse_float(flat.get("тмтB") or flat.get("tmt_b_seconds"))
    if tmt_b is not None:
        out["тмт2"] = _clamp(tmt_b, 0.0, 180.0)

    ds_total = _parse_float(flat.get("DigitSpanобщее"))
    if ds_total is not None:
        out["DigitSpanобщее"] = _clamp(ds_total, 0.0, 17.0)
    else:
        ds_fwd = _parse_float(flat.get("DigitSpanвперед"))
        ds_back = _parse_float(flat.get("DigitSpanназад"))
        if ds_fwd is not None or ds_back is not None:
            parts = [v for v in (ds_fwd, ds_back) if v is not None]
            out["DigitSpanобщее"] = float(sum(parts))

    schulte = _parse_float(flat.get("шульте"))
    if schulte is not None:
        out["шульте"] = _clamp(schulte, 0.0, 100.0)

    digits = _parse_float(flat.get("digit_symbol"))
    if digits is not None:
        out["цифров.замещ"] = _clamp(digits, 0.0, 110.0)

    fab_tot = _parse_float(flat.get("fab_total"))
    if fab_tot is None:
        fab_parts = [_parse_float(flat.get(f"fab{i}")) for i in range(1, 7)]
        filled = [v for v in fab_parts if v is not None]
        if filled:
            fab_tot = float(sum(filled))
    if fab_tot is not None:
        out["фабобщ"] = _clamp(fab_tot, 0.0, 18.0)

    fab_item3 = _parse_float(flat.get("fab3"))
    if fab_item3 is not None:
        out["фаб3"] = _clamp(fab_item3, 0.0, 3.0)

    bs = _parse_float(flat.get("boston_spk"))
    if bs is not None:
        out["называниеСТпск"] = _clamp(bs, 0.0, 12.0)

    bf = _parse_float(flat.get("boston_fpk"))
    if bf is not None:
        out["называниеФпск"] = _clamp(bf, 0.0, 12.0)

    return out


def classify_impairment_label(
    domain_pct: Dict[str, Optional[float]],
    threshold: float = 50.0,
    borderline_hi: float = 70.0,
) -> str:
    measured = {d: v for d, v in domain_pct.items() if v is not None}
    if not measured:
        return "Недостаточно данных по доменам для типирования"

    impaired = {d: v < threshold for d, v in measured.items()}
    borderline = {d: threshold <= v < borderline_hi for d, v in measured.items()}

    mem = impaired.get("Память", False)
    other = ["Внимание", "Управляющие функции", "Праксис", "Речь", "Зрительное восприятие"]
    n_other = sum(1 for x in other if impaired.get(x, False))

    if mem:
        return "Полифункциональный амнестический тип" if n_other >= 1 else "Монофункциональный амнестический тип"
    if n_other >= 1:
        return "Монофункциональный неамнестический тип"
    if any(borderline.values()):
        return "Субъективные жалобы / пограничные показатели по доменам (50–70%)"
    return "Норма / субъективные жалобы без выраженного дефицита (все заполненные домены ≥ 70%)"


def run_prediction(payload: Dict[str, Any]) -> Dict[str, Any]:
    flat = payload.get("form") if isinstance(payload.get("form"), dict) else {}
    merged_tests = form_tests_to_model_columns(flat)
    test_cfg, domains = load_test_config()
    domain_pct = calculate_domain_preservation_pct(merged_tests, test_cfg, domains)
    impairment = classify_impairment_label(domain_pct)

    patient = payload.get("patient") or {}
    age = _parse_float(patient.get("age"))

    risk, model_source, interp_blocks, screening_percent = estimate_conversion_risk(
        domain_pct,
        age,
        patient.get("gender"),
        patient.get("education"),
        extra_tests=merged_tests,
    )

    visit = payload.get("visit") or {}

    return {
        "success": True,
        "model_source": model_source,
        "prediction_horizon_years": PREDICTION_HORIZON_YEARS,
        "dementia_risk_percent": risk,
        "cross_sectional_screening_percent": screening_percent,
        "domains_preservation_percent": domain_pct,
        "impairment_pattern_label": impairment,
        "doctor_comment_echo": visit.get("doctor_comment", ""),
        "visit_meta": {"doctor": visit.get("doctor"), "date_osm": visit.get("date_osm")},
        "interpretation": {
            "model_source": model_source,
            "factors": interp_blocks,
        },
    }


if __name__ == "__main__":
    demo_flat = {"12w_pvpl": "8", "5w_nv": "3", "fab_total": "12", "benton_total": "11"}
    print(json.dumps(run_prediction({"form": demo_flat, "patient": {"age": 71, "gender": "Женский"}}), ensure_ascii=False, indent=2))
