---
name: ga-validation
description: >
  This is the authoritative documentation of the GA Validation domain. It covers
  parsing GA (Gestão de Apontamentos) Excel spreadsheets, matching employee names to
  Task system records, and applying five validation rules (R0–R4) to detect divergences
  between GA hours and billable Task hours per working day of a competência. Load when
  working with GA file parsing, name matching, divergence detection, monthly limits,
  Brazilian holidays, working-day calculation, or the POST /api/validate endpoint.
metadata:
  author: clovis-cli
  type: domain-skill
---

# GA Validation

> **Maintaining this skill**
>
> Update it whenever the behavior of this domain changes — new or modified validation
> rules, changes to GA parsing logic, name-matching algorithm, holiday set, tolerance
> constant, processing modes, or API contract. A code refactor that preserves the
> business behavior does not trigger an update. When the skill and the code describe
> different intended behaviors for the same rule and no recorded decision settles it,
> escalate to the human — do not adjust either side on your own.

## Domain overview

GA Validation is the core reconciliation engine of GABI (Gap Auditor of Billed Input).
Its purpose is to parse the GA (Gestão de Apontamentos) time-tracking spreadsheet
produced by each employee, resolve the employee's identity against the corporate Task
system, and report every discrepancy between the hours the employee declared in GA and
the hours that were billed as FATURADO in the Task system for the same period
(competência).

The domain produces a structured, per-person validation result that is later used by
the Submission Workflow domain (not by GA Validation itself) to support admin review
and billing export.

## Business rules

### R0 — Working day with no entry

A working day on which the employee's GA hours are ≤ 0.1 h **and** Task FATURADO
hours are ≤ 0.1 h **and** Task NAO_FATURADO hours are ≤ 0.1 h generates a **warning**
issue.

Message: `"Dia útil sem apontamento em nenhum dos sistemas"`

R0 does not fire on weekends or holidays.

### R1 — Divergence between GA and billable Task hours

When `|GA_hours − Task_FATURADO_hours| > TOLERANCE` on a working day, a **error**
issue is generated.

Message: `"GA (Xh) difere do Task faturado (Yh) — diferença ±Zh"` (values formatted
to two decimal places).

Only Task FATURADO hours are compared against GA. Task NAO_FATURADO hours are carried
in the result for informational context but play no part in the divergence check.

### R2 — Daily overtime (GA exceeds 8 h)

When `GA_hours > 8.0 + TOLERANCE` on a working day, an overtime issue is generated.
The severity is:

- **info** — when `mensal_ok` is `true` (monthly total within limit); labeled
  `"observação"`.
- **warning** — when `mensal_ok` is `false` (monthly total exceeded); labeled
  `"ponto de ajuste — mensal comprometido"`.

Message: `"GA (Xh) excede 8h diárias (label)"`.

### R3 — Monthly (or period) total exceeds the working-day limit

`mensal_ok = (GA_total ≤ working_days × 8 + TOLERANCE)`. This check runs **before**
the per-day loop. When `mensal_ok` is `false`, a **error** issue is appended with:

- `date`: `"MM/YYYY"` (not a calendar day) for a full-month validation;
  or `"MM/YYYY"` for a partial period (the text "do período" replaces "mensal" in the
  message).
- Message (full month): `"Total mensal GA (Xh) excede Yh (N dias uteis x 8h) - correcao obrigatoria"`.
- Message (partial period): `"Total do período GA (Xh) excede Yh (N dias uteis x 8h) - correcao obrigatoria"`.

The result of R3 also affects R2 severity (see rule above).

### R4 — Entry on weekend or holiday

On any calendar day that is a weekend (Saturday or Sunday) or a Brazilian national
holiday, a **warning** issue fires when `GA_hours > TOLERANCE` **or**
`Task_FATURADO_hours > TOLERANCE`.

Message: `"Apontamento em fim de semana — GA: Xh"` (GA part omitted if ≤ TOLERANCE),
`"Apontamento em fim de semana — Task: Yh"` (Task part omitted if ≤ TOLERANCE), or
both parts joined by `", "`.

## Validation constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `TOLERANCE` | `0.1` h | Absolute tolerance for all hour comparisons. Must be the named constant; never an inline literal. |
| Daily limit | `8.0` h | Threshold above which R2 fires (comparison: `GA > 8.0 + TOLERANCE`). |
| Monthly limit | `working_days × 8` | Upper bound for GA total. R3 fires when `GA_total > limit + TOLERANCE`. |

## Calendar and working-day logic

Working days are defined as weekdays (Monday–Friday) that are **not** Brazilian
national holidays. All calendar logic is centralized in `gabi_engine.py` and must not
be replicated elsewhere in the codebase.

### Brazilian national holidays (calculated algorithmically each year)

The holiday set is derived from the Easter date (Anonymous Gregorian algorithm) and
covers twelve annual occasions:

| Holiday | Date/Rule |
|---------|-----------|
| Confraternização Universal | January 1 |
| Segunda-feira de Carnaval | Easter − 48 days |
| Terça-feira de Carnaval | Easter − 47 days |
| Sexta-feira Santa | Easter − 2 days |
| Tiradentes | April 21 |
| Dia do Trabalho | May 1 |
| Corpus Christi | Easter + 60 days |
| Independência do Brasil | September 7 |
| Nossa Senhora Aparecida | October 12 |
| Finados | November 2 |
| Proclamação da República | November 15 |
| Natal | December 25 |

Holidays are never hardcoded in lists; they must always be calculated by `get_holidays(year)`.

### Partial-period mode

When `start_date` and `end_date` together do not span the full calendar month, the
engine enters partial-period mode:

- Working days are counted within `[start_date, end_date]` only.
- The monthly limit is recalculated as `partial_working_days × 8`.
- GA daily data is filtered to include only dates within the range before validation.
- The period label changes from `"Month / YYYY"` to `"DD/MM – DD/MM/YYYY"`.
- R3 message reads "do período" instead of "mensal".

## GA file parsing

The GA spreadsheet is an Excel file (XLS or XLSX). The engine reads the **first sheet
(index 0)**.

**Header extraction** (row 0, column F = index 5):

The cell content follows the pattern `"YYYYMM\nFull Name"` (year+month digits on the
first line, person name on the second line, separated by `\n`). The parser extracts:

- `name` — the second line, stripped of whitespace.
- `year` — first four characters of the digit-only prefix (zero if absent).
- `month` — characters 4–5 of the digit-only prefix (zero if absent).

**Daily entries extraction**:

The parser scans all rows. A date context is established when column B (index 1)
contains a string with `"/"`. A daily total is recorded when column I (index 8) is
`"Total Data"` and column J (index 9) is non-empty; the value is stored as a float
keyed by the current date string (`"DD/MM/YYYY"`).

## Task file parsing (fallback mode)

When Oracle is unavailable, the engine reads a Task.xlsx fallback file uploaded by an
admin. The file must contain a sheet named `"Analítico"`. Data rows begin at row index
10. The relevant columns are:

| Index | Content |
|-------|---------|
| 0 | `responsavel` (person identifier, e.g., `"PEDRO.SANTOS"`) |
| 1 | Date (`datetime` or ISO string converted to `"DD/MM/YYYY"`) |
| 2 | Area code: `"FATURADO"` or `"NAO_FATURADO"` |
| 8 | Total hours (`float`) |

Rows are skipped if any of `responsavel`, `date`, `area_code`, or `total` is falsy.
Hours are accumulated per `(responsavel, date)` pair into two dictionaries: one for
FATURADO and one for NAO_FATURADO.

## Name matching

The engine resolves an employee's identity by matching the full name extracted from
the GA header against the list of `responsavel` identifiers in the Task system.

Task identifiers follow the format `"FIRSTNAME.LASTNAME"` (e.g., `"PEDRO.SANTOS"`).

Matching algorithm:

1. Apply `norm()` to both sides: Unicode NFD normalization → lowercase → remove
   combining diacritics (category "Mn").
2. Tokenize the normalized GA name; discard tokens that are in the particles set
   `{"de", "da", "do", "dos", "das", "e"}`.
3. For each Task ID, split on `"."` to obtain `[first, last]`.
4. A match is found when token `[0]` equals `first` **and** at least one of the
   remaining tokens equals `last`.
5. Returns the first matching Task ID, or `None` if no match.

A match failure is recorded as an error string (not an HTTP error) that includes the
unmatched GA name and the list of available Task identifiers.

## Processing modes

### Oracle mode (primary)

Active when Oracle is configured (`is_oracle_configured()` returns `true`) and
`use_file_fallback` is `false`. The engine calls Task DB live data per employee:

- Uses the email of the authenticated user to derive the `responsavel` identifier
  (`pedro.santos@db1.com.br` → `PEDRO.SANTOS`).
- Queries billable (FATURADO) and non-billable (NAO_FATURADO) hours from Oracle for
  the requested date range.
- Each GA file is processed independently; a per-file Oracle error is appended to the
  `errors` list without aborting processing of the remaining files.

### File fallback mode (contingency)

Active when `use_file_fallback` is `true` or Oracle is not configured. The engine
reads the Task.xlsx file uploaded by an admin for the matching competência. A
competência mismatch between the uploaded file and the requested period prevents
validation (enforced by the frontend before the request is sent).

## Flows and lifecycle

```
User uploads one or more GA files
         ↓
POST /api/validate (multipart form)
         ↓
For each GA file:
  1. Parse GA file → name, daily_hours, year, month
  2. Determine mode:
     - Oracle mode: query Task DB for FATURADO + NAO_FATURADO hours
     - File mode:   parse Task.xlsx → FATURADO + NAO_FATURADO dicts
  3. Match GA name → Task ID (match_name)
     - Failure: append to errors, skip to next file
  4. Run validate():
     a. Compute monthly limit (working_days × 8)
     b. Check R3 (monthly total)
     c. For each calendar day in the union of GA dates, Task dates,
        and working days:
        - Weekend/holiday → check R4
        - Working day, no entry → R0
        - Working day with entry → check R1, check R2
  5. Build Person result with per-day breakdown
         ↓
Return {persons: [...], errors: [...]}
  - HTTP 422 only when persons is empty AND errors is non-empty (file mode)
```

## Entities and data

### `POST /api/validate` — request

Multipart form fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ga` | `list[UploadFile]` | yes | One or more GA Excel files |
| `start_date` | `string` (ISO date) | yes | Period start, e.g., `"2025-07-01"` |
| `end_date` | `string` (ISO date) | yes | Period end, e.g., `"2025-07-31"` |
| `use_file_fallback` | `bool` | no (default `false`) | Force file mode even if Oracle available |
| `competencia` | `string` (`"YYYY-MM"`) | no | Needed in file mode to select the correct Task file |

Authentication: JWT bearer token required.

### `POST /api/validate` — response

```json
{
  "persons": [Person],
  "errors": ["string"]
}
```

### `Person`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Full name as extracted from the GA header |
| `task_id` | `string` | Matched Task responsavel identifier |
| `month_label` | `string` | `"Month / YYYY"` or `"DD/MM – DD/MM/YYYY"` (partial) |
| `export_suffix` | `string` | `"MMYYYY"` for file naming |
| `ga_total` | `number` | Sum of all GA daily hours (rounded to 2 decimals) |
| `task_total` | `number` | Sum of Task FATURADO hours (rounded to 2 decimals) |
| `diff_total` | `number` | `ga_total − task_total` (rounded to 2 decimals) |
| `working_days` | `integer` | Count of working days in the period |
| `monthly_limit` | `integer` | `working_days × 8` |
| `mensal_ok` | `boolean` | `true` when `ga_total ≤ monthly_limit + TOLERANCE` |
| `issues_count` | `integer` | Total issue count |
| `errors_count` | `integer` | Count of issues with `severity = "error"` |
| `warnings_count` | `integer` | Count of issues with `severity = "warning"` |
| `info_count` | `integer` | Count of issues with `severity = "info"` |
| `days` | `DayResult[]` | One entry per calendar day in scope |
| `issues` | `Issue[]` | All validation issues, including R3 |

### `DayResult`

| Field | Type | Description |
|-------|------|-------------|
| `date` | `string` | `"DD/MM/YYYY"` |
| `ga` | `number` | GA hours for the day (rounded to 2 decimals) |
| `task` | `number` | Task FATURADO hours (rounded to 2 decimals) |
| `task_nf` | `number` | Task NAO_FATURADO hours (rounded to 2 decimals) |
| `diff` | `number` | `ga − task` (rounded to 2 decimals) |
| `rules` | `string[]` | Rules triggered on this day, e.g., `["R0"]` |
| `sevs` | `Record<string, string>` | Severity per rule, e.g., `{"R2": "info"}` |
| `status` | `DayStatus` | See Day status priority below |
| `is_holiday` | `boolean` | Whether the day is a national holiday |
| `holiday_name` | `string \| null` | Holiday name in Portuguese, or `null` |

**Day status priority** (first match wins):

1. `"error"` — R1 or R3 in `rules`
2. `"r4"` — R4 in `rules` **or** `is_holiday` is `true`
3. `"r0"` — R0 in `rules`
4. `"warning"` — R2 in `rules` and `sevs["R2"] == "warning"`
5. `"info"` — R2 in `rules` (implicit info severity)
6. `"ok"` — no rules triggered

Note: R3 appears in the `issues` list with `date = "MM/YYYY"` but is also reflected on
individual days via `status = "error"` for days where R1 co-occurs or for the person-
level `errors_count`. The `days` array itself does not contain a R3 day entry.

### `Issue`

| Field | Type | Description |
|-------|------|-------------|
| `date` | `string` | `"DD/MM/YYYY"` for daily issues; `"MM/YYYY"` for R3 |
| `rule` | `"R0"\|"R1"\|"R2"\|"R3"\|"R4"` | Rule code |
| `severity` | `"error"\|"warning"\|"info"` | Severity level |
| `message` | `string` | Human-readable message in Brazilian Portuguese |

## Integrations and external dependencies

**Oracle DB (read-only, Oracle mode)**: Supplies FATURADO and NAO_FATURADO hours via
the Task Data Access domain. The GA Validation domain calls the Task repository layer
and never queries Oracle directly. The Oracle connection uses thick mode (mandatory for
Oracle 11g). Oracle environment variables are configured through the Task Data Access
domain.

**python-calamine**: Used to parse both GA Excel files and Task.xlsx fallback files.
GA files are read by sheet index (first sheet); Task files are read by sheet name
(`"Analítico"`).

## Maintenance

When a business behavior changes (validation rule threshold, holiday set, matching
algorithm, API contract field, partial-period semantics), update this skill to reflect
the new intended behavior. When a code change is a pure refactor that preserves the
business behavior, do not update this skill. When the skill and the implemented code
describe **different intended behaviors** for the same rule and no recorded decision
in `discovery-answers.md` settles the divergence, escalate to the human — do not
resolve the discrepancy on your own.
