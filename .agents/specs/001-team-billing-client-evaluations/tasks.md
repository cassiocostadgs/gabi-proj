# Tasks: Client Evaluations (MAG)

- [x] **T1. Authoritative documentation — new domain skill and AGENTS.md registration**
  - **Target 1**: `.agents/skills/client-evaluation/SKILL.md` (new file — this skill does not yet exist; create it as the authoritative source for the new bounded context)
    - Affected sections: entire new file.
    - Expected change: create the authoritative skill documenting business rules (supplier validation `Fornecedor == "DB1 Global Software"`, deduplication order, status lifecycle `rascunho → aprovado | rejeitado`, both comment patterns — per-dimension vs. single `Feedback:` block), data model (`client_evaluations` table full schema, both partial unique indexes), all 9 REST endpoint contracts (method, path, auth mechanism per endpoint, request/response shapes, HTTP codes), the `match_name()` adapter pattern (`_email_to_prefix`), and the HTML stripping approach for the automated ingest path.
    - Origin: AGENTS.md — "local skills in `.agents/skills/` are the authoritative domain documentation source"; plan.md "Impact on the authoritative documentation" item 1 — "New domain skill — `.agents/skills/client-evaluation/SKILL.md` must be authored"; all implementation tasks (T2–T8) read this skill during execution and depend on it being accurate before they begin.
  - **Target 2**: `AGENTS.md`
    - Affected section: "Business Domains" table.
    - Expected change: add row for order 5 — domain `client-evaluation`, key responsibility "MAG client evaluation ingest, admin review lifecycle (`rascunho → aprovado | rejeitado`), professional self-service history, and admin dashboard."
    - Origin: plan.md "Impact on the authoritative documentation" item 2; spec.md "Domain" section — "This spec introduces a new bounded context as a sixth domain in GABI alongside the five existing ones"; motivated by Stories 1–7 collectively (the entire `client-evaluation` bounded context is introduced by this spec).

- [x] **T2. Parser module and unit tests**
  - Create `web/client_evaluation_engine.py` — pure Python, stdlib only (`re`, `html`, `unicodedata`). No I/O, no FastAPI imports. Exports a single `parse_evaluation(text: str) -> dict` function that:
    - Extracts `competencia` (normalized to `"YYYY-MM"` from the `Competência: MM / YYYY` label), `nome_extraido`, `fornecedor` (validated against `"DB1 Global Software"`), and the three dimension scores (`comportamental_nota`, `tecnica_nota`, `prazo_nota`) as integers in `[1, 5]`.
    - Detects comment pattern: if the body contains a `Feedback:` label, stores it in `comentario_geral` and sets all `*_comentario` fields to `None`; otherwise extracts per-dimension comments into `comportamental_comentario`, `tecnica_comentario`, `prazo_comentario`, and sets `comentario_geral` to `None`.
    - Imports `norm()` and `PARTICLES` from `gabi_engine` for name normalization; imports `match_name()` for the auto-link logic (caller passes the list of email prefixes, not the module).
    - Raises `ValueError` with a descriptive message on any missing required field, any score outside `[1, 5]`, or a `fornecedor` mismatch. Never infers or defaults missing data silently.
  - Create `tests/test_client_evaluation_engine.py` — unit tests covering: both comment patterns (email bodies A and B from `test-cases.md`), wrong `fornecedor` (email body C), missing required field, score out of range, score as non-integer string, `competencia` normalization to `"YYYY-MM"`. Target ≥ 95% line coverage for this module.

- [x] **T3. DB migration, repository foundation, and ingest endpoints**
  - Prerequisite: `web/db.py` does not yet exist. Create it by extracting the `_db()` context manager from `main.py`; update `main.py` to `from db import _db`. All existing SQLite behavior is unchanged — this is a safe rename, not a logic change.
  - Create `web/repositories/client_evaluation_repository.py` exposing: `insert_draft(...)`, `find_by_message_id(message_id)`, `find_by_email_competencia(user_email, competencia)`, `find_by_name_competencia(nome_extraido, competencia)`, and `find_approved_by_email_competencia(user_email, competencia)`. Imports `_db` from `web/db.py`.
  - Extend `_init_db()` in `main.py` with the `CREATE TABLE IF NOT EXISTS client_evaluations (...)` DDL (full 21-column schema from `data-model.md`) followed by the two `CREATE UNIQUE INDEX IF NOT EXISTS` statements (partial indexes on `(user_email, competencia) WHERE user_email IS NOT NULL` and `email_message_id WHERE email_message_id IS NOT NULL`).
  - Add to `main.py`:
    - `_require_api_key(request: Request) -> None` — reads `X-Api-Key` header, validates against `MAG_EVAL_API_KEY` env var, raises `HTTPException(401)` on mismatch or missing env var.
    - `POST /api/admin/client-evaluations/ingest` — admin JWT required; accepts `{text: str, confirm_override: bool = False}`; applies the three deduplication checks in order before calling the parser; uses the `match_name()` adapter (`_email_to_prefix`) to auto-link; returns `201` with the draft on success, `409` on duplicate (with `requires_override: True` flag when the existing record is `aprovado`), `422` on parse failure.
    - `POST /api/integrations/mag-evaluation` — `Depends(_require_api_key)`; accepts `{content, subject, internetMessageId, receivedDateTime, from}`; strips HTML from `content` with `re.sub(r'<[^>]+>', '', content)` + `html.unescape()` before parsing; applies deduplication (idempotent `200` on same `internetMessageId`); returns `201` or `200 {ok: true, skipped: true}`.
  - Create `tests/test_client_evaluations.py` — integration tests (FastAPI `TestClient`, in-memory SQLite) covering: TC-1 through TC-8 (Story 1 manual ingest), TC-9 through TC-13 (Story 2 duplicates), TC-39 (Story 8 — 403 for non-admin on admin endpoints), TC-41 (Story 8 — cross-user isolation for admin endpoints), TC-44 through TC-51 (RF12 automated ingest — valid key, email_message_id stored, invalid key, missing key, idempotency, HTML stripping, invalid body after strip, messageId-priority dedup).

- [x] **T4. Review, edit, approve, and reject endpoints**
  - Extend `web/repositories/client_evaluation_repository.py` with: `get_by_id(id)`, `list_all(status_filter=None)`, `update_draft(id, fields, edited_by, edited_at)`, `update_status(id, new_status, reviewed_by, reviewed_at)`, and `list_team_members_active()` (needed for professional selector in the review screen).
  - Add to `main.py`:
    - `GET /api/admin/client-evaluations` — admin JWT required; optional `?status=` query param; returns all matching records with all columns including `match_status`; default sort `created_at DESC`.
    - `GET /api/admin/client-evaluations/{id}` — admin JWT required; returns full record including `raw_email_text`.
    - `PATCH /api/admin/client-evaluations/{id}` — admin JWT required; accepts partial update of `user_email`, scores, and comment fields; records `edited_by` + `edited_at`; returns `409` if record status is `aprovado` (immutable).
    - `POST /api/admin/client-evaluations/{id}/approve` — admin JWT required; requires `user_email != null` (returns `422` otherwise); sets `status = "aprovado"`, `reviewed_by`, `reviewed_at`; subsequent PATCH returns `409`.
    - `POST /api/admin/client-evaluations/{id}/reject` — admin JWT required; sets `status = "rejeitado"`, `reviewed_by`, `reviewed_at`.
  - Extend `tests/test_client_evaluations.py` with: TC-14 through TC-17 (Story 3 — GET single, PATCH audit trail, PATCH on aprovado, including `edited_by`/`edited_at` assertion), TC-18 through TC-24 (Story 4 — approve, immutability after approve, approve null user_email, reject, rejected exclusion from professional view), TC-25 through TC-29 (Story 5 — `nao_vinculado` creation, GET list includes unlinked, PATCH resolves to `"manual"`), TC-39/TC-40 (Story 8 — 403 for non-admin, 401 unauthenticated admin endpoints).

- [x] **T5. Dashboard and professional view endpoints**
  - Extend `web/repositories/client_evaluation_repository.py` with: `get_dashboard(user_email_filter, competencia_from, competencia_to)` (returns approved records matching active filters, with per-professional per-competência aggregated scores) and `get_my_evaluations(user_email)` (returns approved records for the authenticated user, ordered `competencia DESC`).
  - Add to `main.py`:
    - `GET /api/admin/client-evaluations/dashboard` — admin JWT required; optional query params `user_email`, `competencia_from`, `competencia_to`; returns only `aprovado` records; when no filters provided, returns all approved. Note: route must be registered before `GET /api/admin/client-evaluations/{id}` to avoid path conflict in FastAPI.
    - `GET /api/my-evaluations` — user JWT required (not admin-only); returns `{evaluations: [...]}` containing only the authenticated user's `aprovado` records, ordered `competencia DESC`; returns `{evaluations: []}` with `200` when no records exist.
  - Extend `tests/test_client_evaluations.py` with: TC-29 through TC-33 (Story 6 — dashboard: all approved, filter by user_email, filter by competencia range, excludes rascunho/rejeitado), TC-34 through TC-38 (Story 7 — professional view: own approved DESC, empty array, excludes rascunho/rejeitado, cross-user exclusion), TC-41 through TC-43 (Story 8 — cross-user isolation, 401 unauthenticated my-evaluations).

- [x] **T6. Admin Ingest & Review screen**
  - Add to `frontend/src/types/index.ts` the three new interfaces:
    - `ClientEvaluation` — full record shape (all columns including `raw_email_text`, `match_status`, audit fields).
    - `ClientEvaluationDraft` — subset used in the review drawer form (editable fields: `user_email`, `comportamental_nota`, `comportamental_comentario`, `tecnica_nota`, `tecnica_comentario`, `prazo_nota`, `prazo_comentario`, `comentario_geral`).
    - `ClientEvaluationDashboard` — aggregated shape returned by `GET /dashboard`.
  - Create `frontend/src/services/client-evaluation.service.ts` — born here, exposing: `ingest(text, confirmOverride?)`, `listEvaluations(statusFilter?)`, `getEvaluation(id)`, `updateEvaluation(id, draft)`, `approveEvaluation(id)`, `rejectEvaluation(id)`. Dashboard and my-evaluations functions added in T7 and T8 respectively.
  - Create `frontend/src/pages/admin/sections/AvaliacaoClienteSection.tsx` — section component with two tabs ("Ingestão / Revisão" | "Dashboard"); this task delivers the "Ingestão / Revisão" tab only (dashboard tab shell is left as a placeholder). Tab content per `ui/screens.md`:
    - Ingest form: `<Textarea>` (min 10 rows, monospace, full width, placeholder in Portuguese), "Processar" button (disabled while in flight), parse error banner (`422` → destructive/red alert), duplicate warning banner (`409` → amber alert; when the existing record is `aprovado` and `requires_override: True`, shows a confirmation dialog before re-submitting with `confirm_override=true`).
    - Records table: columns Status (badge: `rascunho` slate, `aprovado` emerald, `rejeitado` red) | Profissional (linked name or amber "⚠ Não vinculado" badge when `match_status = "nao_vinculado"`) | Competência (`"YYYY-MM"` displayed as `"MMM/YY"`) | Comp. / Técn. / Prazo (score pill, empty when null) | Ações ("Revisar" button — shown for `rascunho` and `aprovado`); filter dropdown above table (All / Rascunho / Aprovado / Rejeitado); empty state message; loading skeleton (3–5 rows, animated pulse).
    - Review drawer: slides from right; two-column split; header `"Revisão — [nome_extraido] / [competencia]"`; left panel (`raw_email_text` in `<pre>`, monospace, dark background, scrollable); right panel (editable fields per screen spec — `Select` for professional populated from `GET /api/admin/client-evaluations` team members, read-only competência, score inputs, conditional comment fields/`comentario_geral`, read-only audit row); footer buttons Rejeitar (destructive, confirmation popover, disabled for `aprovado`), Salvar (secondary, disabled for `aprovado`), Aprovar (primary, disabled when `user_email = null` with tooltip, disabled for `aprovado`).
    - TanStack Query invalidation after ingest, approve, and reject.
  - Extend `frontend/src/pages/admin/AdminPage.tsx` — add `case 'avaliacao-cliente': return <AvaliacaoClienteSection />` to the section switch.
  - Precondition: T3 and T4 must be completed (ingest + review endpoints must be running).

- [x] **T7. Admin dashboard tab**
  - Extend `frontend/src/services/client-evaluation.service.ts` with `getDashboard(filters: {userEmail?, competenciaFrom?, competenciaTo?})`.
  - Extend `AvaliacaoClienteSection.tsx` — implement the "Dashboard" tab (previously a placeholder):
    - Filter bar: `Select` for profissional ("Todos" + active team members sorted by name), two `Input type="text"` for competência from/to (YYYY-MM format, no datepicker), "Aplicar" button triggering the dashboard fetch.
    - `Line` chart via `react-chartjs-2 <Line>`: fixed height 300px, responsive; x-axis = competência labels (`"jun/25"` format); y-axis score 1–5; 3 datasets — Comportamental (blue `rgba(59,130,246,0.9)`), Técnica (green `rgba(52,211,153,0.9)`), Prazo (orange `rgba(251,146,60,0.9)`); legend enabled top; grid color `'#1e293b'`; when "Todos": chart shows average scores per competência; when a specific professional: chart shows that professional's scores.
    - Summary table below chart: columns Profissional | Competência | Comp. | Técnica | Prazo | Comentário (combined: per-dimension joined by ` / ` or `comentario_geral`, truncated to 80 chars with tooltip for full text).
    - Loading state: spinner centered over chart area. Empty state: `"Nenhum dado aprovado disponível para os filtros selecionados."` (centered, muted).
  - Precondition: T5 completed (dashboard endpoint), T6 completed (`AvaliacaoClienteSection.tsx` exists).

- [x] **T8. Professional My Evaluations screen**
  - Extend `frontend/src/services/client-evaluation.service.ts` with `getMyEvaluations()`.
  - Create `frontend/src/pages/my-evaluations/MyEvaluationsPage.tsx` — page component behind `ProtectedRoute`:
    - Page header: `"Minhas Avaliações — Cliente MAG"` (consistent heading style with other GABI pages).
    - One card per competência, sorted newest-first. Card: title in long format (`"Junho / 2025"` using `MONTH_PT` mapping); score badges row (three `<Badge>` side by side: `"Comportamental: N"`, `"Técnica: N"`, `"Prazo: N"`; color: ≥4 emerald, 3 amber, ≤2 red); comment section (if `comentario_geral` is not null: single block labeled `"Feedback:"`; otherwise up to three per-dimension labeled comment blocks, omitted when null/empty).
    - Empty state: centered vertical layout — `"Nenhuma avaliação publicada ainda."` + muted smaller text `"Retorne após o próximo ciclo de aprovação de timesheet."`.
    - Loading state: skeleton cards (2–3 rows, animated pulse).
  - Extend `frontend/src/App.tsx` — add route `<Route path="/minhas-avaliacoes" element={<MyEvaluationsPage />} />` inside the `ProtectedRoute` outlet (alongside `/submissions`, `/task-report`, etc.), outside `AdminRoute`.
  - Add `"Minhas Avaliações"` navigation link to the user sidebar — locate the navigation component (within `Layout.tsx` or equivalent) and add the entry after `"Minhas Submissões"`, visible to non-admin authenticated users.
  - Precondition: T5 completed (my-evaluations endpoint).
