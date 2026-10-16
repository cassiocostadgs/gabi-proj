"""Task DB (Oracle) — query de horas por responsável e período."""

import os
from datetime import date

_HOST = os.getenv("ORACLE_HOST", "")
_PORT = int(os.getenv("ORACLE_PORT", "15210"))
_SID = os.getenv("ORACLE_SID", "orcl")
_USER = os.getenv("ORACLE_USER", "")
_PASSWORD = os.getenv("ORACLE_PASSWORD", "")
_PROJECT = os.getenv("ORACLE_TASK_PROJECT", "DGS_MAG")

_DATE_FMT = "%d/%m/%Y"

_DSN = (
    f"(DESCRIPTION=(CONNECT_TIMEOUT=10)(RETRY_COUNT=0)"
    f"(ADDRESS=(PROTOCOL=TCP)(HOST={_HOST})(PORT={_PORT}))"
    f"(CONNECT_DATA=(SID={_SID})))"
)

_QUERY = """
    SELECT
        TRUNC(ex.dh_inicio)  AS data,
        os.cd_area           AS area,
        SUM(ROUND((ex.dh_termino - ex.dh_inicio) * 24, 2)) AS horas_task
    FROM TASKMANAGER.ordemservico os
    JOIN TASKMANAGER.triagem tr
        ON os.cd_projeto = tr.cd_projeto AND os.cd_tarefa = tr.cd_tarefa
    JOIN TASKMANAGER.execucao ex
        ON tr.cd_projeto = ex.cd_projeto
        AND tr.cd_tarefa = ex.cd_tarefa
        AND tr.cd_triagem = ex.cd_triagem
    WHERE os.cd_projeto     = :projeto
      AND os.cd_area        IN ('FATURADO', 'NAO_FATURADO')
      AND tr.cd_responsavel = :responsavel
      AND ex.dh_inicio     >= TO_DATE(:inicio, 'DD/MM/YYYY')
      AND ex.dh_inicio     <  TO_DATE(:fim,    'DD/MM/YYYY') + 1
      AND ex.bo_abonado    <> 'S'
      AND ex.dh_termino    IS NOT NULL
    GROUP BY TRUNC(ex.dh_inicio), os.cd_area
    ORDER BY TRUNC(ex.dh_inicio), os.cd_area
"""


_ENTRIES_QUERY = """
    SELECT
        ex.dh_inicio   AS inicio,
        ex.dh_termino  AS termino,
        os.cd_projeto  AS projeto,
        os.cd_tarefa   AS tarefa,
        os.ds_tarefa   AS descricao,
        os.cd_area     AS area,
        ROUND((ex.dh_termino - ex.dh_inicio) * 24, 2) AS horas
    FROM TASKMANAGER.ordemservico os
    JOIN TASKMANAGER.triagem tr
        ON os.cd_projeto = tr.cd_projeto AND os.cd_tarefa = tr.cd_tarefa
    JOIN TASKMANAGER.execucao ex
        ON tr.cd_projeto = ex.cd_projeto
        AND tr.cd_tarefa = ex.cd_tarefa
        AND tr.cd_triagem = ex.cd_triagem
    WHERE tr.cd_responsavel = :responsavel
      AND ex.dh_inicio     >= TO_DATE(:inicio, 'DD/MM/YYYY')
      AND ex.dh_inicio     <  TO_DATE(:fim,    'DD/MM/YYYY') + 1
      AND ex.dh_termino    IS NOT NULL
    ORDER BY ex.dh_inicio
"""


_PING_DSN = (
    f"(DESCRIPTION=(CONNECT_TIMEOUT=2)(RETRY_COUNT=0)"
    f"(ADDRESS=(PROTOCOL=TCP)(HOST={_HOST})(PORT={_PORT}))"
    f"(CONNECT_DATA=(SID={_SID})))"
)


def ping() -> bool:
    """Try a real Oracle connection with a 3-second timeout. Returns False on any error."""
    if not _HOST or not _USER or not _PASSWORD:
        return False
    try:
        import oracledb

        with (
            oracledb.connect(user=_USER, password=_PASSWORD, dsn=_PING_DSN) as conn,
            conn.cursor() as cur,
        ):
            cur.execute("SELECT 1 FROM DUAL")
        return True
    except Exception:
        return False


_NETWORK_PROBE_SECONDS = 3


def diagnose() -> list[str]:
    """Why the Task DB is (un)available, for the startup log — ping() alone only says False.
    Never includes the password: config is reported by variable name, errors by first line."""
    missing = [
        name
        for name, value in (
            ("ORACLE_HOST", _HOST),
            ("ORACLE_USER", _USER),
            ("ORACLE_PASSWORD", _PASSWORD),
        )
        if not value
    ]
    if missing:
        return [f"configuração incompleta: {', '.join(missing)} vazio(s)"]
    network = _probe_network()
    if network is not None:
        return [f"rede: {_HOST}:{_PORT} INALCANÇÁVEL ({network})"]
    return [f"rede: {_HOST}:{_PORT} alcançável", _probe_login()]


def _probe_network() -> str | None:
    """None when the host accepts a TCP connection, otherwise the error."""
    import socket

    try:
        with socket.create_connection((_HOST, _PORT), timeout=_NETWORK_PROBE_SECONDS):
            return None
    except OSError as exc:
        return str(exc)


def _probe_login() -> str:
    try:
        import oracledb

        with (
            oracledb.connect(user=_USER, password=_PASSWORD, dsn=_PING_DSN) as conn,
            conn.cursor() as cur,
        ):
            cur.execute("SELECT 1 FROM DUAL")
        return "login: OK"
    except Exception as exc:
        return f"login: FALHOU ({str(exc).splitlines()[0]})"


def responsavel_from_email(email: str) -> str:
    """pedro.santos@db1.com.br → PEDRO.SANTOS"""
    return email.split("@")[0].upper()


def get_default_project() -> str:
    """ORACLE_TASK_PROJECT — default project filter for the entries report."""
    return _PROJECT


def get_task_hours(
    responsavel: str, start_date: date, end_date: date
) -> tuple[dict[str, float], dict[str, float]]:
    """Returns (faturado, nao_faturado) — each {dd/mm/yyyy: horas}."""
    import oracledb

    params = {
        "projeto": _PROJECT,
        "responsavel": responsavel,
        "inicio": start_date.strftime(_DATE_FMT),
        "fim": end_date.strftime(_DATE_FMT),
    }
    with (
        oracledb.connect(user=_USER, password=_PASSWORD, dsn=_DSN) as conn,
        conn.cursor() as cur,
    ):
        cur.execute(_QUERY, params)
        rows = cur.fetchall()

    faturado: dict[str, float] = {}
    nao_faturado: dict[str, float] = {}
    for row_date, area, horas in rows:
        if horas is None:
            continue
        ds = row_date.strftime(_DATE_FMT)
        if area == "FATURADO":
            faturado[ds] = round(faturado.get(ds, 0.0) + float(horas), 2)
        elif area == "NAO_FATURADO":
            nao_faturado[ds] = round(nao_faturado.get(ds, 0.0) + float(horas), 2)
    return faturado, nao_faturado


def get_task_entries(responsavel: str, start_date: date, end_date: date) -> list[dict]:
    """Returns every execution logged by the responsável — all projects, all areas.

    Deliberately unfiltered by project/area/abono: this feeds the self-service
    report used to fill the GA by hand, so a misconfigured area must still show up.
    """
    import oracledb

    params = {
        "responsavel": responsavel,
        "inicio": start_date.strftime(_DATE_FMT),
        "fim": end_date.strftime(_DATE_FMT),
    }
    with (
        oracledb.connect(user=_USER, password=_PASSWORD, dsn=_DSN) as conn,
        conn.cursor() as cur,
    ):
        cur.execute(_ENTRIES_QUERY, params)
        rows = cur.fetchall()

    return [
        {
            "date": inicio.strftime(_DATE_FMT),
            "project": projeto,
            "task_code": tarefa,
            "description": descricao,
            "area": area,
            "start": inicio.strftime("%H:%M"),
            "end": termino.strftime("%H:%M"),
            "hours": float(horas),
        }
        for inicio, termino, projeto, tarefa, descricao, area, horas in rows
    ]
