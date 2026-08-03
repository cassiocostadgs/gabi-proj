"""Repository for the tl-evaluation domain — admin-editable prompt content.

Two kinds of admin-owned data live here:
- `tl_evaluation_prompt_sections`: free-text prose for each editable section of
  the system prompt (`tl_evaluation_engine.EDITABLE_SECTION_KEYS`). Every write
  is preceded by a history snapshot — this policy attaches to real people's
  monthly records, so admins need to reconstruct what a rule said at any past
  date, not just see the latest value.
- `tl_evaluation_voice_forbidden_words`: the structured word list that is the
  single source read both by the rendered "Regra de voz" prompt section and by
  `tl_evaluation_engine._check_voice_rule()` — see spec
  003-tl-evaluation-prompt-admin for why this one is not free text.
"""

import tl_evaluation_engine as engine
from db import _db

MIN_FORBIDDEN_WORD_LENGTH = 3

_SELECT_VOICE_WORDS = "SELECT palavra FROM tl_evaluation_voice_forbidden_words ORDER BY id"


def seed_defaults(conn) -> None:
    """Populate sections and forbidden words with today's shipped defaults.
    Idempotent caller guard: main.py only calls this when
    tl_evaluation_prompt_sections is empty. Takes an already-open connection —
    runs inside the same startup transaction as the table creation, matching
    the pattern of tl_evaluation_role_repository.seed_default_roles."""
    seed_email = "system@seed"
    for key, content in engine.default_sections().items():
        conn.execute(
            "INSERT INTO tl_evaluation_prompt_sections (section_key, content, updated_by)"
            " VALUES (?, ?, ?)",
            (key, content, seed_email),
        )
    for palavra in engine.default_forbidden_words():
        conn.execute(
            "INSERT INTO tl_evaluation_voice_forbidden_words (palavra, created_by) VALUES (?, ?)",
            (palavra, seed_email),
        )


# ── Sections ──────────────────────────────────────────────────────────────────


def get_sections() -> dict[str, dict]:
    """`{section_key: {"content", "updated_by", "updated_at"}}` for every row."""
    with _db() as conn:
        rows = conn.execute("SELECT * FROM tl_evaluation_prompt_sections").fetchall()
    return {
        row["section_key"]: {
            "content": row["content"],
            "updated_by": row["updated_by"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    }


def get_section_contents() -> dict[str, str]:
    """Bare `{section_key: content}` map — what `tl_evaluation_engine.build_chat_request`
    actually consumes, with no audit metadata."""
    return {key: row["content"] for key, row in get_sections().items()}


def update_section(section_key: str, content: str, user_email: str) -> dict:
    """Raises ValueError if `section_key` is not admin-editable (e.g. "escala",
    "voz", or an unrecognized key). Logs the previous value to history before
    overwriting."""
    if section_key not in engine.EDITABLE_SECTION_KEYS:
        raise ValueError(f"section_key inválido: {section_key!r}")
    with _db() as conn:
        existing = conn.execute(
            "SELECT content FROM tl_evaluation_prompt_sections WHERE section_key = ?",
            (section_key,),
        ).fetchone()
        if existing is not None:
            conn.execute(
                "INSERT INTO tl_evaluation_prompt_section_history"
                " (section_key, content, changed_by) VALUES (?, ?, ?)",
                (section_key, existing["content"], user_email),
            )
        conn.execute(
            "INSERT INTO tl_evaluation_prompt_sections"
            " (section_key, content, updated_by, updated_at)"
            " VALUES (?, ?, ?, datetime('now'))"
            " ON CONFLICT(section_key) DO UPDATE SET"
            " content = excluded.content, updated_by = excluded.updated_by,"
            " updated_at = excluded.updated_at",
            (section_key, content, user_email),
        )
        row = conn.execute(
            "SELECT * FROM tl_evaluation_prompt_sections WHERE section_key = ?",
            (section_key,),
        ).fetchone()
    return dict(row)


def get_section_history(section_key: str) -> list[dict]:
    """Oldest first — the value(s) this section held before the current one."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT content, changed_by, changed_at FROM tl_evaluation_prompt_section_history"
            " WHERE section_key = ? ORDER BY id",
            (section_key,),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Forbidden voice-rule words ────────────────────────────────────────────────


def get_forbidden_words() -> list[str]:
    with _db() as conn:
        rows = conn.execute(_SELECT_VOICE_WORDS).fetchall()
    return [r["palavra"] for r in rows]


def _snapshot_voice_words(conn, user_email: str) -> None:
    current = [r["palavra"] for r in conn.execute(_SELECT_VOICE_WORDS).fetchall()]
    conn.execute(
        "INSERT INTO tl_evaluation_prompt_section_history (section_key, content, changed_by)"
        " VALUES ('voz', ?, ?)",
        (", ".join(current), user_email),
    )


def add_forbidden_word(palavra: str, user_email: str) -> list[str]:
    """Raises ValueError if `palavra` is shorter than MIN_FORBIDDEN_WORD_LENGTH
    or already present — both are guardrails against an admin fat-fingering a
    word common enough to make `_check_voice_rule` reject most evaluations."""
    palavra = palavra.strip()
    if len(palavra) < MIN_FORBIDDEN_WORD_LENGTH:
        raise ValueError(f"Palavra deve ter ao menos {MIN_FORBIDDEN_WORD_LENGTH} caracteres")
    with _db() as conn:
        existing = conn.execute(
            "SELECT 1 FROM tl_evaluation_voice_forbidden_words WHERE palavra = ?",
            (palavra,),
        ).fetchone()
        if existing:
            raise ValueError(f"Palavra já cadastrada: {palavra!r}")
        _snapshot_voice_words(conn, user_email)
        conn.execute(
            "INSERT INTO tl_evaluation_voice_forbidden_words (palavra, created_by) VALUES (?, ?)",
            (palavra, user_email),
        )
        rows = conn.execute(_SELECT_VOICE_WORDS).fetchall()
    return [r["palavra"] for r in rows]


def remove_forbidden_word(palavra: str, user_email: str) -> list[str]:
    with _db() as conn:
        _snapshot_voice_words(conn, user_email)
        conn.execute(
            "DELETE FROM tl_evaluation_voice_forbidden_words WHERE palavra = ?", (palavra,)
        )
        rows = conn.execute(_SELECT_VOICE_WORDS).fetchall()
    return [r["palavra"] for r in rows]
