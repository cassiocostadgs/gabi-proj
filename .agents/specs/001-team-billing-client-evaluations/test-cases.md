# Test cases: Client Evaluations (MAG)

## Preconditions

**Infrastructure:**
- GABI backend running and reachable (development: `http://localhost:8000`; production: deployed EC2 instance).
- SQLite database initialized with all migrations applied: table `client_evaluations` and both partial unique indexes exist.
- Environment variable `MAG_EVAL_API_KEY=test-api-key-123` exported in the backend process.
- Frontend reachable (development: `http://localhost:5173`; production: the deployed URL).

**Seed users (present in the `users` table):**

| Variable | Email | Role |
|---|---|---|
| `$ADMIN_TOKEN` | `admin@db1.com.br` | `is_admin=true`, `is_active=true` |
| `$PROF_TOKEN` | `pedro.santos@db1.com.br` | `is_admin=false`, `is_active=true` |
| `$PROF2_TOKEN` | `carlos.pereira@db1.com.br` | `is_admin=false`, `is_active=true` |

Both tokens are obtained via `POST /auth/login` with the respective credentials before each test.

**Seed team members (present in `team_members`):**
- `user_email = "pedro.santos@db1.com.br"`, `is_active = 1`
- `user_email = "carlos.pereira@db1.com.br"`, `is_active = 1`

**State reset:** Unless a test case explicitly sets up a prior state, the `client_evaluations` table is empty at the start of that case.

---

**Reference email bodies (used across multiple test cases):**

*Body A — valid, per-dimension comment pattern (Pedro Santos, 2025-06):*
```
Competência: 06 / 2025
Colaborador: Pedro Santos
Fornecedor: DB1 Global Software
Total de horas(horas): 168:00
Total de horas(decimal): 168,00

Resultado da avaliação do Profissional:

Avaliação Comportamental: 4
Excelente postura profissional.

Avaliação Técnica: 5
Entregas de alta qualidade.

Avaliação Prazos de entrega: 4
Cumpre os prazos acordados.

OBS: Notas de 1 à 5.
```

*Body B — valid, single Feedback block pattern (Pedro Santos, 2025-07):*
```
Competência: 07 / 2025
Colaborador: Pedro Santos
Fornecedor: DB1 Global Software
Total de horas(horas): 168:00
Total de horas(decimal): 168,00

Resultado da avaliação do Profissional:

Avaliação Comportamental: 3
Avaliação Técnica: 4
Avaliação Prazos de entrega: 3

Feedback: Bom desempenho no geral, com espaço para melhoria técnica.

OBS: Notas de 1 à 5.
```

*Body C — invalid, wrong Fornecedor:*
```
Competência: 06 / 2025
Colaborador: Pedro Santos
Fornecedor: Outro Fornecedor Ltda
Total de horas(horas): 168:00

Avaliação Comportamental: 4
Avaliação Técnica: 5
Avaliação Prazos de entrega: 4

OBS: Notas de 1 à 5.
```

*Body D — valid, Carlos Pereira (ALL CAPS name), 2025-06:*
```
Competência: 06 / 2025
Colaborador: CARLOS PEREIRA
Fornecedor: DB1 Global Software
Total de horas(horas): 160:00
Total de horas(decimal): 160,00

Avaliação Comportamental: 5
Avaliação Técnica: 5
Avaliação Prazos de entrega: 5

Feedback: Desempenho exemplar em todos os critérios.

OBS: Notas de 1 à 5.
```

---

## Story 1 — Manual ingest

### TC-1 (mandatory) — Successful ingest creates a rascunho with correct fields

1. Call `POST /api/admin/client-evaluations/ingest` with header `Authorization: Bearer $ADMIN_TOKEN` and body `{"email_body": "<Body A>"}`.

**Expected:** HTTP `201`. The response includes `status = "rascunho"`, `origem = "manual"`, and `competencia = "2025-06"`.

---

### TC-2 (mandatory) — raw_email_text is preserved verbatim in the database

1. Call `POST /api/admin/client-evaluations/ingest` with `$ADMIN_TOKEN` and `{"email_body": "<Body A>"}`. Note the returned record ID.
2. Call `GET /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN`.

**Expected:** The `raw_email_text` field in the step-2 response is byte-for-byte identical to the string submitted in step 1.

---

### TC-3 (mandatory) — Feedback block pattern: comentario_geral populated, per-dimension comments null

1. Call `POST /api/admin/client-evaluations/ingest` with `$ADMIN_TOKEN` and `{"email_body": "<Body B>"}`. Note the returned ID.
2. Call `GET /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN`.

**Expected:** Step 1 returns HTTP `201`. On step 2: `comportamental_nota = 3`, `tecnica_nota = 4`, `prazo_nota = 3`, `comentario_geral = "Bom desempenho no geral, com espaço para melhoria técnica."`, and all three `*_comentario` fields are `null`.

---

### TC-4 (mandatory) — Ingest with wrong Fornecedor returns 422 and creates no record

1. Call `POST /api/admin/client-evaluations/ingest` with `$ADMIN_TOKEN` and `{"email_body": "<Body C>"}`.
2. Query `client_evaluations` and verify it is empty.

**Expected:** Step 1 returns HTTP `422` with an explicit parse error message identifying the Fornecedor mismatch. Step 2 confirms no record was persisted.

---

### TC-5 (mandatory) — Ingest with a missing score label returns 422 and creates no record

1. Prepare a body identical to Body A but with the line `Avaliação Técnica: 5` entirely removed.
2. Call `POST /api/admin/client-evaluations/ingest` with `$ADMIN_TOKEN` and the modified body.
3. Query `client_evaluations` and verify it is empty.

**Expected:** Step 2 returns HTTP `422` with an explicit parse error message. No record is created.

---

### TC-6 (mandatory) — Ingest with a score value out of range returns 422 and creates no record

1. Prepare a body identical to Body A but with `Avaliação Comportamental: 6`.
2. Call `POST /api/admin/client-evaluations/ingest` with `$ADMIN_TOKEN` and the modified body.

**Expected:** HTTP `422` with an explicit parse error message indicating the invalid score value. No record is persisted.

---

### TC-7 (mandatory) — Auto-link resolves collaborator name to the correct team member

1. Confirm `pedro.santos@db1.com.br` is active in `team_members`.
2. Call `POST /api/admin/client-evaluations/ingest` with `$ADMIN_TOKEN` and `{"email_body": "<Body A>"}` (contains `Colaborador: Pedro Santos`). Note the returned ID.
3. Call `GET /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN`.

**Expected:** Step 2 returns HTTP `201`. On step 3: `match_status = "auto"` and `user_email = "pedro.santos@db1.com.br"`.

---

### TC-8 (recommended) — UI: paste form creates draft that appears in the records table

1. Open a web browser and navigate to `http://localhost:5173`.
2. Log in as `admin@db1.com.br`.
3. Navigate to `/admin/avaliacao-cliente`. Confirm the "Ingestão / Revisão" tab is active.
4. Paste Body A into the textarea (the field with the placeholder about MAG notification emails).
5. Click the "Processar" button.

**Expected:** The textarea is cleared. A new row appears in the records table with `status = "rascunho"`, the professional name "Pedro Santos" in the Profissional column, competência "jun/25", and score cells showing 4, 5, 4 for the three dimensions. No error banner is shown.

---

## Story 2 — Duplicate detection

### TC-9 (mandatory) — Duplicate by resolved (user_email, competencia) is blocked

1. Call `POST /api/admin/client-evaluations/ingest` with `$ADMIN_TOKEN` and Body A. Confirm auto-link sets `user_email = "pedro.santos@db1.com.br"`.
2. Call `POST /api/admin/client-evaluations/ingest` again with `$ADMIN_TOKEN` and Body A (same collaborator, same competência).
3. Query `client_evaluations` for `(user_email = "pedro.santos@db1.com.br", competencia = "2025-06")`.

**Expected:** Step 2 returns HTTP `409`. Step 3 shows exactly one record for that pair.

---

### TC-10 (mandatory) — Duplicate by (nome_extraido, competencia) when user_email is unresolved is blocked

1. Call `POST /api/admin/client-evaluations/ingest` with a body where `Colaborador: Nome Totalmente Desconhecido` and a valid competência (e.g., `06 / 2025`), all other fields valid. The resulting record has `match_status = "nao_vinculado"`.
2. Call `POST /api/admin/client-evaluations/ingest` again with the identical body.

**Expected:** Step 2 returns HTTP `409`. The table contains exactly one record for the unmatched name and `"2025-06"`.

---

### TC-11 (mandatory) — Re-ingest over an aprovado record without confirm_override returns 409

1. Ingest Body A (`$ADMIN_TOKEN`). Approve the record via `POST /api/admin/client-evaluations/{id}/approve`.
2. Call `POST /api/admin/client-evaluations/ingest` with `$ADMIN_TOKEN` and Body A, **without** the `?confirm_override=true` query parameter.

**Expected:** HTTP `409`. The approved record is unchanged. No new record is created.

---

### TC-12 (mandatory) — Re-ingest over an aprovado record with confirm_override creates a second rascunho

1. Ingest Body A and approve the resulting record.
2. Call `POST /api/admin/client-evaluations/ingest` with `$ADMIN_TOKEN` and Body A, appending `?confirm_override=true` to the URL.
3. Query `client_evaluations` for `(user_email = "pedro.santos@db1.com.br", competencia = "2025-06")`.

**Expected:** Step 2 returns HTTP `201`. Step 3 returns two records for that pair: the original with `status = "aprovado"` (unmodified) and a new one with `status = "rascunho"`.

---

### TC-13 (recommended) — UI: duplicate warning banner is displayed when pasting a known email

1. Ingest Body A via the API (leaving the record as `rascunho`).
2. Open a browser and navigate to `/admin/avaliacao-cliente`. Log in as admin.
3. Confirm the "Ingestão / Revisão" tab is active. Paste Body A into the textarea and click "Processar".

**Expected:** An amber warning banner appears below the textarea indicating a duplicate has been detected for the same person and competência. The textarea is not cleared. No second row appears in the records table.

---

## Story 3 — Review and edit

### TC-14 (mandatory) — GET single record returns both raw_email_text and all extracted fields

1. Call `POST /api/admin/client-evaluations/ingest` with `$ADMIN_TOKEN` and Body A. Note the returned ID.
2. Call `GET /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN`.

**Expected:** HTTP `200`. The response contains `raw_email_text` (the full body string) and all extracted fields: `competencia`, `nome_extraido`, `user_email`, `match_status`, `comportamental_nota`, `tecnica_nota`, `prazo_nota`, `comportamental_comentario`, `tecnica_comentario`, `prazo_comentario`, and `comentario_geral`.

---

### TC-15 (mandatory) — PATCH draft persists field changes and records the edit audit trail

1. Ingest Body A with `$ADMIN_TOKEN`. Note the draft ID.
2. Call `PATCH /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN` and `{"comportamental_nota": 3, "comportamental_comentario": "Comentário revisado pelo admin."}`.
3. Call `GET /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN`.

**Expected:** Step 2 returns HTTP `200`. On step 3: `comportamental_nota = 3`, `comportamental_comentario = "Comentário revisado pelo admin."`, `edited_by = "admin@db1.com.br"`, and `edited_at` is a non-null ISO timestamp.

---

### TC-16 (mandatory) — PATCH on an aprovado record returns 409

1. Ingest Body A, link the professional, and approve the record.
2. Call `PATCH /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN` and `{"tecnica_nota": 2}`.

**Expected:** HTTP `409`. The record remains unchanged; `tecnica_nota` retains its approved value.

---

### TC-17 (recommended) — UI: review drawer shows raw text on the left and editable fields on the right

1. Ingest Body A via the API.
2. Open a browser and navigate to `/admin/avaliacao-cliente`. Log in as admin.
3. Confirm the "Ingestão / Revisão" tab is active. Locate the newly created rascunho row in the records table and click its "Revisar" button.

**Expected:** A drawer slides in from the right. The left panel displays the raw email text in a read-only monospace block. The right panel shows editable numeric input fields for the three scores, editable text areas for comments, and a professional selector dropdown already showing "Pedro Santos" (auto-linked). The drawer header displays the collaborator name and competência.

---

## Story 4 — Approve and reject

### TC-18 (mandatory) — Approving a linked rascunho sets status to aprovado and records audit fields

1. Ingest Body A with `$ADMIN_TOKEN`. Confirm `user_email = "pedro.santos@db1.com.br"` is resolved (auto or manual).
2. Call `POST /api/admin/client-evaluations/{id}/approve` with `$ADMIN_TOKEN`.
3. Call `GET /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN`.

**Expected:** Step 2 returns HTTP `200`. On step 3: `status = "aprovado"`, `reviewed_by = "admin@db1.com.br"`, and `reviewed_at` is a non-null ISO timestamp.

---

### TC-19 (mandatory) — Subsequent PATCH on an approved record returns 409

1. Ingest Body A, link the professional, and approve the record (TC-18).
2. Call `PATCH /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN` and `{"tecnica_nota": 2}`.

**Expected:** HTTP `409`. The record is immutable; no field is changed.

---

### TC-20 (mandatory) — Approving a record with user_email = null returns 422

1. Ingest a body with `Colaborador: Nome Totalmente Desconhecido` (unmatched — no `team_member`), resulting in `user_email = null` and `match_status = "nao_vinculado"`.
2. Call `POST /api/admin/client-evaluations/{id}/approve` with `$ADMIN_TOKEN`.

**Expected:** HTTP `422`. The record remains `status = "rascunho"`. The response message indicates that the professional link must be resolved before approval.

---

### TC-21 (mandatory) — Rejecting a rascunho sets status to rejeitado

1. Ingest Body A with `$ADMIN_TOKEN`. Note the draft ID.
2. Call `POST /api/admin/client-evaluations/{id}/reject` with `$ADMIN_TOKEN`.
3. Call `GET /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN`.

**Expected:** Step 2 returns HTTP `200`. On step 3: `status = "rejeitado"`.

---

### TC-22 (mandatory) — Rejected record is excluded from the professional view and the dashboard

1. Ingest Body A, link to `pedro.santos@db1.com.br`, and reject the record.
2. Call `GET /api/my-evaluations` with `$PROF_TOKEN`.
3. Call `GET /api/admin/client-evaluations/dashboard` with `$ADMIN_TOKEN`.

**Expected:** Step 2 returns `{evaluations: []}` (no records visible to the professional). Step 3 returns data that does not contain any entry derived from the rejected record.

---

### TC-23 (recommended) — UI: Approve button is disabled and shows a tooltip when professional is unlinked

1. Ingest a body with an unmatched collaborator name via the API.
2. Open a browser and navigate to `/admin/avaliacao-cliente`. Log in as admin.
3. Locate the `nao_vinculado` row in the records table and click its "Revisar" button.
4. Observe the drawer footer.

**Expected:** The "Aprovar" button in the drawer footer is visually disabled (non-clickable). A tooltip is visible on hover indicating the professional must be linked before approval is possible.

---

### TC-24 (recommended) — UI: reject confirmation popover prevents accidental rejection

1. Ingest Body A via the API.
2. Navigate to `/admin/avaliacao-cliente` in a browser. Log in as admin.
3. Click "Revisar" for the rascunho row.
4. In the drawer footer, click the "Rejeitar" button.
5. In the confirmation popover that appears, click "Cancelar" (or dismiss it without confirming).

**Expected:** The popover is dismissed. The record remains `status = "rascunho"`. No reject request is sent to the API.

---

## Story 5 — Unlinked professional

### TC-25 (mandatory) — Ingesting an unmatched name sets match_status to nao_vinculado and user_email to null

1. Call `POST /api/admin/client-evaluations/ingest` with `$ADMIN_TOKEN` and a valid body where `Colaborador: Nome Totalmente Desconhecido` (no corresponding `team_member`). Note the returned ID.
2. Call `GET /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN`.

**Expected:** Step 1 returns HTTP `201`. On step 2: `match_status = "nao_vinculado"` and `user_email = null`.

---

### TC-26 (mandatory) — GET list includes nao_vinculado records

1. Ingest a body with an unmatched collaborator name (TC-25 setup).
2. Call `GET /api/admin/client-evaluations` with `$ADMIN_TOKEN`.

**Expected:** HTTP `200`. The response list includes the record with `match_status = "nao_vinculado"`.

---

### TC-27 (mandatory) — PATCH to set user_email changes match_status to manual

1. Ingest a body with an unmatched collaborator name (TC-25 setup). Note the draft ID.
2. Call `PATCH /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN` and `{"user_email": "pedro.santos@db1.com.br"}`.
3. Call `GET /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN`.

**Expected:** Step 2 returns HTTP `200`. On step 3: `match_status = "manual"` and `user_email = "pedro.santos@db1.com.br"`.

> Note: TC-20 covers the attempt to approve while `user_email` is still `null` (the `nao_vinculado` case).

---

### TC-28 (recommended) — UI: alert badge is displayed for nao_vinculado records in the table

1. Ingest a body with an unmatched collaborator name via the API.
2. Open a browser and navigate to `/admin/avaliacao-cliente`. Log in as admin.
3. Confirm the "Ingestão / Revisão" tab is active. Locate the newly created row.

**Expected:** The "Profissional" column for the unlinked record shows an alert indicator (⚠ Não vinculado), visually distinguishing it from records where the professional has been resolved.

---

## Story 6 — Admin dashboard

### TC-29 (mandatory) — Dashboard with no filters returns all approved records across all dimensions

1. Ingest and approve Body A (pedro.santos, 2025-06) and Body D (carlos.pereira, 2025-06, using `$ADMIN_TOKEN`).
2. Call `GET /api/admin/client-evaluations/dashboard` with `$ADMIN_TOKEN` and no query parameters.

**Expected:** HTTP `200`. The response includes aggregated score data for both professionals for the `2025-06` competência, covering all three dimensions (comportamental, técnica, prazo). No `rascunho` or `rejeitado` records are present in the response.

---

### TC-30 (mandatory) — Dashboard filters by user_email returns only that professional's records

1. Ingest and approve Body A (pedro.santos) and Body D (carlos.pereira).
2. Call `GET /api/admin/client-evaluations/dashboard?user_email=pedro.santos%40db1.com.br` with `$ADMIN_TOKEN`.

**Expected:** HTTP `200`. The response includes only Pedro Santos's records. No data for Carlos Pereira appears.

---

### TC-31 (mandatory) — Dashboard filters by competencia_from and competencia_to returns only records in range

1. Ingest and approve Body A (pedro.santos, 2025-06).
2. Ingest and approve a second body for pedro.santos with `Competência: 07 / 2025` and valid scores.
3. Call `GET /api/admin/client-evaluations/dashboard?competencia_from=2025-07&competencia_to=2025-07` with `$ADMIN_TOKEN`.

**Expected:** HTTP `200`. Only the `2025-07` evaluation appears in the response. The `2025-06` evaluation is excluded.

---

### TC-32 (mandatory) — Dashboard excludes rascunho and rejeitado records

1. Ingest Body A and leave it as `rascunho`.
2. Ingest a second body for pedro.santos with `Competência: 07 / 2025` and reject it.
3. Call `GET /api/admin/client-evaluations/dashboard` with `$ADMIN_TOKEN`.

**Expected:** HTTP `200`. Neither the `rascunho` (2025-06) nor the `rejeitado` (2025-07) record appears in the response. If no approved records exist, the response returns an empty dataset without an error.

---

### TC-33 (recommended) — UI: dashboard tab renders a line chart with approved data

1. Ingest and approve Body A (pedro.santos, 2025-06) via the API.
2. Open a browser and navigate to `/admin/avaliacao-cliente`. Log in as admin.
3. Click the "Dashboard" tab.
4. In the "Profissional" selector, choose Pedro Santos. Click "Aplicar".

**Expected:** A line chart is displayed with three lines labeled Comportamental, Técnica, and Prazo. The x-axis shows the competência label "jun/25". The y-axis is in the 1–5 range. The plotted points correspond to scores 4, 5, 4 respectively. A summary table below the chart lists Pedro Santos's records.

---

## Story 7 — Professional view

### TC-34 (mandatory) — GET /api/my-evaluations returns own approved records in competencia DESC order

1. Ingest and approve Body A (pedro.santos, 2025-06).
2. Ingest and approve Body B (pedro.santos, 2025-07).
3. Call `GET /api/my-evaluations` with `$PROF_TOKEN`.

**Expected:** HTTP `200`. The response is `{evaluations: [...]}` containing exactly two records. The first has `competencia = "2025-07"` and the second has `competencia = "2025-06"` (descending order). Both include the three scores and the applicable comments.

---

### TC-35 (mandatory) — GET /api/my-evaluations with no approved records returns empty array

1. Ingest Body A (leave it as `rascunho` — do not approve).
2. Call `GET /api/my-evaluations` with `$PROF_TOKEN`.

**Expected:** HTTP `200` with `{evaluations: []}`. No error is returned.

---

### TC-36 (mandatory) — rascunho and rejeitado records are never returned in /api/my-evaluations

1. Ingest Body A (rascunho, pedro.santos, 2025-06). Do not approve.
2. Ingest Body B (pedro.santos, 2025-07) and reject it.
3. Ingest a third body for pedro.santos with `Competência: 08 / 2025` (valid scores) and approve it.
4. Call `GET /api/my-evaluations` with `$PROF_TOKEN`.

**Expected:** HTTP `200`. The response contains exactly one record: the approved `2025-08` evaluation. The `rascunho` (2025-06) and `rejeitado` (2025-07) records do not appear.

---

### TC-37 (recommended) — UI: /minhas-avaliacoes shows evaluation cards with score badges and comments

1. Ingest and approve Body A (pedro.santos, 2025-06) via the API.
2. Open a browser and navigate to `http://localhost:5173`.
3. Log in as `pedro.santos@db1.com.br` (non-admin).
4. Navigate to `/minhas-avaliacoes`.

**Expected:** A card for "Junho / 2025" is displayed. Three score badges are visible: "Comportamental: 4", "Técnica: 5", "Prazo: 4". The badges for scores ≥ 4 are displayed in green. Per-dimension comments are shown below the badges.

---

### TC-38 (recommended) — UI: empty state is shown when the professional has no approved evaluations

1. Ensure no approved `client_evaluations` records exist for `pedro.santos@db1.com.br`.
2. Open a browser and navigate to `/minhas-avaliacoes`. Log in as `pedro.santos@db1.com.br`.

**Expected:** The page shows an empty state message and no evaluation cards. No error is displayed.

---

## Story 8 — Access isolation

### TC-39 (mandatory) — Non-admin JWT on an admin endpoint returns 403

1. Call `GET /api/admin/client-evaluations` with header `Authorization: Bearer $PROF_TOKEN`.

**Expected:** HTTP `403`.

---

### TC-40 (mandatory) — Unauthenticated request on an admin endpoint returns 401

1. Call `GET /api/admin/client-evaluations` with no `Authorization` header.

**Expected:** HTTP `401`.

---

### TC-41 (mandatory) — Professional cannot retrieve another professional's evaluations

1. Ingest and approve Body A (pedro.santos, 2025-06).
2. Ingest and approve Body D (carlos.pereira, 2025-06).
3. Call `GET /api/my-evaluations` with `$PROF2_TOKEN` (carlos.pereira's token).

**Expected:** HTTP `200`. The response contains only Carlos Pereira's record. Pedro Santos's record does not appear.

---

### TC-42 (mandatory) — Unauthenticated request on /api/my-evaluations returns 401

1. Call `GET /api/my-evaluations` with no `Authorization` header.

**Expected:** HTTP `401`.

---

### TC-43 (recommended) — UI: non-admin user is redirected away from /admin/avaliacao-cliente

1. Open a browser and log in as `pedro.santos@db1.com.br` (non-admin).
2. Navigate directly to `/admin/avaliacao-cliente`.

**Expected:** The browser is redirected away from the admin route (to `/validate`, the non-admin home). The admin ingest screen is not displayed.

---

## RF12 — Automated ingest (n8n integration endpoint)

### TC-44 (mandatory) — Valid API key and valid body creates a rascunho with origem = automacao

1. Call `POST /api/integrations/mag-evaluation` with header `X-Api-Key: test-api-key-123` and body:
   ```json
   {
     "content": "<plain text of Body A>",
     "subject": "Notificação ao Fornecedor: Pedro Santos - 06 / 2025 - Timesheet aprovado - MAG Seguros",
     "internetMessageId": "msg-id-001",
     "receivedDateTime": "2025-07-01T09:00:00Z",
     "from": "notasti@mag.com.br"
   }
   ```
2. Call `GET /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN` using the ID returned in step 1.

**Expected:** Step 1 returns HTTP `201` with `{"ok": true, "id": <int>}`. On step 2: `status = "rascunho"`, `origem = "automacao"`, and `email_message_id = "msg-id-001"`.

---

### TC-45 (mandatory) — email_message_id is persisted correctly in the database

1. Perform step 1 of TC-44 and note the returned ID.
2. Query the `client_evaluations` table for the returned ID directly.

**Expected:** The row has `email_message_id = "msg-id-001"` and `origem = "automacao"`.

---

### TC-46 (mandatory) — Invalid API key returns 401

1. Call `POST /api/integrations/mag-evaluation` with header `X-Api-Key: wrong-key` and the body from TC-44.

**Expected:** HTTP `401`. No record is created in `client_evaluations`.

---

### TC-47 (mandatory) — Missing X-Api-Key header returns 401

1. Call `POST /api/integrations/mag-evaluation` with **no** `X-Api-Key` header and the body from TC-44.

**Expected:** HTTP `401`. No record is created.

---

### TC-48 (mandatory) — Same internetMessageId submitted twice is idempotent

1. Call `POST /api/integrations/mag-evaluation` with `X-Api-Key: test-api-key-123` and `internetMessageId = "msg-id-idem"` (body otherwise identical to TC-44). Note the returned ID.
2. Call `POST /api/integrations/mag-evaluation` again with the identical body and the same `internetMessageId = "msg-id-idem"`.
3. Query `client_evaluations` for rows where `email_message_id = "msg-id-idem"`.

**Expected:** Step 2 returns HTTP `200` with `{"ok": true, "skipped": true}`. Step 3 returns exactly one record with that `email_message_id`.

---

### TC-49 (mandatory) — HTML email body is stripped and the record is created successfully

1. Build an HTML-wrapped version of Body A (e.g., wrap each text line in `<p>` tags and separate dimensions with `<br>` tags, simulating Outlook's rendering format).
2. Call `POST /api/integrations/mag-evaluation` with `X-Api-Key: test-api-key-123` and `"content": "<the HTML body>"` (other fields as in TC-44 with a different `internetMessageId`).
3. Call `GET /api/admin/client-evaluations/{id}` with `$ADMIN_TOKEN` using the returned ID.

**Expected:** Step 2 returns HTTP `201`. On step 3: scores are correctly extracted (`comportamental_nota = 4`, `tecnica_nota = 5`, `prazo_nota = 4`) and `raw_email_text` contains the plain-text version of the body with no HTML tags.

---

### TC-50 (mandatory) — Unparseable automated body returns 422 and creates no record

1. Call `POST /api/integrations/mag-evaluation` with `X-Api-Key: test-api-key-123` and `"content": "<p>Este texto não contém os campos obrigatórios da avaliação.</p>"`.

**Expected:** HTTP `422` with an explicit parse error message. No record is created in `client_evaluations`.

---

### TC-51 (mandatory) — Automated ingest also detects duplicates by internetMessageId before parsing

1. Call `POST /api/integrations/mag-evaluation` with `X-Api-Key: test-api-key-123`, `internetMessageId = "msg-id-dup"`, and the body from TC-44. Wait for `201`.
2. Call `POST /api/integrations/mag-evaluation` again with the same `internetMessageId = "msg-id-dup"` but a **different** `content` (e.g., different competência or collaborator name).

**Expected:** Step 2 returns HTTP `200` with `{"ok": true, "skipped": true}`. The deduplication by `email_message_id` takes priority and no second record is created — the content of the body is never parsed.
