import json
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

from cognitive_inference import run_prediction

load_dotenv(Path(__file__).resolve().parent / ".env")

app = Flask(__name__)
CORS(app)

BACKEND_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BACKEND_DIR.parent / "frontend"
ARTIFACT_DIR = BACKEND_DIR.parent / "ml" / "model_artifacts"


def two_streams_payload():
    stream1_path = ARTIFACT_DIR / "stream1_patterns.json"
    stream2_path = ARTIFACT_DIR / "landmark_cohort_summary.json"

    def _load(path: Path, alt: Path | None = None):
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
        if alt and alt.is_file():
            return json.loads(alt.read_text(encoding="utf-8"))
        return None

    return {
        "stream1": _load(stream1_path),
        "stream2_cohort": _load(
            stream2_path,
            ARTIFACT_DIR / "landmark_cohort_summary_healthy_strict.json",
        ),
    }


try:
    from form_persistence import (
        save_from_payload,
        save_patient,
        save_test_results,
        save_visit,
        update_visit_notes,
    )
    from patient_queries import (
        load_patient_context,
        load_patient_context_by_id,
        search_patients,
    )
except Exception:
    save_from_payload = save_patient = save_visit = save_test_results = None  # type: ignore
    update_visit_notes = None  # type: ignore
    load_patient_context = load_patient_context_by_id = search_patients = None  # type: ignore

try:
    from visit_drawings import DRAWING_TESTS, resolve_drawing_path, save_drawings
except Exception:
    save_drawings = resolve_drawing_path = None  # type: ignore
    DRAWING_TESTS = {}  # type: ignore


def _parse_predict_request():
    content_type = request.content_type or ""
    if "multipart/form-data" in content_type:
        raw = request.form.get("payload")
        payload = json.loads(raw) if raw else {}
        files = {
            code: request.files[code]
            for code in DRAWING_TESTS
            if code in request.files and request.files[code].filename
        }
        return payload, files
    return request.get_json(force=True, silent=False) or {}, {}

@app.route('/')
def frontend_index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route('/<path:asset_path>')
def frontend_assets(asset_path):
    return send_from_directory(FRONTEND_DIR, asset_path)


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "Backend is running"})


@app.route('/api/analytics/two-streams', methods=['GET'])
def analytics_two_streams():
    try:
        payload = two_streams_payload()
        return jsonify({"success": True, **payload})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/patient/search', methods=['GET'])
def patient_search():
    if search_patients is None:
        return jsonify({"success": False, "error": "БД не настроена."}), 503
    try:
        q = request.args.get("q", "")
        limit = min(int(request.args.get("limit", 12)), 25)
        items = search_patients(q, limit=limit)
        return jsonify({"success": True, "items": items})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/patient/context', methods=['GET'])
def patient_context():
    if load_patient_context is None:
        return jsonify(
            {"success": False, "error": "БД не настроена (backend/.env)."}
        ), 503
    try:
        patient_id = request.args.get("patient_id")
        if patient_id not in (None, ""):
            ctx = load_patient_context_by_id(int(patient_id))
            return jsonify({"success": True, **ctx})

        fio = request.args.get("fio", "")
        card = request.args.get("n_amb_karta", "") or request.args.get("ambulatory_card_no", "")
        age_raw = request.args.get("age")
        age = int(age_raw) if age_raw not in (None, "") else None
        ctx = load_patient_context(fio=fio, ambulatory_card_no=card, age=age)
        return jsonify({"success": True, **ctx})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/visit/<int:visit_id>/notes', methods=['PATCH', 'PUT'])
def visit_notes_update(visit_id: int):
    if update_visit_notes is None:
        return jsonify({"success": False, "error": "БД не настроена."}), 503
    try:
        body = request.get_json(force=True, silent=True) or {}
        notes = body.get("notes")
        if notes is None:
            return jsonify({"success": False, "error": "Поле notes обязательно."}), 400
        if not update_visit_notes(visit_id, str(notes)):
            return jsonify({"success": False, "error": f"Визит id={visit_id} не найден."}), 404
        return jsonify({"success": True, "visit_id": visit_id, "notes": str(notes).strip()})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/visit/<int:visit_id>/drawings/<test_code>', methods=['GET'])
def visit_drawings_file(visit_id: int, test_code: str):
    if resolve_drawing_path is None:
        return jsonify({"success": False, "error": "Модуль загрузки фото недоступен."}), 503
    path = resolve_drawing_path(visit_id, test_code)
    if not path or not path.is_file():
        return jsonify({"success": False, "error": "Файл не найден."}), 404
    return send_file(path, mimetype=None, as_attachment=False)


@app.route('/api/predict', methods=['POST'])
def predict():
    try:
        payload, drawing_files = _parse_predict_request()
        out = run_prediction(payload)
        if save_from_payload:
            try:
                out.update(save_from_payload(payload, out))
                out["db_status"] = "saved" if out.get("saved") else "unknown"
            except Exception as save_err:
                out["saved"] = False
                out["save_error"] = str(save_err)
                out["db_status"] = "error"
        else:
            out["saved"] = False
            out["save_error"] = "database.save_from_payload недоступен"
            out["db_status"] = "disabled"

        visit_id = out.get("visit_id")
        if visit_id and save_drawings and drawing_files:
            uploaded, errors = save_drawings(int(visit_id), drawing_files)
            if uploaded:
                out["drawings_saved"] = uploaded
            if errors:
                out["drawings_errors"] = errors

        return jsonify(out)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/save_data', methods=['POST'])
def save_data():
    if not all((save_patient, save_visit, save_test_results)):
        return jsonify(
            {"success": False, "error": "Сохранение в БД не настроено (form_persistence / .env)."}
        ), 503
    try:
        data = request.json
        patient_id = save_patient(data['patient'])
        data['visit']['patient_id'] = patient_id
        visit_id = save_visit(data['visit'])
        save_test_results(visit_id, data['test_results'])
        return jsonify({
            "success": True,
            "patient_id": patient_id,
            "visit_id": visit_id
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
