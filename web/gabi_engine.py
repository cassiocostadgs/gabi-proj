#!/usr/bin/env python3
"""G.A.B.I. engine — pure logic extracted from gabi.py, no I/O."""

import unicodedata
from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta

# ── Parsers ───────────────────────────────────────────────────────────────────


def parse_task(fp: str) -> dict:
    from python_calamine import CalamineWorkbook

    rows = (
        CalamineWorkbook.from_path(fp)
        .get_sheet_by_name("Analítico")
        .to_python(skip_empty_area=False)
    )
    result = defaultdict(lambda: defaultdict(float))
    for row in rows[10:]:
        if len(row) < 9:
            continue
        resp, dt, cod, total = row[0], row[1], row[2], row[8]
        if not (resp and dt and cod == "FATURADO" and total):
            continue
        ds = dt.strftime("%d/%m/%Y") if hasattr(dt, "strftime") else str(dt)
        result[resp][ds] += float(total)
    return dict(result)


def _parse_ga_header(rows: list) -> tuple:
    hdr = rows[0][5] if rows and len(rows[0]) > 5 else ""
    parts = str(hdr).split("\n")
    name = parts[1].strip() if len(parts) > 1 else str(hdr).strip()
    comp = "".join(filter(str.isdigit, parts[0])) if parts else ""
    year = int(comp[:4]) if len(comp) >= 4 else 0
    month = int(comp[4:6]) if len(comp) >= 6 else 0
    return name, year, month


def _parse_ga_daily(rows: list) -> dict:
    cur = None
    daily = {}
    for row in rows:
        b = row[1] if len(row) > 1 else None
        i = row[8] if len(row) > 8 else None
        q = row[9] if len(row) > 9 else None
        if b and isinstance(b, str) and "/" in b:
            cur = b
        if i == "Total Data" and cur and b != "Total" and q:
            daily[cur] = float(q)
    return daily


def parse_ga(fp: str) -> tuple:
    from python_calamine import CalamineWorkbook

    rows = CalamineWorkbook.from_path(fp).get_sheet_by_index(0).to_python(skip_empty_area=False)
    name, year, month = _parse_ga_header(rows)
    daily = _parse_ga_daily(rows)
    return name, daily, year, month


# ── Matching ──────────────────────────────────────────────────────────────────

PARTICLES = {"de", "da", "do", "dos", "das", "e"}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def match_name(full: str, task_names: list) -> str | None:
    toks = [t for t in norm(full).split() if t not in PARTICLES]
    for tid in task_names:
        p = norm(tid).split(".")
        if len(p) == 2 and toks[0] == p[0] and any(t == p[1] for t in toks[1:]):
            return tid
    return None


# ── Calendário ────────────────────────────────────────────────────────────────


def easter(y: int) -> date:
    # Anonymous Gregorian algorithm
    a = y % 19
    b = y // 100
    c = y % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    ll = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ll) // 451
    mo = (h + ll - 7 * m + 114) // 31
    dy = ((h + ll - 7 * m + 114) % 31) + 1
    return date(y, mo, dy)


def get_holidays(y: int) -> dict:
    p = easter(y)
    return {
        date(y, 1, 1): "Confraternização Universal",
        p - timedelta(48): "Segunda-feira de Carnaval",
        p - timedelta(47): "Terça-feira de Carnaval",
        p - timedelta(2): "Sexta-feira Santa",
        date(y, 4, 21): "Tiradentes",
        date(y, 5, 1): "Dia do Trabalho",
        p + timedelta(60): "Corpus Christi",
        date(y, 9, 7): "Independência do Brasil",
        date(y, 10, 12): "Nossa Senhora Aparecida",
        date(y, 11, 2): "Finados",
        date(y, 11, 15): "Proclamação da República",
        date(y, 12, 25): "Natal",
    }


def get_working_days(y: int, m: int) -> list:
    h = get_holidays(y)
    _, last = monthrange(y, m)
    return [
        f"{d:02d}/{m:02d}/{y}"
        for d in range(1, last + 1)
        if date(y, m, d).weekday() < 5 and date(y, m, d) not in h
    ]


def get_working_days_in_range(start: date, end: date) -> list:
    """Working days within [start, end] inclusive."""
    h = get_holidays(start.year)
    result, d = [], start
    while d <= end:
        if d.weekday() < 5 and d not in h:
            result.append(f"{d.day:02d}/{d.month:02d}/{d.year}")
        d += timedelta(1)
    return result


def _holidays_as_str(
    year: int, month: int, start: date | None = None, end: date | None = None
) -> set:
    holidays = get_holidays(year)
    if start is None or end is None:
        return {
            f"{hd.day:02d}/{hd.month:02d}/{hd.year}"
            for hd in holidays
            if hd.month == month and hd.year == year
        }
    return {f"{hd.day:02d}/{hd.month:02d}/{hd.year}" for hd in holidays if start <= hd <= end}


def filter_daily_by_range(daily: dict, start: date, end: date) -> dict:
    """Filter a {dd/mm/yyyy: float} dict to only dates within [start, end]."""
    return {ds: v for ds, v in daily.items() if start <= ds_to_date(ds) <= end}


MONTH_PT = {
    1: "Janeiro",
    2: "Fevereiro",
    3: "Março",
    4: "Abril",
    5: "Maio",
    6: "Junho",
    7: "Julho",
    8: "Agosto",
    9: "Setembro",
    10: "Outubro",
    11: "Novembro",
    12: "Dezembro",
}


# ── Validação ─────────────────────────────────────────────────────────────────


def ds_to_date(ds: str) -> date:
    d, m, y = ds.split("/")
    return date(int(y), int(m), int(d))


def _issue_weekend(ds: str, g: float, t: float, tol: float) -> dict | None:
    if not (g > tol or t > tol):
        return None
    parts = []
    if g > tol:
        parts.append(f"GA: {g:.2f}h")
    if t > tol:
        parts.append(f"Task: {t:.2f}h")
    return {
        "date": ds,
        "rule": "R4",
        "severity": "warning",
        "message": f"Apontamento em fim de semana — {', '.join(parts)}",
    }


def _issue_no_entry(ds: str) -> dict:
    return {
        "date": ds,
        "rule": "R0",
        "severity": "warning",
        "message": "Dia útil sem apontamento em nenhum dos sistemas",
    }


def _issue_divergence(ds: str, g: float, t: float) -> dict:
    return {
        "date": ds,
        "rule": "R1",
        "severity": "error",
        "message": f"GA ({g:.2f}h) difere do Task faturado ({t:.2f}h) — diferença {g - t:+.2f}h",
    }


def _issue_overtime(ds: str, g: float, mensal_ok: bool) -> dict:
    sev = "info" if mensal_ok else "warning"
    lbl = "observação" if mensal_ok else "ponto de ajuste — mensal comprometido"
    return {
        "date": ds,
        "rule": "R2",
        "severity": sev,
        "message": f"GA ({g:.2f}h) excede 8h diárias ({lbl})",
    }


def _validate_day(
    ds: str,
    g: float,
    t: float,
    mensal_ok: bool,
    tol: float,
    nf: float = 0.0,
    holidays: set | None = None,
) -> list:
    d = ds_to_date(ds)
    if d.weekday() >= 5 or (holidays and d in holidays):
        issue = _issue_weekend(ds, g, t, tol)
        return [issue] if issue else []
    if g <= tol and t <= tol and nf <= tol:
        return [_issue_no_entry(ds)]
    issues = []
    if abs(g - t) > tol:
        issues.append(_issue_divergence(ds, g, t))
    if g > 8.0 + tol:
        issues.append(_issue_overtime(ds, g, mensal_ok))
    return issues


def validate(
    ga: dict,
    task: dict,
    y: int,
    m: int,
    start_date: date | None = None,
    end_date: date | None = None,
    task_nf: dict | None = None,
) -> tuple:
    tol = 0.1
    _, last = monthrange(y, m)
    is_full_month = (
        start_date is None
        or end_date is None
        or (start_date == date(y, m, 1) and end_date == date(y, m, last))
    )

    wdays_list = (
        get_working_days(y, m) if is_full_month else get_working_days_in_range(start_date, end_date)
    )
    wdays = len(wdays_list)
    ga_tot = sum(ga.values())
    lim = wdays * 8
    mensal_ok = ga_tot <= lim + tol
    issues = []

    if not mensal_ok:
        scope = "mensal" if is_full_month else "do período"
        msg = (
            f"Total {scope} GA ({ga_tot:.2f}h) excede {lim}h"
            f" ({wdays} dias uteis x 8h) - correcao obrigatoria"
        )
        issues.append({"date": f"{m:02d}/{y}", "rule": "R3", "severity": "error", "message": msg})

    holidays = get_holidays(y)
    month_hols = _holidays_as_str(y, m, start_date, end_date)
    all_days = sorted(
        set(list(ga) + list(task) + wdays_list) | month_hols,
        key=lambda x: (x[6:], x[3:5], x[:2]),
    )

    nf = task_nf or {}
    for ds in all_days:
        issues.extend(
            _validate_day(
                ds,
                ga.get(ds, 0.0),
                task.get(ds, 0.0),
                mensal_ok,
                tol,
                nf.get(ds, 0.0),
                holidays,
            )
        )

    return issues, mensal_ok, wdays, lim


# ── Public API ────────────────────────────────────────────────────────────────


def _day_status(rules: list, sevs: dict, is_holiday: bool = False) -> str:
    if "R1" in rules or "R3" in rules:
        return "error"
    if "R4" in rules:
        return "r4"
    if is_holiday:
        return "r4"
    if "R0" in rules:
        return "r0"
    if "R2" in rules and sevs.get("R2") == "warning":
        return "warning"
    if "R2" in rules:
        return "info"
    return "ok"


def _build_days_data(
    all_dates: list,
    ga_daily: dict,
    task_daily: dict,
    task_nf_daily: dict,
    issues: list,
    holidays: set | None = None,
) -> list:
    days_data = []
    for ds in all_dates:
        g = round(ga_daily.get(ds, 0.0), 2)
        t = round(task_daily.get(ds, 0.0), 2)
        nf = round(task_nf_daily.get(ds, 0.0), 2)
        day_issues = [iss for iss in issues if iss["date"] == ds]
        rules = [iss["rule"] for iss in day_issues]
        sevs = {iss["rule"]: iss["severity"] for iss in day_issues}
        d_obj = ds_to_date(ds)
        is_holiday = holidays is not None and d_obj in holidays
        holiday_name = holidays[d_obj] if is_holiday else None
        days_data.append(
            {
                "date": ds,
                "ga": g,
                "task": t,
                "task_nf": nf,
                "diff": round(g - t, 2),
                "rules": rules,
                "sevs": sevs,
                "status": _day_status(rules, sevs, is_holiday),
                "is_holiday": is_holiday,
                "holiday_name": holiday_name,
            }
        )
    return days_data


def _build_person(
    ga_name: str,
    task_id: str,
    ga_daily: dict,
    task_daily: dict,
    year: int,
    month: int,
    issues: list,
    wdays: int,
    lim: int,
    mensal_ok: bool,
    start_date: date | None = None,
    end_date: date | None = None,
    task_nf_daily: dict | None = None,
) -> dict:
    ga_tot = sum(ga_daily.values())
    task_tot = sum(task_daily.values())
    _, last = monthrange(year, month)
    is_full_month = (
        start_date is None
        or end_date is None
        or (start_date == date(year, month, 1) and end_date == date(year, month, last))
    )
    holidays = get_holidays(year)
    working = set(
        get_working_days(year, month)
        if is_full_month
        else get_working_days_in_range(start_date, end_date)
    )
    month_hols = _holidays_as_str(year, month, start_date, end_date)
    all_dates = sorted(
        set(list(ga_daily) + list(task_daily)) | working | month_hols,
        key=lambda x: (x[6:], x[3:5], x[:2]),
    )
    period_label = (
        f"{MONTH_PT[month]} / {year}"
        if is_full_month
        else f"{start_date.strftime('%d/%m')} - {end_date.strftime('%d/%m/%Y')}"
    )
    return {
        "name": ga_name,
        "task_id": task_id,
        "month_label": period_label,
        "export_suffix": f"{month:02d}{year}",
        "ga_total": round(ga_tot, 2),
        "task_total": round(task_tot, 2),
        "diff_total": round(ga_tot - task_tot, 2),
        "working_days": wdays,
        "monthly_limit": lim,
        "mensal_ok": mensal_ok,
        "issues_count": len(issues),
        "errors_count": len([i for i in issues if i["severity"] == "error"]),
        "warnings_count": len([i for i in issues if i["severity"] == "warning"]),
        "info_count": len([i for i in issues if i["severity"] == "info"]),
        "days": _build_days_data(
            all_dates, ga_daily, task_daily, task_nf_daily or {}, issues, holidays
        ),
        "issues": issues,
    }


def process(task_path: str, ga_paths: list) -> tuple:
    """Returns (persons: list[dict], errors: list[str])."""
    task_data = parse_task(task_path)
    persons = []
    errors = []

    for ga_file in ga_paths:
        try:
            ga_name, ga_daily, year, month = parse_ga(ga_file)
        except Exception as exc:
            errors.append(f"Erro ao ler arquivo GA: {exc}")
            continue

        task_id = match_name(ga_name, list(task_data.keys()))
        if not task_id:
            errors.append(
                f"Nome '{ga_name}' não encontrado no Task. "
                f"Disponíveis: {', '.join(task_data.keys())}"
            )
            continue

        task_daily = task_data.get(task_id, {})
        issues, mensal_ok, wdays, lim = validate(ga_daily, task_daily, year, month)
        persons.append(
            _build_person(
                ga_name,
                task_id,
                ga_daily,
                task_daily,
                year,
                month,
                issues,
                wdays,
                lim,
                mensal_ok,
            )
        )

    return persons, errors


def process_with_task_data(
    task_id: str,
    task_daily: dict,
    ga_name: str,
    ga_daily: dict,
    year: int,
    month: int,
    start_date: date | None = None,
    end_date: date | None = None,
    task_nf_daily: dict | None = None,
) -> dict:
    """Validates pre-parsed GA data against pre-loaded task data (Oracle mode)."""
    if start_date and end_date:
        ga_daily = filter_daily_by_range(ga_daily, start_date, end_date)
    issues, mensal_ok, wdays, lim = validate(
        ga_daily, task_daily, year, month, start_date, end_date, task_nf_daily
    )
    return _build_person(
        ga_name,
        task_id,
        ga_daily,
        task_daily,
        year,
        month,
        issues,
        wdays,
        lim,
        mensal_ok,
        start_date,
        end_date,
        task_nf_daily,
    )
