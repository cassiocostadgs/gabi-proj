---
name: tl-evaluation
description: >
  Domain skill for the tl-evaluation bounded context in GABI — AI-assisted monthly squad evaluation chat (Gate A: score-5 evidence, Gate B: concrete examples), score 1–5, dimensions Comportamental, Técnica, Prazos de Entrega, stateless Claude Messages API integration, squad and member management, TL-ownership check, monthly closure, and PDF generation.
metadata:
  type: domain
  domain: tl-evaluation
  status: current
---

# TL Evaluation Domain Skill

> **Maintaining this skill**
>
> Update it whenever the behavior of this domain changes purpose, keeping the skill
> faithful to the implemented behavior. A divergence between skill and code with no
> recorded decision is escalated to the human, not resolved on your own.

## Domain overview

The `tl-evaluation` domain is the seventh bounded context in GABI. A Tech Lead (TL) narrates each squad member's month in free text through an interactive chat interface; the engine (backed by the Claude Messages API with tool use) probes for missing evidence (Gate B) or external confirmation of superperformance (Gate A) until it proposes calibrated scores and a written paragraph per dimension (Comportamental, Técnica, Prazos de Entrega). Confirmed evaluations are persisted and exported as a squad PDF. Admins register squads and assign TLs; TLs own squad membership management.

This is the **first LLM-backed domain in GABI** — every other domain's engine is pure deterministic logic. The Anthropic API call must be isolated in `web/core/anthropic_client.py`; the engine module (`web/tl_evaluation_engine.py`) must remain pure (no I/O), matching the existing pattern of `gabi_engine.py`.

**This domain is read-only toward Team & Billing.** It queries `team_members`/`users` only to validate `tech_lead_user_email`, never to manage squad members (who have no GABI account).

---

## Business rules

### Evaluation dimensions

Every evaluation covers exactly three dimensions, always in this order:

| Dimension | Key | Score range |
|---|---|---|
| Comportamental | `comportamental` | 1–5 |
| Técnica | `tecnica` | 1–5 |
| Prazos de Entrega | `prazo` | 1–5 |

Score reference scale (calibration guidance encoded in the system prompt, in the
hardcoded, non-editable *Escala de referência* block alongside the range itself —
ported from the original Cowork skill):
- **1–2** — Insatisfatório
- **3** — Regular
- **4** — Bom
- **5** — Excelente

Per-range guiding questions (also in the same hardcoded block): nota 5 asks
whether something recognized beyond the TL happened; nota 4 asks whether
expectations were met without relevant caveats; nota 3 asks whether performance
was unstable across the month; nota 1–2 asks whether performance stayed clearly
below standard for most of the month. A 4-vs-5 or 2-vs-3 tie-break question is
also encoded ("was there something recognized and confirmed beyond what was
expected?" / "was there any period meeting the standard?").

### Gate A — Score-5 evidence requirement

Whenever an evaluation is converging toward a score of 5 in any dimension, the engine **must** issue an `ask_question` turn requesting a concrete fact of overperformance recognized by someone beyond the TL themselves (e.g., PO, another team, client). Without that externally recognized fact, the maximum proposable score is 4. A `propose_evaluation` turn with `nota = 5` in any dimension is only valid when the preceding conversation contains such a fact. The gate is asked **at most once per dimension**: a positive answer supplies the fact for nota 5, a negative (or non-)answer resolves the gate at nota 4 immediately — the same Gate A question must never repeat for the same dimension, which is what makes an uncapped gate (see "Maximum clarifying question rounds" below) safe from looping.

### Gate B — Concrete example requirement

Any generic positive claim without a concrete example ("é muito bom tecnicamente", "entrega sempre no prazo") **must** trigger an `ask_question` turn before the engine may issue a `propose_evaluation` turn. A `propose_evaluation` turn may only use evidence explicitly provided by the TL. The gate is asked **at most once per claim**: if the answer supplies the example, it is used; otherwise the generic claim is dropped and scoring falls back to whatever else is concrete — the same Gate B question must never repeat for the same claim.

### Generation rules (non-negotiable, encoded in the system prompt)

- No invented examples — the engine never includes a fact not provided by the TL.
- Recycling with perspective: the same fact may appear in two dimensions only if each paragraph explores a distinct angle (Comportamental: the behavior itself; Técnica: quality of what was delivered; Prazo: impact on sprint predictability). Identical-sounding paragraphs across dimensions signal recycling and must be rewritten with the correct angle.
- Paragraph openings must be concrete and specific (never a generic reusable phrase).
- Temporal scope: describe what happened this month — never next month's expectations.
- No superlative without supporting evidence.
- Genericidade test: if a paragraph could describe any person in any month, it is too generic and must be rewritten.
- Neutral tone: negative points describe the behavior and its impact without unsupported intensity adverbs ("claramente", "sistematicamente") unless the TL explicitly reported recurrence.
- Behavior over character judgment: describe the observable action and its impact, never a personality label about the person — in either direction ("é desorganizado" / "é muito proativo") without the underlying behavior. If a paragraph reduces to a personality adjective without losing information, rewrite it around the behavior that produced that impression.
- Reduced observation window: when a member was absent for part of the month, the paragraph signals this with an asterisk and limits statements to the observed period.

### Voice and tone rule

Every paragraph in a `propose_evaluation` turn must be written in the TL's voice, with the **evaluated professional as the grammatical subject**. The following third-person narration markers are **forbidden** in any paragraph field: "TL", "relato", "reportou" (used to describe the TL as a character), and any equivalent construction that narrates the TL rather than the member's actions. This rule was the original trigger for introducing this domain.

### Maximum clarifying question rounds

The engine targets at most 2 clarifying question rounds per evaluation session for open-ended lacuna clarification (inherited from the Cowork skill). This cap does **not** apply to Gate A, Gate B, or the role-responsibility gate: those are mandatory and must trigger an `ask_question` turn whenever their condition is unmet, regardless of how many lacuna rounds have already been used — mirroring the original skill's sequential separation between lacuna complementation (capped) and gate checking (uncapped). After lacunas are addressed and every applicable gate is satisfied, the engine converges to a `propose_evaluation` turn.

Every uncapped gate — including the role-responsibility gate (`_build_role_section`) — is asked **at most once per occurrence** (once per dimension for Gate A, once per claim for Gate B, once per missing principal responsibility for the role gate): whatever answer comes back, the gate resolves immediately (use the evidence, or fall back/proceed without it) and the same question is never repeated. This is what makes an uncapped gate safe from looping — the cap that would otherwise backstop it was deliberately removed from the "Fluxo de trabalho" section.

The system prompt also carries a lightweight internal-reasoning step (not shown to the TL): before every tool call, the model checks per-dimension evidence, pending gates, and how many lacuna rounds have already been used in the message history — and a fully worked example (fictional TL narrative → `ask_question` → answer → `propose_evaluation` paragraph) demonstrating Gate B, the character-label rule, and the voice rule together. Both live in existing admin-editable sections (`fluxo` and `instrucao` respectively) rather than new section keys, to avoid a database migration for a new `tl_evaluation_prompt_sections` row.

---

## Chat flow and tool schemas

### Stateless message-passing contract

`POST /api/tl-evaluations/chat` is fully **stateless**: the client sends the complete message history on every HTTP turn. The server reconstructs context from the `messages[]` array and returns the next turn. No conversation state is persisted server-side before a TL confirms an evaluation.

Request body:

```json
{
  "squad_id": 1,
  "competencia": "YYYY-MM",
  "squad_member_id": 42,
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

### Tool schemas

The engine passes exactly two tool schemas to the Claude Messages API. The API is constrained to respond using one of these tools — no free-text response is accepted.

**`ask_question`** — issued when Gate A or Gate B conditions are unmet:

```json
{
  "name": "ask_question",
  "description": "Ask the TL a targeted clarifying question to gather missing evidence (Gate A or Gate B).",
  "input_schema": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "Single targeted clarifying question."
      }
    },
    "required": ["question"]
  }
}
```

**`propose_evaluation`** — issued when sufficient evidence exists for all three dimensions:

```json
{
  "name": "propose_evaluation",
  "description": "Propose a calibrated score (1–5) and paragraph for each evaluation dimension.",
  "input_schema": {
    "type": "object",
    "properties": {
      "comportamental_nota":    { "type": "integer", "minimum": 1, "maximum": 5 },
      "comportamental_paragrafo": { "type": "string" },
      "tecnica_nota":           { "type": "integer", "minimum": 1, "maximum": 5 },
      "tecnica_paragrafo":      { "type": "string" },
      "prazo_nota":             { "type": "integer", "minimum": 1, "maximum": 5 },
      "prazo_paragrafo":        { "type": "string" },
      "janela_reduzida":        { "type": "boolean" }
    },
    "required": [
      "comportamental_nota", "comportamental_paragrafo",
      "tecnica_nota",        "tecnica_paragrafo",
      "prazo_nota",          "prazo_paragrafo",
      "janela_reduzida"
    ]
  }
}
```

---

## Data model

### Table: `squads`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `nome` | TEXT | NOT NULL UNIQUE | Squad display name |
| `tech_lead_user_email` | TEXT | NOT NULL UNIQUE | Logical FK → `team_members.user_email`; UNIQUE enforces the 1:1 TL/squad cardinality at the database level |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT `datetime('now')` | |

### Table: `squad_members`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `squad_id` | INTEGER | NOT NULL FK → `squads.id` | |
| `nome` | TEXT | NOT NULL | Free-text name; no GABI account required |
| `papel` | TEXT | NOT NULL | e.g. "Dev", "QA", "PO" — squad-scoped attribute, not billing profile |
| `senioridade` | TEXT | NOT NULL | e.g. "Júnior", "Pleno", "Sênior" |
| `fornecedor` | TEXT | NOT NULL | e.g. "DB1 Global Software" or any third-party supplier |
| `ativo` | INTEGER | NOT NULL DEFAULT 1 | 1 = active, 0 = deactivated |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT `datetime('now')` | |
| `removed_at` | TIMESTAMP | NULL | Set when deactivated; historical `tl_evaluations` rows are never deleted |

`squad_members` has **no** `user_email` column and **no** FK to `team_members` or `users`. The evaluated person never authenticates into GABI.

### Table: `tl_evaluations`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `squad_id` | INTEGER | NOT NULL FK → `squads.id` | |
| `squad_member_id` | INTEGER | NOT NULL FK → `squad_members.id` | |
| `competencia` | TEXT | NOT NULL | `"YYYY-MM"` format |
| `comportamental_nota` | INTEGER | NULL | Score 1–5 |
| `comportamental_paragrafo` | TEXT | NULL | Written paragraph for this dimension |
| `tecnica_nota` | INTEGER | NULL | Score 1–5 |
| `tecnica_paragrafo` | TEXT | NULL | |
| `prazo_nota` | INTEGER | NULL | Score 1–5 |
| `prazo_paragrafo` | TEXT | NULL | |
| `janela_reduzida` | INTEGER | NOT NULL DEFAULT 0 | 1 when the member was absent for part of the month |
| `status` | TEXT | NOT NULL DEFAULT `'rascunho'` | `'rascunho'` or `'confirmado'` |
| `confirmed_by` | TEXT | NULL | Email of the TL who confirmed |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT `datetime('now')` | |
| `confirmed_at` | TIMESTAMP | NULL | Set on confirmation |

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_tl_eval_member_competencia
  ON tl_evaluations (squad_id, competencia, squad_member_id);
```

### Table: `squad_competencia_closures`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `squad_id` | INTEGER | NOT NULL FK → `squads.id` | |
| `competencia` | TEXT | NOT NULL | `"YYYY-MM"` format |
| `closed_at` | TIMESTAMP | NOT NULL DEFAULT `datetime('now')` | |
| `closed_by` | TEXT | NOT NULL | Email of the TL who closed |

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_sqc_closure
  ON squad_competencia_closures (squad_id, competencia);
```

---

## REST endpoint contracts

All admin endpoints require `is_admin = true`. Non-admin requests return `403`. Unauthenticated requests return `401`. TL-scoped endpoints require TL ownership of `squad_id` (`is_squad_tl()` returns `true`) **or** `is_admin = true` — unless explicitly noted.

### Admin squad endpoints

#### `POST /api/admin/squads`

**Auth**: admin JWT
**Request body**: `{ "nome": "...", "tech_lead_user_email": "..." }`

| Response | Condition |
|---|---|
| `201` with created squad | Valid `nome` and `tech_lead_user_email` referencing an existing `team_members`/`users` row |
| `422` | `tech_lead_user_email` does not correspond to an existing user |
| `403` | Non-admin user |

#### `GET /api/admin/squads`

**Auth**: admin JWT
**Response**: `200` list of all squads

#### `PUT /api/admin/squads/{id}`

**Auth**: admin JWT
**Request body**: any subset of `{ "nome": "...", "tech_lead_user_email": "..." }`

| Response | Condition |
|---|---|
| `200` | Updated squad |
| `422` | `tech_lead_user_email` does not correspond to an existing user |
| `404` | Squad not found |
| `403` | Non-admin user |

When `tech_lead_user_email` changes: the previous TL immediately loses access to all TL-scoped endpoints for that squad (no additional record to update — `is_squad_tl()` is computed at request time).

#### `GET /api/admin/squads/{id}/members`

**Auth**: admin JWT
**Response**: `200` list of all members (active **and** deactivated) of the squad; `403` for non-admin; `404` if squad not found

There is **no** `POST`/`PATCH` under `/api/admin/squads/*/members` — attempting those methods returns `404` (route does not exist). Write operations on membership are exclusively TL-scoped.

### TL squad endpoints

#### `GET /api/tl/squads`

**Auth**: user JWT (any authenticated user)
**Response**: `200` list of squads where `tech_lead_user_email == current_user.email`; returns `[]` if the user is TL of no squad

#### `POST /api/tl/squads/{squad_id}/members`

**Auth**: TL ownership or admin
**Request body**: `{ "nome": "...", "papel": "...", "senioridade": "...", "fornecedor": "..." }` — no `user_email` accepted or stored

| Response | Condition |
|---|---|
| `201` with created member | Valid body, caller is TL/admin |
| `403` | Caller is neither TL of `squad_id` nor admin |

#### `GET /api/tl/squads/{squad_id}/members`

**Auth**: TL ownership or admin
**Response**: `200` list of **active** members; `403` when not TL/admin

#### `PATCH /api/tl/squads/{squad_id}/members/{member_id}`

**Auth**: TL ownership or admin
**Request body**: any subset of `{ "nome", "papel", "senioridade", "fornecedor", "ativo" }` — toggle `ativo` to `false` to deactivate

Deactivated members no longer appear in `GET /api/tl/squads/{squad_id}/members` but their `tl_evaluations` rows remain queryable via the historico endpoint.

| Response | Condition |
|---|---|
| `200` | Updated |
| `403` | Not TL/admin |
| `404` | Member not found |

#### `GET /api/tl/squads/{squad_id}/historico`

**Auth**: TL ownership or admin
**Response**: `200` confirmed evaluations for all **prior** competências (not the current month), including members no longer active; `403` when not TL/admin

### Evaluation endpoints

#### `POST /api/tl-evaluations/chat`

**Auth**: TL ownership or admin
**Request body**: `{ "squad_id": int, "competencia": "YYYY-MM", "squad_member_id": int, "messages": [...] }`
**Response**: the next structured AI turn — one of:
- `{ "type": "ask_question", "question": "..." }`
- `{ "type": "propose_evaluation", "comportamental_nota": int, "comportamental_paragrafo": "...", "tecnica_nota": int, "tecnica_paragrafo": "...", "prazo_nota": int, "prazo_paragrafo": "...", "janela_reduzida": bool }`

| Response | Condition |
|---|---|
| `200` | Valid request |
| `403` | Not TL/admin |

The endpoint calls `tl_evaluation_engine.build_chat_request()` to assemble the request body and `anthropic_client.complete()` to execute the API call — never directly in the router.

#### `POST /api/tl-evaluations`

**Auth**: TL ownership or admin
**Request body**: `{ "squad_id": int, "competencia": "YYYY-MM", "squad_member_id": int, "comportamental_nota": int, "comportamental_paragrafo": "...", "tecnica_nota": int, "tecnica_paragrafo": "...", "prazo_nota": int, "prazo_paragrafo": "...", "janela_reduzida": bool }`

Behavior: **upsert** — creates or updates the `tl_evaluations` row for `(squad_id, competencia, squad_member_id)`; sets `status = "confirmado"`, `confirmed_by`, `confirmed_at`. If a `squad_competencia_closures` row exists for the same `(squad_id, competencia)`, it is **deleted** (the competência is reopened) before persisting the evaluation.

| Response | Condition |
|---|---|
| `201` | Created or updated |
| `403` | Not TL/admin |

#### `GET /api/tl-evaluations`

**Auth**: TL ownership or admin
**Query params**: `squad_id` (required), `competencia` (required)
**Response**: `200` list of confirmed evaluations for the given squad/competência; `403` when not TL/admin

#### `POST /api/tl-evaluations/{squad_id}/{competencia}/close`

**Auth**: TL ownership or admin
**Response**: `201` with the created `squad_competencia_closures` row; `403` when not TL/admin

A closed competência cannot receive new confirmations without first being reopened (any `POST /api/tl-evaluations` on a closed competência implicitly reopens it by deleting the closure row).

#### `GET /api/tl-evaluations/{squad_id}/{competencia}/pdf`

**Auth**: TL ownership or admin

| Response | Condition |
|---|---|
| `200` | PDF bytes (`Content-Type: application/pdf`); a `squad_competencia_closures` row exists for `(squad_id, competencia)` |
| `404` | No closure row exists, regardless of how many evaluations are confirmed |
| `403` | Not TL/admin |

---

## TL-ownership check pattern

```python
# web/repositories/squad_repository.py
def is_squad_tl(user_email: str, squad_id: int) -> bool:
    """Returns True iff the squad's tech_lead_user_email matches user_email."""
    with _db() as conn:
        row = conn.execute(
            "SELECT 1 FROM squads WHERE id = ? AND tech_lead_user_email = ?",
            (squad_id, user_email),
        ).fetchone()
    return row is not None
```

This function is **the sole authorization check** for TL-scoped access — never check a stored flag or JWT claim. It is computed at request time on every call; a TL reassignment is effective immediately with no cache to invalidate.

Endpoint guard pattern (applied in every TL-scoped endpoint):

```python
if not (current_user.is_admin or squad_repository.is_squad_tl(current_user.email, squad_id)):
    raise HTTPException(status_code=403)
```

---

## Monthly closure flow

The closure entity (`squad_competencia_closures`) represents an **explicit TL action** — it is not derived automatically from evaluation confirmations. A competência can be closed with some members still unconfirmed (the TL chooses to skip them).

**UX decision (mirrors `AprovacoesSection.tsx` / billing `ExportSection`):**
- If all active `squad_members` for the squad have a confirmed `tl_evaluations` row for the competência → "Encerrar Competência" is a single direct action (no confirmation step).
- If some active members are still unconfirmed → the TL sees a warning step: "N profissional(is) ainda não confirmado(s) — o PDF incluirá somente os M confirmados", with "Encerrar assim mesmo" and "Cancelar".

**Reopening:** any `POST /api/tl-evaluations` (re-confirmation of an already-confirmed evaluation) on a closed competência deletes the `squad_competencia_closures` row, implicitly reopening the competência. The TL must close again to re-enable PDF generation.

---

## PDF aggregation logic

`web/tl_evaluation_pdf.py` — ported from the Cowork skill's `generate_pdf.py` (WeasyPrint-based).
Full parity with the original skill: three sections per squad PDF.

```python
def generate_squad_pdf(
    squad_name: str,
    competencia: str,
    evaluations: list[dict],
    *,
    tech_lead_nome: str,
    historico: list[dict] = (),
) -> bytes:
    """
    Returns the PDF as bytes for HTTP streaming.
    evaluations: list of confirmed tl_evaluations rows for (squad_id, competencia),
                 each containing nome/senioridade (from squad_members),
                 papel_nome (from tl_evaluation_roles), comportamental_nota,
                 comportamental_paragrafo, tecnica_nota, tecnica_paragrafo,
                 prazo_nota, prazo_paragrafo, janela_reduzida.
    tech_lead_nome: display name for the squad's tech_lead_user_email, resolved by the
                    caller (team_members.nome_completo, falling back to the raw email).
    historico: confirmed evaluations for prior competências (tl_evaluation_repository.
               get_historico), used to render each member's "Evolução histórica" chart.
    """
```

The `evaluations` list is provided by `tl_evaluation_repository.list_evaluations(squad_id, competencia)`
(joined with `tl_evaluation_roles` for `papel_nome`). The professional identifier in the PDF
is `squad_members.nome` — never a `user_email` or any other GABI account field.

Document structure:
1. **Referência** — static methodology section (dimensions explained + 1–5 score-scale table).
2. **Avaliações individuais** — one card per member: cargo subtitle ("papel · senioridade"),
   current-month notas/paragraphs, and an inline-SVG "Evolução histórica" sparkline (last 6
   competências, current month merged in) when ≥2 historical data points exist.
3. **Panorama da squad** — matrix of members × dimensions with a color legend, plus a
   "Distribuição por dimensão" stacked bar per dimension.

WeasyPrint is auto-installed at runtime following the same pattern already used by the Cowork skill's `generate_pdf.py` — it is not added to `requirements.txt` as a static dependency if that pattern is not already established in the project.

---

## Prompt ownership and admin editing

Full design rationale in [`.agents/specs/003-tl-evaluation-prompt-admin/spec.md`](../../specs/003-tl-evaluation-prompt-admin/spec.md). Summary of the shipped behavior:

The admin is the declared **owner** of the AI evaluation prompt. Every part of it is visible to the admin (nothing is opaque source code they can't see), and most of it is editable **without a deploy** — but not uniformly, and not via free text everywhere. The system prompt is composed at request time from:

1. **Six admin-editable sections** (`tl_evaluation_engine.EDITABLE_SECTION_KEYS`: `papel`, `fluxo`, `gateA`, `gateB`, `regras`, `instrucao`) plus a seventh, `adicionais` (an open-ended addendum appended last, empty by default) — stored as rows in `tl_evaluation_prompt_sections`, one row per key. `gateA`, `gateB`, and `regras` are additionally **versioned**: every overwrite snapshots the previous value to `tl_evaluation_prompt_section_history` before saving, because they encode calibration policy with **no code-side enforcement** — a weakened edit degrades scoring silently, and this policy attaches to real people's monthly records, so admins need to reconstruct what a rule said at any past date.
2. **The *Escala de referência* block** — hardcoded, never editable, exposed read-only via `tl_evaluation_engine.escala_reference_text()`. The 1–5 range is coupled to the `propose_evaluation` tool schema's `minimum`/`maximum` and to `tl_evaluations`' `INTEGER` columns; changing it is a structural change (effectively a new scoring model), not a content edit.
3. **The *Regra de voz* forbidden-words list** — **not free text**. `tl_evaluation_voice_forbidden_words` is a structured list (seeded with `"TL"`, `"relato"`, `"reportou"`) that is the single source read both by the rendered prompt text (`_render_voz_body()`) and by `_check_voice_rule()`'s post-hoc validation. This is deliberately different from the other sections: the prose is the literal human-readable form of a value also enforced in code, so letting it drift into independent free text risks the prompt telling the model one thing while the validator enforces another. Admins add/remove individual words (min. 3 characters, no duplicates) instead of editing prose.

**Voice-rule self-correction retry (`tl_chat()` in `web/main.py`):** the voice rule is probabilistic on the model's side — even with the forbidden words spelled out in the prompt, `propose_evaluation` can still narrate "TL" (e.g. because the system prompt itself refers to the evaluator as "Tech Lead (TL)"). A bare `ValueError` on the first attempt used to surface as an immediate `502` with no recovery path, dead-ending the TL's in-progress chat (production incident, 2026-08-06). `tl_chat()` now peeks at the raw response with `check_response_voice_violation()` (no I/O, no raise) before parsing; on a violation it builds one corrective follow-up via `build_voice_retry_request()` — the model's own `tool_use` turn plus a `tool_result` naming exactly which field/marker to fix — and calls `anthropic_client.complete()` a second time. Only if that corrected attempt *also* violates the rule does `parse_tool_response()` raise and the endpoint return `502`, capping the retry at one extra API call (no loop). This is a `tl_chat()`-endpoint concern, not a pure-engine one — `tl_evaluation_engine.py` only exposes the peek/build primitives; the retry call itself is I/O and stays in `main.py`. Belt-and-suspenders on the frontend: `AvaliacaoTab.handleRetry()` / the drawer's "Tentar novamente" button resend the same message history on a residual failure, so the TL is never forced to retype what they already reported.

`tl_evaluation_engine.py` stays pure per the module's own invariant (no I/O) — `build_system_prompt(sections, forbidden_words)`, `build_chat_request(..., sections=, forbidden_words=)`, and `_check_voice_rule(evaluation, forbidden_words)` all take this data as plain arguments (defaulting to today's shipped values when omitted, e.g. in unit tests) rather than reading the database themselves. The DB reads live in `tl_evaluation_prompt_repository.py`, called once per chat turn from `tl_chat()` and once per preview from `admin_preview_prompt()` — both resolve the same `sections`/`forbidden_words` shape before calling into the engine.

**Fidelity guarantee:** `_DEFAULT_SECTIONS` (the seed values written to the DB on first run) are *derived by slicing* the module's own literal `_SYSTEM_PROMPT` / `_FORBIDDEN_VOICE_MARKERS` constants at import time — never hand-retyped. `build_system_prompt()` called with no arguments must remain byte-identical to `_SYSTEM_PROMPT` (see `TestDefaultsReproduceLegacyPromptExactly` in `tests/test_tl_evaluation_engine.py`); if a future edit to this module breaks that equality, it means the split/rejoin logic diverged from the literal prompt, not that the literal prompt itself needs re-typing anywhere.

**No TL-facing surface exists for any of this** — no route, no UI element. The TL only experiences the prompt's *effect* (different probing questions, different tone), never its configuration. "Número máximo de rodadas de pergunta" (fixed at 2, embedded in the `fluxo` section's prose) was explicitly evaluated and **not** promoted to a separate numeric setting in this round.

Admin endpoints (all `AdminUser`-guarded, no TL-ownership check needed since none of this is squad-scoped):

| Endpoint | Behavior |
|---|---|
| `GET /api/admin/tl-evaluation-prompt` | All sections (content + `updated_by`/`updated_at`), `escala_referencia`, `forbidden_words`, `model`, `max_tokens`. |
| `PUT /api/admin/tl-evaluation-prompt/sections/{section_key}` | Updates one section; `404` for `escala`, `voz`, or any unrecognized key. |
| `GET /api/admin/tl-evaluation-prompt/sections/{section_key}/history` | Oldest-first list of prior values (accepts `voz` too — full word-list snapshots, not diffs). |
| `POST /api/admin/tl-evaluation-prompt/voice-words` | Adds a forbidden word; `422` on duplicate or <3 characters. |
| `DELETE /api/admin/tl-evaluation-prompt/voice-words/{palavra}` | Removes a forbidden word. |
| `GET /api/admin/tl-evaluation-prompt/preview?squad_id=&squad_member_id=&competencia=` | Returns the exact `system` string a real chat turn for that evaluation would send — reuses the same role/context resolution as `tl_chat()` via `_resolve_role_and_context()`. **Never calls the Anthropic API.** |

---

## Module layout

| File | Role |
|---|---|
| `web/tl_evaluation_engine.py` | Pure engine — `build_system_prompt(sections=, forbidden_words=)`, `get_tools()`, `build_chat_request(messages, ..., sections=, forbidden_words=)`, `escala_reference_text()`, `model_config()`, `default_sections()`, `default_forbidden_words()` |
| `web/core/anthropic_client.py` | Thin LLM client — `complete(request: dict) -> dict`; reads `ANTHROPIC_API_KEY` |
| `web/repositories/squad_repository.py` | Squad and member CRUD; `is_squad_tl()` |
| `web/repositories/tl_evaluation_repository.py` | Evaluation persistence and history queries; closure management |
| `web/repositories/tl_evaluation_prompt_repository.py` | Admin-editable prompt sections, section history, and the forbidden-voice-words list; `seed_defaults(conn)` called once from `_init_db()` |
| `web/tl_evaluation_pdf.py` | PDF generation (WeasyPrint) |
| `tests/test_tl_evaluation_engine.py` | Unit tests for the pure engine (no network calls), including the byte-identical defaults guarantee |
| `tests/test_tl_squads.py` | Integration tests for squad/member/evaluation endpoints (FastAPI TestClient, isolated PostgreSQL schema per test) |
| `tests/test_tl_evaluation_prompt_admin.py` | Integration tests for all prompt-admin endpoints |
| `frontend/src/services/tl-evaluation.service.ts` | All API access functions for this domain, including the prompt-admin endpoints |
| `frontend/src/pages/admin/sections/SquadsSection.tsx` | Admin squad CRUD + TL assignment + read-only member view |
| `frontend/src/pages/admin/sections/TlEvaluationPromptSection.tsx` | Admin-only prompt visibility/editing screen: núcleo estrutural, instruções adicionais, simulador |
| `frontend/src/pages/tl/TlSquadsPage.tsx` | TL-scoped page: membership, historico, chat, closure, PDF |

---

## Cross-domain dependencies

- **Authentication** (`get_current_user()`, `is_admin`): used in all endpoint guards. TL-ownership check (`is_squad_tl()`) is domain-specific authorization logic within this unit, not a change to the Authentication domain.
- **Team & Billing** (`team_members`/`users`): queried read-only to validate `tech_lead_user_email` on squad create/update (`422` if the email does not match an existing user row). No dependency for squad members.
- **Client Evaluation**: no dependency in v1; a future comparative view (P2) would read `client_evaluations` read-only without modifying that domain.

No existing domain table or function is modified by this domain.
