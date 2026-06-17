from __future__ import annotations

DOMAINS = [
    "Память",
    "Внимание",
    "Управляющие функции",
    "Праксис",
    "Речь",
    "Зрительное восприятие",
]

DOMAINS_NO_MEMORY = [d for d in DOMAINS if d != "Память"]

ATTENTION_EXTRA_FEATURES = (
    "DigitSpanвперед",
    "DigitSpanназад",
    "DigitSpanобщее",
    "тмт1",
    "цифров.замещ",
)

FUTURE_MODEL_FEATURES = [*DOMAINS, *ATTENTION_EXTRA_FEATURES]

EXCLUDE_FROM_FEATURES = {
    "фио",
    "fio_norm",
    "доктор",
    "архив",
    "дата1",
    "ДатаОсм",
    "visit_date",
    "группа",
    "тяжестьнаруш",
    "тяжестьнаруш1",
    "тяжестьнаруш2",
    "тяжестьнаруш3",
    "target_ba",
    "target_ba_source",
    "y_future_3y",
    "baseline_visit_idx",
    "data_source",
    "source_file_row",
    "patient_source_row",
    "visit_number",
    "nвизит",
    "диагнозосн",
    "направдиагн",
    "формаБА",
    "особдиагн",
}

HORIZON_YEARS = 3
HORIZON_DAYS = int(365.25 * HORIZON_YEARS)
