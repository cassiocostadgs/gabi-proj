from datetime import date
import pytest
import gabi_engine
from gabi_engine import (
    norm, match_name,
    easter, get_holidays, get_working_days,
    ds_to_date,
    _parse_ga_header, _parse_ga_daily,
    _issue_weekend, _issue_no_entry, _issue_divergence, _issue_overtime,
    _validate_day, validate,
    _day_status, _build_days_data, _build_person,
)


# ── norm ──────────────────────────────────────────────────────────────────────

class TestNorm:
    def test_removes_accents(self):
        assert norm("Ação") == "acao"

    def test_lowercases(self):
        assert norm("SILVA") == "silva"

    def test_combined(self):
        assert norm("José Ávila") == "jose avila"

    def test_no_change(self):
        assert norm("abc") == "abc"


# ── match_name ────────────────────────────────────────────────────────────────

class TestMatchName:
    def test_simple_match(self):
        # GA names have family name first: "SILVA José Oliveira"
        assert match_name("Silva José Oliveira", ["silva.jose"]) == "silva.jose"

    def test_no_match(self):
        assert match_name("Silva José", ["santos.pedro"]) is None

    def test_particle_ignored(self):
        # "de" is a particle and is removed; family name still first
        assert match_name("Souza de Ana Lima", ["souza.ana"]) == "souza.ana"

    def test_multiple_candidates_picks_correct(self):
        names = ["silva.jose", "santos.jose", "silva.maria"]
        assert match_name("Silva Jose Ferreira", names) == "silva.jose"

    def test_empty_task_list(self):
        assert match_name("Silva Jose", []) is None


# ── easter / holidays ─────────────────────────────────────────────────────────

class TestEaster:
    def test_2024(self):
        assert easter(2024) == date(2024, 3, 31)

    def test_2025(self):
        assert easter(2025) == date(2025, 4, 20)

    def test_2023(self):
        assert easter(2023) == date(2023, 4, 9)


class TestGetHolidays:
    def test_new_year(self):
        assert date(2025, 1, 1) in get_holidays(2025)

    def test_christmas(self):
        assert date(2025, 12, 25) in get_holidays(2025)

    def test_labor_day(self):
        assert date(2025, 5, 1) in get_holidays(2025)

    def test_returns_twelve_dates(self):
        assert len(get_holidays(2025)) == 12


# ── get_working_days ──────────────────────────────────────────────────────────

class TestGetWorkingDays:
    def test_excludes_weekends(self):
        for ds in get_working_days(2025, 6):
            assert ds_to_date(ds).weekday() < 5

    def test_excludes_new_year(self):
        assert "01/01/2025" not in get_working_days(2025, 1)

    def test_date_format(self):
        days = get_working_days(2025, 6)
        assert all(len(d) == 10 and d[2] == "/" and d[5] == "/" for d in days)

    def test_reasonable_count(self):
        count = len(get_working_days(2025, 1))
        assert 19 <= count <= 23


# ── ds_to_date ────────────────────────────────────────────────────────────────

class TestDsToDate:
    def test_basic(self):
        assert ds_to_date("15/06/2025") == date(2025, 6, 15)

    def test_first_of_month(self):
        assert ds_to_date("01/01/2025") == date(2025, 1, 1)


# ── _parse_ga_header ──────────────────────────────────────────────────────────

class TestParseGaHeader:
    def test_normal(self):
        rows = [["", "", "", "", "", "202501\nJoão Silva"]]
        name, year, month = _parse_ga_header(rows)
        assert name == "João Silva"
        assert year == 2025
        assert month == 1

    def test_empty_rows(self):
        name, year, month = _parse_ga_header([])
        assert name == "" and year == 0 and month == 0

    def test_short_row(self):
        rows = [["a", "b", "c"]]
        _, year, month = _parse_ga_header(rows)
        assert year == 0 and month == 0

    def test_no_newline(self):
        rows = [["", "", "", "", "", "SomeName"]]
        name, year, month = _parse_ga_header(rows)
        assert name == "SomeName"
        assert year == 0
        assert month == 0

    def test_comp_too_short(self):
        rows = [["", "", "", "", "", "20\nNome"]]
        _, year, month = _parse_ga_header(rows)
        assert year == 0 and month == 0


# ── _parse_ga_daily ───────────────────────────────────────────────────────────

class TestParseGaDaily:
    def _row(self, b=None, i=None, q=None):
        return [None, b, None, None, None, None, None, None, i, q]

    def test_single_day(self):
        rows = [self._row("15/06/2025", "Total Data", "8.0")]
        assert _parse_ga_daily(rows) == {"15/06/2025": 8.0}

    def test_skips_total_row(self):
        rows = [
            self._row("15/06/2025", "Total Data", "8.0"),
            self._row("Total", "Total Data", "8.0"),
        ]
        result = _parse_ga_daily(rows)
        assert "Total" not in result

    def test_empty(self):
        assert _parse_ga_daily([]) == {}

    def test_no_cur_skips(self):
        # Row without a date in col[1] → cur remains None, entry skipped
        rows = [self._row(None, "Total Data", "8.0")]
        assert _parse_ga_daily(rows) == {}

    def test_short_row(self):
        assert _parse_ga_daily([[1, 2, 3]]) == {}


# ── issue helpers ─────────────────────────────────────────────────────────────

class TestIssueWeekend:
    def test_no_hours_returns_none(self):
        assert _issue_weekend("01/06/2025", 0.0, 0.0, 0.1) is None

    def test_within_tolerance_returns_none(self):
        assert _issue_weekend("01/06/2025", 0.05, 0.0, 0.1) is None

    def test_ga_hours(self):
        issue = _issue_weekend("01/06/2025", 4.0, 0.0, 0.1)
        assert issue["rule"] == "R4"
        assert issue["severity"] == "warning"
        assert "GA" in issue["message"]

    def test_task_hours(self):
        issue = _issue_weekend("01/06/2025", 0.0, 2.0, 0.1)
        assert "Task" in issue["message"]

    def test_both_hours(self):
        issue = _issue_weekend("01/06/2025", 4.0, 2.0, 0.1)
        assert "GA" in issue["message"] and "Task" in issue["message"]


class TestIssueNoEntry:
    def test_basic(self):
        issue = _issue_no_entry("02/06/2025")
        assert issue["rule"] == "R0"
        assert issue["severity"] == "warning"
        assert issue["date"] == "02/06/2025"


class TestIssueDivergence:
    def test_positive_diff(self):
        issue = _issue_divergence("02/06/2025", 9.0, 8.0)
        assert issue["rule"] == "R1"
        assert issue["severity"] == "error"
        assert "+1.00h" in issue["message"]

    def test_negative_diff(self):
        issue = _issue_divergence("02/06/2025", 7.0, 8.0)
        assert "-1.00h" in issue["message"]


class TestIssueOvertime:
    def test_mensal_ok_info(self):
        issue = _issue_overtime("02/06/2025", 9.0, True)
        assert issue["rule"] == "R2"
        assert issue["severity"] == "info"
        assert "observação" in issue["message"]

    def test_mensal_exceeded_warning(self):
        issue = _issue_overtime("02/06/2025", 9.0, False)
        assert issue["severity"] == "warning"
        assert "comprometido" in issue["message"]


# ── _validate_day ─────────────────────────────────────────────────────────────

class TestValidateDay:
    def test_weekend_no_hours(self):
        assert _validate_day("01/06/2025", 0.0, 0.0, True, 0.1) == []

    def test_weekend_with_ga(self):
        result = _validate_day("01/06/2025", 4.0, 0.0, True, 0.1)
        assert len(result) == 1 and result[0]["rule"] == "R4"

    def test_working_no_entry(self):
        result = _validate_day("02/06/2025", 0.0, 0.0, True, 0.1)
        assert len(result) == 1 and result[0]["rule"] == "R0"

    def test_working_match(self):
        assert _validate_day("02/06/2025", 8.0, 8.0, True, 0.1) == []

    def test_working_divergence_and_overtime(self):
        result = _validate_day("02/06/2025", 9.0, 8.0, True, 0.1)
        rules = {i["rule"] for i in result}
        assert "R1" in rules and "R2" in rules

    def test_working_overtime_only(self):
        result = _validate_day("02/06/2025", 9.0, 9.0, True, 0.1)
        rules = {i["rule"] for i in result}
        assert "R2" in rules and "R1" not in rules

    def test_overtime_mensal_exceeded(self):
        result = _validate_day("02/06/2025", 9.0, 9.0, False, 0.1)
        overtime = [i for i in result if i["rule"] == "R2"]
        assert overtime[0]["severity"] == "warning"


# ── validate ──────────────────────────────────────────────────────────────────

class TestValidate:
    def test_clean_month(self):
        days = get_working_days(2025, 1)
        ga = dict.fromkeys(days, 8.0)
        task = dict.fromkeys(days, 8.0)
        issues, mensal_ok, wdays, lim = validate(ga, task, 2025, 1)
        assert mensal_ok
        assert lim == wdays * 8
        assert issues == []

    def test_monthly_limit_exceeded(self):
        days = get_working_days(2025, 1)
        ga = dict.fromkeys(days, 9.0)
        task = dict.fromkeys(days, 9.0)
        issues, mensal_ok, _, _ = validate(ga, task, 2025, 1)
        assert not mensal_ok
        assert any(i["rule"] == "R3" for i in issues)

    def test_divergence_detected(self):
        days = get_working_days(2025, 1)
        ga = {days[0]: 7.0}
        task = {days[0]: 8.0}
        issues, _, _, _ = validate(ga, task, 2025, 1)
        assert any(i["rule"] == "R1" for i in issues)

    def test_all_working_days_no_entry(self):
        issues, _, wdays, _ = validate({}, {}, 2025, 1)
        r0 = [i for i in issues if i["rule"] == "R0"]
        assert len(r0) == wdays

    def test_returns_tuple_structure(self):
        result = validate({}, {}, 2025, 6)
        assert len(result) == 4  # issues, mensal_ok, wdays, lim


# ── _day_status ───────────────────────────────────────────────────────────────

class TestDayStatus:
    def test_r1_error(self):
        assert _day_status(["R1"], {}) == "error"

    def test_r3_error(self):
        assert _day_status(["R3"], {}) == "error"

    def test_r1_takes_priority(self):
        assert _day_status(["R1", "R4", "R2"], {"R2": "warning"}) == "error"

    def test_r4(self):
        assert _day_status(["R4"], {}) == "r4"

    def test_r0(self):
        assert _day_status(["R0"], {}) == "r0"

    def test_r2_warning(self):
        assert _day_status(["R2"], {"R2": "warning"}) == "warning"

    def test_r2_info(self):
        assert _day_status(["R2"], {"R2": "info"}) == "info"

    def test_ok(self):
        assert _day_status([], {}) == "ok"


# ── _build_days_data ──────────────────────────────────────────────────────────

class TestBuildDaysData:
    def test_basic(self):
        issues = [{"date": "02/06/2025", "rule": "R1", "severity": "error", "message": "x"}]
        result = _build_days_data(
            ["02/06/2025"],
            {"02/06/2025": 8.0},
            {"02/06/2025": 7.0},
            issues,
        )
        assert len(result) == 1
        day = result[0]
        assert day["date"] == "02/06/2025"
        assert day["ga"] == pytest.approx(8.0)
        assert day["task"] == pytest.approx(7.0)
        assert day["diff"] == pytest.approx(1.0)
        assert day["status"] == "error"

    def test_missing_day_defaults_to_zero(self):
        result = _build_days_data(["02/06/2025"], {}, {}, [])
        assert result[0]["ga"] == pytest.approx(0.0)
        assert result[0]["task"] == pytest.approx(0.0)
        assert result[0]["status"] == "ok"

    def test_multiple_issues_on_day(self):
        issues = [
            {"date": "02/06/2025", "rule": "R1", "severity": "error", "message": "a"},
            {"date": "02/06/2025", "rule": "R2", "severity": "warning", "message": "b"},
        ]
        result = _build_days_data(["02/06/2025"], {}, {}, issues)
        assert set(result[0]["rules"]) == {"R1", "R2"}


# ── _build_person ─────────────────────────────────────────────────────────────

class TestBuildPerson:
    def test_structure_keys(self):
        days = get_working_days(2025, 1)
        ga = dict.fromkeys(days, 8.0)
        task = dict.fromkeys(days, 8.0)
        issues, mensal_ok, wdays, lim = validate(ga, task, 2025, 1)
        person = _build_person("silva.jose", "silva.jose", ga, task, 2025, 1, issues, wdays, lim, mensal_ok)
        for key in ("name", "task_id", "month_label", "export_suffix",
                    "ga_total", "task_total", "diff_total", "working_days",
                    "monthly_limit", "mensal_ok", "issues_count",
                    "errors_count", "warnings_count", "info_count", "days", "issues"):
            assert key in person

    def test_month_label(self):
        days = get_working_days(2025, 1)
        ga = dict.fromkeys(days, 8.0)
        person = _build_person("x", "x", ga, ga, 2025, 1, [], len(days), len(days)*8, True)
        assert person["month_label"] == "Janeiro / 2025"

    def test_export_suffix(self):
        days = get_working_days(2025, 6)
        ga = dict.fromkeys(days, 8.0)
        person = _build_person("x", "x", ga, ga, 2025, 6, [], len(days), len(days)*8, True)
        assert person["export_suffix"] == "062025"

    def test_totals(self):
        days = get_working_days(2025, 1)
        ga = dict.fromkeys(days, 8.0)
        task = dict.fromkeys(days, 7.5)
        issues, mensal_ok, wdays, lim = validate(ga, task, 2025, 1)
        person = _build_person("x", "x", ga, task, 2025, 1, issues, wdays, lim, mensal_ok)
        assert person["ga_total"] == pytest.approx(round(sum(ga.values()), 2))
        assert person["task_total"] == pytest.approx(round(sum(task.values()), 2))
