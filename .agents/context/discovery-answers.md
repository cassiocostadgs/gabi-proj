---
name: discovery-answers
description: Functional discovery context for the GABI maintenance project — objective, scope, no user-declared restrictions, validated cross-cutting decisions (auth, lint, testing, Oracle thick mode, validation tolerance, LLM chat statelessness, TL permission derivation), and all gaps resolved (documentation forms: no additional forms beyond FastAPI built-in /docs).
metadata:
  author: clovis-cli
  responsibility: "Durable memory of the functional-discovery context and decisions: objective, scope, declared restrictions, validated cross-cutting decisions (with destination), documentation forms to maintain and the log of human decisions resolved in the gap loop. Source re-read by the following stages; its restrictions take precedence over later inferences."
---

# Discovery Answers — GABI

## Objective

Perform functional discovery of the GABI project (Gap Auditor of Billed Input) to map business domains, identify bounded contexts, and prepare artifacts for skill generation. The project validates whether hours recorded in the GA (Gestão de Apontamentos) time-tracking spreadsheet match what was billed in the Task system (Oracle DB).

Project mode: **maintenance** — whole-project scope.

## Scope

- **Project type**: Maintenance
- **Scope**: Whole project
- **Target directory**: `/Users/tiagohlatki/Developer/GABI`
- **Stack**: Python 3.11 + FastAPI (backend), React 18 + TypeScript + Vite (frontend), SQLite (internal data), Oracle 11g (Task DB read-only)

## Restrictions Declared by the User

None declared.

## Documentation Forms

- **FastAPI OpenAPI/Swagger**: Built-in, always-accurate API contract available at `/docs` — relied on as the sole API documentation form.
- **Postman collections**: Not maintained (no evidence in project; overhead not justified at this scale).
- **Storybook**: Not maintained (UI uses Shadcn/ui + Tailwind CSS v4; components documented upstream).
- **ADRs**: Not maintained (`CLAUDE.md` already captures architectural decisions for this single-team project).
- **Decision**: No additional documentation forms beyond FastAPI's built-in OpenAPI at `/docs`. Convention → `AGENTS.md`. (See gap resolution log.)

## Validated Cross-Cutting Decisions

| Decision | Destination | Evidence |
|----------|-------------|----------|
| Auth: JWT HS256, 8-hour expiry, secret from `SECRET_KEY` env var or persisted `.secret_key` file | Convention → `AGENTS.md` | `web/main.py` lines 41–70 |
| Python lint/format: Ruff (`ruff check` + `ruff format`, line-length 100) | Convention → `AGENTS.md` | `CLAUDE.md`, `pyproject.toml` |
| TypeScript lint/format: ESLint + Prettier, `--max-warnings=0` | Convention → `AGENTS.md` | `CLAUDE.md` |
| Testing: SQLite real in-memory, never mock the database (past prod divergence incident) | Convention → `AGENTS.md` | `CLAUDE.md` testing section |
| Oracle: thick mode mandatory — Oracle 11g does not support thin driver | Convention → `AGENTS.md` | `web/core/oracle.py`, `CLAUDE.md` |
| Validation tolerance: named constant `TOLERANCE = 0.1` (hours) — never inline literal | Convention → `AGENTS.md` | `web/gabi_engine.py` line 266 |
| Brazilian holidays: always calculated algorithmically via `get_holidays()`, never hardcoded | Convention → `AGENTS.md` | `web/gabi_engine.py` lines 108–123, `CLAUDE.md` |
| Working-day logic must not be replicated outside `gabi_engine.py` | Convention → `AGENTS.md` | `CLAUDE.md` business rules section |
| TypeScript: no `any` — use `unknown` with type guard | Convention → `AGENTS.md` | `CLAUDE.md` |
| Commit/push gate: ruff → eslint → pytest → vitest → Sonar (`localhost:9000`) before every push | Convention → `AGENTS.md` | `CLAUDE.md` commit flow section |
| Backend layer invariant: no business logic in routers; no SQL in services; repositories are the only DB contact point | Convention → `AGENTS.md` | `CLAUDE.md` architecture invariant section |
| CORS: all origins/methods/headers allowed (internal corporate tool) | Convention → `AGENTS.md` | `web/main.py` line 75 |
| Competência format: `"YYYY-MM"` string (e.g., `"2025-07"`) throughout backend and frontend | Convention → `AGENTS.md` | `web/main.py`, `frontend/src/types/index.ts` |
| API documentation: FastAPI's built-in OpenAPI/Swagger at `/docs` is the sole API documentation form; no Postman, Storybook or ADRs are maintained | Convention → `AGENTS.md` | Decided in gap-documentation-forms round |
| LLM integration: Claude Messages API (Anthropic Python SDK) with tool use — engine returns either `ask_question` or `propose_evaluation`; the engine module (`tl_evaluation_engine.py`) must be pure (no I/O), matching the existing pattern of `gabi_engine.py` | Convention → `AGENTS.md` | `.agents/specs/002-tl-evaluation/spec.md` — domain boundary and risks sections |
| Chat statelessness: no server-side session for TL evaluation chat; the client sends the complete message history on every HTTP turn; `POST /api/tl-evaluations/chat` is fully stateless | Convention → `AGENTS.md` | `.agents/specs/002-tl-evaluation/spec.md` — observation on chat statelessness |
| TL permission is derived, not stored: a user is a Tech Lead if they appear in `squads.tech_lead_user_email`; no `is_tech_lead` flag is added to the `users` table | Convention → `AGENTS.md` | `.agents/specs/002-tl-evaluation/spec.md` — observation on TL as derived permission |
| Anthropic API key: a dedicated `ANTHROPIC_API_KEY` environment variable is used exclusively for TL Evaluation chat; its cost is tracked separately from GABI's other infrastructure | Convention → `AGENTS.md` | `.agents/specs/002-tl-evaluation/spec.md` — scope (in) and risks sections |

## Gap Resolution Log

### gap-documentation-forms
- **Status**: RESOLVED.
- **Question**: FastAPI's built-in OpenAPI/Swagger is implicitly available at `/docs`. No additional documentation forms (Postman, Storybook, ADRs) were found. Should any additional forms be actively maintained?
- **Human answer**: "Recomende" (requested a recommendation).
- **Decision**: No additional documentation forms are maintained. FastAPI's auto-generated OpenAPI at `/docs` is sufficient for this internal corporate tool with a single development team. Rationale: the OpenAPI spec is always in sync with the code at zero cost; Postman would duplicate it; Storybook adds overhead for a Shadcn/ui-based UI (components already documented upstream); `CLAUDE.md` already fulfills the ADR role for this project's scale. Convention recorded in `AGENTS.md`; no `technical-skill` justified.
