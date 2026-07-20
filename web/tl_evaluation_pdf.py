"""TL evaluation PDF generation — WeasyPrint-based, ported from Cowork skill's generate_pdf.py."""

import html as _html

_SCORE_LABELS = {1: "Insatisfatório", 2: "Insatisfatório", 3: "Regular", 4: "Bom", 5: "Excelente"}

_PAGE_TEMPLATE = """\
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<style>
@page {{
    size: A4;
    margin: 2cm 2cm 2.5cm 2cm;
}}
body {{
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5pt;
    color: #1a1a1a;
}}
.report-header {{
    text-align: center;
    margin-bottom: 28px;
    border-bottom: 2px solid #1e3a5f;
    padding-bottom: 14px;
}}
.report-header h1 {{
    font-size: 17pt;
    color: #1e3a5f;
    margin: 0 0 4px;
}}
.report-header .period {{
    font-size: 11.5pt;
    color: #555;
}}
.member {{
    page-break-inside: avoid;
    margin-bottom: 22px;
    border: 1px solid #d0d0d0;
    border-radius: 5px;
    padding: 14px 16px;
}}
.member-name {{
    font-size: 12pt;
    font-weight: bold;
    color: #1e3a5f;
    margin-bottom: 10px;
    padding-bottom: 7px;
    border-bottom: 1px solid #e8e8e8;
}}
.dimension {{
    margin-bottom: 10px;
}}
.dimension-header {{
    margin-bottom: 3px;
}}
.dimension-name {{
    font-weight: bold;
    font-size: 10pt;
    color: #2c4a7c;
    display: inline;
    margin-right: 8px;
}}
.score-badge {{
    background-color: #1e3a5f;
    color: white;
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 9.5pt;
    display: inline;
    margin-right: 6px;
}}
.score-label {{
    color: #666;
    font-size: 9pt;
    display: inline;
}}
.dimension-text {{
    font-size: 10pt;
    color: #333;
    line-height: 1.55;
    margin-top: 3px;
    padding-left: 12px;
}}
.janela-note {{
    font-size: 8.5pt;
    color: #b05000;
    font-style: italic;
    margin-top: 5px;
    padding-left: 12px;
}}
.footer {{
    text-align: center;
    font-size: 8.5pt;
    color: #aaa;
    margin-top: 18px;
    border-top: 1px solid #e8e8e8;
    padding-top: 8px;
}}
</style>
</head>
<body>
  <div class="report-header">
    <h1>{squad_name}</h1>
    <div class="period">Avaliação Mensal — Competência {competencia}</div>
  </div>
  {members_html}
  <div class="footer">Gerado via GABI · DB1 Global Software</div>
</body>
</html>
"""


def _ensure_weasyprint() -> None:
    try:
        import weasyprint  # noqa: F401
    except ImportError:  # pragma: no cover
        import subprocess
        import sys

        subprocess.check_call([sys.executable, "-m", "pip", "install", "weasyprint"])


def _score_label(nota: int) -> str:
    return _SCORE_LABELS.get(nota, "")


def _render_member(evaluation: dict) -> str:
    nome = _html.escape(str(evaluation["nome"]))
    janela = bool(evaluation.get("janela_reduzida"))
    comp_nota = evaluation["comportamental_nota"]
    comp_para = evaluation["comportamental_paragrafo"]
    tec_nota = evaluation["tecnica_nota"]
    tec_para = evaluation["tecnica_paragrafo"]
    prazo_nota = evaluation["prazo_nota"]
    prazo_para = evaluation["prazo_paragrafo"]
    dimensions = (
        ("Comportamental", comp_nota, comp_para),
        ("Técnica", tec_nota, tec_para),
        ("Prazos de Entrega", prazo_nota, prazo_para),
    )
    dims_html = ""
    for dim_label, nota, paragrafo in dimensions:
        score_text = _score_label(nota)
        paragrafo_escaped = _html.escape(str(paragrafo or ""))
        dims_html += (
            f'<div class="dimension">'
            f'<div class="dimension-header">'
            f'<span class="dimension-name">{dim_label}</span>'
            f'<span class="score-badge">{nota}</span>'
            f'<span class="score-label">{score_text}</span>'
            f"</div>"
            f'<div class="dimension-text">{paragrafo_escaped}</div>'
            f"</div>"
        )
    janela_html = (
        '<p class="janela-note">'
        "* Observação parcial do mês — profissional ausente em parte do período."
        "</p>"
        if janela
        else ""
    )
    return (
        f'<div class="member"><div class="member-name">{nome}</div>{dims_html}{janela_html}</div>'
    )


def generate_squad_pdf(
    squad_name: str,
    competencia: str,
    evaluations: list[dict],
) -> bytes:
    """Return the PDF as bytes for HTTP streaming.

    evaluations: confirmed tl_evaluations rows joined with squad_members.nome,
    as returned by tl_evaluation_repository.list_evaluations().
    """
    _ensure_weasyprint()
    from weasyprint import HTML

    members_html = "".join(_render_member(ev) for ev in evaluations)
    html_content = _PAGE_TEMPLATE.format(
        squad_name=_html.escape(squad_name),
        competencia=_html.escape(competencia),
        members_html=members_html,
    )
    return HTML(string=html_content).write_pdf()
