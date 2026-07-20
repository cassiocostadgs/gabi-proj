---
name: team-billing
description: >
  This is the authoritative documentation of the Team & Billing domain. It covers team member management (billing roster), hourly rate profiles, global billing settings (CNPJ, email recipients, client tag), and the final billing XLSX export derived from approved GA submissions. Use when working with team members, subcontracts, billing profiles, valor_hora, billing rates, CNPJ configuration, billing export, faturamento, email template, deactivation by competência, or missing submissions.
metadata:
  author: clovis-cli
  type: domain-skill
---

# Team & Billing

> **Maintaining this skill**
>
> Update it whenever the behavior of this domain changes — a new field, a changed formula, a new settings key, a modified deactivation rule, or a change to the XLSX structure. A purely structural refactor that preserves the business rule does not require an update. When skill and code diverge semantically with no recorded decision settling the point, escalate to the human rather than silently adjusting the skill or the code.

## Domain overview

Team & Billing models the billing dimension of the team. It links platform users to billing profiles and subcontract numbers, manages hourly rates per profile, stores global billing metadata (company CNPJ, recipient email, client tag), and produces the final billing XLSX export by joining approved GA submissions with team and rate data. It is the last domain in the processing chain: it consumes approved submissions produced by the Submission Workflow domain.

All endpoints in this domain require admin authentication.

## Entities and data

### `team_members` table

| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT |
| `user_email` | TEXT | UNIQUE NOT NULL — must exist in `users` |
| `cpf` | TEXT | NOT NULL |
| `subcontrato` | TEXT | NOT NULL |
| `profile` | TEXT | NOT NULL — must exist in `billing_rates` |
| `is_active` | INTEGER | NOT NULL DEFAULT 1 |
| `deactivated_from_competencia` | TEXT | NULL — `YYYY-MM` format; set on deactivation, cleared on activation |
| `created_at` | TEXT | NOT NULL DEFAULT datetime('now') |

### `billing_rates` table

| Column | Type | Constraints |
|---|---|---|
| `profile` | TEXT | PRIMARY KEY |
| `valor_hora` | REAL | NOT NULL |

### `settings` table

| Column | Type | Constraints |
|---|---|---|
| `key` | TEXT | PRIMARY KEY |
| `value` | TEXT | NOT NULL |

Fixed keys seeded at startup:

| Key | Purpose | Initial value |
|---|---|---|
| `billing_cnpj` | Company CNPJ stamped on billing XLSX | Value of `BILLING_CNPJ` env var, or empty string |
| `billing_email_to` | Billing email recipient address | Empty string |
| `billing_email_tag` | Client tag for email subject | Empty string |

The settings table is an upsert store — any key can be written, but only the three above carry business meaning in this domain.

## API contracts

All endpoints require an admin JWT (Bearer token). Attempting without admin role returns 403.

### Settings

| Method | Path | Request body | Success | Error |
|---|---|---|---|---|
| GET | `/api/admin/settings` | — | `{billing_cnpj, billing_email_to, billing_email_tag}` (flat key-value object) | — |
| PUT | `/api/admin/settings/{key}` | `{value: string}` | `{ok: true}` | — |

The PUT endpoint performs an upsert (INSERT OR REPLACE). No 404 is raised for an unknown key — any key is accepted.

### Billing rates

| Method | Path | Request body | Success | Error |
|---|---|---|---|---|
| GET | `/api/admin/billing-rates` | — | `{rates: [{profile, valor_hora}]}` ordered by `profile` | — |
| POST | `/api/admin/billing-rates` | `{profile: string, valor_hora: float}` | 201 `{ok: true, profile}` | 409 — profile already exists |
| PUT | `/api/admin/billing-rates/{profile}` | `{valor_hora: float}` | `{ok: true}` | 404 — profile not found |
| DELETE | `/api/admin/billing-rates/{profile}` | — | `{ok: true}` | 404 — profile not found |

### Team members

| Method | Path | Request body | Success | Error |
|---|---|---|---|---|
| GET | `/api/admin/team` | — | `{members: [TeamMember]}` ordered by `id` | — |
| POST | `/api/admin/team` | `{user_email, cpf, subcontrato, profile}` | 201 `{ok: true}` | 404 user not found; 400 profile not in rates; 409 email already a member |
| PUT | `/api/admin/team/{member_id}` | `{cpf, subcontrato, profile, is_active: bool}` | `{ok: true}` | 400 profile not in rates; 404 member not found |
| DELETE | `/api/admin/team/{member_id}` | — | `{ok: true}` | 404 member not found |
| PATCH | `/api/admin/team/{member_id}/deactivate` | `{deactivated_from_competencia: string}` | `{ok: true}` | 404 member not found |
| PATCH | `/api/admin/team/{member_id}/activate` | — | `{ok: true}` | 404 member not found |

`TeamMember` response shape:

```json
{
  "id": 1,
  "user_email": "name@db1.com.br",
  "cpf": "111.222.333-44",
  "subcontrato": "SUB 01",
  "profile": "Pleno",
  "is_active": true,
  "deactivated_from_competencia": null,
  "created_at": "2025-07-01T10:00:00"
}
```

### Billing export

| Method | Path | Success | Error |
|---|---|---|---|
| GET | `/api/admin/billing/{competencia}/export` | XLSX file attachment `faturamento_YYYY_MM.xlsx` | 404 — no approved submissions for the competência |

`competencia` path parameter is a `YYYY-MM` string (e.g., `2025-07`). The response `Content-Disposition` header uses underscores: `faturamento_2025_07.xlsx`.

## Business rules

### Team member management

1. **User referential integrity** — the `user_email` provided when creating a member must belong to an existing record in the `users` table; otherwise the creation returns 404.

2. **Profile referential integrity** — the `profile` field must match an existing entry in `billing_rates`, enforced on both creation and update. An unknown profile returns 400.

3. **One team member per user** — `user_email` is a unique key; a second registration of the same email returns 409.

4. **Deactivation is competência-scoped** — `PATCH /deactivate` records the first competência from which the member is no longer expected to submit. A member is treated as active for a given competência `C` when:
   - `deactivated_from_competencia IS NULL`, or
   - `deactivated_from_competencia > C` (lexicographic comparison, valid because competências are `YYYY-MM` strings of equal length).

5. **Activation clears deactivation** — `PATCH /activate` sets `is_active=1` and `deactivated_from_competencia=NULL`, making the member unconditionally active from that point.

6. **`is_active` flag vs. `deactivated_from_competencia`** — the `is_active` column is the boolean gate for UI rendering and the `PUT` update. The `deactivated_from_competencia` column is used in the missing-submissions and summary computations to determine membership per competência. Both are set together on deactivate/activate actions.

### Billing rates

7. **Profile name is the primary key** — rates are identified by `profile` name (a free-text string). The name cannot be changed after creation; only `valor_hora` can be updated.

8. **Rate deletion** — a billing rate can be deleted regardless of whether any team member currently references it. No cascade is enforced by the database; the referential check is only applied on member creation/update.

### Settings

9. **CNPJ stored as raw digits** — the frontend strips non-digit characters before calling `PUT /api/admin/settings/billing_cnpj`. The backend formats it as `XX.XXX.XXX/XXXX-XX` at export time only when the stored value contains exactly 14 digits; otherwise the raw value is used as-is.

10. **Email tag is stored uppercase** — the frontend forces the `billing_email_tag` value to uppercase and caps it at 10 characters before saving.

### Billing export

11. **Only approved submissions are exported** — the SQL query filters `ga_submissions.status = 'approved'`. If no approved submissions exist for the requested competência, the endpoint returns 404.

12. **`horas_ga` resolution priority** — hours used for each billing row are resolved in this order (first non-null value wins):
    1. `approved_snapshot.ga_total`
    2. `validation_snapshot.ga_total`
    3. `approved_snapshot.task_total`
    4. `validation_snapshot.task_total`
    5. `horas_task` (raw field on `ga_submissions`)

    This means admin-approved snapshot GA hours take precedence over original submission snapshot GA hours, which in turn take precedence over Task DB hours.

13. **Row total formula** — `total = horas_ga × valor_hora`, rounded to 2 decimal places per row.

14. **Grand total formula** — `TOTAL NF = Σ(horas_ga × valor_hora)` across all rows, rounded to 2 decimal places. Displayed in the summary row in R$ format.

15. **Row ordering** — rows are sorted by `subcontrato ASC`.

16. **`Nº NOTA FISCAL` column is always empty** — intentionally left blank in the generated XLSX for the billing recipient to fill in.

## Flows and lifecycle

### Billing export flow (admin)

1. Admin navigates to the billing export for a competência.
2. The browser prompts the user to select a local directory (File System Access API — `showDirectoryPicker`).
3. The frontend calls `GET /api/admin/billing/{competencia}/export` and saves the received XLSX as `faturamento_{YYYY_MM}.xlsx` in the selected directory.
4. For each approved submission of that competência, the frontend calls `GET /api/admin/submissions/{id}/ga-file` and saves the file as `GA_{normalized_name}_{YYYY_MM}.{ext}` in the same directory (where `normalized_name` has diacritics stripped, non-alphanumeric characters replaced with `_`, and consecutive/leading/trailing underscores collapsed).
5. If `billing_email_to` is configured, an HTML+plain-text email body is copied to the clipboard and a `mailto:` link is constructed with a prefilled subject.

**Email subject format**: `[DB1][TAG] Faturamento | Mês/Ano`
- `[TAG]` appears only when `billing_email_tag` is non-empty.
- `Mês/Ano` is the abbreviated Portuguese label (e.g., `jul/25`).

**Email body content** (both HTML and plain-text): greeting, list of approved submissions sorted by `subcontrato` (showing subcontract number and professional name), and a placeholder for observations referencing the competência.

### Team member deactivation flow

1. Admin selects "Inativar membro" and picks a competência from the MonthPicker.
2. `PATCH /api/admin/team/{id}/deactivate` is called with `{deactivated_from_competencia: "YYYY-MM"}`.
3. The member's `is_active` is set to `0` and `deactivated_from_competencia` is recorded.
4. From that point, the member no longer appears as "expected" for the specified competência and later ones in missing-submission and summary computations.
5. Reactivation via `PATCH /activate` clears both fields and restores full active membership.

## XLSX structure

The generated billing worksheet ("Faturamento") has this layout:

| Row | Content |
|---|---|
| 1 | Total hours in column F (numeric, hours format — `#,##0.00`) |
| 2 | Column headers |
| 3 … N+2 | Data rows (one per approved submission) |
| N+3 | Summary row: "TOTAL NF" label in column F (bold), grand total R$ in column G (bold) |

Column order (A–I):

| Col | Header | Content |
|---|---|---|
| A | CNPJ EMPRESA | Company CNPJ formatted as `XX.XXX.XXX/XXXX-XX` |
| B | Nº NOTA FISCAL | Empty (to be filled by recipient) |
| C | CPF PROFISSIONAL | Member CPF as stored |
| D | Nº SUBCONTRATO | Member subcontract number |
| E | VALOR HORA | Hourly rate, R$ format |
| F | QUANTIDADE DE HORAS (DECIMAL) | `horas_ga`, numeric format |
| G | TOTAL | `horas_ga × valor_hora`, R$ format |
| H | COMPETÊNCIA EVENTO | Abbreviated label, e.g., `jul/25` |
| I | NOME DO PROFISSIONAL | Professional name from submission |

Formatting applied: Excel table named `TabelaFaturamento` (style `TableStyleMedium2`, row stripes), auto-fit column widths, centered alignment for columns B–H, no grid lines.

## Constraints and validations

- `valor_hora` is stored as a REAL (float) and used directly in multiplication; no minimum or maximum is enforced by the backend.
- `cpf` is stored as a free-text string; the frontend formats it as `000.000.000-00` (masked input) but no server-side format validation is applied.
- `subcontrato` is a free-text string with no format constraint.
- `profile` is a free-text string that serves as the primary key of `billing_rates`; case-sensitivity follows SQLite's default (case-sensitive equality).
- The `billing_email_tag` is capped at 10 characters by the frontend; no server-side length constraint is enforced.
- The settings PUT endpoint accepts any key; only `billing_cnpj`, `billing_email_to`, and `billing_email_tag` carry business meaning.

## Domain environment variables

| Variable | Purpose |
|---|---|
| `BILLING_CNPJ` | Seeds the `billing_cnpj` setting at first startup. Accepts the raw CNPJ value (digits only or formatted). After the initial seed, only the settings API is authoritative; changing the env var on a subsequent startup has no effect because the INSERT uses `OR IGNORE`. |

## Integrations and external dependencies

- **openpyxl** — XLSX generation for the billing export. Used for worksheet creation, number formatting, table styling, column auto-fit, and alignment.
- **File System Access API (browser)** — the billing export flow uses `showDirectoryPicker` to let the user select a local destination folder and write files directly from the browser. This API is available in modern Chromium-based browsers and requires a secure context (HTTPS or localhost).
- **Outlook `mailto:` protocol** — the billing export generates a `mailto:` link with a prefilled subject and copies the email body to the clipboard. The link is opened by the browser's default email client. No SMTP or email API is involved.

## Maintenance

Update this skill when:
- A new column is added to `team_members`, `billing_rates`, or `settings`.
- The `horas_ga` resolution priority changes (rules 12).
- The XLSX column layout, worksheet structure, or naming convention changes.
- A new settings key acquires business meaning.
- The deactivation/activation semantics change (rules 4–6).
- The billing export email subject, body template, or file naming convention changes.

Do not update this skill for purely structural refactors (e.g., extracting a helper function that preserves the same business behavior).

When the skill and the implemented code diverge semantically without a recorded decision that settles the divergence, treat it as a gap and escalate to the human — do not silently update the skill to match the code or vice versa.
