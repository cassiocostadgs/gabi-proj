"""Unit tests for web/client_evaluation_engine.py — pure parser, no I/O."""

import pytest

import client_evaluation_engine as engine

# ── Reference email bodies (from test-cases.md) ───────────────────────────────

BODY_A = """\
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
"""

BODY_B = """\
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
"""

BODY_C = """\
Competência: 06 / 2025
Colaborador: Pedro Santos
Fornecedor: Outro Fornecedor Ltda
Total de horas(horas): 168:00

Avaliação Comportamental: 4
Avaliação Técnica: 5
Avaliação Prazos de entrega: 4

OBS: Notas de 1 à 5.
"""

BODY_D = """\
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
"""

BODY_E = """\
Competência: 05 / 2026
Colaborador: Tadeu Henriques Moreira
Fornecedor: DB1 Global Software
Total de horas(horas): 168:00
Total de horas(decimal): 168,00

Avaliação Comportamental: 3
Tadeu apresenta um comportamento alinhado ao esperado
para sua senioridade e papel de liderança técnica.

Outro ponto de atenção é reforçar o senso de dono sobre
os assuntos sob sua responsabilidade.

Em relação à interação com a equipe, observou-se que,
ao longo do ciclo, as participações nos ritos ocorreram
predominantemente com a câmera fechada.

Avaliação Técnica: 3
Entregas consistentes, principalmente na elaboração dos
desenhos de solução e na condução das definições técnicas.

Avaliação Prazos de entrega: 4
Cumpre os prazos acordados.

OBS: Notas de 1 à 5.
"""


# ── parse_evaluation ──────────────────────────────────────────────────────────

class TestParseEvaluation:
    def test_body_a_per_dimension_comments(self):
        result = engine.parse_evaluation(BODY_A)
        assert result["competencia"] == "2025-06"
        assert result["nome_extraido"] == "Pedro Santos"
        assert result["fornecedor_validado"] == 1
        assert result["comportamental_nota"] == 4
        assert result["tecnica_nota"] == 5
        assert result["prazo_nota"] == 4
        assert result["comportamental_comentario"] == "Excelente postura profissional."
        assert result["tecnica_comentario"] == "Entregas de alta qualidade."
        assert result["prazo_comentario"] == "Cumpre os prazos acordados."
        assert result["comentario_geral"] is None

    def test_body_b_feedback_block_pattern(self):
        result = engine.parse_evaluation(BODY_B)
        assert result["competencia"] == "2025-07"
        assert result["comportamental_nota"] == 3
        assert result["tecnica_nota"] == 4
        assert result["prazo_nota"] == 3
        assert result["comentario_geral"] == "Bom desempenho no geral, com espaço para melhoria técnica."
        assert result["comportamental_comentario"] is None
        assert result["tecnica_comentario"] is None
        assert result["prazo_comentario"] is None

    def test_body_d_uppercase_name_feedback_block(self):
        result = engine.parse_evaluation(BODY_D)
        assert result["nome_extraido"] == "CARLOS PEREIRA"
        assert result["comportamental_nota"] == 5
        assert result["tecnica_nota"] == 5
        assert result["prazo_nota"] == 5
        assert result["comentario_geral"] == "Desempenho exemplar em todos os critérios."

    def test_body_e_multi_paragraph_dimension_comment(self):
        """Regression: a dimension comment spanning multiple paragraphs (blank-line
        separated, each itself hard-wrapped) must not be truncated to its first line."""
        result = engine.parse_evaluation(BODY_E)
        assert result["comportamental_comentario"] == (
            "Tadeu apresenta um comportamento alinhado ao esperado "
            "para sua senioridade e papel de liderança técnica.\n\n"
            "Outro ponto de atenção é reforçar o senso de dono sobre "
            "os assuntos sob sua responsabilidade.\n\n"
            "Em relação à interação com a equipe, observou-se que, "
            "ao longo do ciclo, as participações nos ritos ocorreram "
            "predominantemente com a câmera fechada."
        )
        assert result["tecnica_comentario"] == (
            "Entregas consistentes, principalmente na elaboração dos "
            "desenhos de solução e na condução das definições técnicas."
        )
        assert result["prazo_comentario"] == "Cumpre os prazos acordados."

    def test_feedback_block_multi_paragraph(self):
        """Regression: same truncation bug in the Feedback: block, not just per-dimension."""
        body = BODY_B.replace(
            "Feedback: Bom desempenho no geral, com espaço para melhoria técnica.",
            "Feedback: Bom desempenho no geral.\n\nEspaço para melhoria técnica no próximo ciclo.",
        )
        result = engine.parse_evaluation(body)
        assert result["comentario_geral"] == (
            "Bom desempenho no geral.\n\nEspaço para melhoria técnica no próximo ciclo."
        )

    def test_competencia_normalization_to_yyyy_mm(self):
        result = engine.parse_evaluation(BODY_A)
        assert result["competencia"] == "2025-06"

        body = BODY_A.replace("Competência: 06 / 2025", "Competência: 1 / 2024")
        result2 = engine.parse_evaluation(body)
        assert result2["competencia"] == "2024-01"

    def test_wrong_fornecedor_raises_value_error(self):
        with pytest.raises(ValueError, match="Fornecedor"):
            engine.parse_evaluation(BODY_C)

    def test_missing_score_label_raises_value_error(self):
        body = BODY_A.replace("Avaliação Técnica: 5\nEntregas de alta qualidade.\n", "")
        with pytest.raises(ValueError, match="Avaliação Técnica"):
            engine.parse_evaluation(body)

    def test_score_out_of_range_raises_value_error(self):
        body = BODY_A.replace("Avaliação Comportamental: 4", "Avaliação Comportamental: 6")
        with pytest.raises(ValueError, match="Comportamental"):
            engine.parse_evaluation(body)

    def test_score_zero_raises_value_error(self):
        body = BODY_A.replace("Avaliação Comportamental: 4", "Avaliação Comportamental: 0")
        with pytest.raises(ValueError, match="Comportamental"):
            engine.parse_evaluation(body)

    def test_score_non_integer_string_raises_value_error(self):
        body = BODY_A.replace("Avaliação Comportamental: 4", "Avaliação Comportamental: quatro")
        with pytest.raises(ValueError, match="Comportamental"):
            engine.parse_evaluation(body)

    def test_score_float_string_raises_value_error(self):
        body = BODY_A.replace("Avaliação Comportamental: 4", "Avaliação Comportamental: 4.0")
        with pytest.raises(ValueError, match="Comportamental"):
            engine.parse_evaluation(body)

    def test_missing_colaborador_raises_value_error(self):
        body = BODY_A.replace("Colaborador: Pedro Santos\n", "")
        with pytest.raises(ValueError, match="Colaborador"):
            engine.parse_evaluation(body)

    def test_missing_competencia_raises_value_error(self):
        body = BODY_A.replace("Competência: 06 / 2025\n", "")
        with pytest.raises(ValueError, match="Competência"):
            engine.parse_evaluation(body)

    def test_missing_fornecedor_raises_value_error(self):
        body = BODY_A.replace("Fornecedor: DB1 Global Software\n", "")
        with pytest.raises(ValueError, match="Fornecedor"):
            engine.parse_evaluation(body)


# ── strip_html ────────────────────────────────────────────────────────────────

class TestStripHtml:
    def test_removes_html_tags(self):
        html = "<p>Texto</p><br>"
        assert "<" not in engine.strip_html(html)

    def test_unescapes_entities(self):
        html = "Bom &amp; pr&aacute;tico"
        result = engine.strip_html(html)
        assert "&amp;" not in result
        assert "á" in result

    def test_plain_text_unchanged(self):
        plain = "Sem tags aqui."
        assert engine.strip_html(plain) == plain


# ── auto_link ─────────────────────────────────────────────────────────────────

class TestAutoLink:
    def test_matches_pedro_santos(self):
        emails = ["pedro.santos@db1.com.br", "carlos.pereira@db1.com.br"]
        user_email, status = engine.auto_link("Pedro Santos", emails)
        assert user_email == "pedro.santos@db1.com.br"
        assert status == "auto"

    def test_matches_uppercase_name(self):
        emails = ["carlos.pereira@db1.com.br"]
        user_email, status = engine.auto_link("CARLOS PEREIRA", emails)
        assert user_email == "carlos.pereira@db1.com.br"
        assert status == "auto"

    def test_no_match_returns_nao_vinculado(self):
        emails = ["pedro.santos@db1.com.br"]
        user_email, status = engine.auto_link("Nome Totalmente Desconhecido", emails)
        assert user_email is None
        assert status == "nao_vinculado"

    def test_empty_email_list_returns_nao_vinculado(self):
        user_email, status = engine.auto_link("Pedro Santos", [])
        assert user_email is None
        assert status == "nao_vinculado"
