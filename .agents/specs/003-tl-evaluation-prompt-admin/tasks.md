# Tasks: TL Evaluation — Prompt Ownership & Admin Editing

- [ ] **T1. Skill update — `.agents/skills/tl-evaluation/SKILL.md`**
  - Update the skill (authoritative domain documentation, per its own maintenance note) to reflect: the three new tables; that `_SYSTEM_PROMPT`/`_FORBIDDEN_VOICE_MARKERS` are no longer runtime constants (now DB-backed, seeded once); the new `build_system_prompt(sections, forbidden_words)` / `_check_voice_rule(evaluation, forbidden_words)` signatures; the five new admin endpoints; the editability matrix from `spec.md` (which sections are editable, versioned, or structured, and why).
  - Origin: `spec.md` "Engine changes" and "API Endpoints" sections. Do this first — every other task reads this skill during implementation.

- [ ] **T2. Data model — DB migration**
  - **Target**: `web/main.py`, `_init_db()` (starts at line 103).
  - Insert three `CREATE TABLE IF NOT EXISTS` blocks immediately after the `squad_competencia_closures` unique index (currently ends at line 289), before the "Migrations for existing installs" comment block at line 291: `tl_evaluation_prompt_sections`, `tl_evaluation_prompt_section_history`, `tl_evaluation_voice_forbidden_words` — exact DDL in `spec.md` → Data Model.
  - Add the one-time seed step (runs only when `tl_evaluation_prompt_sections` is empty): insert the six section rows with the **verbatim** text of the current `_SYSTEM_PROMPT` (copy from `web/tl_evaluation_engine.py` lines 10-81 as it exists today, split by the `"## "` markers — do not retype from memory) and seed the three forbidden words from `_FORBIDDEN_VOICE_MARKERS` (line 8).
  - Verification: after seeding, `build_system_prompt()` called with the seeded data must produce a string byte-identical to today's `_SYSTEM_PROMPT` output (write this as an explicit assertion in T9's engine tests, not just eyeballed).
  - Precondition: T1 (skill documents the exact schema first).

- [ ] **T3. Repository — `web/repositories/tl_evaluation_prompt_repository.py`** (new file)
  - `get_sections() -> dict[str, dict]` — `{section_key: {"content", "updated_by", "updated_at"}}` for all rows.
  - `update_section(section_key: str, content: str, user_email: str) -> dict` — raises if `section_key == "escala"` or any other unrecognized key; writes the **previous** content to `tl_evaluation_prompt_section_history` before overwriting; returns the updated row.
  - `get_section_history(section_key: str) -> list[dict]` — oldest first.
  - `get_forbidden_words() -> list[str]`.
  - `add_forbidden_word(palavra: str, user_email: str) -> list[str]` — rejects duplicates and words under 3 characters; logs a full-list snapshot to history under `section_key = "voz"` before the insert; returns the updated list.
  - `remove_forbidden_word(palavra: str, user_email: str) -> list[str]` — same history logging; returns the updated list.
  - Imports `_db` from `web/db.py`, matching every other repository in the domain (`squad_repository`, `tl_evaluation_repository`, `tl_evaluation_role_repository`).
  - Precondition: T2 (tables must exist).

- [ ] **T4. Engine changes — `web/tl_evaluation_engine.py`**
  - Remove `_SYSTEM_PROMPT` and `_FORBIDDEN_VOICE_MARKERS` as runtime-read module constants (their values move to the T2 seed data — they may remain in this file only as a comment pointing to the migration, not as code any function reads).
  - `build_system_prompt(sections: dict[str, str], forbidden_words: list[str]) -> str` — pure; hardcodes section titles/order (papel → escala → fluxo → gateA → gateB → regras → voz → instrucao → adicionais-if-non-empty); escala's body text is the only one still hardcoded inline (not a `sections` key).
  - `_check_voice_rule(evaluation: dict, forbidden_words: list[str]) -> None` — parameterized, no longer reads a module constant.
  - `build_chat_request(messages, role=None, member_context=None, sections=None, forbidden_words=None) -> dict` — additive kwargs; still pure, still sets `tool_choice: {"type": "any"}`.
  - `parse_tool_response(response: dict, forbidden_words: list[str]) -> dict` — passes `forbidden_words` to `_check_voice_rule`.
  - Precondition: T1 (skill defines the exact section boundaries/titles), T2 (seed data is what "byte-identical" is verified against).

- [ ] **T5. Chat endpoint — `web/main.py:2393-2416` (`tl_chat`)**
  - Between the existing `member_context` construction (ends ~line 2405) and the `build_chat_request` call (2406-2408): fetch `sections = tl_evaluation_prompt_repository.get_sections()` and `forbidden_words = tl_evaluation_prompt_repository.get_forbidden_words()` (content-only dict, i.e. `{key: row["content"] for key, row in sections.items()}` passed to the engine — the engine takes plain strings, not the audit metadata).
  - Pass both through to `build_chat_request(...)` and to `tl_evaluation_engine.parse_tool_response(response, forbidden_words)` (line 2414).
  - Add new import `import repositories.tl_evaluation_prompt_repository as tl_evaluation_prompt_repository` alongside the domain's other imports (after line 41, before line 42, per the existing alphabetical grouping).
  - Precondition: T3, T4.

- [ ] **T6. Admin prompt endpoints — `web/main.py`**
  - New routes, all guarded with the existing `_: AdminUser` dependency pattern (same as `admin_create_squad`, `main.py:2075-2093`):
    - `GET /api/admin/tl-evaluation-prompt` — sections + escala (hardcoded constant for display) + forbidden words + model/max_tokens (`_CLAUDE_MODEL`/`_MAX_TOKENS` from the engine).
    - `PUT /api/admin/tl-evaluation-prompt/sections/{section_key}` — `404` if `section_key` not in the six valid keys.
    - `GET /api/admin/tl-evaluation-prompt/sections/{section_key}/history`.
    - `POST /api/admin/tl-evaluation-prompt/voice-words` — `422` on duplicate or <3 chars.
    - `DELETE /api/admin/tl-evaluation-prompt/voice-words/{palavra}`.
    - `GET /api/admin/tl-evaluation-prompt/preview` — query params `squad_id`, `squad_member_id`, `competencia`; resolves `role`/`member_context` the same way `tl_chat` does (reuse, don't duplicate, the resolution logic — extract a small helper if `tl_chat` doesn't already expose one cleanly); calls `build_chat_request([], role=..., member_context=..., sections=..., forbidden_words=...)`; returns only `{"system": "..."}`. No Anthropic call.
  - Precondition: T3, T4.

- [ ] **T7. Frontend types and service**
  - **Target**: `frontend/src/types/index.ts`, after `SquadCompetenciaStatus` (line 313) — add `PromptSection`, `PromptSectionHistoryEntry`, `ForbiddenWord` interfaces, matching the shape returned by T6's endpoints.
  - **Target**: `frontend/src/services/tl-evaluation.service.ts` (or a new sibling `tl-evaluation-prompt.service.ts`, consistent with how `tl-evaluation-role` calls are organized in the existing service file — check before deciding) — `getPromptSections()`, `updatePromptSection(sectionKey, content)`, `getPromptSectionHistory(sectionKey)`, `addForbiddenWord(word)`, `removeForbiddenWord(word)`, `previewPrompt(squadId, squadMemberId, competencia)`.
  - Precondition: T6.

- [ ] **T8. Frontend admin section — routing, nav, component**
  - **Target**: `frontend/src/components/Layout.tsx`, `ADMIN_NAV` array (lines 44-55) — new entry after the "Papéis" entry (line 53): `{ to: '/admin/tl-prompt-settings', icon: <icon>, label: 'Prompt Avaliação TL' }`.
  - **Target**: `frontend/src/pages/admin/AdminPage.tsx`, section switch (lines 568-587) — new `case 'tl-prompt-settings':` after the `'tl-roles'` case (~584), rendering the new section component; add the corresponding import near line 28-29.
  - **New file**: `frontend/src/pages/admin/sections/TlEvaluationPromptSection.tsx` — three tabs, matching the reviewed/navigable prototype's interaction model exactly:
    1. *Núcleo estrutural*: one card per section (edit/view toggle + Salvar/Cancelar + audit line); "Ver histórico" expandable panel wired to `getPromptSectionHistory` for Gate A/Gate B/Regras de geração; chip-list add/remove editor for Regra de voz wired to `addForbiddenWord`/`removeForbiddenWord`; *Escala de referência* rendered as static read-only text with a locked badge (no edit affordance at all — this section has no backing DB row).
    2. *Instruções adicionais*: same edit/view/audit pattern, backed by `section_key = "adicionais"`.
    3. *Simulador*: squad → member → competência selects (reusing existing squad/member list-fetching hooks from `TlSquadsPage.tsx`'s data layer, not new endpoints) → "Simular" button → calls `previewPrompt` → renders the returned `system` string in a scrollable monospace block.
  - Precondition: T7.

- [ ] **T9. Tests**
  - **Target**: `tests/test_tl_evaluation_engine.py` — update existing tests for the new parameterized signatures; add: composition order matches the fixed header sequence; empty `adicionais` produces no trailing section; a forbidden word not in the list passed to `_check_voice_rule` does not raise, one that is present does; `build_system_prompt()` fed the T2 seed data produces the byte-identical string to today's `_SYSTEM_PROMPT`.
  - **New file**: `tests/test_tl_evaluation_prompt_admin.py` — integration tests (FastAPI `TestClient`, in-memory SQLite, same pattern as `tests/test_tl_squads.py`): `403` for non-admin on every new route; section update persists and appears in history; `escala` update attempt returns `404`; voice-word add rejects duplicate and rejects <3 chars; voice-word remove updates the list read by a subsequent `GET`; preview endpoint returns a `system` string containing the resolved squad/member/competência context and does not call `anthropic_client.complete` (assert via mock/monkeypatch that it's never invoked).
  - Precondition: T2-T6.

- [ ] **T10. Prototype reconciliation**
  - The interaction model (edit/save per section, protected tool-name tokens in Fluxo/Instrução, version history panel, voice-word chip editor) was already built and visually validated as a navigable HTML prototype during design. T8's component must match that reviewed interaction model — it is the UI reference, not a new design exercise.
  - Precondition: T8 in progress/complete, for side-by-side comparison before calling the section done.
