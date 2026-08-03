# Plan: Client Evaluations (MAG)

## Stack and structure

Python 3.11 / FastAPI / SQLite backend and React 18 / TypeScript / Vite frontend — same stack as the rest of GABI. No new runtime dependencies are introduced for P0: HTML stripping uses `re` and `html` from the Python standard library; Chart.js and react-chartjs-2 are already installed.

### New backend files

| File | Role |
|---|---|
| `web/client_evaluation_engine.py` | Pure parser module — no I/O, no FastAPI imports |
| `web/db.py` | SQLite `_db()` context manager extracted from `main.py` (refactoring step) |
| `web/repositories/client_evaluation_repository.py` | All SQLite reads/writes for this domain |
| `tests/test_client_evaluation_engine.py` | Unit tests for the pure parser |
| `tests/test_client_evaluations.py` | Integration tests for all 9 new endpoints |

`main.py` receives 9 new route handlers and an expanded `_init_db()` block. No other existing files have logic changes; `main.py` gains one import (`from db import _db` replacing the inline definition).

### New frontend files

| File | Role |
|---|---|
| `frontend/src/services/client-evaluation.service.ts` | Axios API client for all new endpoints |
| `frontend/src/pages/admin/sections/AvaliacaoClienteSection.tsx` | Admin section: ingest + review tab and dashboard tab |
| `frontend/src/pages/my-evaluations/MyEvaluationsPage.tsx` | Professional self-service history |

`frontend/src/types/index.ts` gains three new interfaces.
`frontend/src/App.tsx` gains two new routes.

## Technical decisions

Details, alternatives, and confirmation provenance in [`research.md`](./research.md).

### Parser module (`client_evaluation_engine.py`)

Pure Python, stdlib only (`re`, `html`, `unicodedata`). Regex extracts labeled fields from plain text in a single pass. Both comment patterns (per-dimension and single `Feedback:` block) are detected by the presence or absence of the `Feedback:` label. Any missing required field or score outside `[1, 5]` raises `ValueError` with a descriptive message — no silent default is ever set.

Imports `norm()` and `PARTICLES` from `gabi_engine` for name normalization (read-only cross-module call, no side-effects). `match_name()` is also imported from `gabi_engine` and called via the email-prefix adapter below.

### `match_name()` adapter

`match_name(full, task_names)` expects dot-notation identifiers (e.g., `"pedro.santos"`). Team members are stored with `user_email` like `"pedro.santos@db1.com.br"`. The adapter:

1. Extracts the prefix before `@` from each active `user_email` → `"pedro.santos"` (already in dot-notation).
2. Passes the list of prefixes as `task_names` to `match_name()`.
3. Maps the returned prefix back to the original `user_email`.

Helper: `_email_to_prefix(email: str) -> str = email.split("@")[0]`. No modification to `gabi_engine.py`. See `research.md` for rationale and edge cases.

### HTML stripping

`re.sub(r'<[^>]+>', '', content)` followed by `html.unescape()` — Python stdlib, no new dependency. Applied at the top of the automated ingest handler before the content is passed to the parser. The manual paste path receives plain text directly from the admin (no stripping needed).

### API key authentication

New `_require_api_key(request: Request)` function in `main.py`:

```python
def _require_api_key(request: Request) -> None:
    key = request.headers.get("X-Api-Key", "")
    expected = os.getenv("MAG_EVAL_API_KEY", "")
    if not expected or key != expected:
        raise HTTPException(status_code=401, detail="API key inválida ou ausente")
```

Applied as `Depends(_require_api_key)` exclusively to `POST /api/integrations/mag-evaluation`. No new library; follows the same env-var pattern as `SECRET_KEY` / `ADMIN_EMAIL`.

### `_db()` extraction to `web/db.py`

`_db()` is currently defined inline in `main.py`. Extracting it to `web/db.py` enables `client_evaluation_repository.py` to import it without a circular dependency. `main.py` changes one line: `from db import _db`. All existing SQLite behavior is unchanged. This is the minimum refactoring needed to honor `AGENTS.md`'s "repositories/ is the only contact point with external databases" principle.

### Admin routing

The existing admin route is `/admin/:section` → `AdminPage`. The new section slug is `"avaliacao-cliente"`. The dashboard view is a **tab within the same section component** (`AvaliacaoClienteSection.tsx`), not a separate route — this keeps the routing uniform and avoids adding nested admin routes. Tabs: "Ingestão / Revisão" (default) | "Dashboard".

### Dashboard chart

`Line` chart (react-chartjs-2 `<Line>`). Three datasets: comportamental, técnica, prazo — one line per dimension. X-axis: competência labels; y-axis: score 1–5. `LineController` and `LineElement` are already registered in `PersonCard.tsx` — no additional Chart.js registration needed.

### Squad filter — RESOLVED (no-squad-v1)

The dashboard filter by squad is **removed from v1** scope. Gap `squad-data-source` was answered by the requester: squad grouping is deferred to a future spec because `team_members` has no `squad` column and adding one is out of scope for this unit. The v1 dashboard is filterable by professional (`user_email`) and competência range only. No `ALTER TABLE` on `team_members` is needed. Squad filtering becomes a future spec when a `squad` concept is introduced to the data model.

### Optional artifacts decision

| Artifact | Decision | Reason |
|---|---|---|
| `data-model.md` | Exists (spec phase) | No changes needed from the plan phase |
| `research.md` | **Generated** | Non-trivial decisions (HTML stripping approach, match_name adapter, _db extraction) warrant rationale and confirmation provenance |
| `contracts/` | Waived | Per `AGENTS.md`, FastAPI's built-in OpenAPI at `/docs` is the sole API documentation form; n8n integration schema documented inline below |
| `ui/screens.md` | **Generated** | Three screens with non-trivial states (review drawer dual-panel, chart with pending squad filter, professional empty state) — detail helps avoid ambiguity during implementation |

## Data model

Full schema, index DDL, and deduplication rules in [`data-model.md`](./data-model.md) (authored in the spec phase).

**Migration path**: a new `CREATE TABLE IF NOT EXISTS client_evaluations (...)` block is added to `_init_db()` in `main.py`, followed immediately by the two partial unique index statements:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_user_competencia
  ON client_evaluations (user_email, competencia)
  WHERE user_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_message_id
  ON client_evaluations (email_message_id)
  WHERE email_message_id IS NOT NULL;
```

SQLite's `IF NOT EXISTS` ensures forward-safety on existing deployments with no data loss. No `ALTER TABLE` on existing tables is required — the squad gap was resolved as `no-squad-v1`, so `team_members` remains unchanged.

## External contracts

No separate contract files — FastAPI's auto-generated OpenAPI at `/docs` is the sole documentation form (per `AGENTS.md`).

For implementation reference, the `POST /api/integrations/mag-evaluation` schema:

**Request body** (`application/json`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `content` | string | yes | Email body — plain text or HTML; GABI strips HTML tags |
| `subject` | string | yes | Email subject line |
| `internetMessageId` | string | yes | Outlook message ID; used for idempotency |
| `receivedDateTime` | string | yes | ISO 8601 timestamp |
| `from` | string | yes | Sender email address |

**Responses**:

| HTTP | Body | Condition |
|---|---|---|
| 201 | `{"ok": true, "id": <int>}` | Draft created successfully |
| 200 | `{"ok": true, "skipped": true}` | Same `internetMessageId` already exists (idempotent) |
| 401 | `{"detail": "..."}` | Missing or invalid `X-Api-Key` |
| 422 | `{"detail": "<parser error message>"}` | Parse failure (malformed body, missing field, invalid score) |

## Interface

Details in [`ui/screens.md`](./ui/screens.md). Summary:

**Screen 1 — Admin Ingest & Review** (`/admin/avaliacao-cliente`, tab "Ingestão / Revisão"):
- Textarea paste area + "Processar" button; inline error/warning banners for parse failure and duplicate detection
- Records table with status badges and `⚠ Não vinculado` alert for unlinked professionals
- Review drawer: left panel = read-only raw email text, right panel = editable extracted fields (scores, comments, professional selector); approve (disabled when unlinked) and reject actions in drawer footer

**Screen 2 — Admin Dashboard** (`/admin/avaliacao-cliente`, tab "Dashboard"):
- Filter bar: professional selector, competência from/to (squad filter removed — deferred to future spec)
- Line chart: 3 datasets (one per dimension), competência on x-axis, score 1–5 on y-axis
- Summary table below chart

**Screen 3 — Professional My Evaluations** (`/minhas-avaliacoes`, `ProtectedRoute`):
- Competência cards sorted newest-first; score badges + comments; empty state message when no approved data

## Testing strategy

Existing infrastructure: `pytest` + FastAPI `TestClient` against in-memory SQLite (never mock the database, per `AGENTS.md`); Vitest for frontend.

| Level | Scope | File |
|---|---|---|
| Unit — backend | Parser: 4 real email samples, both comment patterns, all failure cases | `tests/test_client_evaluation_engine.py` |
| Integration — backend | All 9 endpoints: happy path + all acceptance-criteria error paths | `tests/test_client_evaluations.py` |
| Unit — frontend | Service functions, key component states (empty, loading, unlinked professional) | Vitest, co-located |
| E2E | Out of scope | — |

Coverage target: ≥ 80% overall (per `AGENTS.md`). The parser module (pure functions, no I/O) is expected to reach ≥ 95% line coverage. Each task that delivers backend logic includes its tests in the same task.

## Impact on the authoritative documentation

This spec creates a new bounded context with no changes to existing domain behaviors. Two deliberate documentation additions:

1. **New domain skill** — `.agents/skills/client-evaluation/SKILL.md` must be authored to capture business rules, data model, lifecycle, and API contracts of the new domain. Backed by: this unit introduces the domain (recorded decision). Becomes a task in `tasks.md`.

2. **`AGENTS.md` Business Domains table** — A new row for domain 5 `client-evaluation` is added. Backed by: the new domain is a deliverable of this spec. Becomes a task in `tasks.md`.

No existing skill is modified.
