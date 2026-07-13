"""SQLite connection factory — shared across all repository modules."""

import sqlite3


def _db() -> sqlite3.Connection:
    # Deferred import avoids circular dependency at module load time.
    # main.DB_PATH is monkeypatched by the test suite; the lazy read picks up the patched value.
    import main as _main

    conn = sqlite3.connect(_main.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
