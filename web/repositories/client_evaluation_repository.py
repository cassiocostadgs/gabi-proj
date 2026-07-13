"""Repository for the client-evaluation domain — all SQLite access for this domain."""

from db import _db
from gabi_engine import norm


def insert_draft(
    *,
    competencia: str,
    nome_extraido: str,
    user_email,
    match_status: str,
    fornecedor_validado: int,
    comportamental_nota,
    comportamental_comentario,
    tecnica_nota,
    tecnica_comentario,
    prazo_nota,
    prazo_comentario,
    comentario_geral,
    raw_email_text: str,
    email_message_id,
    origem: str,
    created_by: str,
) -> int:
    with _db() as conn:
        cursor = conn.execute(
            """
            INSERT INTO client_evaluations (
                competencia, nome_extraido, user_email, match_status, fornecedor_validado,
                comportamental_nota, comportamental_comentario,
                tecnica_nota, tecnica_comentario,
                prazo_nota, prazo_comentario,
                comentario_geral, raw_email_text,
                email_message_id, origem, status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?)
            """,
            (
                competencia,
                nome_extraido,
                user_email,
                match_status,
                fornecedor_validado,
                comportamental_nota,
                comportamental_comentario,
                tecnica_nota,
                tecnica_comentario,
                prazo_nota,
                prazo_comentario,
                comentario_geral,
                raw_email_text,
                email_message_id,
                origem,
                created_by,
            ),
        )
        row_id = cursor.lastrowid
    return row_id


def find_by_message_id(message_id: str):
    with _db() as conn:
        return conn.execute(
            "SELECT * FROM client_evaluations WHERE email_message_id = ?",
            (message_id,),
        ).fetchone()


def find_by_email_competencia(user_email: str, competencia: str):
    with _db() as conn:
        return conn.execute(
            "SELECT * FROM client_evaluations WHERE user_email = ? AND competencia = ?",
            (user_email, competencia),
        ).fetchone()


def find_by_name_competencia(nome_extraido: str, competencia: str) -> list:
    """Find records with NULL user_email for the same competencia by normalized name."""
    normalized = norm(nome_extraido)
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM client_evaluations WHERE competencia = ? AND user_email IS NULL",
            (competencia,),
        ).fetchall()
    return [r for r in rows if norm(r["nome_extraido"]) == normalized]


def find_approved_by_email_competencia(user_email: str, competencia: str):
    with _db() as conn:
        return conn.execute(
            "SELECT * FROM client_evaluations"
            " WHERE user_email = ? AND competencia = ? AND status = 'aprovado'",
            (user_email, competencia),
        ).fetchone()


def get_by_id(record_id: int):
    with _db() as conn:
        return conn.execute(
            "SELECT * FROM client_evaluations WHERE id = ?",
            (record_id,),
        ).fetchone()


def list_all(status_filter=None) -> list:
    with _db() as conn:
        if status_filter:
            return conn.execute(
                "SELECT * FROM client_evaluations WHERE status = ? ORDER BY created_at DESC",
                (status_filter,),
            ).fetchall()
        return conn.execute("SELECT * FROM client_evaluations ORDER BY created_at DESC").fetchall()


def update_draft(record_id: int, fields: dict, edited_by: str, edited_at: str) -> int:
    """Update editable draft fields. Returns rowcount (0 if record not found)."""
    if not fields:
        return 0

    # Reflect manual professional link in match_status
    if "user_email" in fields:
        fields = {**fields, "match_status": "manual" if fields["user_email"] else "nao_vinculado"}

    # Build SET clause from known column names — values are always parameterised
    set_clause = ", ".join(k + " = ?" for k in fields)
    sql = (
        "UPDATE client_evaluations SET "
        + set_clause
        + ", edited_by = ?, edited_at = ? WHERE id = ?"
    )
    values = [*fields.values(), edited_by, edited_at, record_id]
    with _db() as conn:
        result = conn.execute(sql, values)
    return result.rowcount


def update_status(record_id: int, new_status: str, reviewed_by: str, reviewed_at: str) -> int:
    with _db() as conn:
        result = conn.execute(
            "UPDATE client_evaluations"
            " SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
            (new_status, reviewed_by, reviewed_at, record_id),
        )
    return result.rowcount


def list_team_members_active() -> list:
    with _db() as conn:
        return conn.execute(
            "SELECT user_email FROM team_members WHERE is_active = 1 ORDER BY user_email"
        ).fetchall()


def get_dashboard(
    user_email_filter=None,
    competencia_from=None,
    competencia_to=None,
) -> list:
    sql = "SELECT * FROM client_evaluations WHERE status = 'aprovado'"
    params: list = []
    if user_email_filter:
        sql += " AND user_email = ?"
        params.append(user_email_filter)
    if competencia_from:
        sql += " AND competencia >= ?"
        params.append(competencia_from)
    if competencia_to:
        sql += " AND competencia <= ?"
        params.append(competencia_to)
    sql += " ORDER BY competencia ASC, user_email ASC"
    with _db() as conn:
        return conn.execute(sql, params).fetchall()


def get_my_evaluations(user_email: str) -> list:
    with _db() as conn:
        return conn.execute(
            "SELECT * FROM client_evaluations"
            " WHERE user_email = ? AND status = 'aprovado'"
            " ORDER BY competencia DESC",
            (user_email,),
        ).fetchall()
