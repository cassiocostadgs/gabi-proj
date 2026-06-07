#!/usr/bin/env python3
"""G.A.B.I. Web — FastAPI backend."""

import contextlib
import functools
import os
import secrets
import sqlite3
import tempfile
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Annotated

import anyio
import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from pydantic import BaseModel

load_dotenv()

import gabi_engine  # noqa: E402
from core.oracle import is_oracle_configured, try_init_oracle_client  # noqa: E402

# ── Config ────────────────────────────────────────────────────────────────────

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "users.db"
TASKS_DIR = BASE_DIR / "tasks"
_FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
# Fall back to the legacy monolith until frontend/dist is deployed via CI
STATIC_DIR = _FRONTEND_DIST if _FRONTEND_DIST.exists() else BASE_DIR / "static"


def _load_secret_key() -> str:
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

app = FastAPI(title="G.A.B.I.", description="Gap Auditor of Billed Input", version="3.0.0")
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
                is_admin        INTEGER NOT NULL DEFAULT 0,
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
        # Migrations for existing installs
        for ddl in [
            "ALTER TABLE task_uploads ADD COLUMN competencia TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
        ]:
            with contextlib.suppress(sqlite3.OperationalError):
                conn.execute(ddl)

        if not conn.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            default_email = os.getenv("ADMIN_EMAIL", "tiagohlatki@db1.com.br")
            default_pass = os.getenv("ADMIN_PASSWORD", "gabi2025")
            conn.execute(
                "INSERT INTO users (email, hashed_password, is_admin) VALUES (?, ?, 1)",
                (default_email, _hash(default_pass)),
            )
        else:
            # Promote the configured admin on existing installs after migration
            admin_email = os.getenv("ADMIN_EMAIL", "tiagohlatki@db1.com.br")
            conn.execute(
                "UPDATE users SET is_admin=1 WHERE email=? AND is_admin=0",
                (admin_email,),
            )


# ── Auth helpers ──────────────────────────────────────────────────────────────


def _create_token(email: str) -> str:
    exp = datetime.now(tz=UTC) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": email, "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)


def _current_user(token: Annotated[str, Depends(oauth2)]) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub", "")
        if not email:
            raise ValueError
    except (JWTError, ValueError):  # fmt: skip
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
        ) from None
    with _db() as conn:
        row = conn.execute("SELECT 1 FROM users WHERE email=? AND is_active=1", (email,)).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário inativo")
    return email


def _admin_user(email: Annotated[str, Depends(_current_user)]) -> str:
    with _db() as conn:
        row = conn.execute("SELECT is_admin FROM users WHERE email=?", (email,)).fetchone()
    if not row or not row["is_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores",
        )
    return email


CurrentUser = Annotated[str, Depends(_current_user)]
AdminUser = Annotated[str, Depends(_admin_user)]


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
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas"
        )
    return {"access_token": _create_token(form.username), "token_type": "bearer"}


@app.get("/auth/me")
async def me(email: CurrentUser):
    with _db() as conn:
        row = conn.execute("SELECT is_admin FROM users WHERE email=?", (email,)).fetchone()
    return {"email": email, "is_admin": bool(row["is_admin"]) if row else False}


@app.post(
    "/auth/change-password",
    responses={400: {"description": "Senha atual incorreta ou nova senha inválida"}},
)
async def change_password(current_password: str, new_password: str, email: CurrentUser):
    with _db() as conn:
        row = conn.execute("SELECT hashed_password FROM users WHERE email=?", (email,)).fetchone()
        if not _verify(current_password, row["hashed_password"]):
            raise HTTPException(status_code=400, detail="Senha atual incorreta")
        if len(new_password) < 6:
            raise HTTPException(
                status_code=400, detail="Nova senha deve ter pelo menos 6 caracteres"
            )
        conn.execute(
            "UPDATE users SET hashed_password=? WHERE email=?",
            (_hash(new_password), email),
        )
    return {"ok": True}


# ── Routes: admin — users ─────────────────────────────────────────────────────


class CreateUserRequest(BaseModel):
    email: str
    password: str
    is_admin: bool = False


@app.post(
    "/api/admin/users",
    status_code=201,
    responses={
        400: {"description": "Senha inválida"},
        409: {"description": "E-mail já cadastrado"},
    },
)
async def admin_create_user(body: CreateUserRequest, _: AdminUser):
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter pelo menos 6 caracteres")
    try:
        with _db() as conn:
            conn.execute(
                "INSERT INTO users (email, hashed_password, is_admin) VALUES (?, ?, ?)",
                (body.email, _hash(body.password), int(body.is_admin)),
            )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="E-mail já cadastrado") from exc
    return {"ok": True, "email": body.email}


@app.get("/api/admin/users")
async def admin_list_users(_: AdminUser):
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, email, is_admin, is_active, created_at FROM users ORDER BY id"
        ).fetchall()
    return {"users": [dict(r) for r in rows]}


@app.delete(
    "/api/admin/users/{user_id}",
    responses={
        404: {"description": "Usuário não encontrado"},
        400: {"description": "Não é possível remover o próprio usuário"},
    },
)
async def admin_delete_user(user_id: int, admin_email: AdminUser):
    with _db() as conn:
        row = conn.execute("SELECT email FROM users WHERE id=?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        if row["email"] == admin_email:
            raise HTTPException(status_code=400, detail="Não é possível remover o próprio usuário")
        conn.execute("UPDATE users SET is_active=0 WHERE id=?", (user_id,))
    return {"ok": True}


# ── Routes: task status (public) ──────────────────────────────────────────────


@app.get("/api/task/status")
async def task_status():
    with _db() as conn:
        row = conn.execute(
            "SELECT id, filename, competencia, uploaded_at, uploaded_by FROM task_uploads "
            "ORDER BY competencia DESC, id DESC LIMIT 1"
        ).fetchone()
    if not row:
        return {"available": False}
    return {"available": True, **dict(row)}


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


# ── Routes: oracle status (public) ────────────────────────────────────────────


@app.get("/api/oracle/status")
async def oracle_status():
    if not is_oracle_configured():
        return {"available": False}
    from repositories.task_repository import ping

    available = False
    with anyio.move_on_after(3), contextlib.suppress(Exception):
        available = await anyio.to_thread.run_sync(ping, cancellable=True)
    return {"available": available}


# ── Routes: admin task management ─────────────────────────────────────────────


@app.post("/api/admin/task")
async def admin_upload_task(
    task: Annotated[UploadFile, File()],
    competencia: Annotated[str, Form()],
    email: AdminUser,
):
    TASKS_DIR.mkdir(exist_ok=True)
    ts = datetime.now(tz=UTC).strftime("%Y%m%d_%H%M%S")
    safe_name = f"{ts}_{task.filename or 'task.xlsx'}"
    dest = TASKS_DIR / safe_name
    async with await anyio.open_file(dest, "wb") as f:
        await f.write(await task.read())
    with _db() as conn:
        conn.execute(
            "INSERT INTO task_uploads (filename, path, competencia, uploaded_by)"
            " VALUES (?, ?, ?, ?)",
            (task.filename or "task.xlsx", str(dest), competencia, email),
        )
    return {"ok": True, "filename": task.filename, "competencia": competencia}


@app.delete(
    "/api/admin/task/{task_id}",
    responses={404: {"description": "Upload não encontrado"}},
)
async def admin_delete_task(task_id: int, _: AdminUser):
    with _db() as conn:
        row = conn.execute("SELECT path FROM task_uploads WHERE id=?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Upload não encontrado")
        conn.execute("DELETE FROM task_uploads WHERE id=?", (task_id,))
    with contextlib.suppress(Exception):
        Path(row["path"]).unlink(missing_ok=True)
    return {"ok": True}


@app.get("/api/admin/tasks")
async def admin_list_tasks(_: AdminUser):
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, filename, competencia, uploaded_at, uploaded_by"
            " FROM task_uploads ORDER BY id DESC"
        ).fetchall()
    return {"tasks": [dict(r) for r in rows]}


# ── Routes: validate ──────────────────────────────────────────────────────────


def _resolve_task_file(competencia: str | None) -> str:
    with _db() as conn:
        if competencia:
            row = conn.execute(
                "SELECT path FROM task_uploads WHERE competencia=? ORDER BY id DESC LIMIT 1",
                (competencia,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT path FROM task_uploads ORDER BY competencia DESC, id DESC LIMIT 1"
            ).fetchone()
    if not row:
        raise ValueError(
            "Nenhum relatório Task disponível. Aguarde o administrador fazer o upload."
        )
    if not Path(row["path"]).exists():
        raise ValueError(
            "Arquivo Task não encontrado no servidor. Entre em contato com o administrador."
        )
    return row["path"]


def _process_ga_with_oracle(
    ga_path: str, email: str, sd: date, ed: date, year: int, month: int
) -> tuple[dict | None, str | None]:
    """Returns (person, error_message). One of them is always None."""
    from repositories.task_repository import get_task_hours, responsavel_from_email

    try:
        ga_name, ga_daily, _, _ = gabi_engine.parse_ga(ga_path)
    except Exception as exc:
        return None, f"Erro ao ler GA: {exc}"

    try:
        responsavel = responsavel_from_email(email)
        task_daily, task_nf_daily = get_task_hours(responsavel, sd, ed)
    except Exception as exc:
        return None, f"Erro ao consultar Task DB: {exc}"

    person = gabi_engine.process_with_task_data(
        responsavel, task_daily, ga_name, ga_daily, year, month, sd, ed, task_nf_daily
    )
    return person, None


async def _save_ga_upload(ga_file: UploadFile, tmpdir: str) -> str:
    ga_path = os.path.join(tmpdir, ga_file.filename or "ga.xls")
    async with await anyio.open_file(ga_path, "wb") as f:
        await f.write(await ga_file.read())
    return ga_path


async def _run_oracle(
    ga_path: str, email: str, sd: date, ed: date, year: int, month: int
) -> tuple[dict | None, str | None]:
    try:
        return await anyio.to_thread.run_sync(
            functools.partial(_process_ga_with_oracle, ga_path, email, sd, ed, year, month)
        )
    except Exception as exc:
        return None, f"Erro interno ao processar: {exc}"


def _run_file(ga_path: str, competencia: str | None) -> tuple[list, list]:
    task_path = _resolve_task_file(competencia)
    return gabi_engine.process(task_path, [ga_path])


@app.post(
    "/api/validate",
    responses={422: {"description": "Erro de validação ou arquivo Task ausente"}},
)
async def validate(
    ga: Annotated[list[UploadFile], File()],
    start_date: Annotated[str, Form()],
    end_date: Annotated[str, Form()],
    use_file_fallback: Annotated[bool, Form()] = False,
    competencia: Annotated[str | None, Form()] = None,
    email: CurrentUser = "",
):
    sd = date.fromisoformat(start_date)
    ed = date.fromisoformat(end_date)
    year, month = sd.year, sd.month
    use_oracle = is_oracle_configured() and not use_file_fallback
    persons: list = []
    errors: list = []

    with tempfile.TemporaryDirectory() as tmpdir:
        for ga_file in ga:
            ga_path = await _save_ga_upload(ga_file, tmpdir)
            if use_oracle:
                person, error = await _run_oracle(ga_path, email, sd, ed, year, month)
                if error:
                    errors.append(error)
                else:
                    persons.append(person)
            else:
                try:
                    p, e = _run_file(ga_path, competencia)
                    persons.extend(p)
                    errors.extend(e)
                except Exception as exc:
                    raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not persons and errors:
        raise HTTPException(status_code=422, detail="\n".join(errors))

    return {"persons": persons, "errors": errors}


# ── Startup + static ──────────────────────────────────────────────────────────


@app.on_event("startup")
def startup() -> None:
    _init_db()
    TASKS_DIR.mkdir(exist_ok=True)
    try_init_oracle_client()


if STATIC_DIR.exists():
    if STATIC_DIR == _FRONTEND_DIST:
        # React SPA: serve /assets/* as static files; every other GET path serves
        # index.html so React Router handles client-side navigation (/results, etc.)
        assets_dir = STATIC_DIR / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        # Serve root-level static files (e.g. favicon, logo) before the SPA fallback
        for _static_file in STATIC_DIR.iterdir():
            if _static_file.is_file() and _static_file.name != "index.html":
                _name = _static_file.name

                def _make_route(static_path: Path):
                    route = "/" + static_path.name

                    @app.get(route, include_in_schema=False)
                    async def _static_root():
                        return FileResponse(static_path)

                _make_route(_static_file)

        @app.get("/{full_path:path}")
        async def spa_fallback(full_path: str):
            return FileResponse(STATIC_DIR / "index.html")

    else:
        # Legacy monolith — html=True makes / serve index.html automatically
        app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
