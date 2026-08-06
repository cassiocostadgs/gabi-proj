"""TL evaluation PDF generation — WeasyPrint-based, ported from Cowork skill's generate_pdf.py.

Three sections, mirroring the original skill's design:
  1. Referência   — methodology: dimensions explained + score-scale table.
  2. Avaliações individuais — one card per member: current-month notas/paragraphs,
     plus an "Evolução histórica" sparkline chart when prior competências exist.
  3. Panorama da squad — consolidated matrix across members + distribution bars.
"""

import html as _html
from datetime import UTC, datetime

_MONTHS_PT = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
]
_MONTHS_SHORT_PT = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
]

_INSATISFATORIO = "Insatisfatório"
_CLOSE_DIV = "</div>"
_SCORE_LABELS = {1: _INSATISFATORIO, 2: _INSATISFATORIO, 3: "Regular", 4: "Bom", 5: "Excelente"}
_SCORE_LABELS_SHORT = {1: "Ins.", 2: "Ins.", 3: "Reg.", 4: "Bom", 5: "Exc."}
_SCORE_BG = {1: "#FFC7CE", 2: "#FFC7CE", 3: "#FFEB9C", 4: "#E2EFDA", 5: "#C6EFCE"}
_SCORE_TEXT = {1: "#9C0006", 2: "#9C0006", 3: "#7F6000", 4: "#375623", 5: "#276221"}

_DIMS = (
    ("comportamental_nota", "comportamental_paragrafo", "comportamental", "Comportamental"),
    ("tecnica_nota", "tecnica_paragrafo", "tecnica", "Técnica"),
    ("prazo_nota", "prazo_paragrafo", "prazos", "Prazos de Entrega"),
)


def _competencia_label(competencia: str) -> str:
    year, month = competencia.split("-")
    return f"{_MONTHS_PT[int(month) - 1]} de {year}"


def _competencia_short(competencia: str) -> str:
    year, month = competencia.split("-")
    return f"{_MONTHS_SHORT_PT[int(month) - 1]}/{year[2:]}"


def _esc(value) -> str:
    return _html.escape(str(value if value is not None else ""))


def _score_label(nota) -> str:
    return _SCORE_LABELS.get(nota, "")


def _badge(nota, janela_reduzida: bool = False) -> str:
    if nota is None:
        return '<span class="badge badge-none">—</span>'
    nota = int(nota)
    nota_str = f"{nota}*" if janela_reduzida else str(nota)
    return (
        f'<span class="badge" style="background:{_SCORE_BG.get(nota, "#EEEEEE")}">'
        f"{_esc(nota_str)} · {_esc(_SCORE_LABELS.get(nota, '—'))}</span>"
    )


def _badge_compact(nota, janela_reduzida: bool = False) -> str:
    if nota is None:
        return '<span class="badge-compact badge-none">—</span>'
    nota = int(nota)
    nota_str = f"{nota}*" if janela_reduzida else str(nota)
    return (
        f'<span class="badge-compact" style="background:{_SCORE_BG.get(nota, "#EEEEEE")}">'
        f"{_esc(nota_str)} · {_esc(_SCORE_LABELS_SHORT.get(nota, '—'))}</span>"
    )


def _ensure_weasyprint() -> None:
    _fix_macos_library_path()
    try:
        import weasyprint  # noqa: F401
    except ImportError:  # pragma: no cover
        import subprocess
        import sys

        subprocess.check_call([sys.executable, "-m", "pip", "install", "weasyprint"])


def _fix_macos_library_path() -> None:
    """WeasyPrint's cffi bindings can't find Homebrew's Pango/GObject/Cairo
    libs on Apple Silicon because /opt/homebrew/lib isn't a default dyld
    search path — point the fallback path at it before weasyprint loads them.
    """
    import os
    import sys

    if sys.platform != "darwin":
        return
    homebrew_lib = "/opt/homebrew/lib"
    if not os.path.isdir(homebrew_lib):
        return
    existing = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
    if homebrew_lib not in existing.split(os.pathsep):
        os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = (
            f"{homebrew_lib}{os.pathsep}{existing}" if existing else homebrew_lib
        )


# ── Section 1: Referência ─────────────────────────────────────────────────────

_METODOLOGIA_HTML = """
<hr class="sec-break">
<div class="sec-header">
  <span class="sec-num">1</span>
  <span class="sec-title">Referência</span>
</div>
<p class="sec-ref-note">Metodologia que orienta as notas e dimensões avaliadas.
Pode ser consultada conforme necessário.</p>
<p class="sobre-doc">Este documento reúne os fatos observados pelo Tech Lead no mês de
referência, organizados pelas dimensões avaliadas. Ele não substitui a avaliação do PO —
é um insumo complementar para enriquecer a análise do período.</p>
<h2>Dimensões avaliadas</h2>
<div class="table-card">
<table>
  <thead><tr><th style="width:4cm">Dimensão</th><th>O que avalia</th></tr></thead>
  <tbody>
    <tr><td>Comportamental</td>
        <td>Atitude, comunicação, trabalho em equipe, proatividade</td></tr>
    <tr><td>Técnica</td>
        <td>Qualidade das entregas, domínio técnico, autonomia, soluções propostas</td></tr>
    <tr><td>Prazos de Entrega</td>
        <td>Cumprimento de estimativas, previsibilidade, comunicação de impedimentos</td></tr>
  </tbody>
</table>
</div>
<h2>Escala de notas</h2>
<div class="table-card">
<table>
  <thead><tr><th style="width:3.8cm">Nota</th><th>Definição</th></tr></thead>
  <tbody>
    <tr>
      <td><span class="badge" style="background:#FFC7CE">1-2 · Insatisfatório</span></td>
      <td>Não atende ou atende minimamente às expectativas quanto ao padrão esperado de desempenho
      definido para a competência avaliada. Precisa desenvolver-se total ou quase que totalmente
      na competência.</td>
    </tr>
    <tr>
      <td><span class="badge" style="background:#FFEB9C">3 · Regular</span></td>
      <td>Atende parcialmente às expectativas quanto ao padrão esperado de desempenho definido para
      a competência avaliada. O desempenho alterna entre atendimento e não atendimento. Precisa
      melhorar o desempenho.</td>
    </tr>
    <tr>
      <td><span class="badge" style="background:#E2EFDA">4 · Bom</span></td>
      <td>Atende às expectativas quanto ao padrão esperado de desempenho, definido para a
      competência avaliada. Alcança o padrão esperado, demonstrando resultado de desempenho
      plenamente satisfatório.</td>
    </tr>
    <tr>
      <td><span class="badge" style="background:#C6EFCE">5 · Excelente</span></td>
      <td>Supera as expectativas quanto ao padrão esperado de desempenho definido para a
      competência. Excede ao padrão esperado, demonstrando desempenho além das expectativas.
      Agrega melhorias e resultados visíveis, reconhecidos e confirmados no âmbito da
      entidade.</td>
    </tr>
  </tbody>
</table>
</div>
"""


def _html_header(squad_name: str, competencia: str, tech_lead_nome: str, gerado_em: str) -> str:
    return f"""
<h1>Avaliação Mensal — Insumo Técnico do TL</h1>
<p class="subtitulo-doc">MAG Seguros</p>
<hr>
<div class="table-card">
<table>
  <thead><tr>
    <th>Squad</th><th>Tech Lead</th><th>Mês de referência</th><th>Gerado em</th>
  </tr></thead>
  <tbody><tr>
    <td>{_esc(squad_name)}</td>
    <td>{_esc(tech_lead_nome)}</td>
    <td>{_esc(_competencia_label(competencia))}</td>
    <td>{_esc(gerado_em)}</td>
  </tr></tbody>
</table>
</div>
<hr>
"""


# ── Section 2: Avaliações individuais ─────────────────────────────────────────


def _build_historico_entries(evaluation: dict, historico: list[dict]) -> list[tuple[str, dict]]:
    """[(mes_curto, {comportamental, tecnica, prazos})] chronological, last 6,
    including the current month's evaluation as the latest point."""
    member_id = evaluation.get("squad_member_id")
    by_competencia: dict[str, dict] = {}
    for row in historico:
        if row.get("squad_member_id") != member_id:
            continue
        by_competencia[row["competencia"]] = {
            "comportamental": row.get("comportamental_nota"),
            "tecnica": row.get("tecnica_nota"),
            "prazos": row.get("prazo_nota"),
        }
    by_competencia[evaluation["competencia"]] = {
        "comportamental": evaluation.get("comportamental_nota"),
        "tecnica": evaluation.get("tecnica_nota"),
        "prazos": evaluation.get("prazo_nota"),
    }
    ordered = sorted(by_competencia.items(), key=lambda item: item[0])[-6:]
    return [(_competencia_short(comp), vals) for comp, vals in ordered]


def _svg_point_elements(
    x: float, y: float, note_val: int, is_last: bool, color: str, geom: dict
) -> list[str]:
    """Mini-pill + circle marking one data point on a sparkline row."""
    pill_w, pill_h, pill_gap = geom["pill_w"], geom["pill_h"], geom["pill_gap"]
    pill_bg = _SCORE_BG.get(note_val, "#EEEEEE")
    pill_tc = _SCORE_TEXT.get(note_val, "#333333")
    px = x - pill_w / 2
    py = y - pill_gap - pill_h
    r = "3.2" if is_last else "2.2"
    sw = ' stroke="#ffffff" stroke-width="1.2"' if is_last else ""
    return [
        f'<rect x="{px:.1f}" y="{py:.1f}" width="{pill_w}" height="{pill_h}" '
        f'rx="3" fill="{pill_bg}" stroke="#C8C8C8" stroke-width="0.3"/>',
        f'<text x="{x:.1f}" y="{py + pill_h - 2.2:.1f}" text-anchor="middle" '
        f'font-size="7.5" font-weight="700" fill="{pill_tc}">{note_val}</text>',
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{color}"{sw}/>',
    ]


def _svg_row_elements(
    row_i: int,
    dim_key: str,
    color: str,
    label: str,
    entries: list[tuple[str, dict]],
    geom: dict,
) -> list[str]:
    """Background, gridlines, label, trendline and points for one sparkline row."""
    row_top, yy, xx = geom["row_top"], geom["yy"], geom["xx"]
    ml, pw, rh = geom["ml"], geom["pw"], geom["rh"]
    n = len(entries)

    rt = row_top(row_i)
    rb = rt + rh
    ym = yy(row_i, 3)
    label_y = rt + rh / 2 + 3
    out = [
        f'<rect x="{ml}" y="{rt:.1f}" width="{pw}" height="{rh}" fill="#FAFBFD" rx="2"/>',
        f'<line x1="{ml}" y1="{rt:.1f}" x2="{ml + pw}" y2="{rt:.1f}" '
        f'stroke="#E8EFF6" stroke-width="0.5"/>',
        f'<line x1="{ml}" y1="{rb:.1f}" x2="{ml + pw}" y2="{rb:.1f}" '
        f'stroke="#E8EFF6" stroke-width="0.5"/>',
        f'<line x1="{ml}" y1="{ym:.1f}" x2="{ml + pw}" y2="{ym:.1f}" '
        f'stroke="#DDE6F0" stroke-width="0.6" stroke-dasharray="3,2"/>',
        f'<text x="{ml - 5}" y="{label_y:.1f}" text-anchor="end" '
        f'font-size="7.8" font-weight="700" fill="{color}">{_esc(label)}</text>',
    ]

    pts = []
    for i, (_, vals) in enumerate(entries):
        note = vals.get(dim_key)
        if note is not None:
            pts.append((xx(i), yy(row_i, note), int(note), i == n - 1))

    if len(pts) >= 2:
        poly = " ".join(f"{x:.1f},{y:.1f}" for x, y, _, _ in pts)
        out.append(
            f'<polyline points="{poly}" fill="none" stroke="{color}" '
            f'stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>'
        )

    for x, y, note_val, is_last in pts:
        out.extend(_svg_point_elements(x, y, note_val, is_last, color, geom))

    return out


def _svg_evolucao(entries: list[tuple[str, dict]]) -> str:
    """3 stacked sparklines (Comportamental/Técnica/Prazos) with mini-pills over
    each point. Empty string if fewer than 2 chronological entries."""
    n = len(entries)
    if n < 2:
        return ""

    w, ml, mr, mt, rg, xlh = 500, 92, 8, 8, 12, 14
    pill_w, pill_h, pill_gap = 15, 11, 5
    pad_top = pill_h + pill_gap + 2
    pad_bot = 4
    eff_ph = 44
    rh = pad_top + eff_ph + pad_bot
    pw = w - ml - mr
    total_h = mt + 3 * rh + 2 * rg + xlh

    def row_top(row_i):
        return mt + row_i * (rh + rg)

    def yy(row_i, note):
        if note is None:
            return None
        return row_top(row_i) + pad_top + (5 - int(note)) / 4 * eff_ph

    def xx(i):
        return ml + (i * pw / (n - 1))

    geom = {
        "row_top": row_top,
        "yy": yy,
        "xx": xx,
        "ml": ml,
        "pw": pw,
        "rh": rh,
        "pill_w": pill_w,
        "pill_h": pill_h,
        "pill_gap": pill_gap,
    }
    dim_cfg = [
        ("comportamental", "#2E74B5", "Comportamental"),
        ("tecnica", "#538135", "Técnica"),
        ("prazos", "#C55A11", "Prazos"),
    ]

    out = [
        f'<svg viewBox="0 0 {w} {total_h}" xmlns="http://www.w3.org/2000/svg" '
        f'style="width:100%;height:auto;display:block">'
    ]

    for row_i, (dim_key, color, label) in enumerate(dim_cfg):
        out.extend(_svg_row_elements(row_i, dim_key, color, label, entries, geom))

    y_xlabels = row_top(2) + rh + xlh - 1
    for i, (mes, _) in enumerate(entries):
        x = xx(i)
        is_last = i == n - 1
        fw = ' font-weight="700"' if is_last else ""
        col = "#1F4E79" if is_last else "#BBBBBB"
        out.append(
            f'<text x="{x:.1f}" y="{y_xlabels:.1f}" text-anchor="middle" '
            f'font-size="7.5" fill="{col}"{fw}>{_esc(mes)}</text>'
        )

    out.append("</svg>")
    return "\n".join(out)


def _render_dimension_paragraphs(evaluation: dict, janela: bool) -> str:
    """Heading + paragraph for each of the 3 dimensions."""
    out = []
    for nota_key, para_key, _dim_key, label in _DIMS:
        nota = evaluation.get(nota_key)
        paragrafo = evaluation.get(para_key)
        if nota is None:
            heading = f"{_esc(label)} — Não avaliado"
        else:
            asterisco = "*" if janela else ""
            heading = f"{_esc(label)} — {nota}{asterisco} ({_esc(_score_label(nota))})"
        out.append(f'<p class="dim-titulo">{heading}</p>')
        if paragrafo:
            out.append(f"<p>{_esc(paragrafo)}</p>")
    return "\n".join(out)


def _render_historico_block(entries: list[tuple[str, dict]]) -> str:
    """'Evolução histórica' card — empty string when there's nothing to chart."""
    if len(entries) < 2:
        return ""
    svg = _svg_evolucao(entries)
    if not svg:
        return ""
    date_range = f"{_esc(entries[0][0])} - {_esc(entries[-1][0])}"
    return "\n".join(
        [
            '<div class="card-hist">',
            '<div class="card-hist-header">'
            '<span class="card-hist-header-title">Evolução histórica</span>'
            f'<span class="card-hist-header-range">{date_range}</span>' + _CLOSE_DIV,
            f'<div class="evolucao-wrap">{svg}</div>',
            _CLOSE_DIV,
        ]
    )


def _render_member(
    evaluation: dict,
    entries: list[tuple[str, dict]],
    mes_label: str,
    first: bool,
) -> str:
    nome = _esc(evaluation["nome"])
    cargo = " · ".join(
        part for part in (evaluation.get("papel_nome"), evaluation.get("senioridade")) if part
    )
    janela = bool(evaluation.get("janela_reduzida"))
    subtitulo = f" · {_esc(cargo)}" if cargo else ""

    page_break = "" if first else '<div style="page-break-before:always"></div>'
    breadcrumb = "" if first else '<p class="prof-breadcrumb">2 · Avaliações individuais</p>'
    out = [page_break, breadcrumb, f"<h3>{nome}{subtitulo}</h3>"]

    if janela:
        out.append(
            '<p class="aviso">[!] Janela de observação reduzida — profissional ausente '
            "parte do mês.</p>"
        )

    out.append('<div class="table-card">')
    out.append(
        '<div class="card-mes-header">'
        '<span class="card-mes-header-title">Avaliação do mês</span>'
        f'<span class="card-mes-header-tag">{_esc(mes_label)}</span>' + _CLOSE_DIV
    )
    out.append(
        '<table><thead><tr><th style="width:4cm">Dimensão</th><th>Nota</th></tr></thead><tbody>'
    )
    for nota_key, _para_key, _dim_key, label in _DIMS:
        out.append(
            f"<tr><td>{_esc(label)}</td><td>{_badge(evaluation.get(nota_key), janela)}</td></tr>"
        )
    out.append("</tbody></table></div>")

    if janela:
        out.append(
            '<p class="rodape-nota">* Nota atribuída com base na janela de observação '
            "disponível.</p>"
        )

    out.append(_render_dimension_paragraphs(evaluation, janela))
    out.append(_render_historico_block(entries))

    return "\n".join(part for part in out if part)


# ── Section 3: Panorama da squad ──────────────────────────────────────────────


def _html_panorama(squad_name: str, competencia: str, evaluations: list[dict]) -> str:
    if not evaluations:
        return ""

    squad = _esc(squad_name)
    mes = _esc(_competencia_label(competencia))

    out = [
        '<div style="page-break-before:always;break-before:page"></div>',
        '<hr class="sec-break">',
        '<div class="sec-header"><span class="sec-num">3</span>'
        + '<span class="sec-title">Panorama da squad</span></div>',
        '<div class="panorama-card">',
        '<div class="panorama-header">'
        + '<div class="panorama-header-label">Panorama da squad</div>'
        + f'<div class="panorama-header-sub">Visão consolidada · {mes} · {squad}</div></div>',
        '<table class="pano-table"><thead><tr><th>Profissional</th>',
    ]
    for _nota_key, _para_key, _dim_key, label in _DIMS:
        out.append(f"<th>{_esc(label)}</th>")
    out.append("</tr></thead><tbody>")

    has_janela = any(ev.get("janela_reduzida") for ev in evaluations)
    for ev in evaluations:
        nome = _esc(ev.get("nome", "—").split()[0])
        cargo = _esc(ev.get("papel_nome") or "")
        janela = bool(ev.get("janela_reduzida"))
        out.append(
            f'<tr><td><div class="prof-nome">{nome}</div><div class="prof-cargo">{cargo}</div></td>'
        )
        for nota_key, _para_key, _dim_key, _label in _DIMS:
            out.append(f"<td>{_badge_compact(ev.get(nota_key), janela)}</td>")
        out.append("</tr>")
    out.append("</tbody></table>")

    legend_items = [(5, "Excelente"), (4, "Bom"), (3, "Regular"), (2, _INSATISFATORIO)]
    legend_html = " &nbsp;·&nbsp; ".join(
        f'<span style="display:inline-block;width:9pt;height:9pt;border-radius:2pt;'
        f"background:{_SCORE_BG[nv]};border:0.3pt solid #C8C8C8;vertical-align:middle;"
        f'margin-right:3pt"></span>{_esc(label)}'
        for nv, label in legend_items
    )
    footnote_parts = [f'<span style="font-size:8pt;color:#666666">{legend_html}</span>']
    if has_janela:
        footnote_parts.append(
            '<span style="font-size:8pt;color:#888888;font-style:italic">'
            "&nbsp;&nbsp;* Nota atribuída com base na janela de observação disponível."
            "</span>"
        )
    out.append(f'<div class="panorama-footnote">{"".join(footnote_parts)}</div>')
    out.append(_CLOSE_DIV)

    out.append('<h2 style="margin-top:14pt">Distribuição por dimensão</h2>')
    out.append('<table class="dist-outer">')
    for nota_key, _para_key, _dim_key, label in _DIMS:
        counts: dict[int, int] = {}
        for ev in evaluations:
            nota = ev.get(nota_key)
            if nota is not None:
                counts[int(nota)] = counts.get(int(nota), 0) + 1
        segments = [(nv, counts[nv]) for nv in (5, 4, 3, 2, 1) if counts.get(nv, 0) > 0]
        if not segments:
            continue
        segs_html = "".join(
            f'<div class="dist-seg" style="flex:{cnt};background:{_SCORE_BG[nv]}">{cnt}</div>'
            for nv, cnt in segments
        )
        out.append(
            f'<tr><td class="dist-label-cell">{_esc(label)}</td>'
            f'<td class="dist-bar-cell"><div class="dist-bar">{segs_html}</div></td></tr>'
        )
    out.append("</table>")

    return "\n".join(out)


# ── CSS ────────────────────────────────────────────────────────────────────────

_CSS_CONTENT = """
@page { size: A4; margin: 1.5cm 2.2cm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #222222; line-height: 1.4;
}
h1 { font-size: 18pt; color: #1F4E79; text-align: center; margin-bottom: 2pt; }
.subtitulo-doc { font-size: 9pt; color: #666666; text-align: center; margin-bottom: 10pt; }
.sec-break { border: none; border-top: 1.5pt solid #1F4E79; margin: 14pt 0 10pt 0; }
.sec-header { margin-bottom: 6pt; page-break-after: avoid; break-after: avoid; }
.sec-num {
    display: inline-block; vertical-align: middle; font-size: 8pt; font-weight: bold;
    color: #2E74B5; background: #EEF4FA; border-radius: 4pt; padding: 2pt 7pt; margin-right: 6pt;
}
.sec-title {
    display: inline-block; vertical-align: middle; font-size: 12pt; font-weight: bold;
    color: #1F4E79;
}
.sec-ref-note { font-size: 8pt; color: #888888; font-style: italic; margin-bottom: 8pt; }
.prof-breadcrumb { font-size: 8pt; color: #888888; margin-bottom: 2pt; letter-spacing: 0.03em; }
h2 {
    font-size: 10pt; font-weight: bold; color: #1F4E79; margin-top: 10pt; margin-bottom: 5pt;
    padding-left: 7pt; border-left: 2.5pt solid #2E74B5;
}
h3 {
    font-size: 11pt; font-weight: bold; color: #1F4E79; margin-top: 12pt; margin-bottom: 6pt;
    padding: 5pt 8pt; background: #F0F6FC; border-left: 3pt solid #2E74B5;
    border-radius: 0 4pt 4pt 0; page-break-after: avoid; break-after: avoid;
}
.dim-titulo {
    font-size: 10pt; font-weight: bold; color: #2E74B5; margin-top: 8pt; margin-bottom: 3pt;
}
p { font-size: 10pt; text-align: justify; padding-left: 8pt; margin-bottom: 6pt; }
.aviso {
    font-style: italic; font-size: 9pt; color: #B45E06; margin-bottom: 6pt; padding-left: 0;
    text-align: left;
}
.rodape-nota {
    font-style: italic; font-size: 8pt; color: #888888; margin: 3pt 0 4pt; padding-left: 0;
    text-align: left;
}
.sobre-doc { font-size: 10pt; text-align: justify; margin-bottom: 8pt; }
hr { border: none; border-top: 0.5pt solid #CCCCCC; margin: 8pt 0; }
.table-card {
    border: 0.5pt solid #D0DCE8; border-radius: 8pt; overflow: hidden; margin-bottom: 8pt;
    page-break-inside: avoid; break-inside: avoid;
}
.card-hist {
    border: 0.5pt solid #D0DCE8; border-radius: 8pt; overflow: hidden; margin-bottom: 8pt;
}
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
thead tr { background: #D6E4F0; border-bottom: 1.5pt solid #2E74B5; }
th {
    font-weight: bold; padding: 6pt 8pt; text-align: left; vertical-align: middle;
    color: #1F4E79;
}
td {
    padding: 6pt 8pt; vertical-align: middle; border-top: 0.4pt solid #DDE6F0;
    background: #ffffff;
}
tbody tr:last-child td { border-bottom: none; }
.badge {
    display: inline-block; padding: 2pt 10pt; border-radius: 20pt; border: 0.3pt solid #C8C8C8;
    font-size: 9pt; font-weight: bold; color: #2D2D2D; white-space: nowrap;
}
.badge-none { background: #EEEEEE; color: #AAAAAA; }
.badge-compact {
    display: inline-block; padding: 1.5pt 5pt; border-radius: 20pt; border: 0.3pt solid #C8C8C8;
    font-size: 7.5pt; font-weight: bold; color: #2D2D2D; white-space: nowrap;
}
.card-mes-header {
    background: #D6E4F0; border-bottom: 1.5pt solid #2E74B5; padding: 5pt 8pt;
    display: flex; justify-content: space-between; align-items: center;
}
.card-mes-header-title {
    font-size: 7.5pt; font-weight: bold; color: #1F4E79; text-transform: uppercase;
    letter-spacing: 0.07em;
}
.card-mes-header-tag {
    font-size: 7.5pt; font-weight: bold; color: #2E74B5; background: #EEF4FA;
    border-radius: 4pt; padding: 1.5pt 7pt;
}
.card-hist-header {
    background: #F5F9FC; border-bottom: 0.5pt solid #DDE6F0; padding: 5pt 8pt;
    display: flex; justify-content: space-between; align-items: center;
}
.card-hist-header-title {
    font-size: 7.5pt; font-weight: bold; color: #2E74B5; text-transform: uppercase;
    letter-spacing: 0.07em;
}
.card-hist-header-range { font-size: 7.5pt; color: #AAAAAA; }
.evolucao-wrap { padding: 6pt 10pt 4pt 10pt; background: #FAFBFD; }
.panorama-card {
    border: 0.5pt solid #D0DCE8; border-radius: 8pt; overflow: hidden; margin-bottom: 8pt;
}
.panorama-header { background: #1F4E79; padding: 7pt 12pt; }
.panorama-header-label {
    font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em;
    color: rgba(255,255,255,0.65);
}
.panorama-header-sub { font-size: 10pt; font-weight: bold; color: #ffffff; margin-top: 1pt; }
.pano-table thead { display: table-header-group; }
.pano-table thead tr { background: #EEF4FA; border-bottom: 1pt solid #C8D8EA; }
.pano-table th { color: #2E74B5; text-align: center; font-size: 8pt; }
.pano-table th:first-child { text-align: left; width: 3.5cm; }
.pano-table th, .pano-table td { padding: 4pt 4pt; }
.pano-table td { text-align: center; }
.pano-table td:first-child { text-align: left; background: #FAFBFD; }
.pano-table tbody tr { page-break-inside: avoid; break-inside: avoid; }
.prof-nome { font-weight: bold; font-size: 9pt; color: #1F4E79; }
.prof-cargo { font-size: 8pt; color: #888888; }
.panorama-footnote {
    padding: 4pt 10pt; font-size: 8pt; color: #888888; font-style: italic;
    border-top: 0.4pt solid #DDE6F0; background: #ffffff;
}
.dist-outer { width: 100%; border-collapse: collapse; margin-bottom: 3pt; }
.dist-outer td { border: none; padding: 2pt 0; background: transparent; }
.dist-label-cell {
    width: 4cm; font-size: 9pt; color: #444444; padding-right: 6pt; vertical-align: middle;
}
.dist-bar-cell { padding: 0; vertical-align: middle; }
.dist-bar { display: flex; width: 100%; height: 18pt; border-radius: 4pt; overflow: hidden; }
.dist-seg {
    display: flex; align-items: center; justify-content: center; font-size: 9pt;
    font-weight: bold; color: #2D2D2D;
}
.footer {
    text-align: center; font-size: 8.5pt; color: #aaa; margin-top: 18pt;
    border-top: 1pt solid #e8e8e8; padding-top: 8pt;
}
"""


def generate_squad_pdf(
    squad_name: str,
    competencia: str,
    evaluations: list[dict],
    *,
    tech_lead_nome: str,
    historico: list[dict] = (),
) -> bytes:
    """Return the PDF as bytes for HTTP streaming.

    evaluations: confirmed tl_evaluations rows joined with squad_members.nome/senioridade
    and tl_evaluation_roles.papel_nome, as returned by
    tl_evaluation_repository.list_evaluations().
    historico: confirmed evaluations for prior competências, as returned by
    tl_evaluation_repository.get_historico() — used to render the per-member evolution chart.
    """
    _ensure_weasyprint()
    from weasyprint import HTML

    gerado_em = datetime.now(tz=UTC).strftime("%d/%m/%Y")
    mes_label = _competencia_label(competencia)

    sections = [
        _html_header(squad_name, competencia, tech_lead_nome, gerado_em),
        _METODOLOGIA_HTML,
    ]

    if evaluations:
        first_ev = evaluations[0]
        first_block = (
            '<hr class="sec-break">'
            '<div style="page-break-inside:avoid;break-inside:avoid">'
            '<div class="sec-header"><span class="sec-num">2</span>'
            '<span class="sec-title">Avaliações individuais</span></div>'
            + _render_member(
                first_ev, _build_historico_entries(first_ev, historico), mes_label, first=True
            )
            + _CLOSE_DIV
        )
        sections.append(first_block)
        for ev in evaluations[1:]:
            sections.append(
                _render_member(ev, _build_historico_entries(ev, historico), mes_label, first=False)
            )
        sections.append(_html_panorama(squad_name, competencia, evaluations))

    sections.append('<div class="footer">Gerado via GABI · DB1 Global Software</div>')

    html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><style>{_CSS_CONTENT}</style></head>
<body>
{"".join(sections)}
</body>
</html>"""

    return HTML(string=html_content).write_pdf()
