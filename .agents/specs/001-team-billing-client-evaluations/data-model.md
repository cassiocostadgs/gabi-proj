# Data Model: Client Evaluations

This file documents the new SQLite table introduced by the `client-evaluation` domain. It is an auxiliary artifact to `spec.md` — the schema details are too complex for a single section.

## Table: `client_evaluations`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `competencia` | TEXT | NOT NULL | Competência normalized to `"YYYY-MM"` (extracted from `Competência: MM / YYYY` in the email body) |
| `nome_extraido` | TEXT | NOT NULL | Collaborator name exactly as written in the email `Colaborador:` field (pre-normalization) |
| `user_email` | TEXT | NULL | Logical FK → `team_members.user_email`; `NULL` until the professional link is resolved |
| `match_status` | TEXT | NOT NULL | One of: `"auto"` (resolved by `match_name()`), `"manual"` (resolved by admin), `"nao_vinculado"` (no match found) |
| `fornecedor_validado` | INTEGER | NOT NULL | Boolean: `1` if `Fornecedor == "DB1 Global Software"`, `0` otherwise |
| `comportamental_nota` | INTEGER | NULL | Behavioral dimension score, `1–5` |
| `comportamental_comentario` | TEXT | NULL | Per-dimension comment for behavioral; `NULL` when `comentario_geral` is used instead |
| `tecnica_nota` | INTEGER | NULL | Technical dimension score, `1–5` |
| `tecnica_comentario` | TEXT | NULL | Per-dimension comment for technical |
| `prazo_nota` | INTEGER | NULL | Delivery deadline dimension score, `1–5` |
| `prazo_comentario` | TEXT | NULL | Per-dimension comment for delivery deadline |
| `comentario_geral` | TEXT | NULL | Single `Feedback:` paragraph covering all dimensions; populated when the email uses a unified comment instead of per-dimension comments; mutually exclusive with the three `*_comentario` columns |
| `raw_email_text` | TEXT | NOT NULL | Verbatim plain-text email body (HTML stripped before storage if received via automation); preserved for audit and potential reprocessing |
| `email_message_id` | TEXT | NULL | Outlook `internetMessageId`; `NULL` when `origem = "manual"` (paste path) |
| `origem` | TEXT | NOT NULL | One of: `"automacao"` (n8n push), `"manual"` (admin paste) |
| `status` | TEXT | NOT NULL | One of: `"rascunho"`, `"aprovado"`, `"rejeitado"` |
| `created_by` | TEXT | NOT NULL | Email of the admin who ingested the record |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT `datetime('now')` | |
| `reviewed_by` | TEXT | NULL | Email of the admin who approved or rejected |
| `reviewed_at` | TIMESTAMP | NULL | |
| `edited_by` | TEXT | NULL | Email of the last admin who edited the draft |
| `edited_at` | TIMESTAMP | NULL | |

## Indexes and uniqueness

| Target | Columns | Condition | Purpose |
|---|---|---|---|
| Uniqueness | `(user_email, competencia)` | `user_email IS NOT NULL` | Prevents duplicate approved records after the professional link is resolved |
| Uniqueness | `email_message_id` | `email_message_id IS NOT NULL` | Idempotency for the automated path — the same Outlook message never creates two records |

SQLite supports partial indexes (`WHERE` clause). Both indexes above are enforced as partial unique indexes in the `CREATE TABLE` migration so that `NULL` values in either column are excluded from the constraint (each `NULL` is treated as distinct by SQLite, which would allow unintended duplicates if the index were applied unconditionally).

## Deduplication rules (applied in-order before any INSERT)

1. **By `email_message_id`** (automated path only, when `internetMessageId` is present in the request): if a record with the same `email_message_id` already exists → return `200 {ok: true, skipped: true}`. No record created. No error.

2. **By (`user_email`, `competencia`)** when `user_email` has already been resolved for the incoming record: if any existing record (any `status`) matches → return `409` on the manual path. On the automated path, skip silently.

3. **By (normalized `nome_extraido`, `competencia`)** when `user_email` is not yet resolved: normalize the incoming name with `match_name()` and compare against the normalized `nome_extraido` of existing records for the same `competencia` → return `409` on the manual path. On the automated path, skip silently.

**Special case — re-ingest over an existing `aprovado` record (manual path only):**
Return `409` unless `?confirm_override=true` is provided. With the flag, create a new `rascunho` alongside the existing approved record — the approved record is neither overwritten nor deleted.

## Status lifecycle

```
rascunho  ──►  aprovado    (POST /approve; requires user_email != null)
          ──►  rejeitado   (POST /reject)
```

- `rascunho` — editable; visible to admins only.
- `aprovado` — immutable in v1; visible to the professional and in the admin dashboard.
- `rejeitado` — immutable; never visible to the professional or in the dashboard.
- Reopening an `aprovado` record (e.g., for a legitimate correction) is a Future Consideration (P2) — not implemented in v1.

## Comment pattern mapping

| Email pattern | Parser behaviour |
|---|---|
| Dimension comments (one block below each score label) | Stored in `comportamental_comentario`, `tecnica_comentario`, `prazo_comentario`; `comentario_geral = NULL` |
| Single `Feedback:` paragraph (one block at the end) | Stored in `comentario_geral`; all three `*_comentario` columns = `NULL` |

Both patterns are observed in real samples. The parser must handle both; the two patterns are mutually exclusive within a single email.
