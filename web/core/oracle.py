"""Oracle client lifecycle — initialize once at startup, gate by env var."""

import os

_initialized = False


def is_oracle_configured() -> bool:
    return bool(os.getenv("ORACLE_INSTANT_CLIENT"))


def try_init_oracle_client() -> bool:
    """Initialize thick-mode Oracle client. Idempotent. Returns False if not configured."""
    global _initialized
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
    except Exception:
        return False
