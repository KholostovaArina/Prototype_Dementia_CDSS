from __future__ import annotations

import json
from datetime import date
from typing import Any, Dict, List, Optional

from form_persistence import SCHEMA, get_connection, _birth_year_from_age, _parse_int


def _row_to_dict(cur, row) -> Dict[str, Any]:
    cols = [d[0] for d in cur.description]
    return dict(zip(cols, row))


def find_patient_id(
    fio: str = "",
    ambulatory_card_no: str = "",
    age: Optional[int] = None,
) -> Optional[int]:
    fio = (fio or "").strip()
    card = (ambulatory_card_no or "").strip()
    if not fio and not card:
        return None

    birth_year = _birth_year_from_age(age) if age is not None else None

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if card:
                cur.execute(
                    f"""
                    SELECT id FROM {SCHEMA}.patients
                    WHERE ambulatory_card_no = %s AND is_archived = 0
                    LIMIT 1
                    """,
                    (card,),
                )
                row = cur.fetchone()
                if row:
                    return int(row[0])

            if fio and birth_year is not None:
                cur.execute(
                    f"""
                    SELECT id FROM {SCHEMA}.patients
                    WHERE fio = %s AND birth_year = %s AND is_archived = 0
                    LIMIT 1
                    """,
                    (fio, birth_year),
                )
                row = cur.fetchone()
                if row:
                    return int(row[0])

            if fio:
                cur.execute(
                    f"""
                    SELECT id FROM {SCHEMA}.patients
                    WHERE fio ILIKE %s AND is_archived = 0
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (fio,),
                )
                row = cur.fetchone()
                if row:
                    return int(row[0])
    finally:
        conn.close()
    return None


def get_patient_row(patient_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, fio, birth_year, is_female, education_level,
                       is_heredity_cognitive, ambulatory_card_no, is_archived
                FROM {SCHEMA}.patients
                WHERE id = %s
                """,
                (patient_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return _row_to_dict(cur, row)
    finally:
        conn.close()


def patient_row_to_form_fields(row: Dict[str, Any]) -> Dict[str, Any]:
    birth_year = row.get("birth_year")
    age = None
    if birth_year is not None:
        try:
            age = date.today().year - int(birth_year)
        except (TypeError, ValueError):
            age = None

    edu = row.get("education_level")
    hered = row.get("is_heredity_cognitive")

    return {
        "patient_id": row["id"],
        "fio": row.get("fio") or "",
        "n_amb_karta": row.get("ambulatory_card_no") or "",
        "age": age,
        "gender": "женский" if row.get("is_female") == 1 else "мужской",
        "education": "" if edu is None else str(int(edu)),
        "nasled_otya": "" if hered is None else str(int(hered)),
    }


def get_risk_history(patient_id: int) -> List[Dict[str, Any]]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                  v.id AS visit_id,
                  v.visit_date,
                  v.visit_number,
                  v.doctor,
                  v.notes,
                  p.overall_risk,
                  p.risk_category,
                  p.domains_json,
                  p.recommendations
                FROM {SCHEMA}.visits v
                LEFT JOIN {SCHEMA}.predictions p ON p.visit_id = v.id
                WHERE v.patient_id = %s
                ORDER BY v.visit_date ASC NULLS LAST, v.visit_number ASC NULLS LAST, v.id ASC
                """,
                (patient_id,),
            )
            rows = cur.fetchall()
            if not rows:
                return []
            cols = [d[0] for d in cur.description]
            out: List[Dict[str, Any]] = []
            for raw in rows:
                r = dict(zip(cols, raw))
                domains = r.get("domains_json")
                if isinstance(domains, str):
                    try:
                        domains = json.loads(domains)
                    except json.JSONDecodeError:
                        domains = {}
                elif domains is None:
                    domains = {}

                vd = r.get("visit_date")
                if hasattr(vd, "isoformat"):
                    vd_str = vd.isoformat()
                else:
                    vd_str = str(vd) if vd else ""

                date_label = vd_str
                if vd_str:
                    try:
                        date_label = date.fromisoformat(vd_str[:10]).strftime("%d.%m.%Y")
                    except ValueError:
                        date_label = vd_str
                risk = r.get("overall_risk")
                out.append(
                    {
                        "visit_id": r.get("visit_id"),
                        "visit_date": vd_str[:10] if vd_str else "",
                        "visit_number": r.get("visit_number"),
                        "date_label": date_label,
                        "risk_percent": float(risk) if risk is not None else None,
                        "domains": domains,
                        "impairment": r.get("risk_category") or "",
                        "doctor": r.get("doctor") or "",
                        "notes": r.get("notes") or "",
                        "interpretation": r.get("recommendations") or "",
                        "from_db": True,
                        "ts": int(pd_timestamp(vd_str)) if vd_str else 0,
                    }
                )
            return out
    finally:
        conn.close()


def pd_timestamp(vd_str: str) -> int:
    try:
        from datetime import datetime

        return int(datetime.fromisoformat(vd_str[:10]).timestamp() * 1000)
    except ValueError:
        return 0


def search_patients(query: str, limit: int = 12) -> List[Dict[str, Any]]:
    q = (query or "").strip()
    if len(q) < 2:
        return []

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, fio, birth_year, is_female, education_level,
                       is_heredity_cognitive, ambulatory_card_no
                FROM {SCHEMA}.patients
                WHERE is_archived = 0 AND fio ILIKE %s
                ORDER BY fio
                LIMIT %s
                """,
                (f"%{q}%", limit),
            )
            rows = cur.fetchall()
            if not rows:
                return []
            cols = [d[0] for d in cur.description]
            out = []
            for raw in rows:
                row = dict(zip(cols, raw))
                fields = patient_row_to_form_fields(row)
                fields["label"] = row.get("fio") or ""
                if fields.get("age") is not None:
                    fields["label"] += f" ({fields['age']} лет)"
                if row.get("ambulatory_card_no"):
                    fields["label"] += f" — карта {row['ambulatory_card_no']}"
                out.append(fields)
            return out
    finally:
        conn.close()


def load_patient_context_by_id(patient_id: int) -> Dict[str, Any]:
    row = get_patient_row(patient_id)
    if not row:
        return {"found": False, "patient_id": None, "patient": None, "risk_history": []}

    history = get_risk_history(patient_id)
    history = [h for h in history if h.get("risk_percent") is not None]

    return {
        "found": True,
        "patient_id": patient_id,
        "patient": patient_row_to_form_fields(row),
        "risk_history": history,
    }


def load_patient_context(
    fio: str = "",
    ambulatory_card_no: str = "",
    age: Optional[int] = None,
) -> Dict[str, Any]:
    age_parsed = _parse_int(age) if age is not None else None
    pid = find_patient_id(fio=fio, ambulatory_card_no=ambulatory_card_no, age=age_parsed)
    if pid is None:
        return {
            "found": False,
            "patient_id": None,
            "patient": None,
            "risk_history": [],
        }

    row = get_patient_row(pid)
    if not row:
        return {"found": False, "patient_id": None, "patient": None, "risk_history": []}

    history = get_risk_history(pid)
    history = [h for h in history if h.get("risk_percent") is not None]

    return {
        "found": True,
        "patient_id": pid,
        "patient": patient_row_to_form_fields(row),
        "risk_history": history,
    }
