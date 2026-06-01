#!/usr/bin/env python3
"""G.A.B.I. Web — FastAPI backend."""
import os
import sqlite3
import tempfile
import secrets
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Annotated, List, Optional

import anyio
import bcrypt
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt

import gabi_engine

# ── Config ────────────────────────────────────────────────────────────────────

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "users.db"
TASKS_DIR = BASE_DIR / "tasks"
STATIC_DIR = BASE_DIR / "static"


def _load_secret_key() -> str:
    """Retorna SECRET_KEY persistente entre reinicios (evita invalidar tokens com --reload)."""
    if env := os.getenv("SECRET_KEY"):
        return env
    key_file = BASE_DIR / ".secret_key"
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_hex(32)
    key_file.write_text(key)
    return key


SECRET_KEY = _load_secret_key()

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

app = FastAPI(title="G.A.B.I.", description="Gap Auditor of Billed Input", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ── Password helpers ──────────────────────────────────────────────────────────

def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── Database ──────────────────────────────────────────────────────────────────

def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                email           TEXT    UNIQUE NOT NULL,
                hashed_password TEXT    NOT NULL,
                is_active       INTEGER NOT NULL DEFAULT 1,
                created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS task_uploads (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                filename    TEXT NOT NULL,
                path        TEXT NOT NULL,
                competencia TEXT NOT NULL DEFAULT '',
                uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
                uploaded_by TEXT NOT NULL
            )
        """)
        try:
            conn.execute("ALTER TABLE task_uploads ADD COLUMN competencia TEXT NOT NULL DEFAULT ''")
        except sqlite3.OperationalError:
            pass
        if not conn.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            default_email = os.getenv("ADMIN_EMAIL", "tiagohlatki@db1.com.br")
            default_pass = os.getenv("ADMIN_PASSWORD", "gabi2025")
            conn.execute(
                "INSERT INTO users (email, hashed_password) VALUES (?, ?)",
                (default_email, _hash(default_pass)),
            )
            print(f"\n  ✅ Usuário admin criado: {default_email} / {default_pass}")
            print("  ⚠️  Altere a senha com POST /auth/change-password\n")


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _create_token(email: str) -> str:
    exp = datetime.now(tz=timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": email, "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)


def _current_user(token: Annotated[str, Depends(oauth2)]) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub", "")
        if not email:
            raise ValueError
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
        )
    with _db() as conn:
        row = conn.execute(
            "SELECT 1 FROM users WHERE email=? AND is_active=1", (email,)
        ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário inativo",
        )
    return email


CurrentUser = Annotated[str, Depends(_current_user)]


# ── Routes: auth ──────────────────────────────────────────────────────────────

@app.post("/auth/login")
async def login(form: Annotated[OAuth2PasswordRequestForm, Depends()]):
    with _db() as conn:
        row = conn.execute(
            "SELECT hashed_password FROM users WHERE email=? AND is_active=1",
            (form.username,),
        ).fetchone()
    if not row or not _verify(form.password, row["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
        )
    return {"access_token": _create_token(form.username), "token_type": "bearer"}


@app.get("/auth/me")
async def me(email: CurrentUser):
    return {"email": email}


@app.post("/auth/change-password", responses={400: {"description": "Senha atual incorreta ou nova senha muito curta"}})
async def change_password(
    current_password: str,
    new_password: str,
    email: CurrentUser,
):
    with _db() as conn:
        row = conn.execute(
            "SELECT hashed_password FROM users WHERE email=?", (email,)
        ).fetchone()
        if not _verify(current_password, row["hashed_password"]):
            raise HTTPException(status_code=400, detail="Senha atual incorreta")
        if len(new_password) < 6:
            raise HTTPException(
                status_code=400,
                detail="Nova senha deve ter pelo menos 6 caracteres",
            )
        conn.execute(
            "UPDATE users SET hashed_password=? WHERE email=?",
            (_hash(new_password), email),
        )
    return {"ok": True}


# ── Routes: task status (public) ──────────────────────────────────────────────

@app.get("/api/task/status")
async def task_status():
    with _db() as conn:
        row = conn.execute(
            "SELECT id, filename, competencia, uploaded_at, uploaded_by FROM task_uploads ORDER BY competencia DESC, id DESC LIMIT 1"
        ).fetchone()
    if not row:
        return {"available": False}
    return {
        "available": True,
        "id": row["id"],
        "filename": row["filename"],
        "competencia": row["competencia"],
        "uploaded_at": row["uploaded_at"],
        "uploaded_by": row["uploaded_by"],
    }


# ── Routes: admin task management ─────────────────────────────────────────────

@app.post("/api/admin/task")
async def admin_upload_task(
    task: Annotated[UploadFile, File(description="Arquivo Task.xlsx")],
    competencia: Annotated[str, Form(description="Competência no formato YYYY-MM")],
    email: CurrentUser,
):
    TASKS_DIR.mkdir(exist_ok=True)
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    safe_name = f"{ts}_{task.filename or 'task.xlsx'}"
    dest = TASKS_DIR / safe_name

    async with await anyio.open_file(dest, "wb") as f:
        await f.write(await task.read())

    with _db() as conn:
        conn.execute(
            "INSERT INTO task_uploads (filename, path, competencia, uploaded_by) VALUES (?, ?, ?, ?)",
            (task.filename or "task.xlsx", str(dest), competencia, email),
        )

    return {"ok": True, "filename": task.filename, "competencia": competencia}


@app.delete("/api/admin/task/{task_id}", responses={404: {"description": "Upload não encontrado"}})
async def admin_delete_task(task_id: int, _: CurrentUser):
    with _db() as conn:
        row = conn.execute("SELECT path FROM task_uploads WHERE id=?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Upload não encontrado")
        conn.execute("DELETE FROM task_uploads WHERE id=?", (task_id,))
    try:
        Path(row["path"]).unlink(missing_ok=True)
    except Exception:
        pass
    return {"ok": True}


@app.get("/api/admin/tasks")
async def admin_list_tasks(_: CurrentUser):
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, filename, competencia, uploaded_at, uploaded_by FROM task_uploads ORDER BY id DESC"
        ).fetchall()
    return {"tasks": [dict(r) for r in rows]}


# ── Routes: validate (public) ─────────────────────────────────────────────────

@app.get("/api/task/competencias")
async def task_competencias():
    with _db() as conn:
        rows = conn.execute("""
            SELECT t.competencia, t.uploaded_at, t.uploaded_by
            FROM task_uploads t
            WHERE t.id IN (SELECT MAX(id) FROM task_uploads GROUP BY competencia)
            ORDER BY t.competencia DESC
        """).fetchall()
    return {"competencias": [dict(r) for r in rows]}


@app.post("/api/validate", responses={422: {"description": "Task não disponível, arquivo ausente ou erro de processamento"}})
async def validate(
    ga: Annotated[List[UploadFile], File(description="Um ou mais arquivos GA.xls")],
    competencia: Annotated[Optional[str], Form(description="Competência a validar")] = None,
):
    with _db() as conn:
        if competencia:
            row = conn.execute(
                "SELECT path, filename FROM task_uploads WHERE competencia=? ORDER BY id DESC LIMIT 1",
                (competencia,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT path, filename FROM task_uploads ORDER BY competencia DESC, id DESC LIMIT 1"
            ).fetchone()
    if not row:
        raise HTTPException(
            status_code=422,
            detail="Nenhum relatório Task disponível. Aguarde o administrador fazer o upload.",
        )
    task_path = row["path"]
    if not Path(task_path).exists():
        raise HTTPException(
            status_code=422,
            detail="Arquivo Task não encontrado no servidor. Entre em contato com o administrador.",
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        ga_paths: list[str] = []
        for ga_file in ga:
            ga_path = os.path.join(tmpdir, ga_file.filename or "ga.xls")
            async with await anyio.open_file(ga_path, "wb") as f:
                await f.write(await ga_file.read())
            ga_paths.append(ga_path)

        try:
            persons, errors = gabi_engine.process(task_path, ga_paths)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc))

    if not persons and errors:
        raise HTTPException(status_code=422, detail="\n".join(errors))

    return {"persons": persons, "errors": errors}


# ── Startup + static ──────────────────────────────────────────────────────────

@app.on_event("startup")
def startup() -> None:
    _init_db()
    TASKS_DIR.mkdir(exist_ok=True)


STATIC_DIR.mkdir(exist_ok=True)
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
