from __future__ import annotations

import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

REPO_ROOT = Path(__file__).resolve().parent.parent
UPLOAD_ROOT = REPO_ROOT / "data" / "uploads" / "visits"

DRAWING_TESTS: Dict[str, str] = {
    "clock_drawing": "Часы",
    "cube_copy": "Куб",
    "graphomotor_fence": "Забор",
}

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_BYTES = 12 * 1024 * 1024
SCHEMA = os.getenv("db_schema", "cdss")


def _ext_for(file: FileStorage) -> str:
    name = (file.filename or "").lower()
    for ext in ALLOWED_EXTENSIONS:
        if name.endswith(ext):
            return ext if ext != ".jpeg" else ".jpg"
    guessed, _ = mimetypes.guess_type(name)
    if guessed == "image/png":
        return ".png"
    if guessed in ("image/jpeg", "image/jpg"):
        return ".jpg"
    if guessed == "image/webp":
        return ".webp"
    return ".jpg"


def _visit_dir(visit_id: int) -> Path:
    return UPLOAD_ROOT / str(int(visit_id))


def save_drawing(
    visit_id: int, test_code: str, file: FileStorage
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    code = (test_code or "").strip().lower()
    if code not in DRAWING_TESTS:
        return False, f"Неизвестный тест: {test_code}", None
    if not file or not file.filename:
        return False, "Файл не выбран.", None

    raw = file.read()
    if len(raw) > MAX_BYTES:
        return False, f"Файл больше {MAX_BYTES // (1024 * 1024)} МБ.", None
    if len(raw) < 32:
        return False, "Пустой или повреждённый файл.", None

    ext = _ext_for(file)
    if ext not in ALLOWED_EXTENSIONS and ext != ".jpg":
        return False, "Допустимы JPG, PNG, WEBP.", None

    vid = int(visit_id)
    vdir = _visit_dir(vid)
    vdir.mkdir(parents=True, exist_ok=True)

    for old in vdir.glob(f"{code}.*"):
        try:
            old.unlink()
        except OSError:
            pass

    out_name = f"{secure_filename(code) or code}{ext}"
    out_path = vdir / out_name
    out_path.write_bytes(raw)

    mime = file.mimetype or mimetypes.guess_type(out_name)[0] or "application/octet-stream"
    rel = str(out_path.relative_to(REPO_ROOT)).replace("\\", "/")
    _upsert_db_row(vid, code, out_name, mime, rel)

    return True, "Сохранено.", {
        "test_code": code,
        "label": DRAWING_TESTS[code],
        "file_name": out_name,
        "url": f"/api/visit/{vid}/drawings/{code}",
    }


def save_drawings(
    visit_id: int, files: Dict[str, FileStorage]
) -> Tuple[int, List[str]]:
    uploaded = 0
    errors: List[str] = []
    for code in DRAWING_TESTS:
        file = files.get(code)
        if not file or not file.filename:
            continue
        ok, msg, _ = save_drawing(visit_id, code, file)
        if ok:
            uploaded += 1
        else:
            errors.append(f"{DRAWING_TESTS[code]}: {msg}")
    return uploaded, errors


def resolve_drawing_path(visit_id: int, test_code: str) -> Optional[Path]:
    code = (test_code or "").strip().lower()
    if code not in DRAWING_TESTS:
        return None
    vdir = _visit_dir(int(visit_id))
    if not vdir.is_dir():
        return None
    matches = sorted(vdir.glob(f"{code}.*"))
    return matches[-1] if matches else None


def _upsert_db_row(
    visit_id: int, test_code: str, file_name: str, mime_type: str, storage_path: str
) -> None:
    try:
        from form_persistence import get_connection

        conn = get_connection()
        conn.autocommit = True
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {SCHEMA}.visit_drawings
                      (visit_id, test_code, file_name, mime_type, storage_path)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (visit_id, test_code) DO UPDATE SET
                      file_name = EXCLUDED.file_name,
                      mime_type = EXCLUDED.mime_type,
                      storage_path = EXCLUDED.storage_path,
                      uploaded_at = NOW()
                    """,
                    (visit_id, test_code, file_name, mime_type, storage_path),
                )
        finally:
            conn.close()
    except Exception:
        pass
