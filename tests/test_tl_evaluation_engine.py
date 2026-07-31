"""Unit tests for web/tl_evaluation_engine.py — pure engine, no network calls."""

import sys
import os

import pytest

# Ensure web/ is on the path so the engine can be imported directly.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "web"))

import tl_evaluation_engine as engine


# ── Tool-schema shape ─────────────────────────────────────────────────────────


class TestToolSchemaShape:
    def test_exactly_two_tools(self):
        assert len(engine.get_tools()) == 2

    def test_tool_names(self):
        names = {t["name"] for t in engine.get_tools()}
        assert names == {"ask_question", "propose_evaluation"}

    def test_ask_question_required_fields(self):
        tools = {t["name"]: t for t in engine.get_tools()}
        schema = tools["ask_question"]["input_schema"]
        assert "question" in schema["properties"]
        assert schema["required"] == ["question"]

    def test_propose_evaluation_required_fields(self):
        tools = {t["name"]: t for t in engine.get_tools()}
        schema = tools["propose_evaluation"]["input_schema"]
        required = schema["required"]
        for field in (
            "comportamental_nota",
            "comportamental_paragrafo",
            "tecnica_nota",
            "tecnica_paragrafo",
            "prazo_nota",
            "prazo_paragrafo",
            "janela_reduzida",
        ):
            assert field in required, f"'{field}' ausente em required"

    def test_propose_evaluation_nota_constraints(self):
        tools = {t["name"]: t for t in engine.get_tools()}
        props = tools["propose_evaluation"]["input_schema"]["properties"]
        for field in ("comportamental_nota", "tecnica_nota", "prazo_nota"):
            assert props[field]["minimum"] == 1
            assert props[field]["maximum"] == 5


# ── System prompt encodes business rules ──────────────────────────────────────


class TestSystemPromptRules:
    def test_returns_non_empty_string(self):
        prompt = engine.build_system_prompt()
        assert isinstance(prompt, str)
        assert len(prompt) > 200

    def test_gate_a_rule_present(self):
        prompt = engine.build_system_prompt()
        # Gate A: score 5 requires external evidence
        assert "Gate A" in prompt
        assert "nota 5" in prompt or "nota máxima" in prompt

    def test_gate_b_rule_present(self):
        prompt = engine.build_system_prompt()
        assert "Gate B" in prompt

    def test_voice_rule_present(self):
        prompt = engine.build_system_prompt()
        # Voice rule: TL/relato/reportou are forbidden narration markers
        assert "TL" in prompt
        assert "reportou" in prompt or "relato" in prompt

    def test_three_dimensions_mentioned(self):
        prompt = engine.build_system_prompt()
        assert "Comportamental" in prompt
        assert "Técnica" in prompt
        assert "Prazos de Entrega" in prompt

    def test_score_scale_present(self):
        prompt = engine.build_system_prompt()
        assert "1" in prompt and "5" in prompt


# ── build_chat_request assembles the correct structure ───────────────────────


class TestBuildChatRequest:
    def test_contains_required_keys(self):
        messages = [{"role": "user", "content": "Relato do profissional"}]
        req = engine.build_chat_request(messages)
        for key in ("model", "max_tokens", "system", "tools", "tool_choice", "messages"):
            assert key in req, f"Chave '{key}' ausente no request"

    def test_messages_passed_through(self):
        messages = [{"role": "user", "content": "teste"}]
        req = engine.build_chat_request(messages)
        assert req["messages"] == messages

    def test_tool_choice_forces_tool_use(self):
        req = engine.build_chat_request([])
        assert req["tool_choice"]["type"] == "any"

    def test_system_is_system_prompt(self):
        req = engine.build_chat_request([])
        assert req["system"] == engine.build_system_prompt()

    def test_tools_are_engine_tools(self):
        req = engine.build_chat_request([])
        assert req["tools"] == engine.get_tools()


# ── Member context section — squad/member/month must reach the system prompt ──


class TestMemberContextSection:
    def _context(self, **overrides) -> dict:
        defaults = {
            "squad_nome": "Squad Fênix",
            "membro_nome": "Bruno Fernandez",
            "senioridade": "Pleno",
            "competencia": "2026-07",
        }
        return {**defaults, **overrides}

    def test_no_context_leaves_system_prompt_unchanged(self):
        req = engine.build_chat_request([], member_context=None)
        assert req["system"] == engine.build_system_prompt()

    def test_context_appends_squad_member_senioridade_and_competencia(self):
        req = engine.build_chat_request([], member_context=self._context())
        assert "Squad Fênix" in req["system"]
        assert "Bruno Fernandez" in req["system"]
        assert "Pleno" in req["system"]
        assert "2026-07" in req["system"]
        # Base rules must still be present, not replaced.
        assert "Gate A" in req["system"]
        assert "Gate B" in req["system"]

    def test_context_instructs_model_not_to_ask_who_is_being_evaluated(self):
        req = engine.build_chat_request([], member_context=self._context())
        context_section = req["system"].split("## Contexto da avaliação")[1]
        assert "NUNCA pergunte ao TL" in context_section

    def test_context_and_role_sections_coexist(self):
        role = {
            "nome": "Tech Lead",
            "descricao": "Responsável pelo 'como'.",
            "responsabilidades": [{"descricao": "Escreve a DOD", "principal": 0}],
        }
        req = engine.build_chat_request([], role=role, member_context=self._context())
        assert "Bruno Fernandez" in req["system"]
        assert "Tech Lead" in req["system"]

    def test_missing_optional_fields_are_omitted_gracefully(self):
        req = engine.build_chat_request([], member_context={"membro_nome": "Ana"})
        context_section = req["system"].split("## Contexto da avaliação")[1]
        assert "Ana" in context_section
        assert "Squad:" not in context_section
        assert "Senioridade:" not in context_section


# ── Role section — principal responsibilities become a probing requirement ────


class TestRoleSection:
    def _role(self, **overrides) -> dict:
        defaults = {
            "nome": "Tech Lead",
            "descricao": "Responsável pelo 'como' e pela capacidade de entrega.",
            "responsabilidades": [
                {"descricao": "Responsável técnico pelo sucesso da sprint", "principal": 1},
                {"descricao": "Escreve a DOD das demandas", "principal": 0},
            ],
        }
        return {**defaults, **overrides}

    def test_no_role_leaves_system_prompt_unchanged(self):
        req = engine.build_chat_request([], role=None)
        assert req["system"] == engine.build_system_prompt()

    def test_role_appends_role_name_and_description(self):
        req = engine.build_chat_request([], role=self._role())
        assert "Tech Lead" in req["system"]
        assert "capacidade de entrega" in req["system"]
        # Base rules (Gate A/B, voice rule) must still be present, not replaced.
        assert "Gate A" in req["system"]
        assert "Gate B" in req["system"]

    def test_principal_responsibility_is_marked_as_mandatory_probe(self):
        req = engine.build_chat_request([], role=self._role())
        assert "Responsável técnico pelo sucesso da sprint" in req["system"]
        assert "ask_question" in req["system"].split("## Papel avaliado")[1]

    def test_non_principal_responsibility_is_context_only(self):
        req = engine.build_chat_request([], role=self._role())
        role_section = req["system"].split("## Papel avaliado")[1]
        assert "Escreve a DOD das demandas" in role_section
        assert "não exigem pergunta própria" in role_section

    def test_role_with_no_principal_responsibilities_has_no_probe_instruction(self):
        role = self._role(
            responsabilidades=[{"descricao": "Faz algo secundário", "principal": 0}]
        )
        req = engine.build_chat_request([], role=role)
        role_section = req["system"].split("## Papel avaliado")[1]
        assert "Faz algo secundário" in role_section
        assert "Responsabilidades PRINCIPAIS" not in role_section


# ── parse_tool_response: Gate A/B trigger and voice rule ─────────────────────


class TestParseToolResponse:
    """parse_tool_response converts the raw API response to a structured turn.

    Gate A and Gate B are enforced by the LLM following the system prompt; the
    engine's parse_tool_response handles the two possible output shapes and
    validates the voice rule on propose_evaluation paragraphs.
    """

    def _ask_response(self, question: str) -> dict:
        return {
            "content": [
                {
                    "type": "tool_use",
                    "name": "ask_question",
                    "input": {"question": question},
                }
            ]
        }

    def _propose_response(self, **overrides) -> dict:
        defaults = {
            "comportamental_nota": 4,
            "comportamental_paragrafo": "Manteve boa postura durante o mês.",
            "tecnica_nota": 4,
            "tecnica_paragrafo": "Entregou as implementações planejadas.",
            "prazo_nota": 4,
            "prazo_paragrafo": "Cumpriu os prazos acordados na sprint.",
            "janela_reduzida": False,
        }
        return {
            "content": [
                {
                    "type": "tool_use",
                    "name": "propose_evaluation",
                    "input": {**defaults, **overrides},
                }
            ]
        }

    # Gate A trigger — LLM returns ask_question when converging toward nota 5
    def test_gate_a_trigger_maps_to_ask_question(self):
        """When the LLM issues ask_question (Gate A check), parse correctly."""
        resp = self._ask_response(
            "Você mencionou desempenho excelente. Existe algum reconhecimento "
            "externo ao TL que confirme essa superação?"
        )
        result = engine.parse_tool_response(resp)
        assert result["type"] == "ask_question"
        assert "reconhecimento" in result["question"]

    # Gate B trigger — LLM returns ask_question when a generic claim is unqualified
    def test_gate_b_trigger_maps_to_ask_question(self):
        """When the LLM issues ask_question (Gate B check), parse correctly."""
        resp = self._ask_response(
            "Você descreveu o profissional como 'muito bom tecnicamente'. "
            "Pode dar um exemplo concreto do mês?"
        )
        result = engine.parse_tool_response(resp)
        assert result["type"] == "ask_question"
        assert "exemplo" in result["question"]

    # Sufficient evidence → LLM returns propose_evaluation
    def test_sufficient_evidence_maps_to_propose_evaluation(self):
        resp = self._propose_response()
        result = engine.parse_tool_response(resp)
        assert result["type"] == "propose_evaluation"
        assert result["comportamental_nota"] == 4
        assert result["tecnica_nota"] == 4
        assert result["prazo_nota"] == 4

    def test_propose_evaluation_includes_janela_reduzida(self):
        resp = self._propose_response(janela_reduzida=True)
        result = engine.parse_tool_response(resp)
        assert result["janela_reduzida"] is True

    # Paragraph voice rule — forbidden markers raise ValueError
    def test_voice_rule_rejects_tl_in_comportamental(self):
        resp = self._propose_response(
            comportamental_paragrafo="O TL registrou boa postura do profissional."
        )
        with pytest.raises(ValueError, match="TL"):
            engine.parse_tool_response(resp)

    def test_voice_rule_rejects_reportou_in_tecnica(self):
        # Paragraph contains "reportou" only — "TL" is absent to avoid matching first.
        resp = self._propose_response(
            tecnica_paragrafo="O gestor reportou que as entregas foram de alta qualidade."
        )
        with pytest.raises(ValueError, match="reportou"):
            engine.parse_tool_response(resp)

    def test_voice_rule_rejects_relato_in_prazo(self):
        # Paragraph contains "relato" only — "TL" is absent to avoid matching first.
        resp = self._propose_response(
            prazo_paragrafo="Conforme relato da reunião semanal, os prazos foram cumpridos."
        )
        with pytest.raises(ValueError, match="relato"):
            engine.parse_tool_response(resp)

    def test_voice_rule_accepts_correct_subject(self):
        resp = self._propose_response(
            comportamental_paragrafo="Demonstrou proatividade ao antecipar impedimentos.",
            tecnica_paragrafo="Conduziu as definições técnicas com clareza.",
            prazo_paragrafo="Entregou todas as histórias antes da deadline da sprint.",
        )
        result = engine.parse_tool_response(resp)
        assert result["type"] == "propose_evaluation"

    def test_raises_when_no_tool_use_block(self):
        with pytest.raises(ValueError, match="tool_use"):
            engine.parse_tool_response({"content": [{"type": "text", "text": "resposta"}]})

    def test_raises_on_empty_content(self):
        with pytest.raises(ValueError):
            engine.parse_tool_response({"content": []})


# ── Admin-editable sections / forbidden words (003-tl-evaluation-prompt-admin) ─
#
# The system prompt used to be one hardcoded constant; it is now composed from
# admin-editable sections plus a structured forbidden-words list (both DB-backed
# in production, resolved by the caller — this module stays pure). These tests
# guard the two properties that matter most: (1) the shipped defaults reproduce
# today's exact behavior byte-for-byte, and (2) an admin edit to one section or
# to the word list actually changes what gets sent, without corrupting anything
# else.


class TestDefaultsReproduceLegacyPromptExactly:
    def test_build_system_prompt_with_no_args_matches_legacy_constant(self):
        """The defaults are *derived* from `_SYSTEM_PROMPT` via slicing, never
        hand-retyped — this assertion is what actually proves that derivation
        round-trips losslessly, not just that it looks right on inspection."""
        assert engine.build_system_prompt() == engine._SYSTEM_PROMPT

    def test_default_sections_cover_every_editable_key(self):
        sections = engine.default_sections()
        assert set(sections) == set(engine.EDITABLE_SECTION_KEYS)

    def test_default_adicionais_seeds_empty(self):
        assert engine.default_sections()["adicionais"] == ""

    def test_default_forbidden_words_match_legacy_constant(self):
        assert engine.default_forbidden_words() == list(engine._FORBIDDEN_VOICE_MARKERS)

    def test_escala_reference_text_is_not_in_editable_keys(self):
        assert "escala" not in engine.EDITABLE_SECTION_KEYS
        assert "voz" not in engine.EDITABLE_SECTION_KEYS
        assert "## Escala de referência" in engine.escala_reference_text()

    def test_model_config_matches_build_chat_request(self):
        config = engine.model_config()
        req = engine.build_chat_request([])
        assert req["model"] == config["model"]
        assert req["max_tokens"] == config["max_tokens"]


class TestCustomSections:
    def _sections(self, **overrides) -> dict:
        base = engine.default_sections()
        base.update(overrides)
        return base

    def test_custom_papel_replaces_only_that_section(self):
        prompt = engine.build_system_prompt(sections=self._sections(papel="Texto customizado."))
        assert "Texto customizado." in prompt
        # Everything else (Gates, escala) must survive untouched.
        assert "Gate A" in prompt
        assert "Gate B" in prompt
        assert "## Escala de referência" in prompt

    def test_custom_adicionais_appended_last(self):
        prompt = engine.build_system_prompt(
            sections=self._sections(adicionais="Pergunte sobre câmera ligada nas calls.")
        )
        assert prompt.rstrip().endswith("Pergunte sobre câmera ligada nas calls.")
        assert "## Instruções adicionais" in prompt

    def test_empty_adicionais_produces_no_trailing_section(self):
        prompt = engine.build_system_prompt(sections=self._sections(adicionais=""))
        assert "Instruções adicionais" not in prompt

    def test_whitespace_only_adicionais_treated_as_empty(self):
        prompt = engine.build_system_prompt(sections=self._sections(adicionais="   \n  "))
        assert "Instruções adicionais" not in prompt

    def test_missing_section_key_falls_back_to_default(self):
        sections = engine.default_sections()
        del sections["gateA"]
        prompt = engine.build_system_prompt(sections=sections)
        assert "Toda vez que a avaliação convergir para nota 5" in prompt

    def test_edited_regras_section_reflected_verbatim(self):
        prompt = engine.build_system_prompt(
            sections=self._sections(regras="1. Regra totalmente nova de teste.")
        )
        assert "1. Regra totalmente nova de teste." in prompt
        assert "Sem invenção" not in prompt  # old content actually replaced, not merged


class TestCustomForbiddenWords:
    def test_voz_section_lists_custom_words(self):
        prompt = engine.build_system_prompt(forbidden_words=["câmera desligada", "TL"])
        assert '"câmera desligada"' in prompt
        assert '"TL"' in prompt
        # Words not in the custom list must not appear as a quoted forbidden term.
        assert '"relato"' not in prompt

    def test_default_forbidden_words_preserve_legacy_voz_wording(self):
        prompt = engine.build_system_prompt(forbidden_words=list(engine._FORBIDDEN_VOICE_MARKERS))
        assert prompt == engine._SYSTEM_PROMPT

    def test_check_voice_rule_uses_passed_words_not_module_default(self):
        # "relato" is a legacy default marker; omit it from the custom list.
        with pytest.raises(ValueError, match="câmera"):
            engine._check_voice_rule(
                {"comportamental_paragrafo": "Manteve a câmera desligada durante as calls."},
                forbidden_words=["câmera"],
            )

    def test_check_voice_rule_does_not_flag_word_outside_custom_list(self):
        # "relato" would trip the legacy default, but is absent from this custom list.
        engine._check_voice_rule(
            {"comportamental_paragrafo": "Conforme relato da reunião, entregou no prazo."},
            forbidden_words=["câmera"],
        )  # must not raise

    def test_parse_tool_response_passes_forbidden_words_through(self):
        resp = {
            "content": [
                {
                    "type": "tool_use",
                    "name": "propose_evaluation",
                    "input": {
                        "comportamental_nota": 4,
                        "comportamental_paragrafo": "Manteve a câmera desligada nas calls.",
                        "tecnica_nota": 4,
                        "tecnica_paragrafo": "Entregou as tarefas planejadas.",
                        "prazo_nota": 4,
                        "prazo_paragrafo": "Cumpriu os prazos combinados.",
                        "janela_reduzida": False,
                    },
                }
            ]
        }
        with pytest.raises(ValueError, match="câmera"):
            engine.parse_tool_response(resp, forbidden_words=["câmera"])

    def test_build_chat_request_forwards_sections_and_words(self):
        req = engine.build_chat_request(
            [],
            sections=self._sections_helper(papel="Assistente customizado."),
            forbidden_words=["xyz"],
        )
        assert "Assistente customizado." in req["system"]
        assert '"xyz"' in req["system"]

    @staticmethod
    def _sections_helper(**overrides) -> dict:
        base = engine.default_sections()
        base.update(overrides)
        return base
