# Spec: TL Evaluation — Prompt Ownership & Admin Editing

## Overview

Extends the `tl-evaluation` domain (spec `002-tl-evaluation`) so the admin — the declared owner of the AI evaluation prompt — gets full visibility into exactly what is sent to the Claude Messages API on every chat turn, and can edit most of it directly, without a deploy. Today the entire system prompt is one hardcoded Python string (`_SYSTEM_PROMPT` in `web/tl_evaluation_engine.py`) with zero runtime visibility and zero runtime editability — the admin has never seen it rendered, and any tone/wording tweak requires a PR and a deploy.

## Domain

Not a new bounded context — extends `tl-evaluation` (order 6 in `AGENTS.md`'s Business Domains table). No change to that table or to the domain's scope/personas from `002-tl-evaluation/spec.md`.

## Background — how this scope was reached

Design discussion (not repeated in full here — see conversation history) rejected two simpler shapes before arriving at this one:

1. **A single free-text "additional instructions" field bolted onto the existing hardcoded prompt.** Gives the admin a place to add new content (e.g. "pergunte se a câmera fica ligada nas calls") but no visibility into the rules that already exist, and no way to adjust their wording.
2. **A flat file on disk, edited directly, read fresh per request.** Rejected because it doesn't fit GABI's deploy model (`AGENTS.md`: push to `main` → CI → EC2 `git pull` → `systemctl restart gabi`). A git-tracked file still goes through the full pipeline to take effect; an untracked file requires SSH access on the production box, with no audit trail and no way for a non-engineer admin to use it.
3. **Treating every section of the prompt as equally safe to expose as free text.** A section-by-section technical review (see "Editability matrix" below) found that the *Regra de voz* section is not just policy text — its wording is the literal human-readable form of `_FORBIDDEN_VOICE_MARKERS`, a Python tuple checked post-hoc by `_check_voice_rule()`. Free-text editing that section independently of the validator risks silent drift (prompt says one thing, validator enforces another) up to and including a runtime `ValueError` that breaks an in-progress evaluation for a TL.

## Decisions

| Decision | Resolution |
|---|---|
| Who can access this feature | **Admin only.** No TL-facing route, no TL-facing UI surface. The TL only experiences the *effect* of the prompt (different questions, different tone), never the configuration screen. |
| Storage mechanism | **Database-backed** (SQLite, `web/users.db`), not a flat file. A DB read is genuinely deploy-free and auditable (`updated_by`/`updated_at` per row); a file is neither, given how GABI ships. |
| *Escala de referência* | **Out of scope, stays hardcoded.** The 1–5 range is coupled to the `propose_evaluation` tool schema's `minimum`/`maximum` and to the `INTEGER` columns in `tl_evaluations`. Changing it is a structural change (effectively a new scoring model), not a wording tweak — same category as adding a 4th dimension. |
| *Papel do assistente*, *Fluxo de trabalho*, *Instrução de resposta* | **Admin-editable**, simple audit line (`updated_by`/`updated_at`), no dedicated version-history panel. Technical coupling is low: *Fluxo*/*Instrução* name the tools `ask_question`/`propose_evaluation` in prose, but no code parses that prose — worst case of a bad edit is silent behavioral degradation, not a crash. *Instrução de resposta* additionally has a real backstop: the API call already sets `"tool_choice": {"type": "any"}`, so a tool-use response is guaranteed regardless of this text. |
| *Gate A*, *Gate B*, *Regras de geração* | **Admin-editable, with version history.** These encode business/calibration policy with **zero code-side enforcement** — no validator confirms a score-5 evaluation actually cited an externally-recognized fact. A weakened edit degrades calibration silently, with no automated safety net. Because this policy attaches to real people's monthly records, admins need to reconstruct "what did this rule say in March" months later — hence full history, not just a last-edit line. |
| *Regra de voz* | **Not free text.** Refactored into a structured list of forbidden words/expressions (`tl_evaluation_voice_forbidden_words`), which is the single source read both by the rendered prompt text and by `_check_voice_rule()`. This removes the prompt/validator drift risk by construction instead of relying on admin discipline. |
| Número máximo de rodadas de pergunta (hoje fixo em 2) | **Explicitly not exposed** as a setting in this round — stays embedded in the *Fluxo de trabalho* section's prose. Revisit only if a concrete need surfaces later. |
| "Instruções adicionais" (the original single-field idea) | Folded into the same generic mechanism as one more row, `section_key = 'adicionais'` — not a separate table. Rendered last, after all structural sections, before the dynamic role/context sections. |
| Transparency beyond static text | A read-only **simulator**: admin picks squad + member + competência and gets the exact `system` string `build_chat_request()` would send for that evaluation, including the dynamic *Papel avaliado*/*Contexto da avaliação* sections — no Anthropic API call, pure composition against real data. |
| Engine purity | `tl_evaluation_engine.py` keeps the existing "pure, no I/O" invariant (documented in `.agents/skills/tl-evaluation/SKILL.md`). All DB reads happen in the repository/router layer; the engine's functions take sections/forbidden-words as plain arguments, the same way `build_chat_request()` already takes `role`/`member_context` today. |

## Editability matrix (authoritative for implementation)

| Section | Real technical coupling | Failure mode of a bad edit | Treatment |
|---|---|---|---|
| Papel do assistente | None — free prose, not parsed by code | Cosmetic drift only | Editable, simple audit |
| Escala de referência | Tool schema `minimum`/`maximum`, `tl_evaluations` integer columns | N/A — not editable | **Locked, code-only** |
| Fluxo de trabalho | Names `ask_question`/`propose_evaluation` in prose; nothing validates the prose | Silent behavioral degradation (harder question triage), no crash | Editable, simple audit |
| Gate A | **None in code** — 100% prompt-enforced | Silent calibration drift; nota 5 could be granted without external evidence, undetected | Editable, versioned |
| Gate B | **None in code** — 100% prompt-enforced | Silent calibration drift on generic claims | Editable, versioned |
| Regras de geração | Item 5 (*janela reduzida*) feeds a real `BOOLEAN` column and the tool schema field of the same name | Items 1–4: silent quality drift. Item 5: field semantics could decouple from the paragraph text | Editable, versioned |
| Regra de voz | **Hard-coupled**: literal source of `_FORBIDDEN_VOICE_MARKERS`, checked post-hoc by `_check_voice_rule()` | Prompt/validator divergence → `ValueError` mid-evaluation, a hard runtime break | **Structured list**, shared source of truth, versioned |
| Instrução de resposta | Names both tools in prose; **but** `tool_choice: {"type": "any"}` already guarantees a tool-use response regardless | Lowest real risk of the set — redundant guidance on top of a hard API guarantee | Editable, simple audit |

## Non-Goals

- Free-text editing of *Regra de voz* (superseded by the structured list).
- Any change to score range, dimension count, or tool schema shape — that remains a code + deploy change, same as introducing any other new structural rule.
- TL-facing access to any part of this feature.
- Exposing "número de rodadas" as an editable setting.
- A separate single-purpose table for "instruções adicionais" — superseded by the generic sections table (`section_key = 'adicionais'`).
- Automatic migration/versioning tool outside this domain (e.g. diff view across arbitrary dates) — history is a flat list per section, newest last, no calendar/diff UI in v1.

## Data Model

Three new tables in `web/users.db`, alongside the existing `tl-evaluation` tables (`squads`, `squad_members`, `tl_evaluations`, `squad_competencia_closures`, `tl_evaluation_roles`, `tl_evaluation_role_responsibilities`):

```sql
CREATE TABLE IF NOT EXISTS tl_evaluation_prompt_sections (
  section_key   TEXT PRIMARY KEY,         -- 'papel' | 'fluxo' | 'gateA' | 'gateB' | 'regras' | 'instrucao' | 'adicionais'
  content       TEXT NOT NULL,            -- 'regras' stores one rule per line; all others store prose
  updated_by    TEXT NOT NULL,
  updated_at    TIMESTAMP NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tl_evaluation_prompt_section_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  section_key   TEXT NOT NULL,            -- same domain as above, plus 'voz' for forbidden-word-list snapshots
  content       TEXT NOT NULL,            -- snapshot of the value BEFORE the edit that superseded it
  changed_by    TEXT NOT NULL,
  changed_at    TIMESTAMP NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tl_evaluation_voice_forbidden_words (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  palavra       TEXT NOT NULL UNIQUE,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT (datetime('now'))
);
```

**Seeding (critical, one-time, idempotent):** on first run after migration, if `tl_evaluation_prompt_sections` is empty, seed all six section rows (`papel`, `fluxo`, `gateA`, `gateB`, `regras`, `instrucao`) with the **verbatim** current text of `_SYSTEM_PROMPT` (word-for-word, not retyped from memory or summarized), `adicionais` seeded empty, and seed `tl_evaluation_voice_forbidden_words` with exactly `("TL", "relato", "reportou")` from the current `_FORBIDDEN_VOICE_MARKERS`. This guarantees the rendered prompt is byte-identical to today's behavior until an admin makes a first edit.

> **Cautionary note carried over from this feature's own prototyping:** an early draft of the read-only preview (built as an HTML mockup before this spec) hand-transcribed `_SYSTEM_PROMPT` into a different format and silently dropped whole sentences (e.g. Gate A's closing sentence, Gate B's closing sentence, the superlative-word list in *Regras de geração*) — caught only because it was checked line-by-line against the source. The seeding migration must be verified the same way: diffed against the literal current file content, not hand-copied.

## Engine changes (`web/tl_evaluation_engine.py`)

- `_SYSTEM_PROMPT` and `_FORBIDDEN_VOICE_MARKERS` module-level constants are removed as the runtime source of truth (their literal values become the one-time seed data above, not a fallback read at request time).
- `build_system_prompt(sections: dict[str, str]) -> str` — pure function; composes the fixed `"## Título"` headers (still hardcoded — section *order* and *titles* are structural) around each `sections[key]` body, in the fixed order: papel → escala (hardcoded, not a parameter) → fluxo → gateA → gateB → regras → voz (rendered from `forbidden_words`, see next) → instrucao → adicionais (only appended if non-empty).
- `build_system_prompt` additionally takes `forbidden_words: list[str]` to render the *Regra de voz* section's list.
- `_check_voice_rule(evaluation: dict, forbidden_words: list[str]) -> None` — takes the list as a parameter instead of reading the module constant; called with the same list that was used to render the prompt for that turn, so prompt and validator can never diverge within a single request.
- `build_chat_request(messages, role=None, member_context=None, sections=None, forbidden_words=None)` — unchanged signature shape (additive kwargs), still pure, still assembles the full request dict including `tool_choice: {"type": "any"}`.
- `parse_tool_response(response, forbidden_words)` — passes `forbidden_words` through to `_check_voice_rule`.

## API Endpoints (all admin-only, `Depends` on the existing `AdminUser` guard)

| Endpoint | Behavior |
|---|---|
| `GET /api/admin/tl-evaluation-prompt` | Returns all 7 editable sections (content + `updated_by`/`updated_at`), the hardcoded *Escala de referência* text (read-only, for display parity), the forbidden-words list, and `model`/`max_tokens`. |
| `PUT /api/admin/tl-evaluation-prompt/sections/{section_key}` | Body `{"content": "..."}`. Writes the previous value to `tl_evaluation_prompt_section_history`, updates the row. `section_key = "escala"` is rejected (`404` — not a valid key; it was never a row). |
| `GET /api/admin/tl-evaluation-prompt/sections/{section_key}/history` | List of `{content, changed_by, changed_at}`, oldest first. |
| `POST /api/admin/tl-evaluation-prompt/voice-words` | Body `{"palavra": "..."}`. Rejects duplicates (`422`) and words shorter than 3 characters (`422` — guardrail against an admin fat-fingering a common short word that would make `_check_voice_rule` reject most evaluations). Logs a list snapshot to history under `section_key = "voz"`. |
| `DELETE /api/admin/tl-evaluation-prompt/voice-words/{palavra}` | Removes one word; same history logging. |
| `GET /api/admin/tl-evaluation-prompt/preview?squad_id=&squad_member_id=&competencia=` | Resolves `role`/`member_context` the same way `tl_chat` does today, calls `build_chat_request([], role=role, member_context=member_context, sections=..., forbidden_words=...)`, and returns only the composed `system` string. No Anthropic call. |

## Chat endpoint change

`tl_chat` (`web/main.py:2393-2416`) gains one step between resolving `member_context` (currently ending at line 2405) and calling `build_chat_request` (currently lines 2406-2408): fetch `sections = tl_evaluation_prompt_repository.get_sections()` and `forbidden_words = tl_evaluation_prompt_repository.get_forbidden_words()`, then pass both through as the new kwargs. `parse_tool_response` (line 2414) receives `forbidden_words` as well.

## Frontend

- New admin section slug `tl-prompt-settings`, wired the same way `squads`/`tl-roles` were (`frontend/src/pages/admin/AdminPage.tsx` switch, new case after the `tl-roles` case; `frontend/src/components/Layout.tsx` `ADMIN_NAV` array, new entry after "Papéis").
- New component `frontend/src/pages/admin/sections/TlEvaluationPromptSection.tsx`, three tabs — matches the reviewed/navigable prototype exactly:
  1. **Núcleo estrutural** — one editable card per section (edit/view toggle, Salvar/Cancelar, audit line; "Ver histórico" panel for Gate A/Gate B/Regras de geração; chip-list editor with add/remove for Regra de voz; *Escala de referência* rendered read-only with a locked badge).
  2. **Instruções adicionais** — the `adicionais` section, same edit/view/audit pattern as the low-risk core sections.
  3. **Simulador** — squad/member/competência pickers → "Simular" → renders the full composed prompt for that exact evaluation via the preview endpoint.
- New service functions (extend `frontend/src/services/tl-evaluation.service.ts` or add a sibling `tl-evaluation-prompt.service.ts`): `getPromptSections()`, `updatePromptSection(key, content)`, `getPromptSectionHistory(key)`, `addForbiddenWord(word)`, `removeForbiddenWord(word)`, `previewPrompt(squadId, squadMemberId, competencia)`.
- New types in `frontend/src/types/index.ts` (after `SquadCompetenciaStatus`, line 313): `PromptSection`, `PromptSectionHistoryEntry`, `ForbiddenWord`.

## Risks

- **Admin adds an overly common forbidden word** (e.g. a short, frequent word) → `_check_voice_rule` starts rejecting most evaluations mid-flow. Mitigated by the 3-character minimum on `POST .../voice-words`; not further hardened in v1 (e.g. no dictionary-frequency check) — revisit if this actually happens in practice.
- **Gate A/B or Regras de geração edited into a materially weaker rule** with no code review gate. Mitigated by full version history + "restore" flow (restoring only loads the old text into the editor — admin must still explicitly click Salvar, no one-click instant rollback of live policy).
- **Seed migration drift** — see the cautionary note under Data Model. The seeding task must be reviewed against the literal current `_SYSTEM_PROMPT`/`_FORBIDDEN_VOICE_MARKERS` source, not retyped.

## Open Questions

- Should *Regras de geração* eventually become discrete, individually-addable/removable rule rows (like the forbidden-words list) instead of one newline-delimited textarea? V1 keeps it as a single textarea (one rule per line) to match the reviewed prototype; per-rule CRUD is a fast-follow if the line-based editing proves awkward in practice.
- Should the admin see a diff (old vs. new) when opening a history entry, rather than just the snippet? V1 shows a truncated snippet per entry, no inline diff.
