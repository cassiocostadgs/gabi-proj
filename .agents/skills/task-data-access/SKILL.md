---
name: task-data-access
description: >
  This is the authoritative documentation of the Task Data Access domain. It covers
  Oracle DB connectivity checks, querying billable (FATURADO) and non-billable
  (NAO_FATURADO) hours per person, Task.xlsx upload as Oracle contingency fallback,
  self-service task-entries reports with XLSX export, and responsavel derivation
  from email. Load this skill for Oracle status, task hours, task entries, task
  upload, fallback file mode, task data querying, or the /api/task and
  /api/admin/task endpoints.
metadata:
  author: clovis-cli
  type: domain-skill
---

# Task Data Access

> **Maintaining this skill**
>
> Update it whenever the behavior of this domain changes — new query filters, new
> endpoints, changes to the Oracle/file fallback selection logic, changes to the
> XLSX report format, or changes to any environment variable that governs this
> domain's behavior. A technical refactor that preserves the rules (renaming an
> internal helper, moving code to a different module) does not require an update.
> When the implemented code diverges from what this skill documents and no recorded
> decision explains the divergence, escalate to the human — do not silently rewrite
> the skill or the code.

## Domain overview

Task Data Access is the domain responsible for supplying hours data from the
corporate Task system (Oracle 11g database). It exposes two read channels — a
live Oracle query path and a static fallback file path — and adds a self-service
report layer that lets each user (and admins acting on behalf of any team member)
view and export their detailed task entries for any date range.

All other domains that need Task hours — GA Validation and Submission Workflow —
consume the interface this domain exposes. The Oracle database is accessed in
**read-only** mode; this domain never writes to Oracle.

## Business rules

### Responsável derivation

1. The Oracle `cd_responsavel` key is derived from the user's email by taking the
   local part (before `@`) and converting it to uppercase.
   - Example: `pedro.santos@db1.com.br` → `PEDRO.SANTOS`
2. This derivation is the sole mechanism for matching a platform user to their
   Oracle records. No lookup table is maintained.

### Hours aggregation query (`get_task_hours`)

This query is used by GA Validation and Submission Workflow reprocessing to
produce the day-by-day summary of billed and non-billed hours.

3. The query spans three Oracle tables: `TASKMANAGER.ordemservico` (os),
   `TASKMANAGER.triagem` (tr), and `TASKMANAGER.execucao` (ex), joined on
   `(cd_projeto, cd_tarefa)` and `(cd_projeto, cd_tarefa, cd_triagem)`.
4. Required filters (all mandatory, cannot be relaxed):
   - `os.cd_projeto = ORACLE_TASK_PROJECT` — scope to the configured project.
   - `os.cd_area IN ('FATURADO', 'NAO_FATURADO')` — only billable and
     non-billable areas; other areas are silently excluded.
   - `tr.cd_responsavel = :responsavel` — scoped to the specific person.
   - `ex.dh_inicio >= :inicio AND ex.dh_inicio < :fim + 1` — date range
     (inclusive on both ends in DD/MM/YYYY format).
   - `ex.dh_termino IS NOT NULL` — only completed (closed) executions.
5. Hours per execution: `ROUND((dh_termino - dh_inicio) * 24, 2)`.
6. Result is grouped by `(TRUNC(dh_inicio), cd_area)` and summed per day per
   area; final values are rounded to 2 decimal places in the application layer.
7. Returns two dictionaries: `faturado` and `nao_faturado`, each mapping
   `dd/mm/yyyy → hours`. Days with no entries are absent from the dictionary.

### Entries query (`get_task_entries`)

This query feeds the self-service task-entries report.

8. Deliberately **unfiltered by project and area** — no `cd_projeto` filter, no
   `cd_area` filter. The only filter beyond date range and responsável is
   `ex.dh_termino IS NOT NULL`.
9. Rationale: the report is intended to help users manually fill in their GA, so
   entries with misconfigured areas must still appear so users can spot and
   correct them.
10. Returns one record per execution with fields: `date` (dd/mm/yyyy), `project`,
    `task_code`, `description`, `area`, `start` (HH:MM), `end` (HH:MM),
    `hours` (float, rounded 2 decimal places).
11. An `unexpected_area` boolean flag is added at the application layer: `true`
    when `area NOT IN ('FATURADO', 'NAO_FATURADO')`.

### Oracle connectivity and fallback mode selection

12. Oracle is considered **configured** when the `ORACLE_INSTANT_CLIENT`
    environment variable is set. If it is absent, all Oracle queries are disabled
    regardless of other Oracle env vars.
13. The thick-mode Oracle client is initialized once at application startup via
    `ORACLE_INSTANT_CLIENT`. **Thick mode is mandatory** — Oracle 11g does not
    support the thin driver.
14. The validation endpoint (`POST /api/validate`) selects the data source:
    - **Oracle mode**: `ORACLE_INSTANT_CLIENT` is set AND
      `use_file_fallback=false` (the default).
    - **File mode**: `ORACLE_INSTANT_CLIENT` is absent OR
      `use_file_fallback=true` was explicitly passed in the form.
15. `use_file_fallback=true` forces file mode even when Oracle is configured.
    This is the mechanism for processing a specific competência when Oracle data
    is unavailable or the user explicitly chooses the uploaded file.

### Task.xlsx fallback file management

16. Admins can upload one or more Task XLSX files per competência. The most
    recently uploaded file per competência is the one used in file mode.
17. The uploaded file is stored on disk; the PostgreSQL `task_uploads` table records
    the metadata (`filename`, `path`, `competencia`, `uploaded_at`,
    `uploaded_by`).
18. File-mode validation selects the most recent upload matching the given
    `competencia`. If no `competencia` is provided, the globally most recent
    upload is used.
19. If no matching upload exists or the stored file path no longer exists on
    disk, validation returns HTTP 422 with an appropriate error message.
20. The `parse_task()` parser reads the **"Analítico" sheet** of the XLSX/XLS
    file, starting at row index 10 (the 11th row, skipping headers).
    - Expected columns: `row[0]=responsavel`, `row[1]=date`, `row[2]=area_code`,
      `row[8]=total_hours`.
    - Only rows where `area_code IN ('FATURADO', 'NAO_FATURADO')` and all
      four fields are non-empty are processed.
    - Result structure: `{responsavel: {dd/mm/yyyy: hours}}` for each area.

### Task entries report — grouping and filtering

21. `build_task_report()` groups raw entries by date, sorted chronologically,
    producing a list of days. Each day contains its entries list and the daily
    total (sum of hours, rounded to 2 decimal places).
22. `filter_task_report()` is applied only at export time (not for the JSON
    view endpoint). It accepts two boolean flags:
    - `only_faturado` (default `true`): retains only entries where
      `area == 'FATURADO'`.
    - `only_default_project` (default `true`): retains only entries where
      `project == ORACLE_TASK_PROJECT`.
    - Days that become empty after filtering are dropped from the result.
    - Day totals are recomputed after filtering.
23. The unfiltered list (from the view endpoint) always returns all areas and all
    projects, including entries with `unexpected_area=true`.

### XLSX report generation

24. The XLSX output has a single sheet named "Apontamentos".
25. Structure per day: a merged day-header row (date + daily total), a column
    header row, then one row per entry.
26. Summary block at the top: report title, Usuário (email in uppercase), Período
    (dd/mm/yyyy format), Total do período.
27. Footer: "Gerado por {user} em {timestamp}" — timestamp in
    `America/Sao_Paulo` timezone, format `dd/mm/yyyy HH:MM:SS`.
28. Entries with `unexpected_area=true` are visually highlighted in the Área
    column with a yellow background (`#FDE68A`).
29. The Description column width is auto-adjusted to the longest description in
    the dataset (minimum: header label length + 2).
30. Grid lines are hidden. Numeric hours column uses `"0.00"` number format.

## Flows and lifecycle

### Oracle connectivity check

`GET /api/oracle/status` is a public endpoint (no authentication required).

- Returns `{"available": false}` immediately if `ORACLE_INSTANT_CLIENT` is not
  set.
- When configured, runs `ping()`: executes `SELECT 1 FROM DUAL` with a 2-second
  TCP connection timeout and a 3-second wall-clock outer timeout.
- Returns `{"available": true}` on success; `{"available": false}` on any error
  or timeout.

### Fallback file status

`GET /api/task/status` and `GET /api/task/competencias` are public endpoints.

- `task/status`: returns the single most recent upload across all competências,
  or `{"available": false}` if none exists.
- `task/competencias`: returns one entry per competência (most recent upload per
  competência), ordered by competência descending.

### Self-service entries report

1. The authenticated user calls `GET /api/task/my-entries` with `start_date` and
   `end_date` (ISO date strings, `YYYY-MM-DD`). The backend derives the
   responsável from the caller's email, queries Oracle, and returns
   `{"days": [TaskReportDay[]]}`.
2. To export, the user calls `GET /api/task/my-entries/export` with the same
   date params plus optional filter flags. Returns an XLSX file.
3. Both endpoints return HTTP 503 if the Oracle query fails.

### Admin entries report

4. An admin calls `GET /api/admin/task/entries` passing a target `email` plus
   the date range. The backend first verifies the target user exists in
   `team_members`; if not, returns HTTP 403.
5. Export follows the same pattern via
   `GET /api/admin/task/entries/export`. The XLSX footer records the **admin's**
   email as "Gerado por", not the target user's.

## Entities and data

### PostgreSQL — `task_uploads`

| Column        | Type    | Notes                                      |
|---------------|---------|--------------------------------------------|
| `id`          | INTEGER | PK, autoincrement                          |
| `filename`    | TEXT    | Original filename                          |
| `path`        | TEXT    | Absolute path on server disk               |
| `competencia` | TEXT    | Format: `YYYY-MM` (default `''`)           |
| `uploaded_at` | TIMESTAMP(0) | UTC; returned as "YYYY-MM-DD HH:MM:SS" |
| `uploaded_by` | TEXT    | Email of the uploading admin               |

### Oracle tables (read-only)

| Table                       | Role in queries                              |
|-----------------------------|----------------------------------------------|
| `TASKMANAGER.ordemservico`  | Service orders — project, task, area         |
| `TASKMANAGER.triagem`       | Task triage — links responsável to tasks     |
| `TASKMANAGER.execucao`      | Executions — start/end times, hours, abono   |

### API contracts

| Method | Path                                   | Auth     | Description                                           |
|--------|----------------------------------------|----------|-------------------------------------------------------|
| GET    | `/api/oracle/status`                   | Public   | Oracle connectivity check                             |
| GET    | `/api/task/status`                     | Public   | Most recent Task upload status                        |
| GET    | `/api/task/competencias`               | Public   | Available competências with uploads                   |
| GET    | `/api/task/default-project`            | Public   | Returns `ORACLE_TASK_PROJECT` value                   |
| GET    | `/api/task/my-entries`                 | User     | Task entries for authenticated user                   |
| GET    | `/api/task/my-entries/export`          | User     | XLSX export of entries for authenticated user         |
| POST   | `/api/admin/task`                      | Admin    | Upload a Task XLSX file                               |
| GET    | `/api/admin/tasks`                     | Admin    | List all Task uploads                                 |
| DELETE | `/api/admin/task/{task_id}`            | Admin    | Delete a Task upload (record + file)                  |
| GET    | `/api/admin/task/entries`              | Admin    | Task entries for a specified team member              |
| GET    | `/api/admin/task/entries/export`       | Admin    | XLSX export of entries for a specified team member    |

**Query parameters** for entries endpoints:
- `start_date`: `YYYY-MM-DD` (ISO date, inclusive start)
- `end_date`: `YYYY-MM-DD` (ISO date, inclusive end)
- `only_faturado`: boolean, default `true` (export only)
- `only_default_project`: boolean, default `true` (export only)
- `email` (admin endpoints): the target user's email address

### Response schemas

**`GET /api/task/status`**:
```
{ available: bool, id?: int, filename?: str, competencia?: str,
  uploaded_at?: str, uploaded_by?: str }
```

**`GET /api/task/competencias`**:
```
{ competencias: [{ competencia: str, uploaded_at: str, uploaded_by: str }] }
```

**`GET /api/task/my-entries` / `GET /api/admin/task/entries`**:
```
{ days: [ { date: str (dd/mm/yyyy), total: float,
    entries: [ { date, project, task_code, description, area,
                 start (HH:MM), end (HH:MM), hours: float,
                 unexpected_area: bool } ] } ] }
```

**`POST /api/admin/task`**:
```
{ ok: true, filename: str, competencia: str }
```

## Constraints and validations

31. Admin task upload requires `competencia` as a form field alongside the file.
    The competência must be in `YYYY-MM` format (enforced by the wider system
    convention but not validated at the route level).
32. The admin entries endpoints require the target `email` to exist in the
    `team_members` table. Violation → HTTP 403 "Usuário não faz parte do time".
33. A 503 is returned when the Oracle query cannot be completed (connection error,
    timeout, or other exception). The error detail includes the original exception
    message.
34. Task file deletion is non-atomic: the record is deleted from the database first;
    file removal failure is silently suppressed.
35. `GET /api/task/my-entries` and the admin equivalents always invoke Oracle
    directly (no file fallback). The file fallback is used only within
    `POST /api/validate` when explicitly requested or when Oracle is not
    configured.

## Integrations and external dependencies

- **Oracle 11g (Task DB)** — the primary data source. Accessed via `oracledb` in
  thick mode. Connection requires `ORACLE_INSTANT_CLIENT`, `ORACLE_HOST`,
  `ORACLE_PORT`, `ORACLE_SID`, `ORACLE_USER`, `ORACLE_PASSWORD`.
- **`oracledb`** — Python Oracle database driver; thick mode initialized once at
  startup.
- **`python-calamine`** — XLS/XLSX parser used to read the Task fallback file.
- **`openpyxl`** — XLSX writer used to generate the task entries export report.
- **`aiofiles` / `anyio`** — async I/O for file write on upload and for running
  blocking Oracle calls in a thread pool.

## Domain environment variables

| Variable                | Default     | Effect on behavior                                                   |
|-------------------------|-------------|----------------------------------------------------------------------|
| `ORACLE_INSTANT_CLIENT` | (none)      | Path to Oracle Instant Client lib dir. If absent, Oracle is disabled for all queries in this domain. |
| `ORACLE_HOST`           | (empty)     | Oracle server hostname. Empty → `ping()` returns `false` immediately. |
| `ORACLE_PORT`           | `15210`     | Oracle TCP port.                                                     |
| `ORACLE_SID`            | `orcl`      | Oracle SID used in connection DSN.                                   |
| `ORACLE_USER`           | (empty)     | Oracle credentials — empty → `ping()` returns `false` immediately.  |
| `ORACLE_PASSWORD`       | (empty)     | Oracle credentials — empty → `ping()` returns `false` immediately.  |
| `ORACLE_TASK_PROJECT`   | `DGS_MAG`   | Project code (`cd_projeto`) used in `get_task_hours` and as the default project filter for the entries export. |

`ORACLE_INSTANT_CLIENT` is the master gate: it must be set for any Oracle access to work. The remaining Oracle vars are ignored when it is absent.

## Maintenance

Update this skill whenever any behavior described here changes — query filters,
fallback logic, environment variable semantics, XLSX report structure, or
endpoint contracts. A technical refactor that preserves the rules does not require
an update: the skill documents decisions, not code structure.

When the implemented code diverges from this skill without a recorded decision in
`discovery-answers.md` that directly addresses the divergence, do not resolve it
unilaterally — escalate to the human for a decision on which behavior is correct.
