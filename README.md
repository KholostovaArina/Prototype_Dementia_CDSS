# Прототип CDSS — прогноз когнитивного риска

Исследовательский прототип системы поддержки решений для врача: структурированный ввод тестов, профиль по шести когнитивным доменам, оценка риска ухудшения на 3 года.

## Запуск

**Нужен Python 3.11 или 3.12.** На Python 3.14 pandas и scikit-learn часто не ставятся (нет готовых сборок под Windows).

Проверка версии:

```powershell
python --version
```

Если показывает 3.14+, установите [Python 3.12](https://www.python.org/downloads/) и создайте окружение так:

```powershell
py -3.12 -m venv .venv
```

Расчёт риска и интерфейс работают без настройки базы данных.

```powershell
.\.venv\Scripts\pip install -r backend\requirements.txt
cd backend
python app.py
```

Откройте http://localhost:5000 → заполните форму → «Получить прогноз».

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
