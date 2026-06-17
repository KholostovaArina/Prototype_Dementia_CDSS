from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd

from domain_scores import normalize_test_from_config
from feature_config import ATTENTION_EXTRA_FEATURES, FUTURE_MODEL_FEATURES

ML_ROOT = Path(__file__).resolve().parent
ARTIFACT_DIR = ML_ROOT / "model_artifacts"
FUTURE_MODEL_PATH = ARTIFACT_DIR / "future_conversion_model.joblib"
LEGACY_MODEL_PATH = ARTIFACT_DIR / "dementia_risk_model.joblib"
AUX_MODEL_PATH = ARTIFACT_DIR / "domain_risk_infer.joblib"
PREDICTION_HORIZON_YEARS = 3
FUTURE_FEATURE_NAMES = list(FUTURE_MODEL_FEATURES)


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _female_flag(gender_raw: Optional[str]) -> float:
    if not gender_raw:
        return float("nan")
    g = str(gender_raw).strip().lower()
    return 1.0 if "жен" in g else 0.0


def _education_numeric(value: Any) -> float:
    if value is None or value == "":
        return float("nan")
    s = str(value).strip().lower()
    for key, v in (("началь", 1.0), ("средне-спец", 2.0), ("средн", 2.0), ("высш", 3.0)):
        if key in s:
            return v
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def _future_feature_row(
    domain_pct: Dict[str, Optional[float]],
    age: Optional[float],
    gender_raw: Optional[str],
    education_raw: Any,
    feature_names: Optional[List[str]] = None,
    extra_tests: Optional[Dict[str, float]] = None,
) -> pd.DataFrame:
    names = feature_names or FUTURE_FEATURE_NAMES
    extras = extra_tests or {}
    med_dom = float(
        np.nanmedian([v for v in domain_pct.values() if v is not None] or [70.0])
    )
    row: Dict[str, float] = {}
    for name in names:
        if name in domain_pct:
            v = domain_pct[name]
            row[name] = float(v if v is not None else med_dom)
        elif name in extras and extras[name] is not None:
            try:
                raw = float(extras[name])
                norm = normalize_test_from_config(name, raw, scale="unit")
                row[name] = float(norm) if norm is not None else raw
            except (TypeError, ValueError):
                row[name] = float("nan")
        elif name in ATTENTION_EXTRA_FEATURES:
            row[name] = float("nan")
        elif name == "возраст":
            row[name] = float(age if age is not None else 70.0)
        elif name == "пол_женский":
            fv = _female_flag(gender_raw)
            row[name] = float(fv) if not pd.isna(fv) else 0.0
        elif name == "образов":
            ev = _education_numeric(education_raw)
            row[name] = float(ev) if not pd.isna(ev) else 2.0
        elif name == "domain_median":
            vals = [float(v) for v in domain_pct.values() if v is not None]
            row[name] = float(np.nanmedian(vals)) if vals else med_dom
    return pd.DataFrame([row], columns=names)


def aux_domain_contributions(pipe: Any, X: pd.DataFrame) -> List[Dict[str, Any]]:
    scaler = pipe.named_steps["scaler"]
    lr: Any = pipe.named_steps["model"]
    x_s = scaler.transform(X)[0]
    coef = lr.coef_.ravel()
    contrib = coef * x_s
    items = []
    for name, piece in zip(X.columns, contrib):
        mag = float(piece)
        if not np.isfinite(mag):
            continue
        items.append({"feature": name, "contribution": mag})
    items.sort(key=lambda z: abs(z["contribution"]), reverse=True)
    return items[:8]


def predict_future_conversion(
    domain_pct: Dict[str, Optional[float]],
    age: Optional[float],
    gender_raw: Optional[str],
    education_raw: Any,
    extra_tests: Optional[Dict[str, float]] = None,
) -> Optional[Tuple[float, List[Dict[str, Any]]]]:
    if not FUTURE_MODEL_PATH.is_file():
        return None
    blob = joblib.load(FUTURE_MODEL_PATH)
    pipe = blob.get("pipeline", blob)
    feat_names: Optional[List[str]] = blob.get("feature_names")
    frame = _future_feature_row(
        domain_pct,
        age,
        gender_raw,
        education_raw,
        feature_names=feat_names,
        extra_tests=extra_tests,
    )
    feat_names = list(feat_names or frame.columns)
    frame = frame.reindex(columns=feat_names)
    proba_arr = pipe.predict_proba(frame)[0]
    lr: Any = pipe.named_steps["model"]
    cls = list(lr.classes_)
    ix = cls.index(1) if 1 in cls else int(np.argmax(proba_arr))
    pct = round(float(proba_arr[ix]) * 100.0, 2)
    try:
        factors = aux_domain_contributions(pipe, frame)
    except Exception:
        factors = []
    return pct, factors


def heuristic_conversion_risk(
    domain_pct: Dict[str, Optional[float]],
    age: Optional[float],
    education_raw: Any,
) -> Tuple[float, List[Dict[str, Any]]]:
    vals = [float(v) for v in domain_pct.values() if v is not None]
    if not vals:
        return 0.0, []

    mean_p = float(np.mean(vals))
    min_p = float(np.min(vals))
    score = 0.6 * (100.0 - mean_p) + 0.25 * (100.0 - min_p)
    if min_p < 40.0:
        score += 12.0
    if age is not None:
        score += max(0.0, (float(age) - 60.0) * 0.45)
    ev = _education_numeric(education_raw)
    if not pd.isna(ev):
        score += (3.0 - ev) * 5.0

    pct = round(float(_clamp(score, 4.0, 98.0)), 2)
    return pct, []


def predict_aux_domains(
    domain_pct: Dict[str, Optional[float]],
    age: Optional[float],
    gender_raw: Optional[str],
) -> Optional[Tuple[float, List[Dict[str, Any]]]]:
    if not AUX_MODEL_PATH.is_file():
        return None

    blob = joblib.load(AUX_MODEL_PATH)
    pipe = blob["pipeline"]
    feats: List[str] = list(blob["feature_names"])

    row: Dict[str, float] = {}
    med_dom = np.nanmedian(
        [v for v in domain_pct.values() if v is not None]
        or [70.0]
    )
    for d in feats:
        if d in domain_pct:
            row[d] = float(domain_pct[d] if domain_pct[d] is not None else med_dom)
        elif d == "возраст":
            row[d] = float(age if age is not None else 70.0)
        elif d == "пол_женский":
            fv = _female_flag(gender_raw)
            row[d] = float(fv) if not pd.isna(fv) else 0.0

    frame = pd.DataFrame([row], columns=feats)
    lr: Any = pipe.named_steps["model"]
    proba_arr = pipe.predict_proba(frame)[0]
    cls = list(lr.classes_)
    if 1 in cls:
        pct = round(float(proba_arr[cls.index(1)]) * 100.0, 2)
    else:
        pct = round(float(np.max(proba_arr)) * 100.0, 2)

    return pct, aux_domain_contributions(pipe, frame)


def predict_full_pipeline(pipe: Any, merged: Dict[str, Any]) -> Optional[float]:
    pre = pipe.named_steps.get("preprocessor")
    names = getattr(pre, "feature_names_in_", None)
    if names is None:
        return None

    row_dict: Dict[str, Any] = {}
    for c in names:
        val = merged.get(c, np.nan)
        if val is None or (isinstance(val, float) and np.isnan(val)):
            row_dict[c] = np.nan
        elif isinstance(val, (int, float, np.integer, np.floating)):
            row_dict[c] = float(val)
        elif isinstance(val, str):
            vv = val.strip()
            row_dict[c] = vv if vv else "MISSING"
        else:
            row_dict[c] = str(val)

    frame = pd.DataFrame([row_dict], columns=list(names))
    proba_arr = pipe.predict_proba(frame)[0]
    clf = pipe.named_steps["model"]
    classes = list(getattr(clf, "classes_", [0, 1]))
    if len(classes) >= 2 and 1 in classes:
        ix = classes.index(1)
        return round(float(proba_arr[ix]) * 100.0, 2)
    return round(float(np.max(proba_arr)) * 100.0, 2)


def estimate_conversion_risk(
    domain_pct: Dict[str, Optional[float]],
    age: Optional[float],
    gender_raw: Optional[str],
    education_raw: Any,
    extra_tests: Optional[Dict[str, float]] = None,
) -> Tuple[float, str, List[Dict[str, Any]], Optional[float]]:
    risk: Optional[float] = None
    interp_blocks: List[Dict[str, Any]] = []
    screening_percent: Optional[float] = None
    model_source = "domain_heuristic"

    fx = predict_future_conversion(
        domain_pct,
        age,
        gender_raw,
        education_raw,
        extra_tests=extra_tests,
    )
    if fx:
        risk, interp_blocks = fx
        model_source = "future_conversion_3y"
    elif LEGACY_MODEL_PATH.is_file():
        try:
            leg_pipe = joblib.load(LEGACY_MODEL_PATH)
            merged_row_extended = {**(extra_tests or {})}
            screening_percent = predict_full_pipeline(leg_pipe, merged_row_extended)
        except Exception:
            screening_percent = None

    if risk is None:
        gx = predict_aux_domains(domain_pct, age, gender_raw)
        if gx:
            risk, interp_blocks = gx
            model_source = "domain_auxiliary"
        else:
            risk, interp_blocks = heuristic_conversion_risk(
                domain_pct, age, education_raw
            )
            model_source = "domain_heuristic"

    return risk, model_source, interp_blocks, screening_percent
