# Spec: Client Evaluations (MAG)

## Overview

Introduce the `client-evaluation` domain into GABI: ingest monthly MAG client evaluation emails (one record per professional per competência), extract scores and comments deterministically, require mandatory admin review before publication, and expose approved evaluations in a professional self-service history view and an admin dashboard.

## Domain

This spec introduces a **new bounded context** — `client-evaluation` — as a sixth domain in GABI alongside the five existing ones. No skill exists yet for this domain; it will be authored as a task in the plan phase.

- Proposed slug: `client-evaluation`
- Skill (to be authored): `.agents/skills/client-evaluation/SKILL.md`

This unit is filed under the `team-billing` CLI category because it consumes `team_members` for name-linking; however, it introduces no changes to Team & Billing business rules and its artifacts live in a distinct bounded context.

Reference document (product requirements): [`docs/specs/avaliacao-cliente-mag.md`](../../../docs/specs/avaliacao-cliente-mag.md)

## Scope

**In:**

- Admin ingest of a MAG evaluation email body via manual paste on a dedicated admin screen (one email per operation, one record per ingest)
- Admin ingest via automated HTTP call from the n8n polling workflow (`POST /api/integrations/mag-evaluation`, API-key authenticated)
- Deterministic parser extracting: competência (normalized to `"YYYY-MM"`), collaborator name, supplier validation (`Fornecedor == "DB1 Global Software"`), three dimension scores (1–5 integer), and comments — supporting two patterns: per-dimension comment immediately below each score, or single `Feedback:` paragraph covering all three dimensions
- Explicit parser failure (never inferred data) when any required field is absent, a score is outside `[1, 5]`, or `Fornecedor` does not match the expected value
- Duplicate detection before insert: by Outlook `internetMessageId` (automated path) and by (normalized collaborator name or resolved `user_email`) + competência (both paths)
- Auto-linking of the extracted collaborator name to `team_members.user_email` using `match_name()` from `gabi_engine.py` (NFD normalization, lowercase, particle removal); manual link resolution in the review screen when no automatic match is found
- Admin review screen: raw email text alongside editable extracted fields (scores, comments, professional link); full edit audit trail (`edited_by`, `edited_at`)
- Record lifecycle: `rascunho → aprovado | rejeitado`; approved records are immutable in v1
- Professional self-service view: own approved evaluations only, read-only, ordered by competência descending
- Admin dashboard: approved evaluation scores aggregated by professional and dimension over competências, with time-series visualization (Chart.js); filterable by professional and competência range

**Out:**

- Processing `Total de horas` fields from the email body — belongs to Task Data Access / GA Validation domains
- Merging or comparing with TL self-evaluation (`avaliacao-mensal-tl`) — Future Consideration (P2)
- Professional editing their own scores — read-only in v1
- Proactive notifications (email or in-app badge) on new approved evaluation — Future Consideration (P1/P2)
- Squad-scoped admin role (TL seeing only their squad) — v1 uses the binary `is_admin` flag; Future Consideration (P2)
- Dashboard filter by squad — `team_members` has no `squad` column; squad grouping is deferred to a future spec (gap `squad-data-source` resolved: `no-squad-v1`)
- Multi-client support beyond MAG — no multi-client logic in v1; data model avoids hard-coding "MAG" for engineering prudence
- XLSX export of dashboard or professional history (RF08) — P1, not in scope for P0
- `.eml` file upload in addition to paste (RF09) — P1, not in scope for P0
- Format drift detection (RF10) — P1, not in scope for P0
- In-app badge notification (RF11) — P1, not in scope for P0
- Explicit "reopen for correction" flow for an already-approved record — Future Consideration (P2); v1 returns `409` on any edit attempt of an approved record

## Domain boundary

**This spec implements:**

- SQLite table `client_evaluations` (new; full schema, indexes, and deduplication rules in `data-model.md`)
- Module `web/client_evaluation_engine.py` — pure parser function (no I/O, no FastAPI imports): HTML-to-plain-text stripping, regex extraction of all labeled fields, handling of both comment patterns, raises `ValueError` with descriptive message on malformed input; reuses `match_name()` from `gabi_engine.py` (read-only call, no modification)
- Repository `web/repositories/client_evaluation_repository.py` — all SQLite access for this domain (insert draft, query single/list, update draft fields, update status, dashboard aggregate query)
- REST endpoints (added to `web/main.py`, following existing router pattern):
  - `POST /api/admin/client-evaluations/ingest` — manual paste; admin JWT required
  - `GET /api/admin/client-evaluations` — list all records for admin review; admin JWT required
  - `GET /api/admin/client-evaluations/{id}` — single record (raw text + extracted data); admin JWT required
  - `PATCH /api/admin/client-evaluations/{id}` — edit draft fields; admin JWT required
  - `POST /api/admin/client-evaluations/{id}/approve` — publish record; admin JWT required; `user_email` must be resolved
  - `POST /api/admin/client-evaluations/{id}/reject` — discard record; admin JWT required
  - `GET /api/admin/client-evaluations/dashboard` — aggregated approved data, filterable by professional and competência range; admin JWT required
  - `POST /api/integrations/mag-evaluation` — automated n8n ingest; `X-Api-Key` header authenticated against `MAG_EVAL_API_KEY` env var
  - `GET /api/my-evaluations` — professional's own approved evaluations; user JWT required
- Frontend service `frontend/src/services/client-evaluation.service.ts` — Axios API client functions for all endpoints above
- TypeScript interfaces in `frontend/src/types/index.ts` — `ClientEvaluation`, `ClientEvaluationDraft`, `ClientEvaluationDashboard`
- Frontend route `/admin/avaliacao-cliente` — admin ingest form (paste field) + pending list + review drawer (admin only, behind `AdminRoute`)
- Frontend route `/admin/avaliacao-cliente/dashboard` — admin dashboard: filters (professional, competência range) + Chart.js time-series charts per dimension (admin only)
- Frontend route `/minhas-avaliacoes` — professional self-service history (authenticated user, behind `ProtectedRoute`)
- Environment variable `MAG_EVAL_API_KEY` — static API key for the n8n integration endpoint; added to the `web/.env` pattern

**Belongs to other domains (cross-domain, does not become a task here):**

- `team_members` table, all team management endpoints → Team & Billing (`team-billing/SKILL.md`)
- `users` table, JWT creation/validation, `get_current_user()` dependency, `is_admin` check → Authentication (`authentication/SKILL.md`)
- `match_name()` function in `gabi_engine.py` — reused read-only; not modified → GA Validation (`ga-validation/SKILL.md`)
- The n8n workflow (Schedule Trigger, Outlook `Message: Get All`, HTTP Request node, `Message: Update` + `Message: Move`) — external to GABI; this spec defines only the GABI-side endpoint

## User stories

1. As an **admin**, I want to paste the body of a MAG notification email into a form field and receive a structured draft with collaborator, competência, 3 scores, and comments extracted, so that I do not transcribe the data manually.
2. As an **admin**, I want to be warned when the pasted email is a duplicate of an existing record (same person and competência), so that I do not create redundant entries from the email that arrives in duplicate.
3. As an **admin**, I want to review the extracted draft side-by-side with the original email text before publishing, and be able to correct any score, comment, or professional link.
4. As an **admin**, I want to individually approve (publish) or reject (discard) each record, so that I control exactly what each professional sees.
5. As an **admin**, when the extracted name does not match any active `team_member`, I want to be explicitly flagged and required to resolve the link manually before I can approve the record.
6. As an **admin**, I want a dashboard showing score trends by professional and dimension over time, so that I can identify development patterns and inform 1:1 conversations.
7. As a **professional**, I want to see my own approved evaluation history by competência with 3 scores and comments, so that I understand how the client perceives me and where to focus.
8. As a **professional**, I want my evaluations to be visible only to me and only after admin approval — not to peers, and not while still in draft.

## Acceptance criteria

**Story 1 — Manual ingest:**

- Given an authenticated admin, when `POST /api/admin/client-evaluations/ingest` with a conforming email body, then the response is `201` with the created draft (`status = "rascunho"`, `origem = "manual"`, `competencia` in `"YYYY-MM"` format).
- Given a body where `Fornecedor` ≠ `"DB1 Global Software"`, then the response is `422` with an explicit parse error message; no record is created.
- Given a body where any of the 3 score labels is absent, or the score value is not an integer in `[1, 5]`, then the response is `422` with an explicit parse error; no score is inferred and no record is created.
- Given a conforming body, the persisted `raw_email_text` is byte-for-byte identical to the submitted string.

**Story 2 — Duplicate detection:**

- Given an existing record (any `status`) for the same (`user_email`, `competencia`) where `user_email` is resolved, when manual ingest is attempted for the same pair, then the response is `409` with a duplicate warning; no second record is created.
- Given an existing record for the same normalized `nome_extraido` and `competencia` where `user_email` is not yet resolved, when manual ingest is attempted, then the response is `409` with a duplicate warning.
- Given an existing `aprovado` record for the same pair, when re-ingest is attempted without `?confirm_override=true`, then the response is `409`; with `?confirm_override=true`, a new `rascunho` is created alongside (the approved record is not modified or deleted).
- Given the same `internetMessageId` submitted a second time via the automated endpoint, then the response is `200 {ok: true, skipped: true}` and no second record is created.
- Given the automated endpoint (`POST /api/integrations/mag-evaluation`) receives a body with a **different** `internetMessageId` but matching the same (`user_email`, `competencia`) or normalized (`nome_extraido`, `competencia`) of an existing `rascunho` or `rejeitado` record, then the response is `200 {ok: true, skipped: true}` and no second record is created; silent deduplication applies on the automated path (no admin warning is raised).

**Story 3 — Review and edit:**

- Given a `rascunho` record, when `GET /api/admin/client-evaluations/{id}`, then the response includes both `raw_email_text` and all extracted fields.
- Given a `rascunho` record, when `PATCH /api/admin/client-evaluations/{id}` with updated scores, comments, or `user_email`, then the change is persisted and `edited_by` (admin email) and `edited_at` (ISO timestamp) are recorded.
- Given an `aprovado` record, when `PATCH` is attempted, then the response is `409` — the record is immutable.

**Story 4 — Approve and reject:**

- Given a `rascunho` record with `user_email` resolved (not null), when `POST /api/admin/client-evaluations/{id}/approve`, then `status` becomes `"aprovado"`, `reviewed_by` and `reviewed_at` are set, and subsequent `PATCH` attempts return `409`.
- Given a `rascunho` record with `user_email = null`, when approve is attempted, then the response is `422` — professional link must be resolved before approval.
- Given a `rascunho` record, when `POST /api/admin/client-evaluations/{id}/reject`, then `status` becomes `"rejeitado"` and the record is excluded from the professional view and the dashboard.

**Story 5 — Unlinked professional:**

- Given a `rascunho` record where no `team_member` matched `nome_extraido`, then `match_status = "nao_vinculado"` and `user_email = null` immediately after ingest.
- Given `GET /api/admin/client-evaluations`, records with `match_status = "nao_vinculado"` are included in the list and visually flagged in the UI.
- Given `PATCH /api/admin/client-evaluations/{id}` providing a `user_email` that exists in `team_members`, then `match_status` changes to `"manual"` and the link is persisted.

**Story 6 — Admin dashboard:**

- Given `GET /api/admin/client-evaluations/dashboard` with optional query params `user_email`, `competencia_from`, and `competencia_to`, then the response includes only `aprovado` records matching the active filters.
- Given no filter params, then all approved records are included in the response.
- Given approved records, then the response includes per-professional per-competência aggregated scores for each of the three dimensions.
- Given approved records with per-dimension comments (`comentario_geral = null`), the dashboard summary table displays comments as the three per-dimension values joined by ` / `; when `comentario_geral` is not null, it is displayed directly; values exceeding 80 characters are truncated and the full text is accessible via tooltip.

**Story 7 — Professional view:**

- Given an authenticated professional with at least one `aprovado` evaluation, when `GET /api/my-evaluations`, then the response is `{evaluations: [...]}` containing only their own records, ordered by `competencia DESC`.
- Given an authenticated professional with no approved evaluations, when `GET /api/my-evaluations`, then the response is `{evaluations: []}` with HTTP `200` (no error).
- Given a `rascunho` or `rejeitado` record, `GET /api/my-evaluations` never includes it.

**Story 8 — Access isolation:**

- Given a non-admin authenticated user, when calling any `/api/admin/client-evaluations/*` endpoint, then the response is `403`.
- Given `GET /api/my-evaluations`, the response never includes records where `user_email` differs from the authenticated user's email.

**Automated ingest (RF12):**

- Given a valid `X-Api-Key` header, when `POST /api/integrations/mag-evaluation` with `{content, subject, internetMessageId, receivedDateTime, from}`, then the response is `201` and a `rascunho` is created with `origem = "automacao"` and `email_message_id = internetMessageId`.
- Given an invalid or absent `X-Api-Key`, then the response is `401`.
- Given HTML `content`, then GABI strips HTML tags before passing plain text to the parser.

## Current → new behavior

**Current state:** No client evaluation functionality exists in GABI. MAG evaluation emails are managed exclusively in the DM's personal inbox, with no structure, no sharing, and no historical visibility in the system.

**New behavior:** The `client-evaluation` domain is introduced. GABI gains an ingest pipeline (manual paste and automated via n8n), an admin review/approval workflow, a professional self-service history view, and an admin dashboard with time-series charts. All data lives in the new `client_evaluations` table.

**What stays the same:** All five existing domains and their tables, endpoints, and business rules remain unmodified. `team_members` is read (for name-linking) but not structurally changed. `match_name()` in `gabi_engine.py` is called without modification.

## Cross-domain dependencies

- **Team & Billing** — `team_members` table (read-only): queried to auto-link `nome_extraido` to `user_email` at ingest time, and to populate the professional selector in the review screen.
- **Authentication** — `get_current_user()` JWT dependency used in all user-authenticated endpoints; `is_admin` flag gates the `/api/admin/*` endpoints; `MAG_EVAL_API_KEY` provides a parallel machine-to-machine auth path exclusively for `POST /api/integrations/mag-evaluation`.
- **GA Validation** — `match_name()` from `gabi_engine.py` reused (read-only) for collaborator name normalization during auto-linking.

## Risks and observations

- **Name matching edge cases:** `match_name()` normalizes to NFD + lowercase + particle removal, but cannot guarantee uniqueness if two team members have near-identical normalized names. Given the current team size this is low-probability; the mandatory admin review step handles any mismatch.
- **HTML body in the automated path:** the n8n Outlook node returns `body.content` as HTML. GABI must strip tags before invoking the parser. A lightweight approach (`html.parser` from the standard library or a `re.sub` for simple stripping) is sufficient; no heavy dependency is needed. The stripping must happen in GABI so that the parser always receives plain text regardless of origin.
- **Squad concept not yet in the data model:** the dashboard filter references squad, but the current `team_members` schema has no `squad` column (only `profile`, `subcontrato`, `cpf`). The plan phase must decide how squad is represented — options include a new column on `team_members`, a separate mapping, or deriving squad from another field. This spec sets the requirement; the implementation design is deferred to the plan.
- **API key rotation:** `MAG_EVAL_API_KEY` is a static env var. Rotation requires restarting the GABI service and updating the n8n credential — no automated rotation in v1.
- **New `/api/integrations` prefix:** first created by this spec. Future machine-to-machine integrations of similar nature should follow the same prefix convention.
- **Immutability of approved records in v1:** no "reopen for correction" flow is implemented. If a correction is needed before P2, the admin must reject the approved record and re-ingest. This is a known limitation accepted for v1.
