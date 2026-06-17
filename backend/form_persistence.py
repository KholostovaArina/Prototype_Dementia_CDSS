from __future__ import annotations

import json
import os
from decimal import Decimal
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH, override=True)
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
from psycopg2.extras import Json, execute_values

SCHEMA = os.getenv("db_schema", "cdss")

NEURO_FORM_TO_CODE: Dict[str, str] = {
    "mimic_tests": "neuro_mimic",
    "eye_restriction": "neuro_gaze",
    "tongue_deviation": "neuro_tongue",
    "oral_reflexes": "neuro_oral_reflexes",
    "pseudobulbar_symptoms": "neuro_pseudobulbar",
    "bulbar_symptoms": "neuro_bulbar",
    "pyramidal_syndrome": "neuro_pyramidal",
    "parkinsonism_syndrome": "neuro_parkinsonism",
    "chorea": "neuro_chorea",
    "myoclonia": "neuro_myoclonus",
    "other_hyperkineses": "neuro_other_hyperkinesis",
    "postural_tremor": "neuro_postural_tremor",
    "intentional_tremor": "neuro_intention_tremor",
    "resting_tremor": "neuro_rest_tremor",
    "deep_sensitivity": "neuro_deep_sensitivity",
    "surface_sensitivity": "neuro_surface_sensitivity",
    "polyneuropathic_syndrome": "neuro_polyneuropathy",
    "postural_disorders": "neuro_postural_disorder",
    "falls": "neuro_falls",
    "cerebellar_ataxia": "neuro_cerebellar_ataxia",
    "sensitive_ataxia": "neuro_sensitive_ataxia",
    "vestibular_ataxia": "neuro_vestibular_ataxia",
    "frontal_ataxia": "neuro_frontal_ataxia",
    "functional_ataxia": "neuro_functional_ataxia",
    "grasp_reflex": "neuro_grasp_reflex",
    "pelvic_disorders": "neuro_pelvic_disorder",
    "pelvic_disorder_type": "neuro_pelvic_type",
    "counter_resistance": "neuro_counter_resistance",
}

TEST_FORM_TO_CODE: Dict[str, str] = {
    "mmse_time": "mmse_temporal_orientation",
    "mmse_place": "mmse_spatial_orientation",
    "mmse_repeat": "mmse_registration",
    "mmse_count": "mmse_attention",
    "mmse_memory": "mmse_delayed_recall",
    "mmse_naming": "mmse_naming",
    "mmse_phrase": "mmse_repetition",
    "mmse_command": "mmse_comprehension",
    "mmse_read": "mmse_reading",
    "mmse_write": "mmse_writing",
    "mmse_praxis": "mmse_constructive_praxis",
    "mmse_total": "mmse_total",
    "digit_symbol": "digit_substitution",
    "digit_symbol_correct": "digit_substitution_correct",
    "clock": "clock_drawing",
    "cube": "cube_copy",
    "graphomotor": "graphomotor_fence",
    "assoc_c": "verbal_assoc_category",
    "assoc_animals": "verbal_assoc_animals",
    "fab1": "fab_conceptualization",
    "fab2": "fab_fluency",
    "fab3": "fab_motor_series",
    "fab4": "fab_go_nogo",
    "fab5": "fab_prehension",
    "fab6": "fab_grasp_reflex",
    "fab_total": "fab_total",
    "benton_total": "benton_total",
    "boston_correct": "boston_naming_correct",
    "boston_spk": "boston_naming_st",
    "boston_fpk": "boston_naming_ph",
    "tmt_a_seconds": "tmt_a_seconds",
    "тмтB": "tmt_b_seconds",
    "cdr_memory": "cdr_memory",
    "cdr_orientation": "cdr_orientation",
    "cdr_judgment": "cdr_judgment",
    "cdr_community": "cdr_community",
    "cdr_home": "cdr_home",
    "cdr_care": "cdr_care",
    "cdr_sum": "cdr_global",
    "npi_delusions_prod": "npi_delusions",
    "npi_halluc_prod": "npi_hallucinations",
    "npi_agitation_prod": "npi_agitation",
    "npi_depression_prod": "npi_depression",
    "npi_anxiety_prod": "npi_anxiety",
    "npi_euphoria_prod": "npi_euphoria",
    "npi_apathy_prod": "npi_apathy",
    "npi_disinhibition_prod": "npi_disinhibition",
    "npi_irritability_prod": "npi_irritability",
    "npi_motor_prod": "npi_motor",
    "npi_sleep_prod": "npi_sleep",
    "npi_appetite_prod": "npi_appetite",
    "npi_total": "npi_total",
    "12w_pvpl": "word_list_immediate_total",
    "12w_ov": "word_list_delayed_total",
    "5w_nv": "five_words_immediate",
    "5w_ov": "five_words_delayed",
    "ГамильтонДепрессия": "hamilton_depression",
    "ГамильтонТревога": "hamilton_anxiety",
    "шкалаапатии": "apathy_scale",
    "beck": "beck_depression",
}

REFERRAL_TEXT_TO_CODE: Dict[str, int] = {
    "самотек": 0,
    "сам": 0,
    "0": 0,
    "когнитивные нарушения": 1,
    "кн": 1,
    "1": 1,
    "ба": 2,
    "болезнь альцгеймера": 2,
    "2": 2,
    "сосудистая деменция": 3,
    "сосудистая": 3,
    "3": 3,
    "смешанная деменция": 4,
    "смешанная": 4,
    "4": 4,
    "лобная деменция": 5,
    "лобная": 5,
    "5": 5,
    "дтл": 6,
    "деменция с тельцами леви": 6,
    "6": 6,
    "другое": 7,
    "7": 7,
}

MRI_FORM_TO_COLUMN: Dict[str, str] = {
    "mri1_presence": "is_mri_done",
    "ct_presence": "is_ct_done",
    "mri2_periventricular": "periventricular_leukoaraiosis",
    "mri3_subcortical": "subcortical_leukoaraiosis",
    "mri4_external_atrophy": "external_atrophy",
    "mri5_internal_atrophy": "internal_atrophy",
    "mri6_cysts": "post_stroke_cysts",
    "МРТфазекас": "fazekas",
    "МРТGCA": "gca",
    "МРТатрофгиппокамп": "hippocampus_atrophy",
    "локатрофия": "focal_atrophy",
}

CSF_FORM_TO_COLUMN: Dict[str, str] = {
    "бетаамилоид": "beta_amyloid",
    "общийтаубелок": "total_tau",
    "фосфорилиртаубелок": "phospho_tau",
    "общийтаубелокамилоид": "tau_amyloid_ratio",
    "фосфорилиртаубелокамилоид": "phospho_tau_amyloid_ratio",
}

VISIT_INT_FIELDS = {
    "diagnoz": "diagnosis_main",
    "osobennosti_diagnoza": "diagnosis_features",
    "tyazhest_narush": "severity",
    "tip_sindroma_ukn": "ukn_type",
    "techenie_bolezni": "disease_course",
    "dinamika_simptomov": "dynamics",
    "dlit_zabol": "disease_duration_months",
    "dlit_nabl": "observation_duration_months",
    "behavior_disorders": "behavior_disorders",
    "infarkt": "is_myocardial_infarction",
    "tyazh_serd": "comorbidity_hf",
    "sd_ana": "comorbidity_diabetes",
    "ag_ana": "comorbidity_hypertension",
    "onmk_ana": "comorbidity_stroke",
    "kurenie_ana": "comorbidity_smoking",
    "alkogol_ana": "comorbidity_alcohol",
    "yazva": "comorbidity_ulcer",
    "onkologia_ana": "comorbidity_onco",
    "schit_ana": "comorbidity_thyroid",
    "nevr_patol_ana": "comorbidity_neuro",
    "hachinski_total": "hachinski_score",
    "treatment1_history": "treatment_anamnesis",
    "treatment3_main": "treatment_main",
    "treatment4_additional": "treatment_additional_anamnesis",
    "treatment_duration_months": "treatment_duration_months",
    "treatment5_tolerance": "treatment_tolerance",
    "treatment_change": "treatment_changes",
    "treatment_additional_appointment": "treatment_additional",
}


def _parse_int(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(float(str(v).replace(",", ".")))
    except (TypeError, ValueError):
        return None


def _parse_float(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _parse_bool01(v: Any) -> int:
    if v in (True, 1, "1", "true", "True", "да", "есть"):
        return 1
    return 0


def _is_female(gender_raw: Any) -> int:
    if not gender_raw:
        return 0
    g = str(gender_raw).strip().lower()
    if g in ("f", "1", "женский", "ж", "female"):
        return 1
    return 0


def _birth_year_from_age(age: Any) -> Optional[int]:
    a = _parse_int(age)
    if a is None:
        return None
    return date.today().year - a


def _referral_code(raw: Any) -> Optional[int]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, (int, float)):
        return int(raw)
    key = str(raw).strip().lower()
    if key.isdigit():
        return int(key)
    return REFERRAL_TEXT_TO_CODE.get(key)


def _db_config() -> Dict[str, str]:
    file_values = dotenv_values(_ENV_PATH) if _ENV_PATH.is_file() else {}
    keys = ("user", "password", "host", "port", "dbname", "db_schema", "db_sslmode")
    out: Dict[str, str] = {}
    for key in keys:
        raw = file_values.get(key)
        if raw is None or raw == "":
            raw = os.getenv(key)
        out[key] = str(raw or "").strip()
    return out


def get_connection():
    cfg = _db_config()
    try:
        return psycopg2.connect(
            user=cfg["user"],
            password=cfg["password"],
            host=cfg["host"],
            port=cfg["port"] or "5432",
            dbname=cfg["dbname"],
            sslmode=cfg["db_sslmode"] or "require",
            connect_timeout=15,
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=5,
            options=f"-c search_path={cfg['db_schema'] or SCHEMA}",
        )
    except UnicodeDecodeError as err:
        raise ConnectionError(
            "Не удалось подключиться к PostgreSQL. "
            "На Windows direct connection (порт 5432) часто не работает — "
            "в Supabase возьмите Session pooler (порт 6543) и обновите backend/.env. "
            "Также проверьте пароль и что выполнены SQL-скрипты из sql/."
        ) from err


def is_db_configured() -> bool:
    cfg = _db_config()
    return all(cfg.get(key) for key in ("user", "password", "host", "dbname"))


def format_db_error(err: Exception) -> str:
    if isinstance(err, UnicodeDecodeError):
        return (
            "Не удалось подключиться к PostgreSQL (ошибка кодировки Windows). "
            "В Supabase: Settings → Database → Connection string → Session pooler, "
            "скопируйте host, port=6543 и user вида postgres.XXXX. Обновите backend/.env."
        )
    msg = str(err).strip()
    lowered = msg.lower()
    if "utf-8" in lowered and "codec can't decode" in lowered:
        return (
            "Не удалось подключиться к PostgreSQL. "
            "Используйте Session pooler из Supabase (порт 6543), не direct (5432). "
            "Проверьте пароль и SQL-схему cdss."
        )
    if "connection refused" in lowered or "10061" in msg:
        return (
            "PostgreSQL недоступен (localhost:5432). "
            "Прогноз рассчитан, но визит не сохранён. "
            "Запустите БД или удалите backend/.env для работы без сохранения."
        )
    if "password authentication failed" in lowered:
        return "Неверный логин или пароль в backend/.env."
    if "could not translate host name" in lowered or "name or service not known" in lowered:
        return "Не удаётся найти сервер БД. Проверьте host в backend/.env."
    if "timeout expired" in lowered:
        return "Таймаут подключения к БД. Проверьте host, порт и доступ в интернет (Supabase)."
    if len(msg) > 220:
        return msg[:220] + "…"
    return msg


def _find_or_insert_patient(cur, form: Dict[str, Any], patient: Dict[str, Any]) -> int:
    card = (form.get("n_amb_karta") or patient.get("ambulatory_card_no") or "").strip()
    fio = (form.get("fio") or patient.get("fio") or "").strip()
    birth_year = _birth_year_from_age(form.get("age") or patient.get("age"))

    if card:
        cur.execute(
            f"SELECT id FROM {SCHEMA}.patients WHERE ambulatory_card_no = %s LIMIT 1",
            (card,),
        )
        row = cur.fetchone()
        if row:
            return row[0]

    if fio and birth_year:
        cur.execute(
            f"SELECT id FROM {SCHEMA}.patients WHERE fio = %s AND birth_year = %s LIMIT 1",
            (fio, birth_year),
        )
        row = cur.fetchone()
        if row:
            return row[0]

    cur.execute(
        f"""
        INSERT INTO {SCHEMA}.patients
          (fio, birth_year, is_female, education_level, is_heredity_cognitive,
           ambulatory_card_no, is_archived)
        VALUES (%s, %s, %s, %s, %s, %s, 0)
        RETURNING id
        """,
        (
            fio or "Без ФИО",
            birth_year,
            _is_female(form.get("gender") or patient.get("gender")),
            _parse_int(form.get("education") or patient.get("education")),
            _parse_bool01(form.get("nasled_otya")),
            card or None,
        ),
    )
    return cur.fetchone()[0]


def _build_visit_row(form: Dict[str, Any], patient_id: int, visit: Dict[str, Any]) -> Dict[str, Any]:
    visit_date = form.get("date_osm") or visit.get("date_osm") or visit.get("visit_date")
    if not visit_date:
        visit_date = date.today().isoformat()

    row: Dict[str, Any] = {
        "patient_id": patient_id,
        "visit_date": visit_date,
        "doctor": form.get("doctor") or visit.get("doctor"),
        "visit_number": _parse_int(form.get("n_vizit")) or 1,
        "diagnosis_referral": _referral_code(form.get("naprav_diagn")),
        "notes": form.get("notes"),
    }

    for form_key, col in VISIT_INT_FIELDS.items():
        if form_key in form:
            row[col] = _parse_int(form.get(form_key))

    if "infarkt" in form:
        row["is_myocardial_infarction"] = _parse_bool01(form.get("infarkt"))

    return row


def _insert_visit(cur, row: Dict[str, Any]) -> int:
    cols = list(row.keys())
    vals = [row[c] for c in cols]
    placeholders = ", ".join(["%s"] * len(cols))
    col_sql = ", ".join(cols)
    cur.execute(
        f"INSERT INTO {SCHEMA}.visits ({col_sql}) VALUES ({placeholders}) RETURNING id",
        vals,
    )
    return cur.fetchone()[0]


def _insert_mri(cur, visit_id: int, form: Dict[str, Any]) -> None:
    if not any(k in form for k in MRI_FORM_TO_COLUMN):
        return
    data: Dict[str, Any] = {"visit_id": visit_id}
    for form_key, col in MRI_FORM_TO_COLUMN.items():
        if form_key not in form:
            continue
        val = _parse_int(form.get(form_key))
        if col in ("is_mri_done", "is_ct_done"):
            data[col] = _parse_bool01(val) if val is not None else 0
        else:
            data[col] = val if val is not None else 0

    cols = list(data.keys())
    cur.execute(
        f"""
        INSERT INTO {SCHEMA}.mri ({', '.join(cols)})
        VALUES ({', '.join(['%s'] * len(cols))})
        ON CONFLICT (visit_id) DO UPDATE SET
          is_mri_done = EXCLUDED.is_mri_done,
          is_ct_done = EXCLUDED.is_ct_done,
          periventricular_leukoaraiosis = EXCLUDED.periventricular_leukoaraiosis,
          subcortical_leukoaraiosis = EXCLUDED.subcortical_leukoaraiosis,
          external_atrophy = EXCLUDED.external_atrophy,
          internal_atrophy = EXCLUDED.internal_atrophy,
          post_stroke_cysts = EXCLUDED.post_stroke_cysts,
          fazekas = EXCLUDED.fazekas,
          gca = EXCLUDED.gca,
          hippocampus_atrophy = EXCLUDED.hippocampus_atrophy,
          focal_atrophy = EXCLUDED.focal_atrophy
        """,
        [data[c] for c in cols],
    )


def _insert_csf(cur, visit_id: int, form: Dict[str, Any]) -> None:
    data: Dict[str, Any] = {"visit_id": visit_id}
    for form_key, col in CSF_FORM_TO_COLUMN.items():
        if form_key in form:
            v = _parse_float(form.get(form_key))
            if v is not None:
                data[col] = v
    if len(data) == 1:
        return
    cols = list(data.keys())
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != "visit_id")
    cur.execute(
        f"""
        INSERT INTO {SCHEMA}.csf_biomarkers ({', '.join(cols)})
        VALUES ({', '.join(['%s'] * len(cols))})
        ON CONFLICT (visit_id) DO UPDATE SET {updates}
        """,
        [data[c] for c in cols],
    )


def _insert_neuro(cur, visit_id: int, form: Dict[str, Any]) -> None:
    rows = []
    for form_key, code in NEURO_FORM_TO_CODE.items():
        if form_key not in form:
            continue
        sev = _parse_int(form.get(form_key))
        if sev is None:
            continue
        rows.append((visit_id, code, sev))
    if not rows:
        return
    execute_values(
        cur,
        f"""
        INSERT INTO {SCHEMA}.neurological_status (visit_id, finding_code, severity_value)
        VALUES %s
        ON CONFLICT (visit_id, finding_code) DO UPDATE SET severity_value = EXCLUDED.severity_value
        """,
        rows,
    )


def _insert_tests(cur, visit_id: int, form: Dict[str, Any]) -> int:
    rows = []
    for form_key, code in TEST_FORM_TO_CODE.items():
        if form_key not in form:
            continue
        score = _parse_float(form.get(form_key))
        if score is None:
            continue
        rows.append((visit_id, code, score))
    if rows:
        execute_values(
            cur,
            f"""
            INSERT INTO {SCHEMA}.test_results (visit_id, test_code, score)
            VALUES %s
            ON CONFLICT (visit_id, test_code) DO UPDATE SET score = EXCLUDED.score
            """,
            rows,
        )
    return len(rows)


def _json_safe(obj: Any) -> Any:
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {str(k): _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    return str(obj)


def _insert_prediction(cur, visit_id: int, prediction: Dict[str, Any]) -> None:
    domains = _json_safe(prediction.get("domains_preservation_percent") or {})
    rec_parts = [str(prediction.get("model_source") or "")]

    risk = prediction.get("dementia_risk_percent")
    cur.execute(
        f"""
        INSERT INTO {SCHEMA}.predictions
          (visit_id, overall_risk, confidence, risk_category, recommendations, domains_json)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (visit_id) DO UPDATE SET
          overall_risk = EXCLUDED.overall_risk,
          confidence = EXCLUDED.confidence,
          risk_category = EXCLUDED.risk_category,
          recommendations = EXCLUDED.recommendations,
          domains_json = EXCLUDED.domains_json
        """,
        (
            visit_id,
            int(round(risk)) if risk is not None else None,
            None,
            prediction.get("impairment_pattern_label"),
            "\n\n".join(rec_parts) if rec_parts else None,
            json.dumps(domains, ensure_ascii=False),
        ),
    )


def _persist_allowed(
    form: Dict[str, Any], patient: Dict[str, Any], visit: Dict[str, Any]
) -> tuple[bool, str]:
    fio = (form.get("fio") or patient.get("fio") or "").strip()
    if not fio:
        return False, "ФИО не указано — визит не сохранён в БД."
    visit_date = (
        form.get("date_osm") or visit.get("date_osm") or visit.get("visit_date") or ""
    ).strip()
    if not visit_date:
        return False, "Дата осмотра не указана — визит не сохранён в БД."
    card = (form.get("n_amb_karta") or patient.get("ambulatory_card_no") or "").strip()
    if card.upper().startswith("DEMO"):
        return False, "Демо-карта — визит не сохранён в БД."
    if fio.lower().startswith("демо"):
        return False, "Демо-ФИО — визит не сохранён в БД."
    return True, ""


def save_from_payload(payload: Dict[str, Any], prediction: Dict[str, Any]) -> Dict[str, Any]:
    form = payload.get("form") or {}
    patient = payload.get("patient") or {}
    visit = payload.get("visit") or {}

    allowed, skip_reason = _persist_allowed(form, patient, visit)
    if not allowed:
        return {
            "saved": False,
            "save_skipped": True,
            "save_error": None,
            "save_message": skip_reason,
        }

    def _run(step):
        c = get_connection()
        c.autocommit = True
        try:
            with c.cursor() as cur:
                return step(cur)
        finally:
            c.close()

    def _step_core(cur):
        nonlocal patient_id, visit_id
        patient_id = _find_or_insert_patient(cur, form, patient)
        visit_id = _insert_visit(cur, _build_visit_row(form, patient_id, visit))

    def _step_mri(cur):
        _insert_mri(cur, visit_id, form)

    def _step_csf(cur):
        _insert_csf(cur, visit_id, form)

    def _step_neuro(cur):
        _insert_neuro(cur, visit_id, form)

    def _step_tests(cur):
        return _insert_tests(cur, visit_id, form)

    def _step_prediction(cur):
        _insert_prediction(cur, visit_id, prediction)

    patient_id = visit_id = None
    tests_n = 0
    _run(_step_core)
    _run(_step_mri)
    _run(_step_csf)
    _run(_step_neuro)
    tests_n = _run(_step_tests) or 0
    _run(_step_prediction)

    return {
        "saved": True,
        "patient_id": patient_id,
        "visit_id": visit_id,
        "tests_saved": tests_n,
    }


def save_patient(data: Dict[str, Any]) -> int:
    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                return _find_or_insert_patient(cur, data, data)
    finally:
        conn.close()


def save_visit(data: Dict[str, Any]) -> int:
    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                return _insert_visit(cur, data)
    finally:
        conn.close()


def update_visit_notes(visit_id: int, notes: Optional[str]) -> bool:
    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.visits SET notes = %s WHERE id = %s RETURNING id",
                    ((notes or "").strip() or None, visit_id),
                )
                return cur.fetchone() is not None
    finally:
        conn.close()


def save_test_results(visit_id: int, tests: Dict[str, Any]) -> None:
    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                for code, score in tests.items():
                    cur.execute(
                        f"""
                        INSERT INTO {SCHEMA}.test_results (visit_id, test_code, score)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (visit_id, test_code) DO UPDATE SET score = EXCLUDED.score
                        """,
                        (visit_id, code, float(score)),
                    )
    finally:
        conn.close()
