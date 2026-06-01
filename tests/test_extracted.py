"""Tests for extracted/gabi.py — markdown/HTML builders and shared logic."""
from datetime import date
import pytest
import gabi
from gabi import (
    norm, match_name, easter, get_holidays, get_working_days, wd_count,
    ds_to_date, _parse_ga_header, _parse_ga_daily,
    _issue_weekend, _issue_no_entry, _issue_divergence, _issue_overtime,
    _validate_day, validate,
    _severity_icon, _md_status_geral, _md_person_header,
    _md_pattern_section, _md_days_table, _md_issues_section, build_md,
    _day_status, _build_person, build_html,
)


# ── Shared pure functions (coverage for extracted/gabi.py lines) ──────────────

def test_norm_accent():
    assert norm("Ação") == "acao"

def test_norm_lowercase():
    assert norm("SILVA") == "silva"

def test_match_name_found():
    assert match_name("Souza Ana Lima", ["souza.ana"]) == "souza.ana"

def test_match_name_not_found():
    assert match_name("Ninguem Aqui", ["silva.jose"]) is None

def test_easter_2025():
    assert easter(2025) == date(2025, 4, 20)

def test_get_holidays_count():
    assert len(get_holidays(2025)) == 12

def test_wd_count():
    count = wd_count(2025, 1)
    assert 19 <= count <= 23

def test_get_working_days_no_weekends():
    for ds in get_working_days(2025, 6):
        assert ds_to_date(ds).weekday() < 5

def test_ds_to_date():
    assert ds_to_date("15/06/2025") == date(2025, 6, 15)

def test_parse_ga_header_normal():
    rows = [["", "", "", "", "", "202506\nJoão Silva"]]
    name, year, month = _parse_ga_header(rows)
    assert name == "João Silva" and year == 2025 and month == 6

def test_parse_ga_header_empty():
    _, year, month = _parse_ga_header([])
    assert year == 0 and month == 0

def test_parse_ga_daily_single():
    rows = [[None, "02/06/2025", None, None, None, None, None, None, "Total Data", "8.0"]]
    assert _parse_ga_daily(rows) == {"02/06/2025": 8.0}

def test_parse_ga_daily_empty():
    assert _parse_ga_daily([]) == {}

def test_issue_weekend_no_hours():
    assert _issue_weekend("01/06/2025", 0.0, 0.0, 0.1) is None

def test_issue_weekend_with_ga():
    issue = _issue_weekend("01/06/2025", 4.0, 0.0, 0.1)
    assert issue["rule"] == "R4"

def test_issue_no_entry():
    assert _issue_no_entry("02/06/2025")["rule"] == "R0"

def test_issue_divergence():
    issue = _issue_divergence("02/06/2025", 9.0, 8.0)
    assert issue["rule"] == "R1" and "+1.00h" in issue["message"]

def test_issue_overtime_info():
    assert _issue_overtime("02/06/2025", 9.0, True)["severity"] == "info"

def test_issue_overtime_warning():
    assert _issue_overtime("02/06/2025", 9.0, False)["severity"] == "warning"

def test_validate_day_weekend_no_hours():
    assert _validate_day("01/06/2025", 0.0, 0.0, True, 0.1) == []

def test_validate_day_no_entry():
    result = _validate_day("02/06/2025", 0.0, 0.0, True, 0.1)
    assert result[0]["rule"] == "R0"

def test_validate_clean():
    days = get_working_days(2025, 1)
    ga = task = dict.fromkeys(days, 8.0)
    issues, mensal_ok, _, _ = validate(ga, task, 2025, 1)
    assert mensal_ok and issues == []

def test_validate_limit_exceeded():
    days = get_working_days(2025, 1)
    ga = task = dict.fromkeys(days, 9.0)
    issues, mensal_ok, _, _ = validate(ga, task, 2025, 1)
    assert not mensal_ok and any(i["rule"] == "R3" for i in issues)

def test_day_status_error():
    assert _day_status(["R1"], {}) == "error"

def test_day_status_r4():
    assert _day_status(["R4"], {}) == "r4"

def test_day_status_r0():
    assert _day_status(["R0"], {}) == "r0"

def test_day_status_ok():
    assert _day_status([], {}) == "ok"

def test_day_status_r2_info():
    assert _day_status(["R2"], {"R2": "info"}) == "info"

def test_day_status_r2_warning():
    assert _day_status(["R2"], {"R2": "warning"}) == "warning"


# ── _build_person ─────────────────────────────────────────────────────────────

def _make_person(mensal_ok=True, issues=None):
    days = get_working_days(2025, 1)
    ga = dict.fromkeys(days, 8.0)
    task = dict.fromkeys(days, 8.0)
    if issues is None:
        issues, mensal_ok, wdays, lim = validate(ga, task, 2025, 1)
    else:
        wdays = len(days)
        lim = wdays * 8
    return _build_person("silva.jose", "silva.jose", ga, task, 2025, 1, issues, wdays, lim, mensal_ok)


def test_build_person_month_label():
    assert _make_person()["month_label"] == "Janeiro / 2025"

def test_build_person_export_suffix():
    assert _make_person()["export_suffix"] == "012025"

def test_build_person_totals():
    p = _make_person()
    days = get_working_days(2025, 1)
    assert p["ga_total"] == round(len(days) * 8.0, 2)
    assert p["diff_total"] == pytest.approx(0.0)

def test_build_person_has_days():
    p = _make_person()
    assert isinstance(p["days"], list) and len(p["days"]) > 0


# ── _severity_icon ────────────────────────────────────────────────────────────

class TestSeverityIcon:
    def test_error(self):
        assert _severity_icon("error") == "❌"

    def test_warning(self):
        assert _severity_icon("warning") == "⚠️"

    def test_info(self):
        assert _severity_icon("info") == "ℹ️"

    def test_unknown(self):
        assert _severity_icon("other") == "ℹ️"


# ── _md_status_geral ──────────────────────────────────────────────────────────

_PERSON_OK = {
    "issues_count": 0, "errors_count": 0, "warnings_count": 0, "info_count": 0,
}
_PERSON_ERR = {
    "issues_count": 2, "errors_count": 2, "warnings_count": 0, "info_count": 0,
}
_PERSON_WARN = {
    "issues_count": 1, "errors_count": 0, "warnings_count": 1, "info_count": 0,
}
_PERSON_INFO = {
    "issues_count": 1, "errors_count": 0, "warnings_count": 0, "info_count": 1,
}


class TestMdStatusGeral:
    def test_ok(self):
        assert "Sem inconsistências" in _md_status_geral(_PERSON_OK)

    def test_error(self):
        assert "erro" in _md_status_geral(_PERSON_ERR)

    def test_warning(self):
        assert "aviso" in _md_status_geral(_PERSON_WARN)

    def test_info(self):
        assert "observaç" in _md_status_geral(_PERSON_INFO)


# ── markdown helpers ──────────────────────────────────────────────────────────

def _full_person(with_issues=False):
    days = get_working_days(2025, 6)
    ga = dict.fromkeys(days, 8.0)
    task = dict.fromkeys(days, 8.0)
    if with_issues:
        ga[days[0]] = 9.5
        task[days[0]] = 8.0
    issues, mensal_ok, wdays, lim = validate(ga, task, 2025, 6)
    return _build_person("silva.jose", "silva.jose", ga, task, 2025, 6, issues, wdays, lim, mensal_ok)


class TestMdPersonHeader:
    def test_returns_list(self):
        p = _full_person()
        lines = _md_person_header(p, "✅ OK")
        assert isinstance(lines, list) and len(lines) > 0

    def test_contains_name(self):
        p = _full_person()
        header = "\n".join(_md_person_header(p, "✅ OK"))
        assert "silva.jose" in header

    def test_contains_month(self):
        p = _full_person()
        header = "\n".join(_md_person_header(p, "✅ OK"))
        assert "Junho" in header

    def test_mensal_ok_shows_ok(self):
        p = _full_person()
        header = "\n".join(_md_person_header(p, "✅ OK"))
        assert "OK" in header

    def test_mensal_exceeded_shows_exceeded(self):
        days = get_working_days(2025, 1)
        ga = dict.fromkeys(days, 9.0)
        task = dict.fromkeys(days, 9.0)
        issues, mensal_ok, wdays, lim = validate(ga, task, 2025, 1)
        p = _build_person("x", "x", ga, task, 2025, 1, issues, wdays, lim, mensal_ok)
        header = "\n".join(_md_person_header(p, "❌ erros"))
        assert "EXCEDIDO" in header


class TestMdPatternSection:
    def test_no_r1_returns_empty(self):
        p = _full_person()
        assert _md_pattern_section(p) == []

    def test_r1_all_ga_above_task_returns_section(self):
        days = get_working_days(2025, 6)
        ga = dict.fromkeys(days, 9.0)
        task = dict.fromkeys(days, 8.0)
        issues, mensal_ok, wdays, lim = validate(ga, task, 2025, 6)
        p = _build_person("x", "x", ga, task, 2025, 6, issues, wdays, lim, mensal_ok)
        result = _md_pattern_section(p)
        assert isinstance(result, list) and len(result) > 0


class TestMdDaysTable:
    def test_returns_list_with_header(self):
        p = _full_person()
        lines = _md_days_table(p)
        assert any("Data" in l for l in lines)

    def test_contains_day_rows(self):
        p = _full_person()
        lines = _md_days_table(p)
        assert any("/2025" in l for l in lines)

    def test_dash_for_zero_diff(self):
        p = _full_person()
        lines = _md_days_table(p)
        table_rows = [l for l in lines if "|" in l and "/2025" in l]
        assert any("—" in r for r in table_rows)


class TestMdIssuesSection:
    def test_no_issues_returns_ok(self):
        p = _full_person()
        result = "\n".join(_md_issues_section(p))
        assert "Nenhuma inconsistência" in result

    def test_with_issues_returns_section(self):
        p = _full_person(with_issues=True)
        result = "\n".join(_md_issues_section(p))
        assert "Inconsistências" in result

    def test_r1_in_output(self):
        days = get_working_days(2025, 6)
        ga = dict.fromkeys(days, 9.0)
        task = dict.fromkeys(days, 8.0)
        issues, mensal_ok, wdays, lim = validate(ga, task, 2025, 6)
        p = _build_person("x", "x", ga, task, 2025, 6, issues, wdays, lim, mensal_ok)
        result = "\n".join(_md_issues_section(p))
        assert "R1" in result


# ── build_md ──────────────────────────────────────────────────────────────────

class TestBuildMd:
    def test_returns_string(self):
        p = _full_person()
        assert isinstance(build_md([p]), str)

    def test_contains_gabi_footer(self):
        p = _full_person()
        assert "G.A.B.I." in build_md([p])

    def test_multiple_persons(self):
        p1 = _full_person()
        p2 = _full_person(with_issues=True)
        md = build_md([p1, p2])
        assert md.count("---") >= 2

    def test_empty_list(self):
        assert build_md([]) == ""


# ── build_html ────────────────────────────────────────────────────────────────

class TestBuildHtml:
    def test_returns_html_string(self):
        p = _full_person()
        html = build_html([p])
        assert html.startswith("<!DOCTYPE html>")

    def test_contains_data_json(self):
        p = _full_person()
        html = build_html([p])
        assert "silva.jose" in html

    def test_contains_month_label(self):
        p = _full_person()
        html = build_html([p])
        assert "Junho" in html

    def test_contains_chart_js(self):
        p = _full_person()
        html = build_html([p])
        assert "buildChart" in html
