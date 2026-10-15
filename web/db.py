"""PostgreSQL connection factory — shared across all repository modules."""

import threading
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.adapt import Dumper
from psycopg.rows import dict_row
from psycopg.types.datetime import TimestampLoader
from psycopg_pool import ConnectionPool

IntegrityError = psycopg.IntegrityError

_POOL_MAX_SIZE = 10
_TIMESTAMP_FORMAT = "%Y-%m-%d %H:%M:%S"

_pools: dict[str, ConnectionPool] = {}
_pools_lock = threading.Lock()


class _BoolAsIntDumper(Dumper):
    """Flag columns are INTEGER 0/1 (the API returns 0/1, not true/false), so Python
    bools must be sent as integers — Postgres refuses boolean → integer implicitly."""

    oid = psycopg.adapters.types["int2"].oid

    def dump(self, obj: bool) -> bytes:
        return b"1" if obj else b"0"


class _TimestampAsTextLoader(TimestampLoader):
    """Timestamps keep the plain "YYYY-MM-DD HH:MM:SS" string the frontend already consumes.
    Formatted here rather than via a DateStyle session option, which PgBouncer rejects."""

    def load(self, data) -> str:
        return super().load(data).strftime(_TIMESTAMP_FORMAT)


def _configure(conn: psycopg.Connection) -> None:
    conn.adapters.register_dumper(bool, _BoolAsIntDumper)
    conn.adapters.register_loader("timestamp", _TimestampAsTextLoader)


def _pool(database_url: str) -> ConnectionPool:
    # Opening a Postgres connection costs a server process; reuse them across requests.
    with _pools_lock:
        if database_url not in _pools:
            _pools[database_url] = ConnectionPool(
                database_url,
                min_size=1,
                max_size=_POOL_MAX_SIZE,
                configure=_configure,
                # No server-side prepared statements: PgBouncer in transaction mode (the
                # portal's DATABASE_URL) cannot keep them, and they go stale when the test
                # suite recreates the schema under a pooled connection.
                kwargs={"row_factory": dict_row, "prepare_threshold": None},
                open=True,
            )
        return _pools[database_url]


@contextmanager
def _db() -> Iterator[psycopg.Connection]:
    """Commits on success, rolls back on exception, then returns the connection to the pool."""
    # Deferred import avoids circular dependency at module load time.
    # main.DATABASE_URL is monkeypatched by the test suite; the lazy read picks up the patch.
    import main as _main

    if not _main.DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada — defina-a em web/.env")
    with _pool(_main.DATABASE_URL).connection() as conn:
        yield conn
