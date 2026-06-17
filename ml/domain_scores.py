from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

ARTIFACT_DIR = Path(__file__).resolve().parent / "model_artifacts"
DOMAIN_CFG_PATH = ARTIFACT_DIR / "domain_config.json"


def load_domain_config_raw() -> Dict[str, Any]:
    return json.loads(DOMAIN_CFG_PATH.read_text(encoding="utf-8"))


def load_test_config() -> tuple[Dict[str, Dict[str, Any]], List[str]]:
    raw = load_domain_config_raw()
    return raw["TEST_CONFIG"], raw["DOMAINS"]


def test_domains(cfg: Dict[str, Any]) -> List[str]:
    if "domains" in cfg and cfg["domains"]:
        return list(cfg["domains"])
    dom = cfg.get("domain")
    return [dom] if dom else []


def use_in_domain_average(cfg: Dict[str, Any]) -> bool:
    return bool(cfg.get("lokshina_protocol", False))


def protocol_tests_by_domain() -> Dict[str, Tuple[str, ...]]:
    test_cfg, domains = load_test_config()
    by_domain: Dict[str, List[str]] = {d: [] for d in domains}
    for test_name, cfg in sorted(test_cfg.items()):
        if not use_in_domain_average(cfg):
            continue
        for dom in test_domains(cfg):
            if dom in by_domain:
                by_domain[dom].append(test_name)
    return {d: tuple(by_domain[d]) for d in domains}


def _column_for_test(row: pd.Series, test_name: str) -> Optional[str]:
    if test_name in row.index:
        return test_name
    low = test_name.lower()
    for col in row.index:
        if str(col).lower() == low:
            return str(col)
    return None


def normalize_test_from_config(
    test_name: str,
    value: float,
    *,
    scale: str = "unit",
) -> Optional[float]:
    test_cfg, _ = load_test_config()
    if test_name not in test_cfg:
        return None
    cfg = test_cfg[test_name]
    ns = normalize_score_val(
        float(value),
        cfg["min"],
        cfg["max"],
        cfg["higher_is_better"],
    )
    if ns is None:
        return None
    if scale == "percent":
        return round(ns * 100.0, 1)
    if scale == "unit":
        return float(ns)
    raise ValueError(scale)


def normalize_score_val(
    value: float,
    mn: float,
    mx: float,
    higher_is_better: bool,
) -> Optional[float]:
    if mx <= mn:
        return None
    val = float(max(mn, min(mx, value)))
    if higher_is_better:
        out = (val - mn) / (mx - mn)
    else:
        out = (mx - val) / (mx - mn)
    return float(np.clip(out, 0.0, 1.0))


def calculate_domain_preservation_pct(
    test_values: Dict[str, float],
    test_cfg: Dict,
    domains: List[str],
) -> Dict[str, Optional[float]]:
    by_domain: Dict[str, List[float]] = {d: [] for d in domains}
    for test_name, cfg in test_cfg.items():
        if not use_in_domain_average(cfg):
            continue
        if test_name not in test_values:
            continue
        ns = normalize_score_val(
            test_values[test_name],
            cfg["min"],
            cfg["max"],
            cfg["higher_is_better"],
        )
        if ns is None:
            continue
        pct = ns * 100.0
        for dom in test_domains(cfg):
            if dom in by_domain:
                by_domain[dom].append(pct)

    results: Dict[str, Optional[float]] = {}
    for d in domains:
        vals = by_domain[d]
        results[d] = round(float(sum(vals) / len(vals)), 1) if vals else None
    return results


def domains_from_series(row: pd.Series) -> Dict[str, Optional[float]]:
    test_cfg, domains = load_test_config()
    tests: Dict[str, float] = {}
    for test_name in test_cfg:
        col = _column_for_test(row, test_name)
        if col is None:
            continue
        v = row[col]
        if pd.isna(v):
            continue
        try:
            tests[test_name] = float(v)
        except (TypeError, ValueError):
            continue
    return calculate_domain_preservation_pct(tests, test_cfg, domains)
