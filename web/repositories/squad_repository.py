"""Repository for the tl-evaluation domain — squad and member management."""

from datetime import UTC, datetime

from db import _db


def create_squad(nome: str, tech_lead_user_email: str):
    with _db() as conn:
        cursor = conn.execute(
            "INSERT INTO squads (nome, tech_lead_user_email) VALUES (?, ?)",
            (nome, tech_lead_user_email),
        )
        return conn.execute("SELECT * FROM squads WHERE id = ?", (cursor.lastrowid,)).fetchone()


def list_squads() -> list:
    with _db() as conn:
        return conn.execute("SELECT * FROM squads ORDER BY nome").fetchall()


def update_squad(squad_id: int, fields: dict) -> int:
    if not fields:
        return 0
    set_clause = ", ".join(k + " = ?" for k in fields)
    sql = f"UPDATE squads SET {set_clause} WHERE id = ?"
    values = [*fields.values(), squad_id]
    with _db() as conn:
        result = conn.execute(sql, values)
    return result.rowcount


def list_squad_members_admin(squad_id: int) -> list:
    """All members of a squad, active and deactivated."""
    with _db() as conn:
        return conn.execute(
            "SELECT * FROM squad_members WHERE squad_id = ? ORDER BY nome",
            (squad_id,),
        ).fetchall()


def is_squad_tl(user_email: str, squad_id: int) -> bool:
    """Returns True iff the squad's tech_lead_user_email matches user_email."""
    with _db() as conn:
        row = conn.execute(
            "SELECT 1 FROM squads WHERE id = ? AND tech_lead_user_email = ?",
            (squad_id, user_email),
        ).fetchone()
    return row is not None


def list_tl_squads(user_email: str) -> list:
    """Squads where the given user is the tech lead."""
    with _db() as conn:
        return conn.execute(
            "SELECT * FROM squads WHERE tech_lead_user_email = ? ORDER BY nome",
            (user_email,),
        ).fetchall()


def create_member(
    squad_id: int,
    nome: str,
    papel: str,
    senioridade: str,
    fornecedor: str,
):
    with _db() as conn:
        cursor = conn.execute(
            "INSERT INTO squad_members (squad_id, nome, papel, senioridade, fornecedor)"
            " VALUES (?, ?, ?, ?, ?)",
            (squad_id, nome, papel, senioridade, fornecedor),
        )
        return conn.execute(
            "SELECT * FROM squad_members WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()


def list_members(squad_id: int) -> list:
    """Active members of the squad only."""
    with _db() as conn:
        return conn.execute(
            "SELECT * FROM squad_members WHERE squad_id = ? AND ativo = 1 ORDER BY nome",
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
    set_clause = ", ".join(k + " = ?" for k in updated)
    sql = f"UPDATE squad_members SET {set_clause} WHERE id = ?"
    values = [*updated.values(), member_id]
    with _db() as conn:
        result = conn.execute(sql, values)
    return result.rowcount
