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
