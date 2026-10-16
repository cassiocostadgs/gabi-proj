"""Oracle client lifecycle — initialize once at startup, gate by env var."""

import os

_initialized = False
_init_error: str | None = None


def is_oracle_configured() -> bool:
    return bool(os.getenv("ORACLE_INSTANT_CLIENT"))


def try_init_oracle_client() -> bool:
    """Initialize thick-mode Oracle client. Idempotent. Returns False if not configured."""
    global _initialized, _init_error
    if _initialized:
        return True
    lib_dir = os.getenv("ORACLE_INSTANT_CLIENT")
    if not lib_dir:
        return False
    try:
        import oracledb

        oracledb.init_oracle_client(lib_dir=lib_dir)
        _initialized = True
        return True
    except Exception as exc:
        # Kept for the startup diagnostics: a missing Instant Client otherwise only
        # surfaces as a generic "Task DB indisponível".
        _init_error = str(exc).splitlines()[0]
        return False


def init_error() -> str | None:
    """Why the last try_init_oracle_client() failed, or None."""
    return _init_error
