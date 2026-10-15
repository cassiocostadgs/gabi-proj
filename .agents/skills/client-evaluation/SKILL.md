---
name: client-evaluation
description: Domain skill for the client-evaluation bounded context in GABI — MAG evaluation email ingest (manual paste and automated n8n), admin review lifecycle (rascunho → aprovado | rejeitado), professional self-service history, and admin dashboard with time-series scores.
metadata:
  type: domain
  domain: client-evaluation
  status: current
---

# Client Evaluation Domain Skill

## Bounded context

The `client-evaluation` domain is the sixth bounded context in GABI (alongside Authentication, Task Data Access, GA Validation, Submission Workflow, and Team & Billing). It ingests monthly MAG client evaluation emails, extracts scores deterministically, requires mandatory admin review before publication, and exposes approved evaluations to professionals and admins.

**This domain is read-only toward Team & Billing.** It consumes `team_members` for name-linking but never modifies that table.

---

## Business rules

### Supplier validation

Every email body must contain `Fornecedor: DB1 Global Software` (exact match, case-sensitive). Any other value — including a misspelling, a different company name, or an absent label — causes an explicit `ValueError` from the parser. No record is created.

### Parser determinism

The parser (`web/client_evaluation_engine.py`, function `parse_evaluation`) **never infers or defaults** missing data. Any missing required field, any score outside `[1, 5]`, or any Fornecedor mismatch raises `ValueError` with a descriptive message.

Required fields: `Competência`, `Colaborador`, `Fornecedor`, `Avaliação Comportamental`, `Avaliação Técnica`, `Avaliação Prazos de entrega`.

Scores must be integers; a float string such as `"4.0"` or a text value such as `"four"` raises `ValueError`.

`competencia` extracted from `Competência: MM / YYYY` is always normalized to the `"YYYY-MM"` string format.

### Comment patterns (mutually exclusive)

| Pattern | Detection | Storage |
|---|---|---|
| Per-dimension | `Feedback:` label absent from the body | Each dimension comment stored in its own `*_comentario` column; `comentario_geral = NULL` |
| Single Feedback block | `Feedback:` label present anywhere in the body | `comentario_geral` populated; all three `*_comentario` columns = `NULL` |

Both patterns are handled transparently by the parser. If neither applies (no comments at all), all comment columns remain `NULL`.

### Status lifecycle

```
rascunho ──► aprovado    (POST /approve; requires user_email != null)
         ──► rejeitado   (POST /reject)
```

- `rascunho` — editable; visible to admins only.
- `aprovado` — **immutable in v1**; visible to the professional (`GET /api/my-evaluations`) and in the admin dashboard.
- `rejeitado` — immutable; never visible to the professional or the dashboard.

Approved records cannot be patched: `PATCH` on an `aprovado` record returns `409`.

### Approval pre-condition

`POST /approve` requires `user_email != null`. If `user_email` is `null` (unlinked professional), the endpoint returns `422`. The admin must resolve the professional link via `PATCH /{id}` first.

### Deduplication (applied in-order before any INSERT)

1. **By `email_message_id`** (automated path only, when `internetMessageId` is present): if a record with the same `email_message_id` already exists → return `200 {ok: true, skipped: true}`. No record created. No error. This check happens **before** parsing.

2. **By `(user_email, competencia)`** when `user_email` is resolved after auto-link: if any existing record (any `status`) matches → `409` on the manual path; silent `200 {ok: true, skipped: true}` on the automated path.
   - Exception: if the existing record is `aprovado` and the manual request includes `?confirm_override=true`, a new `rascunho` is created alongside the approved record (the approved record is not modified).
   - Without `?confirm_override=true` on the manual path, the response is `409` with `{requires_override: true}` in the body.

3. **By normalized `(nome_extraido, competencia)`** when `user_email` is `null` (unlinked): normalize the incoming name with `norm()`, compare against normalized `nome_extraido` of existing records for the same `competencia` where `user_email IS NULL` → `409` on the manual path; silent skip on the automated path.

### Name-linking adapter (`_email_to_prefix`)

`match_name(full, task_names)` in `gabi_engine.py` expects dot-notation identifiers (e.g., `"pedro.santos"`). Team members are stored with `user_email` like `"pedro.santos@db1.com.br"`.

Adapter: extract the prefix before `@` from each active `user_email` → `"pedro.santos"`. Pass the list of prefixes as `task_names`. Map the returned prefix back to the original `user_email`.

Helper: `_email_to_prefix(email: str) -> str = email.split("@")[0]`.  
Adapter function: `auto_link(nome_extraido, active_emails) -> (user_email | None, match_status)` lives in `web/client_evaluation_engine.py`.

Match outcomes:
- `match_name` returns a prefix → `match_status = "auto"`, `user_email` = the corresponding email.
- `match_name` returns `None` → `match_status = "nao_vinculado"`, `user_email = NULL`.
- Admin resolves manually via `PATCH /{id}` with `user_email` → `match_status = "manual"`.

### HTML stripping (automated ingest path)

The n8n Outlook node returns `body.content` as HTML. GABI strips tags before parsing:

```python
import re
import html

content_plain = re.sub(r'<[^>]+>', ' ', content)
content_plain = html.unescape(content_plain)
```

This is handled by `strip_html(content: str) -> str` in `web/client_evaluation_engine.py`. The manual paste path always receives plain text and is not stripped.

### API key authentication (automated endpoint)

`POST /api/integrations/mag-evaluation` is authenticated via `X-Api-Key` header validated against the `MAG_EVAL_API_KEY` environment variable. Missing env var or key mismatch → `401`. This endpoint does NOT use JWT.

Dependency: `_require_api_key(request: Request) -> None` in `web/main.py`.

---

## Data model

### Table: `client_evaluations`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `competencia` | TEXT | NOT NULL | `"YYYY-MM"` format |
| `nome_extraido` | TEXT | NOT NULL | Raw collaborator name from the `Colaborador:` label |
| `user_email` | TEXT | NULL | Logical FK → `team_members.user_email`; `NULL` until resolved |
| `match_status` | TEXT | NOT NULL | `"auto"`, `"manual"`, or `"nao_vinculado"` |
| `fornecedor_validado` | INTEGER | NOT NULL | `1` if `Fornecedor == "DB1 Global Software"`, `0` otherwise |
| `comportamental_nota` | INTEGER | NULL | Behavioral score, 1–5 |
| `comportamental_comentario` | TEXT | NULL | Per-dimension comment; `NULL` when `comentario_geral` is used |
| `tecnica_nota` | INTEGER | NULL | Technical score, 1–5 |
| `tecnica_comentario` | TEXT | NULL | Per-dimension comment for technical |
| `prazo_nota` | INTEGER | NULL | Delivery deadline score, 1–5 |
| `prazo_comentario` | TEXT | NULL | Per-dimension comment for delivery deadline |
| `comentario_geral` | TEXT | NULL | Single feedback paragraph; mutually exclusive with `*_comentario` |
| `raw_email_text` | TEXT | NOT NULL | Verbatim plain-text body preserved for audit |
| `email_message_id` | TEXT | NULL | Outlook `internetMessageId`; `NULL` when `origem = "manual"` |
| `origem` | TEXT | NOT NULL | `"automacao"` or `"manual"` |
| `status` | TEXT | NOT NULL | `"rascunho"`, `"aprovado"`, or `"rejeitado"` |
| `created_by` | TEXT | NOT NULL | Admin email who created the record |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT `datetime('now')` | |
| `reviewed_by` | TEXT | NULL | Admin email who approved or rejected |
| `reviewed_at` | TIMESTAMP | NULL | |
| `edited_by` | TEXT | NULL | Admin email who last edited the draft |
| `edited_at` | TIMESTAMP | NULL | |

### Indexes

```sql
-- Prevents duplicate approved records for the same professional + competência.
-- Status condition ensures the confirm_override rascunho can coexist with an approved record.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_user_competencia
  ON client_evaluations (user_email, competencia)
  WHERE user_email IS NOT NULL AND status = 'aprovado';

-- Idempotency for the automated path.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_message_id
  ON client_evaluations (email_message_id)
  WHERE email_message_id IS NOT NULL;
```

---

## REST endpoint contracts

All admin endpoints require `is_admin = true`. Non-admin requests return `403`. Unauthenticated requests return `401`.

### `POST /api/admin/client-evaluations/ingest`

**Auth**: admin JWT  
**Request body**: `{"email_body": "<plain text>"}` + optional query param `?confirm_override=true`

| Response | Condition |
|---|---|
| `201` `{"id": <int>, "status": "rascunho", "origem": "manual", "competencia": "YYYY-MM"}` | Draft created successfully |
| `409` `{"detail": "...", "requires_override": true}` | Existing `aprovado` record for the same pair; `?confirm_override=true` not provided |
| `409` `{"detail": "..."}` | Existing non-approved record for the same pair |
| `422` `{"detail": "<parser error>"}` | Parse failure |

### `GET /api/admin/client-evaluations`

**Auth**: admin JWT  
**Query params**: optional `?status=rascunho|aprovado|rejeitado`  
**Response**: `{"evaluations": [...]}` sorted `created_at DESC`; all columns including `match_status`

### `GET /api/admin/client-evaluations/dashboard`

**Auth**: admin JWT  
**Query params**: optional `user_email`, `competencia_from`, `competencia_to` (all `"YYYY-MM"`)  
**Response**: `{"data": [...]}` — only `aprovado` records matching filters

> **Registration order**: must be registered in `main.py` **before** `GET /api/admin/client-evaluations/{id}` to avoid FastAPI treating `"dashboard"` as an `{id}` path parameter.

### `GET /api/admin/client-evaluations/{id}`

**Auth**: admin JWT  
**Response**: `200` with full record including `raw_email_text`; `404` if not found

### `PATCH /api/admin/client-evaluations/{id}`

**Auth**: admin JWT  
**Request body** (partial): any subset of `user_email`, `comportamental_nota`, `comportamental_comentario`, `tecnica_nota`, `tecnica_comentario`, `prazo_nota`, `prazo_comentario`, `comentario_geral`  
**Side effects**: setting `user_email` to a non-null value also sets `match_status = "manual"`; setting `user_email` to `null` sets `match_status = "nao_vinculado"`; always records `edited_by` and `edited_at`

| Response | Condition |
|---|---|
| `200` `{"ok": true}` | Update applied |
| `404` | Record not found |
| `409` | Record is `aprovado` (immutable) |

### `POST /api/admin/client-evaluations/{id}/approve`

**Auth**: admin JWT  
**Response**: `200` + sets `status = "aprovado"`, `reviewed_by`, `reviewed_at`; `404` not found; `422` if `user_email` is null; `409` if already approved

### `POST /api/admin/client-evaluations/{id}/reject`

**Auth**: admin JWT  
**Response**: `200` + sets `status = "rejeitado"`, `reviewed_by`, `reviewed_at`; `404` not found

### `POST /api/integrations/mag-evaluation`

**Auth**: `X-Api-Key` header validated against `MAG_EVAL_API_KEY` env var (no JWT)  
**Request body**:

| Field | Type | Required |
|---|---|---|
| `content` | string | yes — plain text or HTML (stripped by GABI before parsing) |
| `subject` | string | yes — metadata only |
| `internetMessageId` | string | yes — used for idempotency |
| `receivedDateTime` | string | yes — metadata only |
| `from` | string | yes — metadata only |

| Response | Condition |
|---|---|
| `201` `{"ok": true, "id": <int>}` | Draft created |
| `200` `{"ok": true, "skipped": true}` | Same `internetMessageId` already exists |
| `401` | Invalid or missing `X-Api-Key` |
| `422` | Parse failure after HTML stripping |

Deduplication on the automated path is always silent (no `409`): same messageId → `200 skipped`; same (user_email, competencia) or same normalized (nome_extraido, competencia) → `200 skipped`.

### `GET /api/my-evaluations`

**Auth**: user JWT (not admin-only; any authenticated user)  
**Response**: `{"evaluations": [...]}` — only the authenticated user's `aprovado` records, ordered `competencia DESC`; returns `{"evaluations": []}` with `200` when no records exist

---

## Module layout

| File | Role |
|---|---|
| `web/client_evaluation_engine.py` | Pure parser — `parse_evaluation()`, `strip_html()`, `auto_link()` |
| `web/db.py` | PostgreSQL `_db()` connection factory shared across repositories |
| `web/repositories/client_evaluation_repository.py` | All database reads/writes for this domain |
| `tests/test_client_evaluation_engine.py` | Unit tests for the pure parser |
| `tests/test_client_evaluations.py` | Integration tests for all endpoints |

---

## Cross-domain dependencies

- **Team & Billing** (`team_members`): queried read-only at ingest time to auto-link collaborator names.
- **Authentication** (`_current_user`, `_admin_user`, `is_admin` flag): used for all endpoint guards.
- **GA Validation** (`match_name()`, `norm()`, `PARTICLES` from `gabi_engine.py`): reused read-only for name normalization and matching.

No existing domain table or function is modified by this domain.
