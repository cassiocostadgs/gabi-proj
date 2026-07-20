# AGENTS.md

## Overview

**G.A.B.I. — Gap Auditor of Billed Input**

Internal corporate tool that validates whether hours recorded in the GA (Gestão de Apontamentos) time-tracking spreadsheet match what was billed in the Task system (Oracle DB). Each employee logs in and sees only their own data; admins see all employees.

---

## Stack

### Backend
- **Python 3.11** — FastAPI + uvicorn
- **SQLite** (`web/users.db`) — internal data (users, submissions, history)
- **oracledb** — Oracle driver; thick mode required (Oracle 11g has no thin-driver support)
- **python-calamine** — XLS/XLSX parsing (GA files and Task fallback)
- **python-jose** + **bcrypt** — JWT authentication and password hashing
- **openpyxl** — XLSX export
- **Ruff** — Python linter and formatter

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **React Router DOM** — routing
- **TanStack Query** — server state (cache, loading, error, auto-refetch)
- **Axios** — HTTP client
- **Shadcn/ui** + **Tailwind CSS v4** — UI and styles
- **Lucide React** — icons
- **Chart.js** + **react-chartjs-2** — validation charts
- **SheetJS** — browser-side XLSX export
- **ESLint** + **Prettier** — lint and formatting
- **Vitest** — unit tests

---

## Repository Structure

```
web/
  main.py              → HTTP layer (FastAPI, auth, routes) — no business logic
  gabi_engine.py       → pure validation logic (no I/O, no FastAPI)
  users.db             → SQLite internal database
  tasks/               → Task.xlsx fallback files uploaded by admin
  core/
    oracle.py          → Oracle thick-mode client initialization
  repositories/
    task_repository.py → Oracle Task DB queries (only external DB contact point)

frontend/
  src/
    pages/             → route components (one folder per page)
    components/        → reusable UI components
    hooks/             → custom hooks (TanStack Query)
    services/          → API access functions (Axios)
    types/             → TypeScript interfaces and types
    lib/               → pure utilities (no side effects)

tests/
  test_api.py          → API integration tests (FastAPI TestClient)

.agents/
  context/             → functional discovery artifacts (discovery-answers.md)
  maps/                → domain maps (functional-map.md)
  skills/              → domain and technical skills (loaded on demand)
```

---

## Architecture & Layer Invariants

- **`gabi_engine.py`**: pure logic — no I/O, no FastAPI imports, no direct DB calls.
- **`repositories/`**: the only contact point with external databases (Oracle and SQLite).
- **`main.py` routers**: no business logic — delegate to engine/services only.
- **Frontend `services/`**: never access the Task DB directly — always via the G.A.B.I. API.

New validation rules must be added as independent functions composed into `validate()` — never modify `validate()` directly (Open/Closed principle).

---

## User Model & Auth

- **Identity**: corporate email (`@db1.com.br`); cross-referenced with Task DB records.
- **Auth**: JWT HS256, 8-hour expiry; secret from `SECRET_KEY` env var or persisted `web/.secret_key` file.
- **Token storage**: `gabi_admin_token` in `localStorage`.
- **Seed**: default admin created from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars at startup.
- **Scope**: employees see only their own data; admins see all.
- **CORS**: all origins/methods/headers allowed (internal corporate tool).
- **Runtime env vars**: configured in `web/.env` (gitignored; not committed).

---

## Business Domains

Seven bounded contexts identified in functional discovery:

| Order | Domain | Key Responsibility |
|-------|--------|--------------------|
| 0 | **Authentication** | Login, JWT, user CRUD (admin) |
| 1 | **Task Data Access** | Oracle connectivity, hour queries, Task.xlsx fallback, task-entries report |
| 2 | **GA Validation** | GA file parsing, R0–R4 rule engine, working-day calculation |
| 3 | **Submission Workflow** | GA submission lifecycle: pending → approved / rejected |
| 4 | **Team & Billing** | Team profiles, billing rates, billing XLSX export |
| 5 | **Client Evaluation** | MAG client evaluation ingest, admin review lifecycle (`rascunho → aprovado | rejeitado`), professional self-service history, and admin dashboard |
| 6 | **TL Evaluation** | TL-driven squad evaluation chat flow (Gates A/B, score 1–5, dimensions), squad and membership management, monthly closure, and PDF generation |

---

## Validation Rules (R0–R4)

Tolerance applied in all comparisons: **`TOLERANCE = 0.1h`** (named constant — never use an inline literal).

| Rule | Severity | Condition | Description |
|------|----------|-----------|-------------|
| **R0** | warning | Working day with GA = 0 and Task = 0 | No entry in either system |
| **R1** | error | `abs(GA − Task) > 0.1` | GA diverges from billed Task hours |
| **R2** | warning/info | `GA > 8.0h` | warning if R3 active, info if monthly total is ok |
| **R3** | error | `GA_total > working_days × 8h` | Monthly cap exceeded — correction required |
| **R4** | warning | Weekend/holiday with GA > 0 or Task > 0 | Entry on Saturday, Sunday, or holiday |

Working days = calendar days excluding weekends and **Brazilian national holidays**, calculated algorithmically (including Easter and Corpus Christi) via `get_holidays()`.

- **Never hardcode holidays** — always use `get_holidays()`.
- **Never replicate working-day logic** outside `gabi_engine.py`.

---

## Oracle Task DB

| Parameter | Value |
|-----------|-------|
| Host | `192.168.199.99` |
| Port | `1521` |
| SID | `orcl` |
| Version | Oracle 11.2.0.4.0 |
| Driver | `oracledb` thick mode (11g has no thin-driver support) |

**Schema** (`TASKMANAGER`):
- `ORDEMSERVICO` — OS: `CD_PROJETO`, `CD_TAREFA`, `CD_AREA`, `CD_NATUREZA`, `DS_TAREFA`
- `TRIAGEM` — triagem of OS: `CD_RESPONSAVEL`, `CD_TIPOTAREFA`, `TMP_PREVISTO`, `TMP_GASTO`
- `EXECUCAO` — actual executions: `DH_INICIO`, `DH_TERMINO`, `BO_TABULADO`, `BO_ABONADO`

**Mandatory query filters**:
- `os.cd_area IN ('FATURADO', 'NAO_FATURADO')` — only these two areas
- `ex.bo_abonado <> 'S'` — exclude hours pardoned by the manager
- **Do NOT filter** `bo_tabulado` — recent months have `bo_tabulado = 'N'` until accounting close

Only `FATURADO` hours feed the GA comparison. `NAO_FATURADO` provides context only.

---

## Code Quality Standards

**Clean Code**
- Names reveal intent — no abbreviations (`ga_total`, not `gat`).
- Functions do one thing.
- No magic numbers — use named constants (`TOLERANCE = 0.1`, `MAX_DAILY_HOURS = 8.0`).
- Comments explain the *why*, never the *what*.

**SOLID (applied where it adds value)**
- **S** — each module has one reason to change.
- **O** — new validation rules extend, never modify `validate()`.
- **D** — services depend on repository abstractions.

**Object Calisthenics (applicable rules)**
- One level of indentation per function.
- No `else` after `return` or `raise` — always early return.
- Small entities: functions ≤ ~20 lines, files ≤ ~200 lines as a guide.
- No abbreviations.

**TypeScript**
- No `any` — use `unknown` with a type guard.

---

## Development Commands

```bash
# Backend — development server
cd web && uvicorn main:app --reload

# Frontend — development server
cd frontend && npm run dev

# Frontend — production build (output: frontend/dist/, served by FastAPI)
cd frontend && npm run build

# Python lint + format
ruff check web/
ruff format web/

# Python tests with XML coverage (for Sonar)
python -m pytest --cov=web --cov-report=xml

# Frontend lint + format check
cd frontend && npx eslint src/ --max-warnings=0
cd frontend && npx prettier --check src/

# Frontend tests with lcov coverage (for Sonar)
cd frontend && npm run coverage

# Sonar local analysis (see Commit & Push Gate below)
./sonar-scan.sh
```

---

## Commit & Push Gate

**Mandatory sequence before every push:**

```
1. ruff check + ruff format          → Python lint & format
2. eslint + prettier --check         → TypeScript/React lint & format
3. pytest                            → Python tests with coverage
4. vitest                            → Frontend tests
5. ./sonar-scan.sh                   → Local Sonar analysis (localhost:9000)
   ↓
Failed? → fix and repeat from the failing step
Passed? → git commit + git push
```

Use the `/commit` skill to execute this flow. WIP commits (without push) do not require Sonar.

**Why Sonar runs locally**: SonarQube runs at `localhost:9000`; GitHub Actions runners have no access to it. The gate is enforced by `/commit` before push.

- Sonar Quality Gate must be **green** before every push — never push with a red gate.
- Python coverage threshold: **80%** (excludes `task_repository.py` and `gabi_engine.py` — require real Oracle).
- Sonar cognitive complexity maximum per function: **15**.
- Commit messages: **English only** (title and body).
- Never skip CI hooks (`--no-verify`).

---

## CI/CD & Deploy

**Trigger**: push to `main` → lint + tests (Python & frontend) + build → deploy to EC2.

**Deploy steps**: GitHub Actions copies `frontend/dist/` to EC2, pulls `main`, installs Python deps, runs `systemctl restart gabi`, reloads nginx.

**Secrets** (GitHub Actions): `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, `ORACLE_HOST`, `ORACLE_PORT`, `ORACLE_SID`, `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_TASK_PROJECT`, `MAG_EVAL_API_KEY`.

---

## Cross-Cutting Conventions

- **`competencia` format**: `"YYYY-MM"` string (e.g., `"2025-07"`) throughout backend and frontend.
- **API documentation**: FastAPI's built-in OpenAPI/Swagger at `/docs` is the sole form; no Postman collections, Storybook, or ADRs are maintained.
- **`responsavel` derivation**: email prefix uppercased and dot-preserved (`pedro.santos@db1.com.br` → `PEDRO.SANTOS`).

---

## What NOT to Do

- No business logic in routers — delegate to engine/services.
- No SQL queries in services — belongs in repositories.
- No validation logic replicated in the frontend — backend is the source of truth.
- No `any` in TypeScript — use `unknown` with type guard.
- Do not commit: `.secret_key`, `users.db`, files in `web/tasks/`, `.env` with secrets, `sonar-project.properties`.
- Do not skip CI hooks (`--no-verify`).
- Do not push with a red Sonar Quality Gate.

---

## Domain Source of Truth & `.agents/` Structure

The **local skills in `.agents/skills/`** are the authoritative domain documentation source. Read the relevant skill(s) before implementing any business rule, and keep them up to date as the domain evolves.

**`.agents/` layout:**
- `context/` — functional discovery artifacts (`discovery-answers.md` with validated cross-cutting decisions and gap resolution log)
- `maps/` — domain maps (`functional-map.md` with bounded context boundaries, dependencies, and suggested implementation order)
- `skills/` — domain skills (one per bounded context) and technical skills (transversal how-tos); all loaded on demand via each skill's `description` frontmatter — no index needed here
