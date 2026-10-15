---
name: submission-workflow
description: This is the authoritative documentation of the Submission Workflow domain. It covers the complete lifecycle of a validated GA spreadsheet — from initial submission by a team member, through admin review, approval or rejection, reprocessing, and the final immutable approved snapshot used in billing. Load this skill when working on submitting GA files for approval, approving or rejecting submissions, admin rerun of validation, previewing submission state, tracking submission status per competência, missing-submission tracking, or billing export from approved submissions.
metadata:
  author: clovis-cli
  type: domain-skill
---

# Submission Workflow

> **Maintaining this skill**
>
> Update it whenever the behavior of this domain changes purpose, keeping the skill
> faithful to the implemented behavior. A divergence between skill and code with no
> recorded decision is escalated to the human, not resolved on your own.

## Domain overview

The Submission Workflow domain manages the lifecycle of a validated GA (Gestão de Apontamentos) spreadsheet from the moment a team member submits it for admin approval through the final authorized snapshot that feeds billing. It stores the raw GA file, the validation result captured at submission time, and an immutable approved snapshot set by the admin. The domain exposes read endpoints for users to track their own submission history and write endpoints that allow admins to approve, reject, reprocess, or preview any submission. It is the bridge between GA Validation (which produces the validation result) and Team & Billing (which consumes approved snapshots to generate the billing XLSX).

## Business rules

**BR-1 — One active submission per (user, competência).** The `ga_submissions` table enforces `UNIQUE (user_email, competencia)`. Submitting again for the same competência performs an UPSERT: all fields are updated with the new values, `status` is reset to `pending`, `rejection_reason` is cleared, and all review metadata (`reviewed_at`, `reviewed_by`) is nulled. The `submitted_at` timestamp is refreshed to the current UTC datetime.

**BR-2 — Initial status is always `pending`.** Every new submission (insert or upsert) sets `status = 'pending'`. There is no direct path for a user to create an `approved` or `rejected` submission.

**BR-3 — Status lifecycle.** The only valid status values are `pending`, `approved`, and `rejected`. Transitions:
- `pending` → `approved` (admin approves)
- `pending` → `rejected` (admin rejects)
- `rejected` → `pending` (user resubmits via UPSERT)
- `approved` is a terminal state from the admin-action perspective — it cannot be transitioned back by any endpoint.

**BR-4 — Approved snapshot is immutable.** When a submission reaches `approved` status, the `approved_snapshot` column stores a JSON snapshot of the `Person` object as seen by the admin at the moment of approval. No subsequent endpoint changes `approved_snapshot` after it is written. The preview and detail endpoints signal immutability via `is_immutable: true` and `snapshot_source: 'approved'` respectively.

**BR-5 — Admin approval with optional override.** The approve endpoint accepts an optional JSON body with `horas_task` (float) and `approved_snapshot` (serialized JSON string). If the body is provided (normal path from the frontend, which always sends the current preview data), those values are written to the record. If the body is omitted, the current `horas_task` and `validation_snapshot` are copied into `approved_snapshot` unchanged.

**BR-6 — Admin rerun resets the submission to pending.** When an admin triggers a rerun, the submission's GA file is reprocessed with the current Task data. The result replaces `validation_snapshot` and `horas_task`. The record is reset to `status = 'pending'`, `rejection_reason = NULL`, `reviewed_at = NULL`, `reviewed_by = NULL`, and `submitted_at` is refreshed. This forces the admin to re-review the updated result before approving.

**BR-7 — Preview is non-destructive.** The preview endpoint reprocesses the GA file with the current Task data and returns the result without writing to the database. For approved submissions, it returns the immutable `approved_snapshot` directly without reprocessing. The preview response always includes `is_immutable` (bool) and reviewer metadata (`reviewed_at`, `reviewed_by`).

**BR-8 — GA file download requires approved status.** `GET /api/admin/submissions/{id}/ga-file` returns the stored raw GA file (BLOB) only when the submission's `status = 'approved'`. Any other status returns HTTP 404.

**BR-9 — Missing-submission list respects competência-scoped deactivation.** A team member is considered active for a given competência if their `deactivated_from_competencia` field is `NULL` or is strictly greater than the competência string. The endpoint returns active members who have no row in `ga_submissions` for the given competência.

**BR-10 — Summary counts active team members globally.** The summary endpoint counts `total_members` as the number of `team_members` rows where `deactivated_from_competencia IS NULL`, regardless of any specific competência. Per-competência `total_members` applies the same deactivation rule to the competência being reported.

**BR-11 — Billing export resolves hours with a JSON-path priority chain.** For each approved submission, the GA hours value used in billing is resolved in this order:
1. `approved_snapshot.ga_total`
2. `validation_snapshot.ga_total`
3. `approved_snapshot.task_total`
4. `validation_snapshot.task_total`
5. `horas_task` column

The export includes only rows with `status = 'approved'`, joined with `team_members` and `billing_rates`.

**BR-12 — Rejection reason is optional.** The reject endpoint accepts `reason: str = ""`. An empty string is valid; the field is stored as-is without minimum-length enforcement.

## Flows and lifecycle

### User submission flow

1. The user validates their GA spreadsheet via the GA Validation domain (`POST /api/validate`), which produces a `Person` JSON object. The raw GA file and competência are stored client-side in session storage (`pendingSubmission`).
2. The user navigates to the results page, where the current submission status for the competência is checked via `GET /api/submissions/status`.
3. If not yet submitted (or previously rejected), the user clicks "Submeter" (or "Re-submeter"). The client posts the GA file plus the validation snapshot to `POST /api/submissions`.
4. The submission record is created (or upserted) with `status = 'pending'`.

### Admin review flow

1. The admin opens the approvals panel and selects a competência.
2. `GET /api/admin/submissions/summary` provides aggregate counts per competência; `GET /api/admin/submissions?competencia=YYYY-MM` lists individual submissions.
3. The admin opens a submission in the drawer, which calls `GET /api/admin/submissions/{id}/preview`. The preview reprocesses with current Task data and compares against the original snapshot, showing a diff warning if Task hours changed.
4. The admin either:
   - **Approves**: calls `PATCH /api/admin/submissions/{id}/approve` with the current preview's `Person` data and `horas_task` in the body. The record transitions to `approved` and `approved_snapshot` is written.
   - **Rejects**: enters a reason text and calls `PATCH /api/admin/submissions/{id}/reject`. The record transitions to `rejected`.
   - **Reruns**: calls `POST /api/admin/submissions/{id}/rerun` to refresh the snapshot with current Task data. The record reverts to `pending` for re-review.

### User resubmission flow (after rejection)

1. The user sees their submission as `rejected` in the submission list.
2. The user re-validates the GA (or the same GA file) and calls `POST /api/submissions` again.
3. The UPSERT resets the record to `pending` and clears all rejection metadata.

### Billing export flow

1. The admin verifies via the summary that all expected submissions are `approved`.
2. `GET /api/admin/billing/{competencia}/export` generates and returns an XLSX file with one row per approved submission, joining billing rates and team member profiles.
3. `GET /api/admin/submissions/{id}/ga-file` downloads the original raw GA file for each approved submission.
4. The frontend uses the browser File System Access API to save the XLSX and GA files to a local folder chosen by the user.

## Entities and data

### Table: `ga_submissions`

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | no | Surrogate key |
| `user_email` | TEXT | no | Authenticated user's email |
| `competencia` | TEXT | no | Period in `YYYY-MM` format |
| `nome_profissional` | TEXT | no | Professional's display name from the GA file |
| `task_id` | TEXT | no | Task project identifier from validation |
| `horas_task` | REAL | no | Task hours at submission time; updated on rerun |
| `ga_filename` | TEXT | no | Original filename of the uploaded GA file |
| `ga_data` | BLOB | no | Raw bytes of the GA file (XLS or XLSX) |
| `validation_snapshot` | TEXT (JSON) | no | `Person` object captured at submission time; updated on rerun |
| `status` | TEXT | no | `pending` \| `approved` \| `rejected`; default `pending` |
| `rejection_reason` | TEXT | yes | Free-text reason set on rejection; nullable |
| `submitted_at` | TEXT | no | UTC datetime of last submission or rerun |
| `reviewed_at` | TEXT | yes | UTC datetime of last approve/reject action |
| `reviewed_by` | TEXT | yes | Email of the admin who last reviewed |
| `approved_snapshot` | TEXT (JSON) | yes | Immutable `Person` snapshot written on approval; added via schema migration |

**Unique constraint**: `(user_email, competencia)`.

### API endpoints — user

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/submissions` | authenticated user | Submit or resubmit a GA with validation snapshot |
| `GET` | `/api/submissions/status` | authenticated user | Check submission status for a given `competencia` |
| `GET` | `/api/submissions/my` | authenticated user | List all submissions by the current user, ordered by competência DESC |
| `GET` | `/api/submissions/{id}` | authenticated user (own submissions only) | Get submission detail with snapshot |

### API endpoints — admin

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/submissions/summary` | admin | Aggregate counts per competência plus total active members |
| `GET` | `/api/admin/submissions` | admin | List submissions for a given `competencia` |
| `GET` | `/api/admin/submissions/{competencia}/missing` | admin | Active members who have not submitted for the competência |
| `PATCH` | `/api/admin/submissions/{id}/approve` | admin | Approve; optional body overrides `horas_task` and `approved_snapshot` |
| `PATCH` | `/api/admin/submissions/{id}/reject` | admin | Reject with an optional reason string |
| `POST` | `/api/admin/submissions/{id}/rerun` | admin | Reprocess GA with current Task data; resets to `pending` |
| `GET` | `/api/admin/submissions/{id}/preview` | admin | Preview current state non-destructively |
| `GET` | `/api/admin/submissions/{id}/ga-file` | admin | Download raw GA file (approved submissions only) |
| `GET` | `/api/admin/billing/{competencia}/export` | admin | Generate billing XLSX from approved submissions |

### Request / response shapes

**`POST /api/submissions`** (multipart/form-data):
- `ga` — GA file (UploadFile)
- `competencia` — `YYYY-MM` string
- `nome_profissional` — string
- `task_id` — string
- `horas_task` — float
- `snapshot` — serialized `Person` JSON string

**`PATCH /api/admin/submissions/{id}/approve`** (optional JSON body):
```json
{ "horas_task": 160.0, "approved_snapshot": "<Person JSON string>" }
```

**`PATCH /api/admin/submissions/{id}/reject`** (JSON body):
```json
{ "reason": "" }
```

**`GET /api/submissions/status`** response:
```json
{ "submitted": true, "id": 1, "status": "pending", "rejection_reason": null, "submitted_at": "2025-07-01T12:00:00" }
```
or `{ "submitted": false }` when no record exists.

**`GET /api/admin/submissions/{id}/preview`** response:
```json
{
  "person": { /* Person object — current reprocessed or immutable approved snapshot */ },
  "submission_snapshot": { /* Person object at original submission time */ },
  "is_immutable": false,
  "reviewed_at": null,
  "reviewed_by": null
}
```

**`GET /api/submissions/{id}`** response (includes `snapshot_source`):
- `snapshot_source: "approved"` — approved snapshot is returned (immutable)
- `snapshot_source: "original"` — validation snapshot is returned
- `snapshot_source: null` — no snapshot available (edge case)

**`GET /api/admin/submissions/summary`** response:
```json
{
  "total_members": 10,
  "competencias": [
    {
      "competencia": "2025-07",
      "total_submitted": 8,
      "total_approved": 5,
      "total_pending": 2,
      "total_rejected": 1,
      "total_members": 10
    }
  ]
}
```

**`POST /api/admin/submissions/{id}/rerun`** response:
```json
{ "ok": true, "horas_task": 160.0 }
```

## Constraints and validations

- **Authentication required** on all endpoints: user endpoints require a valid JWT (`CurrentUser`); admin endpoints additionally require `is_admin = true` (`AdminUser`).
- **Ownership enforcement**: `GET /api/submissions/{id}` enforces `user_email = authenticated email` in the SQL query; HTTP 404 is returned if the submission does not exist or belongs to another user.
- **Competência format**: all `competencia` values must follow `YYYY-MM` (enforced at the application level by convention; no separate regex validation at the submission layer — the format is validated upstream by the validation domain and by the admin filter parameter).
- **Status-gated GA file download**: querying `ga-file` for a non-approved submission returns HTTP 404 (the SQL WHERE includes `AND status='approved'`).
- **Rerun fails with HTTP 422** if reprocessing produces no persons or raises an unhandled exception; the database record is not modified in that case.
- **No enforcement that a submission must pass validation before submission**: the submission endpoint stores whatever snapshot the client sends; correctness of the snapshot content is the responsibility of the GA Validation domain.

## Integrations and external dependencies

- **Authentication domain** — provides JWT-based identity for all endpoints. The authenticated user's email is used as `user_email` in the submission record.
- **GA Validation domain** — produces the `Person` JSON object (validation snapshot) that the user forwards to this domain at submission time. The rerun and preview operations invoke the same validation engine (`gabi_engine.process` or `process_with_task_data`) on the stored GA file.
- **Task Data Access domain** — supplies the current Task hours used during rerun and preview reprocessing. The oracle-mode path (`_run_oracle`) or file-mode path (`_run_file`) is selected based on whether Oracle is configured.
- **Team & Billing domain** — the billing export endpoint (`GET /api/admin/billing/{competencia}/export`) consumes approved submissions and joins `team_members` and `billing_rates` to compute totals. The GA file download endpoint supplies raw GA files for archival alongside the billing XLSX.
- **PostgreSQL** — all submission state is persisted in the `ga_submissions` table in the internal PostgreSQL database. Oracle is not written to; it is read-only.
- **openpyxl** — used to generate the billing XLSX response from approved submissions.
- **File System Access API** (browser) — the frontend uses this browser API to allow the admin to save the billing XLSX and raw GA files to a user-chosen local folder. There is no server-side ZIP packaging; file saving is client-orchestrated.

## Maintenance

Update this skill whenever the status lifecycle, snapshot immutability rules, admin action semantics, or API contracts of this domain change with a known intent. A refactor that preserves observable behavior (renaming a variable, extracting a helper) does not require a skill update.

If a divergence is found between what this skill documents and what the implemented code does, and no recorded decision in `discovery-answers.md` settles which behavior is correct, treat it as a gap and escalate to the human — do not silently rewrite the skill to match the code or vice versa.
