"""Repository for the tl-evaluation domain — squad and member management."""

from datetime import UTC, datetime

from db import _db


def create_squad(nome: str, tech_lead_user_email: str):
    with _db() as conn:
        return conn.execute(
            "INSERT INTO squads (nome, tech_lead_user_email) VALUES (%s, %s) RETURNING *",
            (nome, tech_lead_user_email),
        ).fetchone()


def list_squads() -> list:
    with _db() as conn:
        return conn.execute("SELECT * FROM squads ORDER BY nome").fetchall()


def update_squad(squad_id: int, fields: dict) -> int:
    if not fields:
        return 0
    set_clause = ", ".join(k + " = %s" for k in fields)
    sql = f"UPDATE squads SET {set_clause} WHERE id = %s"
    values = [*fields.values(), squad_id]
    with _db() as conn:
        result = conn.execute(sql, values)
    return result.rowcount


_MEMBER_SELECT = """
    SELECT sm.*, r.nome AS papel_nome, r.descricao AS papel_descricao,
           r.categoria AS papel_categoria
    FROM squad_members sm
    JOIN tl_evaluation_roles r ON r.id = sm.role_id
"""


def list_squad_members_admin(squad_id: int) -> list:
    """All members of a squad, active and deactivated."""
    with _db() as conn:
        return conn.execute(
            f"{_MEMBER_SELECT} WHERE sm.squad_id = %s ORDER BY sm.nome",
            (squad_id,),
        ).fetchall()


def get_member(member_id: int):
    """A single squad member (with joined role info), or None."""
    with _db() as conn:
        return conn.execute(
            f"{_MEMBER_SELECT} WHERE sm.id = %s",
            (member_id,),
        ).fetchone()


def get_squad(squad_id: int):
    """A single squad, or None."""
    with _db() as conn:
        return conn.execute("SELECT * FROM squads WHERE id = %s", (squad_id,)).fetchone()


def is_squad_tl(user_email: str, squad_id: int) -> bool:
    """Returns True iff the squad's tech_lead_user_email matches user_email."""
    with _db() as conn:
        row = conn.execute(
            "SELECT 1 FROM squads WHERE id = %s AND tech_lead_user_email = %s",
            (squad_id, user_email),
        ).fetchone()
    return row is not None


def list_tl_squads(user_email: str) -> list:
    """Squads where the given user is the tech lead."""
    with _db() as conn:
        return conn.execute(
            "SELECT * FROM squads WHERE tech_lead_user_email = %s ORDER BY nome",
            (user_email,),
        ).fetchall()


def create_member(
    squad_id: int,
    nome: str,
    role_id: int,
    senioridade: str,
    fornecedor: str,
):
    with _db() as conn:
        cursor = conn.execute(
            "INSERT INTO squad_members (squad_id, nome, role_id, senioridade, fornecedor)"
            " VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (squad_id, nome, role_id, senioridade, fornecedor),
        )
        member_id = cursor.fetchone()["id"]
        return conn.execute(f"{_MEMBER_SELECT} WHERE sm.id = %s", (member_id,)).fetchone()


def list_members(squad_id: int) -> list:
    """Active members of the squad only."""
    with _db() as conn:
        return conn.execute(
            f"{_MEMBER_SELECT} WHERE sm.squad_id = %s AND sm.ativo = 1 ORDER BY sm.nome",
            (squad_id,),
        ).fetchall()


def update_member(member_id: int, fields: dict) -> int:
    if not fields:
        return 0
    updated = dict(fields)
    if "ativo" in updated:
        if updated["ativo"] == 0 or updated["ativo"] is False:
            updated["removed_at"] = datetime.now(tz=UTC).strftime("%Y-%m-%d %H:%M:%S")
        else:
            updated["removed_at"] = None
    set_clause = ", ".join(k + " = %s" for k in updated)
    sql = f"UPDATE squad_members SET {set_clause} WHERE id = %s"
    values = [*updated.values(), member_id]
    with _db() as conn:
        result = conn.execute(sql, values)
    return result.rowcount
