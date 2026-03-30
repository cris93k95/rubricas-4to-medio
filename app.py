"""
Rúbricas 4° Medio — Flask Backend
Evaluación Mock Job Interview (Video) + Curriculum Vitae
Persistencia en PostgreSQL · Autenticación Google OAuth
"""
from __future__ import annotations

import io
import json
import logging
import os
import threading
from functools import wraps
from pathlib import Path

from authlib.integrations.flask_client import OAuth
from flask import Flask, jsonify, redirect, render_template, request, send_file, session, url_for
from werkzeug.middleware.proxy_fix import ProxyFix
from openpyxl import load_workbook
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
SECRET_KEY = os.getenv("SECRET_KEY", "rubricas-dev-key-change-in-production")

GOOGLE_CLIENT_ID = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
GOOGLE_CLIENT_SECRET = (os.getenv("GOOGLE_CLIENT_SECRET") or "").strip()
GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"

ADMIN_EMAIL = (os.getenv("ADMIN_EMAIL") or "").strip().lower()
ADMIN_NAME = (os.getenv("ADMIN_NAME") or "Administrador").strip()

VALID_TOOLS = {"video", "cv"}

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.secret_key = SECRET_KEY
app.config['PREFERRED_URL_SCHEME'] = 'https'
lock = threading.Lock()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

oauth = OAuth(app)
google_oauth_enabled = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
if google_oauth_enabled:
    oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url=GOOGLE_DISCOVERY_URL,
        client_kwargs={"scope": "openid email profile"},
    )


# ─── Database ───────────────────────────────────────────────────────────────

def normalize_database_url(raw_url: str) -> str:
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg://", 1)
    if raw_url.startswith("postgresql://") and "+" not in raw_url.split("://", 1)[0]:
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw_url


engine: Engine | None = None
if DATABASE_URL:
    engine = create_engine(normalize_database_url(DATABASE_URL), pool_pre_ping=True, future=True)


def default_state() -> dict:
    return {"courses": {}}


def init_database_if_needed() -> None:
    if not engine:
        return
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS app_users (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                google_sub TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS rubric_state (
                user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
                tool TEXT NOT NULL,
                data TEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, tool)
            )
        """))
        # Bootstrap admin user
        if ADMIN_EMAIL:
            existing = conn.execute(
                text("SELECT id FROM app_users WHERE email = :email"),
                {"email": ADMIN_EMAIL},
            ).first()
            if existing:
                conn.execute(
                    text("UPDATE app_users SET name = :name, role = 'admin' WHERE id = :id"),
                    {"id": existing[0], "name": ADMIN_NAME},
                )
            else:
                conn.execute(
                    text("INSERT INTO app_users (email, name, role) VALUES (:email, :name, 'admin')"),
                    {"email": ADMIN_EMAIL, "name": ADMIN_NAME},
                )


init_database_if_needed()


# ─── State Management ────────────────────────────────────────────────────────

def load_state(user_id: int, tool: str) -> dict:
    if engine:
        try:
            with engine.begin() as conn:
                row = conn.execute(
                    text("SELECT data FROM rubric_state WHERE user_id = :uid AND tool = :tool"),
                    {"uid": user_id, "tool": tool},
                ).first()
                if row and row[0]:
                    return json.loads(row[0])
        except Exception:
            pass
    return default_state()


def save_state(user_id: int, tool: str, state: dict) -> None:
    if engine:
        payload = json.dumps(state, ensure_ascii=False)
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO rubric_state (user_id, tool, data, updated_at)
                VALUES (:uid, :tool, :data, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, tool)
                DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
            """), {"uid": user_id, "tool": tool, "data": payload})


# ─── Auth Helpers ─────────────────────────────────────────────────────────────

def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def get_user_by_id(user_id: int) -> dict | None:
    if not engine:
        return None
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT id, email, name, role FROM app_users WHERE id = :id"),
            {"id": user_id},
        ).first()
    if not row:
        return None
    return {"id": int(row[0]), "email": row[1], "name": row[2], "role": row[3]}


def get_user_by_email(email: str) -> dict | None:
    if not engine:
        return None
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT id, email, name, role FROM app_users WHERE email = :email"),
            {"email": normalize_email(email)},
        ).first()
    if not row:
        return None
    return {"id": int(row[0]), "email": row[1], "name": row[2], "role": row[3]}


def get_current_user() -> dict | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    try:
        return get_user_by_id(int(user_id))
    except Exception:
        return None


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not get_current_user():
            if request.path.startswith("/api"):
                return jsonify({"error": "No autenticado"}), 401
            return redirect(url_for("login"))
        return view(*args, **kwargs)
    return wrapped


# ─── Auth Routes ──────────────────────────────────────────────────────────────

@app.route("/login")
def login():
    user = get_current_user()
    if user:
        return redirect(url_for("landing"))
    return render_template("login.html", google_enabled=google_oauth_enabled)


@app.route("/auth/google")
def auth_google():
    if not google_oauth_enabled:
        return "Google OAuth no configurado", 503
    redirect_uri = url_for("auth_google_callback", _external=True, _scheme='https')
    logger.info(f"OAuth redirect URI: {redirect_uri}")
    return oauth.google.authorize_redirect(redirect_uri)


@app.route("/auth/google/callback")
def auth_google_callback():
    if not google_oauth_enabled:
        return "Google OAuth no configurado", 503
    try:
        token = oauth.google.authorize_access_token()
        user_info = token.get("userinfo")
        if not user_info:
            resp = oauth.google.get("userinfo")
            user_info = resp.json()
    except Exception as e:
        logger.error(f"OAuth error: {e}", exc_info=True)
        return f"Error al autenticar con Google: {e}", 401

    email = normalize_email(user_info.get("email", ""))
    if not email:
        return "No se pudo obtener email de Google", 401

    user = get_user_by_email(email)
    if not user:
        return "Usuario no autorizado. Contacta al administrador.", 403

    if engine:
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE app_users SET google_sub = :sub, last_login = CURRENT_TIMESTAMP WHERE id = :id"),
                {"id": user["id"], "sub": user_info.get("sub")},
            )

    session["user_id"] = int(user["id"])
    return redirect(url_for("landing"))


@app.route("/logout")
def logout():
    session.pop("user_id", None)
    return redirect(url_for("login"))


# ─── Page Routes ──────────────────────────────────────────────────────────────

@app.route("/")
@login_required
def landing():
    return render_template("landing.html", current_user=get_current_user())


@app.route("/video")
@login_required
def video_page():
    return render_template("video.html", current_user=get_current_user())


@app.route("/cv")
@login_required
def cv_page():
    return render_template("cv.html", current_user=get_current_user())


# ─── API: State ───────────────────────────────────────────────────────────────

@app.route("/api/state/<tool>", methods=["GET"])
@login_required
def api_get_state(tool: str):
    if tool not in VALID_TOOLS:
        return jsonify({"error": "Herramienta no válida"}), 400
    user = get_current_user()
    with lock:
        state = load_state(int(user["id"]), tool)
    return jsonify(state)


@app.route("/api/state/<tool>", methods=["PUT"])
@login_required
def api_save_state(tool: str):
    if tool not in VALID_TOOLS:
        return jsonify({"error": "Herramienta no válida"}), 400
    user = get_current_user()
    payload = request.get_json(force=True)
    with lock:
        save_state(int(user["id"]), tool, payload)
    return jsonify({"ok": True})


# ─── API: Excel Upload ───────────────────────────────────────────────────────

@app.route("/api/<tool>/upload-excel/<course_name>", methods=["POST"])
@login_required
def api_upload_excel(tool: str, course_name: str):
    if tool not in VALID_TOOLS:
        return jsonify({"error": "Herramienta no válida"}), 400
    
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Archivo requerido"}), 400

    try:
        wb = load_workbook(filename=io.BytesIO(file.read()), data_only=True)
        ws = wb[wb.sheetnames[0]]
        names = []
        for row in ws.iter_rows(min_row=1, max_col=1):
            value = row[0].value
            if value is not None:
                n = str(value).strip()
                if n:
                    names.append(n)
    except Exception as e:
        return jsonify({"error": f"Error al leer archivo: {e}"}), 400

    user = get_current_user()
    with lock:
        state = load_state(int(user["id"]), tool)
        courses = state.get("courses", {})
        
        if course_name not in courses:
            return jsonify({"error": "Curso no encontrado"}), 404

        added = 0
        if tool == "video":
            # Add to roster
            roster = courses[course_name].get("roster", [])
            for n in names:
                if n not in roster:
                    roster.append(n)
                    added += 1
            courses[course_name]["roster"] = roster
        elif tool == "cv":
            # Add as students
            existing = {s.get("name") for s in courses[course_name].get("students", [])}
            import time
            for n in names:
                if n not in existing:
                    courses[course_name]["students"].append({
                        "id": int(time.time() * 1000) + added,
                        "name": n,
                        "scores": {},
                        "feedback": "",
                        "isOpen": False
                    })
                    existing.add(n)
                    added += 1

        state["courses"] = courses
        save_state(int(user["id"]), tool, state)

    return jsonify({"ok": True, "added": added})


# ─── API: Export / Import ─────────────────────────────────────────────────────

@app.route("/api/export", methods=["GET"])
@login_required
def api_export():
    user = get_current_user()
    with lock:
        video_state = load_state(int(user["id"]), "video")
        cv_state = load_state(int(user["id"]), "cv")
    
    export_data = {"video": video_state, "cv": cv_state}
    payload = json.dumps(export_data, ensure_ascii=False, indent=2).encode("utf-8")
    
    from datetime import datetime
    return send_file(
        io.BytesIO(payload),
        as_attachment=True,
        download_name=f"respaldo_rubricas_4to_{datetime.now().date()}.json",
        mimetype="application/json",
    )


@app.route("/api/import", methods=["POST"])
@login_required
def api_import():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Archivo requerido"}), 400
    try:
        imported = json.loads(file.read().decode("utf-8"))
    except Exception:
        return jsonify({"error": "JSON inválido"}), 400

    user = get_current_user()
    with lock:
        if "video" in imported:
            save_state(int(user["id"]), "video", imported["video"])
        if "cv" in imported:
            save_state(int(user["id"]), "cv", imported["cv"])
    return jsonify({"ok": True})


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
