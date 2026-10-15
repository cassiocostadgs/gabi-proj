"""One-off migration: copy the legacy SQLite database (web/users.db) into PostgreSQL.

Usage (from the repository root, with DATABASE_URL set in web/.env or the environment):

    python scripts/migrate_sqlite_to_postgres.py [path/to/users.db] [--force]

The schema is created through main._init_db(); every table is then emptied and
refilled from SQLite with the original ids, so foreign keys and the API ids the
users already know stay the same. Run it once, before the app serves traffic on
the new database. --force is required when the target already holds real data.
"""

import sqlite3
import sys
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
sys.path.insert(0, str(WEB_DIR))

import main  # noqa: E402
from db import _db  # noqa: E402

# Foreign-key dependency order — parents before children.
TABLES = [
    "users",
    "task_uploads",
    "settings",
    "billing_rates",
    "team_members",
    "ga_submissions",
    "client_evaluations",
    "tl_evaluation_roles",
    "tl_evaluation_role_responsibilities",
    "squads",
    "squad_members",
    "tl_evaluations",
    "squad_competencia_closures",
    "tl_evaluation_prompt_sections",
    "tl_evaluation_prompt_section_history",
    "tl_evaluation_voice_forbidden_words",
]
TABLES_WITHOUT_ID = {
    "settings",
    "billing_rates",
    "squad_competencia_closures",
    "tl_evaluation_prompt_sections",
}
# Tables that only ever hold user data — anything here means the target is in use.
USER_DATA_TABLES = ["team_members", "ga_submissions", "client_evaluations", "squads"]


def _target_has_user_data(conn) -> bool:
    return any(
        conn.execute(f"SELECT 1 FROM {table} LIMIT 1").fetchone() for table in USER_DATA_TABLES
    )


def _columns(conn, table: str) -> list[str]:
    rows = conn.execute(
        "SELECT column_name FROM information_schema.columns"
        " WHERE table_schema = current_schema() AND table_name = %s",
        (table,),
    ).fetchall()
    return [row["column_name"] for row in rows]


def _copy_table(source: sqlite3.Connection, conn, table: str) -> int:
    exists = source.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    if not exists:
        return 0
    source_columns = {row[1] for row in source.execute(f"PRAGMA table_info({table})")}
    columns = [c for c in _columns(conn, table) if c in source_columns]
    column_list = ", ".join(columns)
    placeholders = ", ".join("%s" for _ in columns)
    rows = source.execute(f"SELECT {column_list} FROM {table}").fetchall()
    with conn.cursor() as cursor:
        cursor.executemany(
            f"INSERT INTO {table} ({column_list}) VALUES ({placeholders})",
            [tuple(row) for row in rows],
        )
    return len(rows)


def _reset_identity(conn, table: str) -> None:
    # Rows were inserted with explicit ids, so the identity sequence must skip past them.
    conn.execute(
        f"SELECT setval(pg_get_serial_sequence('{table}', 'id'),"
        f" COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM {table}"
    )


def migrate(sqlite_path: Path, force: bool) -> None:
    main._init_db()
    source = sqlite3.connect(sqlite_path)
    with _db() as conn:
        if _target_has_user_data(conn) and not force:
            sys.exit("O banco de destino já contém dados — use --force para sobrescrever.")
        conn.execute(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE")
        for table in TABLES:
            copied = _copy_table(source, conn, table)
            if table not in TABLES_WITHOUT_ID:
                _reset_identity(conn, table)
            print(f"{table}: {copied} linha(s)")
    source.close()


if __name__ == "__main__":
    arguments = [a for a in sys.argv[1:] if a != "--force"]
    path = Path(arguments[0]) if arguments else WEB_DIR / "users.db"
    if not path.exists():
        sys.exit(f"Arquivo SQLite não encontrado: {path}")
    migrate(path, force="--force" in sys.argv)
