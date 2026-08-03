# UI Screens: Client Evaluations (MAG)

## Overview

Three screens are introduced:

| Screen | Route | Guard | Access |
|---|---|---|---|
| Admin Ingest & Review | `/admin/avaliacao-cliente` | `AdminRoute` | `is_admin = true` |
| Admin Dashboard | `/admin/avaliacao-cliente` (tab) | `AdminRoute` | `is_admin = true` |
| Professional My Evaluations | `/minhas-avaliacoes` | `ProtectedRoute` | Any authenticated user |

The admin screens share the same route and component (`AvaliacaoClienteSection.tsx`) as two tabs. The component is registered under the `"avaliacao-cliente"` section slug in `AdminPage`, following the existing `/:section` routing pattern.

---

## Screen 1 — Admin Ingest & Review

**Component**: `AvaliacaoClienteSection.tsx`  
**Tab**: "Ingestão / Revisão" (default active tab)

### Ingest form

Positioned at the top of the tab content.

| Element | Details |
|---|---|
| `<Textarea>` | Min 10 rows; monospace font; full width. Placeholder: `"Cole aqui o corpo do e-mail de notificação da MAG..."` |
| "Processar" button | Primary; calls `POST /api/admin/client-evaluations/ingest`; disabled while request is in flight |
| Parse error banner | Red/destructive alert shown below textarea on `422` response. Content: parser error message + note `"Texto original não foi salvo — corrija o e-mail e tente novamente."` |
| Duplicate warning banner | Amber/warning alert on `409`. Content: `"Registro duplicado: [nome_extraido] já possui avaliação para [competencia]."` + link to the existing record in the table |
| Override confirmation | If an `aprovado` record exists for the same pair, the `409` response includes a flag; the UI shows a confirmation dialog before re-submitting with `?confirm_override=true` |

After a successful `201`, the textarea is cleared and the records table refreshes (TanStack Query cache invalidation).

### Records table

Columns: **Status** | **Profissional** | **Competência** | **Comp.** | **Técn.** | **Prazo** | **Ações**

| Column | Details |
|---|---|
| Status | Badge variant: `rascunho` (slate/gray), `aprovado` (emerald/green), `rejeitado` (red) |
| Profissional | Linked name when `user_email` is set; `⚠ Não vinculado` alert badge (amber) when `match_status = "nao_vinculado"` |
| Competência | `"YYYY-MM"` string displayed as `"MMM/YY"` (e.g., `"jun/25"`) |
| Comp. / Técn. / Prazo | Score pill (e.g., `"4"`); empty cell when null |
| Ações | "Revisar" button; shown for `rascunho` and `aprovado` records; clicking opens the review drawer |

Default sort: `created_at DESC`.

Filter controls (above table): dropdown "Status" with options All / Rascunho / Aprovado / Rejeitado.

**Empty state** (no records): centered message — `"Nenhuma avaliação processada ainda. Cole um e-mail acima para começar."`

**Loading state**: skeleton rows (3–5 rows, animated pulse).

### Review drawer

Slides in from the right. Triggered by the "Revisar" button in the table. Same pattern as `SubmissionDrawer`.

**Layout**: two-column split (≈50/50), with a fixed header and footer.

**Header**: `"Revisão — [nome_extraido] / [competencia]"` + close button.

#### Left panel — Raw text

| Element | Details |
|---|---|
| Label | `"Texto original"` (small, muted) |
| Content | `<pre>` block, `raw_email_text` value; read-only; scrollable; monospace font; dark background |

#### Right panel — Editable fields

| Field | Component | Editable | Notes |
|---|---|---|---|
| Profissional | `Select` (Shadcn/ui) | yes | Options: all active `team_members`, sorted by name; first option `"— Selecionar profissional —"` (value: null); displays amber alert icon when `match_status = "nao_vinculado"` |
| Competência | Read-only text | no | Extracted value; re-ingest required to change |
| Nota Comportamental | `Input type="number"` min=1 max=5 | yes | |
| Comentário Comportamental | `Textarea` | yes | Shown only when `comentario_geral` is null |
| Nota Técnica | `Input type="number"` min=1 max=5 | yes | |
| Comentário Técnico | `Textarea` | yes | Shown only when `comentario_geral` is null |
| Nota Prazo | `Input type="number"` min=1 max=5 | yes | |
| Comentário Prazo | `Textarea` | yes | Shown only when `comentario_geral` is null |
| Feedback geral | `Textarea` | yes | Shown only when `comentario_geral` is not null; replaces the three per-dimension comment fields |
| Auditoria | Read-only text (muted, small) | no | `"Criado por [created_by] em [created_at]"` + `"Editado por [edited_by] em [edited_at]"` when applicable |

**Footer** (fixed at bottom of drawer):

| Element | Position | Behavior |
|---|---|---|
| "Rejeitar" button | Left | Destructive (red); opens confirmation popover `"Tem certeza? Esta ação é irreversível."` → confirms → calls `POST /reject`; disabled for `aprovado` records |
| "Salvar" button | Right (secondary) | Calls `PATCH /{id}` with edited fields; disabled for `aprovado` records |
| "Aprovar" button | Right (primary) | Calls `POST /approve`; disabled when `user_email = null`, with tooltip `"Vincule o profissional antes de aprovar"`; disabled for `aprovado` records |

After approve or reject: drawer closes, table and summary badge refresh (TanStack Query invalidation).

---

## Screen 2 — Admin Dashboard

**Component**: `AvaliacaoClienteSection.tsx`  
**Tab**: "Dashboard"

### Filter bar

Horizontal bar at the top of the tab content.

| Filter | Component | Notes |
|---|---|---|
| Profissional | `Select` | Options: `"Todos"` + all active `team_members` names, sorted alphabetically |
| Competência de | `Input type="text"` | `YYYY-MM` format; no datepicker (consistent with existing competência inputs in GABI) |
| Competência até | `Input type="text"` | `YYYY-MM` format |
| "Aplicar" button | Primary | Triggers `GET /api/admin/client-evaluations/dashboard` with active filters |

> Squad filter removed from v1 (gap `squad-data-source` resolved: `no-squad-v1`). Squad grouping is deferred to a future spec.

### Chart area

`Line` chart via `react-chartjs-2 <Line>`. Container height: fixed (e.g., 300px), `responsive: true`.

| Property | Value |
|---|---|
| X-axis | Competência labels in abbreviated format (`"jun/25"`, `"jul/25"`, …) |
| Y-axis | Score 1–5, `min: 1`, `max: 5`; label `"Nota"` |
| Datasets | 3 lines: Comportamental (blue `rgba(59,130,246,0.9)`), Técnica (green `rgba(52,211,153,0.9)`), Prazo (orange `rgba(251,146,60,0.9)`) |
| Legend | Enabled, top |
| Grid | Consistent with existing `PersonCard` chart styling (`color: '#1e293b'`) |
| Tooltip | Default Chart.js tooltip (no custom HTML required for this chart) |

When "Todos" is selected for Profissional: chart shows **average scores** per competência across all filtered professionals (3 datasets with averaged values).

When a specific professional is selected: chart shows that professional's scores across competências.

### Summary table (below chart)

Columns: **Profissional** | **Competência** | **Comp.** | **Técnica** | **Prazo** | **Comentário**

The "Comentário" column shows the combined comment: per-dimension comments joined by ` / `, or the `comentario_geral` text (truncated to 80 characters with tooltip for full text).

**Empty state**: `"Nenhum dado aprovado disponível para os filtros selecionados."` (centered, muted).

**Loading state**: spinner centered over chart area.

---

## Screen 3 — Professional My Evaluations

**Route**: `/minhas-avaliacoes`  
**Component**: `MyEvaluationsPage.tsx`  
**Guard**: `ProtectedRoute`

Registered in `App.tsx` as a sibling of `/submissions`, `/task-report`, and `/validate` (inside the `ProtectedRoute` outlet, outside `AdminRoute`).

### Page header

`"Minhas Avaliações — Cliente MAG"` — consistent heading style with other GABI pages.

### Evaluation cards

One card per competência, sorted by `competencia DESC` (newest first).

| Element | Details |
|---|---|
| Card title | Competência in long format: `"Junho / 2025"` (derived from `"YYYY-MM"` using `MONTH_PT` mapping from `gabi_engine.py`) |
| Score badges (row) | Three `<Badge>` components side by side: `"Comportamental: N"`, `"Técnica: N"`, `"Prazo: N"` |
| Score color | ≥ 4 → `emerald` (green); 3 → `amber` (yellow); ≤ 2 → `red` |
| Comment section | If `comentario_geral` is not null: single block labeled `"Feedback:"`. Otherwise: three labeled comment blocks (one per dimension), omitted when the comment is null/empty |

### Empty state

Centered vertical layout:

> "Nenhuma avaliação publicada ainda."  
> (muted, smaller) "Retorne após o próximo ciclo de aprovação de timesheet."

### Loading state

Skeleton cards (2–3 rows, animated pulse).

### Navigation

The route `/minhas-avaliacoes` is added to the user sidebar navigation (for non-admin users). The sidebar currently shows links to validate, results, submissions, and task-report. A new entry `"Minhas Avaliações"` is added after `"Minhas Submissões"`.
