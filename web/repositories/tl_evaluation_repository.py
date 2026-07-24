"""Repository for the tl-evaluation domain — evaluation persistence and history queries."""

from datetime import UTC, datetime

from db import _db

_DELETE_CLOSURE_SQL = (
    "DELETE FROM squad_competencia_closures WHERE squad_id = ? AND competencia = ?"
)


def upsert_evaluation(
    *,
    squad_id: int,
    squad_member_id: int,
    competencia: str,
    comportamental_nota: int,
    comportamental_paragrafo: str,
    tecnica_nota: int,
    tecnica_paragrafo: str,
    prazo_nota: int,
    prazo_paragrafo: str,
    janela_reduzida: bool,
    confirmed_by: str,
) -> None:
    now = datetime.now(tz=UTC).strftime("%Y-%m-%d %H:%M:%S")
    with _db() as conn:
        # Closing-state guard: delete any closure row to reopen the competência.
        conn.execute(
            _DELETE_CLOSURE_SQL,
            (squad_id, competencia),
        )
        conn.execute(
            """
            INSERT INTO tl_evaluations (
                squad_id, squad_member_id, competencia,
                comportamental_nota, comportamental_paragrafo,
                tecnica_nota, tecnica_paragrafo,
                prazo_nota, prazo_paragrafo,
                janela_reduzida, status, confirmed_by, confirmed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmado', ?, ?)
            ON CONFLICT(squad_id, competencia, squad_member_id) DO UPDATE SET
                comportamental_nota      = excluded.comportamental_nota,
                comportamental_paragrafo = excluded.comportamental_paragrafo,
                tecnica_nota             = excluded.tecnica_nota,
                tecnica_paragrafo        = excluded.tecnica_paragrafo,
                prazo_nota               = excluded.prazo_nota,
                prazo_paragrafo          = excluded.prazo_paragrafo,
                janela_reduzida          = excluded.janela_reduzida,
                status                   = 'confirmado',
                confirmed_by             = excluded.confirmed_by,
                confirmed_at             = excluded.confirmed_at
            """,
            (
                squad_id,
                squad_member_id,
                competencia,
                comportamental_nota,
                comportamental_paragrafo,
                tecnica_nota,
                tecnica_paragrafo,
                prazo_nota,
                prazo_paragrafo,
                int(janela_reduzida),
                confirmed_by,
                now,
            ),
        )


def list_evaluations(squad_id: int, competencia: str) -> list:
    """Confirmed evaluations for a squad/competência, joined with member name/role."""
    with _db() as conn:
        return conn.execute(
            """
            SELECT te.*, sm.nome, sm.senioridade, r.nome AS papel_nome
            FROM tl_evaluations te
            JOIN squad_members sm ON sm.id = te.squad_member_id
            JOIN tl_evaluation_roles r ON r.id = sm.role_id
            WHERE te.squad_id = ? AND te.competencia = ? AND te.status = 'confirmado'
            ORDER BY sm.nome
            """,
            (squad_id, competencia),
        ).fetchall()


def get_historico(squad_id: int) -> list:
    """Confirmed evaluations for all prior competências (not current month), including inactive."""
    current_competencia = datetime.now().strftime("%Y-%m")
    with _db() as conn:
        return conn.execute(
            """
            SELECT te.*, sm.nome
            FROM tl_evaluations te
            JOIN squad_members sm ON sm.id = te.squad_member_id
            WHERE te.squad_id = ? AND te.competencia < ? AND te.status = 'confirmado'
            ORDER BY te.competencia DESC, sm.nome
            """,
            (squad_id, current_competencia),
        ).fetchall()


def close_competencia(squad_id: int, competencia: str, closed_by: str):
    with _db() as conn:
        conn.execute(
            "INSERT INTO squad_competencia_closures (squad_id, competencia, closed_by)"
            " VALUES (?, ?, ?)",
            (squad_id, competencia, closed_by),
        )
        return conn.execute(
            "SELECT * FROM squad_competencia_closures WHERE squad_id = ? AND competencia = ?",
            (squad_id, competencia),
        ).fetchone()


def get_closure(squad_id: int, competencia: str):
    """Returns the closure row or None."""
    with _db() as conn:
        return conn.execute(
            "SELECT * FROM squad_competencia_closures WHERE squad_id = ? AND competencia = ?",
            (squad_id, competencia),
        ).fetchone()


def reopen_competencia(squad_id: int, competencia: str) -> None:
    """Deletes the closure row, reopening the competência without touching evaluations."""
    with _db() as conn:
        conn.execute(
            _DELETE_CLOSURE_SQL,
            (squad_id, competencia),
        )


def reopen_evaluation(squad_id: int, competencia: str, squad_member_id: int) -> None:
    """Un-confirms one evaluation (status -> rascunho) and reopens the competência's closure.

    Notas/parágrafos are kept as-is so the TL can start editing from the previous values —
    only upsert_evaluation overwrites them, on the next confirm.
    """
    with _db() as conn:
        conn.execute(
            """
            UPDATE tl_evaluations SET status = 'rascunho'
            WHERE squad_id = ? AND competencia = ? AND squad_member_id = ?
            """,
            (squad_id, competencia, squad_member_id),
        )
        conn.execute(
            _DELETE_CLOSURE_SQL,
            (squad_id, competencia),
        )
