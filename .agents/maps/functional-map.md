---
name: functional-map
description: Six business domains identified in GABI — Authentication, Task Data Access, GA Validation, Submission Workflow, Team & Billing, and TL Evaluation — with boundaries, dependencies, and evidence from the existing codebase and external sources.
metadata:
  author: clovis-cli
  responsibility: "Map of identification of the business domains (bounded contexts), their boundaries, dependencies and suggested implementation order. Index of domains for skill generation and the spec-driven flow; it does not detail business rules nor duplicate the cross-cutting decisions, which live in the discovery-answers.md."
---

# Functional Map — GABI

## Domain 1 — Authentication

**Business objective**: Manage platform identity — login with corporate email, issue JWT tokens, and allow admins to create, activate, deactivate and delete platform users. Provides the security boundary for all other domains.

**Evidence in the code**:
- `web/main.py`: `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password` (lines 238–276); `POST /api/admin/users`, `GET /api/admin/users`, `PATCH …/toggle`, `DELETE …/{user_id}` (lines 288–353).
- SQLite table `users` (id, email, hashed_password, is_admin, is_active, created_at) — `web/main.py` lines 100–108.
- JWT helpers `create_access_token` / `get_current_user` — `web/main.py` lines 202–237.
- Frontend: `frontend/src/services/auth.service.ts`, `frontend/src/hooks/useAuth.ts`, `frontend/src/components/ProtectedRoute.tsx`, `frontend/src/components/AdminRoute.tsx`.

**Dependencies**: None.

**Relevant external dependencies**: `python-jose` (JWT), `bcrypt` (password hashing), `TanStack Query` (frontend cache), React Router DOM (route guards).

**Inferred rules** (identification level only):
- Email domain is always `@db1.com.br`; frontend appends it in the UI.
- A user cannot toggle or delete their own account.
- Default admin seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars at startup.

**Confidence**: high.

**Open gaps**: None.

---

## Domain 2 — Task Data Access

**Business objective**: Provide a unified read interface for hours logged in the corporate Task system (Oracle DB). Includes: Oracle connectivity check, querying billable and non-billable hours per person and date, a Task.xlsx upload mechanism as Oracle contingency fallback, and a self-service task-entries report for individuals and admins.

**Evidence in the code**:
- `web/repositories/task_repository.py`: `ping()`, `get_task_hours()`, `get_task_entries()`, `responsavel_from_email()`, `get_default_project()`.
- Oracle tables queried: `TASKMANAGER.ordemservico`, `TASKMANAGER.triagem`, `TASKMANAGER.execucao`.
- `web/main.py`: `GET /api/oracle/status` (line 598); `POST /api/admin/task`, `GET /api/admin/tasks`, `DELETE /api/admin/task/{task_id}` (lines 606–650); `GET /api/task/status`, `GET /api/task/competencias`, `GET /api/task/default-project` (lines 359–395).
- Task entries report: `GET /api/task/my-entries`, `GET /api/task/my-entries/export`, `GET /api/admin/task/entries`, `GET /api/admin/task/entries/export` (lines 562–689).
- `web/core/oracle.py`: thick-mode Oracle client initialization.
- SQLite table `task_uploads` — `web/main.py` lines 110–119.
- Frontend: `frontend/src/services/validate.service.ts` (Oracle status, task status, competências); `frontend/src/services/task-report.service.ts` (entries, export); `frontend/src/pages/task-report/`, `frontend/src/pages/admin/sections/TaskEntriesSection.tsx`; `frontend/src/components/TaskReportView.tsx`.

**Dependencies**: `authentication`.

**Relevant external dependencies**: `oracledb` (thick mode, Oracle 11g), `python-calamine` (XLS/XLSX parsing for fallback Task files), `openpyxl` (XLSX export), `aiofiles` (async file write on upload).

**Inferred rules** (identification level only):
- Oracle query filters: `cd_area IN ('FATURADO', 'NAO_FATURADO')`, `bo_abonado <> 'S'`; `bo_tabulado` is **not** filtered.
- `FATURADO` hours feed the GA validation comparison; `NAO_FATURADO` provides context only.
- `responsavel` derived from email: `pedro.santos@db1.com.br` → `PEDRO.SANTOS`.
- Fallback Task.xlsx file is used only when Oracle is unavailable (`use_file_fallback=true` in validate endpoint).

**Confidence**: high.

**Open gaps**: None.

---

## Domain 3 — GA Validation

**Business objective**: Parse the employee's GA spreadsheet, match the person's name to the Task DB record, and apply five validation rules (R0–R4) to detect divergences between GA hours and billed Task hours for each working day of the competência. Produces a per-person structured validation report.

**Evidence in the code**:
- `web/gabi_engine.py`: `parse_task()`, `parse_ga()`, `match_name()`, `get_holidays()`, `get_working_days()`, `validate()`, `_validate_day()`, `_build_person()`, `process()`, `process_with_task_data()`, `build_task_report()`, `filter_task_report()`.
- `web/main.py`: `POST /api/validate` (lines 762–801) — uploads GA files, calls engine, returns `{persons[], errors[]}`.
- Frontend: `frontend/src/pages/validate/`, `frontend/src/pages/results/`, `frontend/src/components/PersonCard.tsx`; `frontend/src/services/validate.service.ts`; `frontend/src/types/index.ts` — `Person`, `DayResult`, `Issue`, `DayStatus`, `ValidationResult`.

**Dependencies**: `authentication`, `task-data-access`.

**Relevant external dependencies**: `python-calamine` (GA file parsing), Chart.js + react-chartjs-2 (GA vs Task hours chart in `PersonCard`).

**Inferred rules** (identification level only):
- Five rules: R0 (no entry on working day), R1 (GA ≠ Task faturado, tolerance 0.1h), R2 (daily GA > 8h), R3 (monthly GA total > working_days × 8h), R4 (entry on weekend/holiday).
- Name matching is normalized (NFD, lowercase, diacritics stripped, particles filtered).
- Two processing modes: file mode (`process()`) for Oracle fallback; Oracle mode (`process_with_task_data()`) for live data.
- Cross-cutting decisions for holidays, working days and tolerance live in `discovery-answers.md`.

**Confidence**: high.

**Open gaps**: None.

---

## Domain 4 — Submission Workflow

**Business objective**: Manage the lifecycle of a validated GA from user submission through admin review (approve / reject) to a final approved snapshot. Enables admins to preview, reprocess and annotate submissions, and provides users with a history of their submission statuses.

**Evidence in the code**:
- `web/main.py`: `POST /api/submissions`, `GET /api/submissions/status`, `GET /api/submissions/my`, `GET /api/submissions/{id}` (lines 1052–1174); `GET /api/admin/submissions/summary`, `GET /api/admin/submissions`, `GET /api/admin/submissions/{competencia}/missing`, `PATCH …/approve`, `PATCH …/reject`, `POST …/rerun`, `GET …/preview`, `GET …/ga-file` (lines 1180–1543).
- SQLite table `ga_submissions` (id, user_email, competencia, nome_profissional, task_id, horas_task, ga_filename, ga_data BLOB, validation_snapshot JSON, status, rejection_reason, submitted_at, reviewed_at, reviewed_by, approved_snapshot JSON) — `web/main.py` lines 143–160.
- Frontend: `frontend/src/pages/submissions/`, `frontend/src/pages/submissions/:id/`, `frontend/src/pages/admin/sections/AprovacoesSection.tsx`; `frontend/src/components/SubmissionDrawer.tsx`; `frontend/src/services/billing.service.ts` (submit, getSubmissionStatus, listMySubmissions, previewSubmission, approveSubmission, rejectSubmission, exportBillingWithFiles).

**Dependencies**: `authentication`, `ga-validation`, `task-data-access`.

**Relevant external dependencies**: `openpyxl` (approved GA file stored as BLOB and served for download), File System Access API (browser-side bulk file save in billing export).

**Inferred rules** (identification level only):
- Status lifecycle: `pending` → `approved` | `rejected`.
- One submission per (user_email, competencia) — upsert on re-submit.
- `rerun` re-executes validation on current Task DB and updates `horas_task` without changing status.
- Approved submissions become immutable (`is_immutable` flag in preview response).
- Admin `approve` can override `horas_task` and stores an `approved_snapshot`.

**Confidence**: high.

**Open gaps**: None.

---

## Domain 5 — Team & Billing

**Business objective**: Model the billing dimension of the team — link platform users to billing profiles and subcontracts, manage hourly rates per profile, configure global billing metadata (CNPJ, email recipients), and produce the final billing XLSX export from approved submissions.

**Evidence in the code**:
- `web/main.py`: team member CRUD (`GET/POST /api/admin/team`, `PUT/DELETE/PATCH …/deactivate/activate` — lines 926–1046); billing rates CRUD (`GET/POST/PUT/DELETE /api/admin/billing-rates` — lines 861–920); settings CRUD (`GET /api/admin/settings`, `PUT /api/admin/settings/{key}` — lines 836–855); billing export (`GET /api/admin/billing/{competencia}/export` — lines 1546–1602).
- SQLite tables: `team_members` (id, user_email, cpf, subcontrato, profile, is_active, deactivated_from_competencia) lines 131–141; `billing_rates` (profile, valor_hora) lines 126–130; `settings` (key, value) lines 120–124.
- Frontend: `frontend/src/pages/admin/sections/EquipeSection.tsx`, `ConfiguracoesSection.tsx`; `frontend/src/services/billing.service.ts` (listTeam, createMember, updateMember, deleteMember, deactivateMember, activateMember, listRates, createRate, updateRate, deleteRate, getSettings, updateSetting, exportBillingWithFiles); `frontend/src/types/index.ts` — `TeamMember`, `BillingRate`, `AppSettings`.

**Dependencies**: `authentication`, `submission-workflow`.

**Relevant external dependencies**: `openpyxl` (billing XLSX generation), SheetJS (frontend XLSX handling), Outlook `mailto:` link with prefilled email (billing export email template via clipboard).

**Inferred rules** (identification level only):
- A team member must reference a valid billing rate profile.
- Deactivation is competência-scoped (`deactivated_from_competencia`); full reactivation clears that field.
- Billing export joins approved `ga_submissions` + `team_members` + `billing_rates`; uses `approved_snapshot` when available, otherwise `validation_snapshot`.
- Predefined settings keys: `billing_cnpj`, `billing_email_to`, `billing_email_tag`.
- `total = horas_ga × valor_hora` per row; grand total summed across all rows.

**Confidence**: high.

**Open gaps**: None.

---

## Domain 6 — TL Evaluation

**Business objective**: Enable Tech Leads to conduct AI-assisted monthly evaluations of their squad members. A TL narrates each member's month in free text via an interactive chat interface; the engine (backed by the Claude Messages API) probes for missing evidence (Gate B) or external confirmation of superperformance (Gate A) until it can propose calibrated scores and a written paragraph per evaluation dimension (Comportamental, Técnica, Prazo de Entrega). Confirmed evaluations are persisted and can be exported as a squad PDF panorama. Admins register squads, assign TLs, and manage membership.

**Evidence in the external source**:
- Spec `.agents/specs/002-tl-evaluation/spec.md`: bounded-context definition, 10 user stories (US-TL-01–US-TL-05, US-ADM-01–US-ADM-04, US-ISO-01), acceptance criteria, planned entities (`Squad`, `SquadMember`, `TlEvaluation`, `squad_competencia_closures`), planned endpoints, and cross-domain dependency table.
- HTML prototype `prototipo-chat-tl-evaluation.html` (OneDrive): interactive UI demonstrating the chat drawer per professional, Gate A/B prompts, proposal card with per-dimension score + paragraph, competência progress bar, cycle closure/reopen flow, and squad PDF panorama table.

**Planned entities** (SQLite):
- `squads` (id, name, tech_lead_user_email UNIQUE, created_at)
- `squad_members` (id, squad_id FK, nome, is_active)
- `tl_evaluations` (id, squad_id FK, member_id FK, competencia, comportamental_nota, comportamental_comentario, tecnica_nota, tecnica_comentario, prazo_nota, prazo_comentario, confirmed_at, confirmed_by)
- `squad_competencia_closures` (squad_id FK, competencia, closed_at, closed_by)

**Planned modules**:
- `web/tl_evaluation_engine.py` — pure LLM-backed engine using the Anthropic Python SDK (tool use: `ask_question` / `propose_evaluation`); stateless per turn — no I/O side effects
- `web/repositories/squad_repository.py` — squad and member CRUD
- `web/repositories/tl_evaluation_repository.py` — evaluation persistence and history queries
- PDF generation module (library TBD at spec stage) — squad panorama PDF

**Planned endpoints**:
- `POST /api/tl-evaluations/chat` — stateless turn: receives full message history + new message, returns `ask_question` or `propose_evaluation`
- `POST /api/tl-evaluations/{member_id}/{competencia}/confirm` — persists confirmed evaluation (upsert)
- `GET /api/tl-evaluations/{squad_id}/{competencia}` — evaluation history per squad/competência
- `GET /api/tl-evaluations/{squad_id}/{competencia}/pdf` — squad PDF panorama (requires all members confirmed)
- `GET/POST/PATCH/DELETE /api/tl/squads/{squad_id}/members` — TL-owned membership management
- `GET/POST/PUT/DELETE /api/admin/squads`, `PATCH /api/admin/squads/{squad_id}/assign-tl` — admin squad CRUD and TL assignment

**Dependencies**: `authentication`, `team-billing`.

**Relevant external dependencies**: Anthropic Python SDK (`anthropic`) for Claude Messages API with tool use; PDF generation library (TBD at spec stage — `reportlab` or `weasyprint` are candidates).

**Inferred rules** (identification level only):
- One squad per TL: `squads.tech_lead_user_email` has a UNIQUE constraint.
- TL permission is **derived**, not stored: a user is a TL if they appear as `tech_lead_user_email` in an active squad row — no flag in the `users` table.
- Squad members are free-text names (no GABI login required).
- Chat is **stateless**: the client sends the full message history on each turn; no server-side chat session.
- Gate A: a score of 5 on any dimension requires the TL to name an external witness who confirms the superperformance.
- Gate B: generic claims without concrete examples trigger a clarifying question before a proposal can be issued.
- Cycle closure (`squad_competencia_closures`) is a soft lock: a closed competência cannot receive new confirmations, but a TL can reopen it.
- Confirmed evaluations are upsert — re-confirming replaces the previous record for the same (member_id, competencia).
- Access isolation: a TL can only operate on their own squad members (403 otherwise); admins have full read and management access.

**Confidence**: high (detailed spec + interactive prototype provided).

**Open gaps**: None.

---

## Suggested Implementation Order

| Order | Domain | Rationale |
|-------|--------|-----------|
| 0 | `authentication` | Foundation — all other domains require auth |
| 1 | `task-data-access` | Supplies data for GA validation and the submission rerun |
| 2 | `ga-validation` | Core business logic; depends on Task data |
| 3 | `submission-workflow` | Lifecycle built on top of validation results |
| 4 | `team-billing` | Consumes approved submissions; depends on submission chain |
| 5 | `tl-evaluation` | Requires auth (JWT) and team-billing (TL validation); independent of the GA/Oracle chain |
