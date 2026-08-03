# Spec: TL Evaluation

## Overview

Introduce the `tl-evaluation` domain into GABI: an AI-assisted chat flow where a squad's Tech Lead (TL) reports each professional's month in free text, is guided through clarifying questions when evidence is missing, confirms a calibrated score and paragraph per dimension, and generates a squad PDF — replacing the external Claude Cowork skill (`avaliacao-mensal-tl`) that runs today outside the codebase, on each TL's individual machine.

## Domain

This spec introduces a **new bounded context** — `tl-evaluation` — as a seventh domain in GABI, alongside the six existing ones (including `client-evaluation`, which covers the inverse side of the same overall process: the score the client returns, not the score the TL gives). No skill exists yet for this domain; it will be authored as a task in the plan phase.

- Proposed slug: `tl-evaluation`
- Skill (to be authored): `.agents/skills/tl-evaluation/SKILL.md`

Reference documents (authoritative):
- Product requirements: [`docs/specs/avaliacao-tl-gabi.md`](../../../docs/specs/avaliacao-tl-gabi.md)
- Business rules (dimensions, score scale, Gates A/B, tone, voice): the existing Claude Cowork skill `avaliacao-mensal-tl` (external to this repository) — summarized and cited in the product doc's "Evidência real" section. Any behavioral doubt during implementation resolves against that skill's rules, not against assumptions made here.

**Naming correction carried over from the product doc:** `.agents/specs/001-team-billing-client-evaluations/spec.md` labels this future domain "TL self-evaluation" (Out-of-scope line: *"Merging or comparing with TL self-evaluation (avaliacao-mensal-tl)"*). This is imprecise — the TL evaluates each professional of their own squad, not themselves. This spec uses the corrected framing throughout; correcting the label in `001/spec.md` itself is a documentation follow-up, not a task of this unit.

## Scope

**In:**

- Admin CRUD of squads, limited to squad creation and assigning/reassigning the responsible `tech_lead` — the TL is picked from existing registered users (`team_members`/`users`), never entered as free-text name/email
- Admin read-only visibility of any squad's membership, for oversight — no create/edit/deactivate capability
- TL-owned CRUD of squad membership (name, role, seniority, supplier; active/removed state) — scoped to the squad(s) the TL is responsible for; write access is not an admin capability in this domain
- TL-scoped access: a TL only sees and operates squads (and their membership) where they are the registered `tech_lead`
- Interactive chat session per professional: free-text report from the TL, AI-driven clarifying questions when evidence for Gate A (score 5) or Gate B (unsupported generic claim) is missing, ending in a proposed score (1–5) and paragraph per dimension (Comportamental, Técnica, Prazos de Entrega)
- TL confirmation step: review and adjust the proposed score/paragraph per dimension before it is persisted
- Historical view per squad: prior competências' confirmed scores, available to the TL during the current month's session (mirrors today's `historico.json`)
- PDF generation per squad/competência, aggregating all confirmed professionals, reusing the layout/logic of the existing `generate_pdf.py` (weasyprint) script from the Cowork skill
- A dedicated Anthropic API key, in its own Workspace under DB1's Anthropic organization, used exclusively by this domain

**Out:**

- TL self-evaluation of themselves — not what this domain does (naming correction above)
- Merging or comparing with `client-evaluation` scores in one combined view — Future Consideration (P2), same direction already recorded in `001/spec.md`
- Automatic PDF delivery to the PO by email — TL continues sending manually after generating the PDF in GABI
- Squad-scoped admin role beyond the TL/squad link introduced here — this spec does not generalize `is_admin` into a tiered role system, only adds the minimal `tech_lead_user_email` ownership check needed for this domain
- A stored "TL" role/flag on `team_members` or `users` — TL status is derived entirely from `squads.tech_lead_user_email`, never a separate persisted attribute
- Admin **write** management of squad membership (create/edit/deactivate) — this spec deliberately moves that capability to the TL (see "Domain boundary" and Risks); admin retains read-only visibility only
- Professional's own view of the TL's evaluation of them — unlike `client-evaluation`, which already exposes approved scores to the professional; also not technically meaningful here, since most evaluated squad members have no GABI account at all
- Automated migration of the legacy `historico.json`/`avaliacao_*.json` files from TLs' local folders — separate import task if decided later
- Decommissioning the Cowork skill `avaliacao-mensal-tl` — both coexist during transition; decommissioning is a future decision after validation

## Domain boundary

**This spec implements:**

- Entities `Squad`, `SquadMember`, `TlEvaluation` (new SQLite tables `squads`, `squad_members`, `tl_evaluations`; full schema in the product doc's "Modelo de Dados" section — `data-model.md` to detail indexes/constraints in the plan phase). `SquadMember` has **no** relation to `team_members`/`users` — it is a free-text record (`nome`, `papel`, `senioridade`, `fornecedor`) with no login, since most evaluated squad members are third-party professionals from other suppliers
- Module `web/tl_evaluation_engine.py` — encodes the inherited business rules (dimensions, score scale, Gate A, Gate B, tone/voice rule) as the system prompt and tool schemas (`ask_question`, `propose_evaluation`) passed to the Claude Messages API; this module is the first in GABI to depend on an external LLM call rather than pure deterministic logic — the network call itself must be isolated in a thin client module (see Risks)
- Repository `web/repositories/squad_repository.py` — squad CRUD (admin), squad membership CRUD (TL), TL-ownership lookup (`is_squad_tl(user_email, squad_id) -> bool`, computed against `squads.tech_lead_user_email`, never a stored flag)
- Repository `web/repositories/tl_evaluation_repository.py` — persist/query confirmed evaluations, historical lookups
- Module `web/tl_evaluation_pdf.py` — ported from the Cowork skill's `generate_pdf.py` (weasyprint), same auto-install-dependency pattern
- REST endpoints (added to `web/main.py`, following the existing router pattern):
  - `POST /api/admin/squads`, `GET /api/admin/squads`, `PUT /api/admin/squads/{id}` (rename, reassign `tech_lead_user_email` — the value must reference an existing `team_members`/`users` row, selected from a list in the UI, never free-typed) — admin JWT required
  - `GET /api/admin/squads/{id}/members` — read-only listing of a squad's members, for admin oversight; admin JWT required. There is no `POST`/`PATCH` under `/api/admin/squads/*/members` — write stays exclusively on the TL-scoped routes below
  - `GET /api/tl/squads` — squads where the current user is `tech_lead`; user JWT required
  - `POST /api/tl/squads/{squad_id}/members`, `GET /api/tl/squads/{squad_id}/members`, `PATCH /api/tl/squads/{squad_id}/members/{member_id}` (edit fields or deactivate/reactivate) — requires TL ownership of `squad_id` or `is_admin`
  - `GET /api/tl/squads/{squad_id}/historico` — prior competências' confirmed evaluations; requires TL ownership of `squad_id` or `is_admin`
  - `POST /api/tl-evaluations/chat` — stateless chat turn; receives `{squad_id, competencia, squad_member_id, messages[]}`, returns the next structured AI turn; requires TL ownership or `is_admin`
  - `POST /api/tl-evaluations` — persist a confirmed evaluation (one `squad_member_id`, one competência); requires TL ownership or `is_admin`
  - `GET /api/tl-evaluations?squad_id=&competencia=` — list confirmed evaluations; requires TL ownership or `is_admin`
  - `GET /api/tl-evaluations/{squad_id}/{competencia}/pdf` — generate/download the aggregated PDF; requires TL ownership or `is_admin`
- Frontend service `frontend/src/services/tl-evaluation.service.ts`
- TypeScript interfaces in `frontend/src/types/index.ts` — `Squad`, `SquadMember` (no `user_email`; `nome`/`papel`/`senioridade`/`fornecedor`), `TlEvaluation`, chat message/turn types
- Frontend route `/tl/squads` — squad selector, membership management (add/edit/deactivate), historical view, chat UI per member, PDF download (TL, behind ownership check)
- Frontend route `/admin/squads` — squad CRUD and TL assignment (TL picked from existing users via a selector, never typed), plus a read-only view of each squad's members for oversight; no create/edit/deactivate capability on this screen (admin only, behind `AdminRoute`)
- Environment variable `ANTHROPIC_API_KEY` — dedicated Workspace key under DB1's Anthropic organization; added to the `web/.env` pattern alongside `SECRET_KEY`/`ADMIN_EMAIL`

**Belongs to other domains (cross-domain, does not become a task here):**

- `team_members` table, `users` table, JWT creation/validation, `get_current_user()`, `is_admin` check → Authentication (`authentication/SKILL.md`) and Team & Billing (`team-billing/SKILL.md`)
- `client_evaluations` table and endpoints → Client Evaluation (`client-evaluation/SKILL.md`, once authored) — read only in a possible future comparative view (P2), not touched by this spec
- Business rules content itself (score scale, Gates A/B, tone) → owned by the Cowork skill `avaliacao-mensal-tl` until this spec's implementation supersedes it as the operational source; this spec's engine module encodes them, it does not redefine them

## User stories

1. As a **TL**, I want to report a professional's month in free text and be guided by clarifying questions when evidence is missing, so that I do not fill out a rigid form.
2. As a **TL**, I want the system to withhold a score of 5 until I confirm a recognized fact of overperformance beyond myself, so that the scale stays calibrated (Gate A).
3. As a **TL**, I want generic positive claims without a concrete example to be challenged before becoming final text, so that the evaluation avoids vagueness (Gate B).
4. As a **TL**, I want to review and confirm the score and paragraph per dimension before closing, and be able to adjust either.
5. As a **TL**, I want to generate the squad's PDF for the month, in the same layout I use today, so that I can send it to the PO without changing my delivery process.
6. As a **TL**, I want to see my squad's score history across months, to calibrate the current score against the prior pattern.
7. As an **admin**, I want to register squads and assign the responsible TL by picking them from existing GABI accounts, so that the access link exists before a TL configures and evaluates their own squad, without retyping a name or email that might not match an existing user.
8. As an **admin**, I want to view the members each TL has registered in any squad, so that I keep oversight of squad composition without managing it myself.
9. As a **TL**, I want to register and maintain my squad's members (name, role, seniority, supplier), so that the squad stays current without depending on the admin — most members are third-party professionals from other suppliers, with no GABI account.
10. As a **TL**, I want to access only the squads where I am responsible — not see or edit another TL's squad.

## Acceptance criteria

**Story 1/2/3 — Chat session and gates:**

- Given an authenticated TL who owns `squad_id`, when `POST /api/tl-evaluations/chat` is called with a free-text report and no prior AI turn, then the response is either an `ask_question` turn (if Gate A or Gate B conditions are unmet) or a `propose_evaluation` turn (if the report already contains sufficient evidence).
- Given a report converging toward a score of 5 in any dimension without a stated fact of overperformance recognized beyond the TL, then the response is always `ask_question` targeting that gap — never a direct `propose_evaluation` with a 5.
- Given a report containing a strong generic claim ("é muito bom tecnicamente") without a concrete example, then the response is always `ask_question` targeting that gap — never a direct `propose_evaluation` using the unqualified claim as-is.
- Given a `propose_evaluation` turn, every paragraph field contains no third-person narration markers ("TL", "relato", "reportou" used to describe the TL as a character) — the professional evaluated is always the grammatical subject.
- Given a TL who does not own `squad_id` and is not `is_admin`, when calling `POST /api/tl-evaluations/chat` for that squad, then the response is `403`.

**Story 4 — Confirmation:**

- Given a `propose_evaluation` turn, when the TL submits `POST /api/tl-evaluations` with the (possibly adjusted) score and paragraph per dimension, then a `tl_evaluations` row is created with `status = "confirmado"`.
- Given an existing confirmed row for the same (`squad_id`, `competencia`, `squad_member_id`), when a second confirmation is submitted, then the prior row is updated (upsert), not duplicated.

**Story 5 — PDF generation:**

- Given at least one confirmed evaluation for (`squad_id`, `competencia`), when `GET /api/tl-evaluations/{squad_id}/{competencia}/pdf`, then the response is a PDF aggregating every confirmed squad member of that squad/competência (by `squad_members.nome`), in the layout inherited from `generate_pdf.py`.
- Given no confirmed evaluation exists for (`squad_id`, `competencia`), then the response is `404` — no empty PDF is generated.
- **Superseded by "Monthly closure" in Risks:** the actual gating condition is a `squad_competencia_closures` row for (`squad_id`, `competencia`), not merely "at least one confirmed evaluation" — `GET .../pdf` returns `404` when no closure row exists, regardless of how many evaluations are confirmed. To be reflected directly in this story's AC in the plan phase.

**Story 6 — Historical view:**

- Given a TL who owns `squad_id`, when `GET /api/tl/squads/{squad_id}/historico`, then the response includes confirmed evaluations of prior competências, including members no longer active in the squad, without mixing them into the current competência's pending list.

**Story 7 — Squad registration and TL assignment (admin):**

- Given an authenticated admin, when `POST /api/admin/squads` with a unique `nome` and a `tech_lead_user_email` referencing an existing `team_members`/`users` row, then the squad is created.
- Given an authenticated admin, when `POST`/`PUT /api/admin/squads*` is submitted with a `tech_lead_user_email` that does **not** correspond to an existing `team_members`/`users` row, then the response is `422` — the API never creates a placeholder user from a typed name/email; the frontend selector only offers existing accounts, but the backend validates independently of the UI.
- Given an authenticated admin, when `PUT /api/admin/squads/{id}` reassigns `tech_lead_user_email` to a different existing user, then the previous TL immediately loses access to `squad_id`-scoped endpoints (Story 10), and the new TL immediately gains it — no additional record to update.
- Given a non-admin user, when calling any `/api/admin/squads*` endpoint, then the response is `403`.

**Story 8 — Admin read-only visibility of squad membership:**

- Given an authenticated admin, when `GET /api/admin/squads/{id}/members`, then the response lists every member (active and deactivated) of that squad, regardless of which TL registered them.
- Given an authenticated admin, there is no `POST`/`PATCH` counterpart under `/api/admin/squads/*/members` — attempting to write there returns `404` (route does not exist), keeping write exclusively on the TL-scoped routes (Story 9).
- Given a non-admin user, when calling `GET /api/admin/squads/{id}/members`, then the response is `403`.

**Story 9 — Squad membership management (TL):**

- Given a TL who owns `squad_id`, when `POST /api/tl/squads/{squad_id}/members` with `nome`, `papel`, `senioridade`, `fornecedor`, then the member is created as active, with no `user_email`/login required or accepted.
- Given a TL who owns `squad_id`, when `PATCH /api/tl/squads/{squad_id}/members/{member_id}` deactivates a member, then the member no longer appears in the current competência's pending evaluation list, but their historical `tl_evaluations` rows remain queryable via Story 6.
- Given an admin (`is_admin = true`) calling `POST/PATCH /api/tl/squads/{squad_id}/members*`, then the request is also accepted (admin retains override access to TL-scoped endpoints, per Story 10) — this is the same override pattern used for every other TL-scoped endpoint in this domain, distinct from the dedicated read-only Story 8 route.

**Story 10 — Access isolation:**

- Given a non-admin authenticated user who is not the `tech_lead` of `squad_id`, when calling any `/api/tl/squads/{squad_id}/*` or `/api/tl-evaluations*` endpoint scoped to that squad, then the response is `403`.
- Given an admin (`is_admin = true`), all squad-scoped endpoints are accessible regardless of `tech_lead_user_email`.

## Current → new behavior

**Current state:** The TL evaluation process runs entirely outside GABI, as a Claude Cowork skill (`avaliacao-mensal-tl`) installed individually on each TL's machine. Business rules (dimensions, score scale, Gates A/B, tone) live only in that skill's `SKILL.md`, not in this codebase. History is kept as local JSON files (`avaliacoes/<squad>/historico.json`) and PDFs are generated by a standalone Python script (`generate_pdf.py`) run outside the GABI stack. Rule updates require each TL to manually reinstall/update the skill.

**New behavior:** The `tl-evaluation` domain is introduced inside GABI. The chat-driven evaluation flow, the Gates A/B, the score scale, and the voice/tone rule are encoded once in `web/tl_evaluation_engine.py`, served to every TL through their existing GABI login — no per-TL install step. History moves from local JSON to the `tl_evaluations` table (scoped by the new `squads`/`squad_members` tables). PDF generation is ported into the GABI backend. The Claude API call is billed through a single dedicated Workspace/API key owned by DB1's Anthropic organization, not by individual TL subscriptions or another system's key.

**What stays the same:** All six existing domains and their tables, endpoints, and business rules remain unmodified. `team_members`/`users` is read only to validate `tech_lead_user_email` (the TL's own identity) — never for squad members, who have no relation to that table.

## Cross-domain dependencies

- **Authentication** — `get_current_user()` JWT dependency used in all endpoints; a new TL-ownership check (`squads.tech_lead_user_email == current_user.email` or `is_admin`) is added as domain-specific authorization logic within this unit, not a change to the Authentication domain itself.
- **Team & Billing** — `team_members`/`users` (read-only): validates that `tech_lead_user_email` corresponds to a registered team member. No dependency for squad members — they are not `team_members` rows.
- **Client Evaluation** — no dependency in this version; a future comparative view (P2) would read `client_evaluations` (read-only) without modifying that domain.

## Risks and observations

- **First LLM-backed domain in GABI.** Every existing domain (`gabi_engine.py`, `client_evaluation_engine.py`) is pure deterministic logic with no I/O. This domain's engine cannot follow that exact invariant — it depends on an external API call. The plan phase must define the isolation boundary precisely: the system prompt/tool schemas (static, testable data) stay separate from the actual network call, which should live in a thin client module (same spirit as `core/oracle.py`) so `web/tl_evaluation_engine.py` remains as testable as possible without hitting the network in unit tests.
- **Anthropic billing/ToS.** The dedicated Workspace/API key decision (vs. individual TL subscriptions, vs. reusing another internal system's key) is a product-level decision recorded in `docs/specs/avaliacao-tl-gabi.md`; this spec assumes it as given. Anthropic's OAuth-based subscription auth is documented as restricted to individual use in native apps — routing a shared backend's requests through individual Pro/Max credentials is out of ToS scope and was explicitly discarded.
- **Squad/TL role modeling is new.** `squads`, introduced here, also resolves a gap already flagged in `001-team-billing-client-evaluations/spec.md` ("Squad concept not yet in the data model" — dashboard filter by squad deferred there). Future specs needing squad data (e.g., the `client-evaluation` dashboard filter) can depend on `squads` instead of re-solving the gap. `squad_members`, by contrast, is specific to this domain and should not be assumed reusable elsewhere — see next point.
- **TL is a derived permission, not a stored role.** There is no `is_tl` column anywhere. "Being TL of squad X" is exactly "`squads.tech_lead_user_email == my email`" — checked at request time via `is_squad_tl()`, never cached or duplicated on the user record. This was a deliberate choice to avoid a second source of truth that could drift from the actual squad assignment (e.g., a user flagged TL but leading no squad, or vice versa).
- **Four options compared for this decision:** (A) derived from `squads.tech_lead_user_email` — adopted; (B) a stored global flag (`team_members.is_tl` or `users.is_tl`); (C) a hybrid — relation as source of truth, with a cached snapshot (e.g., led-squad list) embedded in the JWT at login, bounded by the existing 8h token expiry; (D) a stored flag **inside `team_members`**, with a form-level rule requiring a squad selection when the flag is set. B and D were rejected for the same core reason — a second source of truth with no database-level integrity guarantee, only form validation at write time, which does not prevent later drift (direct edit, migration, partial update). D has the additional problem of placing a `tl-evaluation` concept (who leads which squad) inside `team_members`, a table owned by the Team & Billing domain — crossing the domain-boundary invariant this project's own `spec-authoring` skill is designed to prevent. C was rejected as solving a performance concern not present at GABI's current scale (a handful of squads), trading it for unnecessary cache-staleness complexity.
- **Squad ↔ TL cardinality is 1:1**, confirmed in this round: one squad has exactly one TL, and one TL leads at most one squad at a time. `squads.tech_lead_user_email` is therefore declared `UNIQUE` (not just `NOT NULL`) — the database itself prevents assigning the same person as TL of two squads, independent of any application-level check.
- **TL assignment surface stays on `/admin/squads`, not on the team member ("cadastro de equipe") screen.** Considered and rejected: exposing TL assignment as a field on the team member edit form (writing through to `squads.tech_lead_user_email` under the hood, to avoid a second source of truth). Rejected because a squad-membership management screen must exist regardless (Story 9, TL-owned), so there is no UX economy gained from a second entry point — it would only add a second surface writing to the same column.
- **`squad_members` holds no account/login.** Unlike every other person-shaped entity in GABI (`team_members`, `users`), `squad_members` rows are free-text (`nome`, `papel`, `senioridade`, `fornecedor`) describing a third-party professional who never authenticates into GABI. This means: no `403`/ownership check ever applies to a squad member as a principal (they have no session); all access control in this domain is expressed purely in terms of the TL/admin acting on the record, never the evaluated person acting on their own data. `papel` and `senioridade` are squad-scoped attributes maintained by the TL, deliberately independent of `team_members.profile` (which serves DB1's own billing-rate lookup and does not apply to third-party suppliers).
- **Terminology correction owed to prior docs.** `001/spec.md` and `docs/specs/avaliacao-cliente-mag.md` both use "autoavaliação do TL" to describe this domain's precursor. This spec is the recorded decision that the correct framing is "the TL evaluates the squad" — a small documentation fix to both files is a natural follow-up, not a task of this unit.
- **Chat statelessness.** Conversation-in-progress messages are not persisted server-side in v1 — the full message history travels with each request until confirmation. This is simple and sufficient for a single-session flow, but means an abandoned mid-conversation session leaves no server-side trace to resume from; acceptable for v1, flagged here in case usage patterns later require resumable sessions.
- **Monthly closure — decided during prototyping, resolves the earlier open question.** Story 4's AC persisted confirmation per `squad_member`; Story 5's AC gated PDF generation on "at least one confirmed evaluation for (`squad_id`, `competencia`)" — neither represented "the TL has finished the whole squad for the month". Resolved as: a new entity `squad_competencia_closures` (`squad_id`, `competencia`, `closed_at`, `closed_by`) — an explicit TL action, decoupled from whether every `squad_member` was actually evaluated. `GET .../pdf` requires this row to exist (`404` otherwise), not just "any confirmed row exists". Closing follows the same UX already shipped for the analogous problem in Aprovações/billing (`AprovacoesSection.tsx`'s `ExportSection`): if every active `squad_member` is confirmed, closing is a single direct action; if some are still unconfirmed, the TL sees a confirmation step ("N profissionais ainda não confirmados — o PDF incluirá somente os M confirmados") before an explicit "Encerrar assim mesmo", mirroring "Gerar assim mesmo" in billing. This lets a TL close a month with someone deliberately skipped (e.g. offboarded mid-competência) without a hard block, while still defaulting to requiring full completion. Reopening a confirmed evaluation (Story 4) after closure implicitly reopens the closure row (deletes it) — a closed competência can never have an unconfirmed member by construction. Story 4/5's AC and the data model section should be updated in the plan phase to reference `squad_competencia_closures` explicitly.
- **Cost.** Negligible at current Sonnet pricing for the described volume (a handful of evaluations per squad per month); not a factor in this spec's decisions, but worth revisiting if the number of squads using this flow grows substantially.
