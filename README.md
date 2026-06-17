# Прототип CDSS — прогноз когнитивного риска

Исследовательский прототип системы поддержки решений для врача: структурированный ввод тестов, профиль по шести когнитивным доменам, оценка риска ухудшения на 3 года.

## Запуск

Расчёт риска и интерфейс работают без настройки базы данных.

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r backend\requirements.txt
cd backend
python app.py
```

Откройте http://localhost:5000 → заполните форму → «Получить прогноз».

## База данных (опционально)

Для поиска пациентов, сохранения визитов и динамики риска:

1. Выполните `sql/cdss_schema.sql` и `sql/cdss_visit_drawings.sql` в PostgreSQL (Supabase).
2. Скопируйте `backend/.env.example` → `backend/.env` и укажите параметры подключения.

Без `.env` прототип считает риск, но не сохраняет данные в БД.

## Структура

```
backend/          Flask API, сохранение в БД
frontend/         веб-интерфейс (HTML, CSS, JS)
ml/               расчёт доменов и прогноза
  model_artifacts/
    domain_config.json
    future_conversion_model.joblib
sql/              схема PostgreSQL
data/uploads/     загрузка рисунков тестов (часы, куб)
```

## Модель

- Горизонт прогноза: **3 года**
- Признаки: 6 доменов + 3 теста внимания (см. `ml/model_artifacts/future_conversion_meta.json`)
- Метрики на обучающей когорте (n=19): accuracy 0,68, recall 0,78

## Автор

Холостова Арина, НИЯУ МИФИ, 2026.
