#!/usr/bin/env python3
"""Client evaluation domain — pure parser module (no I/O, no FastAPI imports)."""

import html as _html
import re

from gabi_engine import PARTICLES, match_name, norm

_COMPETENCIA_RE = re.compile(r"Compet[eê]ncia:\s*(\d{1,2})\s*/\s*(\d{4})", re.IGNORECASE)
_COLABORADOR_RE = re.compile(r"Colaborador:\s*(.+)", re.IGNORECASE)
_FORNECEDOR_RE = re.compile(r"Fornecedor:\s*(.+)", re.IGNORECASE)
_COMPORTAMENTAL_RE = re.compile(r"Avalia[çc][aã]o\s+Comportamental:\s*(\S+)", re.IGNORECASE)
_TECNICA_RE = re.compile(r"Avalia[çc][aã]o\s+T[eé]cnica:\s*(\S+)", re.IGNORECASE)
_PRAZO_RE = re.compile(r"Avalia[çc][aã]o\s+Prazos\s+de\s+entrega:\s*(\S+)", re.IGNORECASE)
_FEEDBACK_RE = re.compile(r"Feedback:\s*(.*)", re.IGNORECASE)
_IS_SECTION_RE = re.compile(
    r"(Avalia[çc][aã]o\s+(Comportamental|T[eé]cnica|Prazos)|"
    r"OBS:|Feedback:|Resultado\s+da|Total\s+de|Compet[eê]ncia:|Colaborador:|Fornecedor:)",
    re.IGNORECASE,
)

_EXPECTED_FORNECEDOR = "DB1 Global Software"


def _parse_score(value: str, dimension: str) -> int:
    try:
        score = int(value)
    except (ValueError, TypeError):
        raise ValueError(
            f"Nota inválida para '{dimension}': '{value}' não é um número inteiro"
        ) from None
    if not (1 <= score <= 5):
        raise ValueError(f"Nota fora do intervalo para '{dimension}': {score} (esperado: 1-5)")
    return score


def _consume_paragraphs(lines: list, start: int, leading: str = "") -> tuple:
    """Consume lines from start until a section marker or EOF, joined as free text.

    A run of consecutive non-empty lines is one paragraph (its lines joined with a
    single space, undoing hard-wrap); a blank line starts a new paragraph. Paragraphs
    are joined with a blank line so multi-paragraph comments survive intact instead of
    being truncated to their first line. `leading` seeds the first paragraph with text
    already captured on the label's own line (e.g. "Feedback: ...").
    Returns (comentario_or_None, next_index).
    """
    paragraphs: list = []
    current: list = [leading] if leading else []
    j = start
    while j < len(lines):
        stripped = lines[j].strip()
        if stripped and _IS_SECTION_RE.match(stripped):
            break
        if stripped:
            current.append(stripped)
        elif current:
            paragraphs.append(" ".join(current))
            current = []
        j += 1
    if current:
        paragraphs.append(" ".join(current))
    comentario = "\n\n".join(paragraphs) if paragraphs else None
    return comentario, j


def _extract_competencia(match: re.Match) -> str:
    month, year = int(match.group(1)), int(match.group(2))
    return f"{year:04d}-{month:02d}"


_SIMPLE_MATCHERS = (
    ("competencia", _COMPETENCIA_RE, _extract_competencia),
    ("nome_extraido", _COLABORADOR_RE, lambda m: m.group(1).strip()),
    ("fornecedor", _FORNECEDOR_RE, lambda m: m.group(1).strip()),
)

_DIMENSION_MATCHERS = (
    ("comportamental", _COMPORTAMENTAL_RE, "Comportamental"),
    ("tecnica", _TECNICA_RE, "Técnica"),
    ("prazo", _PRAZO_RE, "Prazos de entrega"),
)

_REQUIRED_FIELDS = (
    ("Competência", "competencia"),
    ("Colaborador", "nome_extraido"),
    ("Fornecedor", "fornecedor"),
    ("Avaliação Comportamental", "comportamental_nota"),
    ("Avaliação Técnica", "tecnica_nota"),
    ("Avaliação Prazos de entrega", "prazo_nota"),
)


def _match_simple_field(line: str, fields: dict) -> bool:
    """Try each single-value matcher against line; record the first hit in fields."""
    for key, pattern, extract in _SIMPLE_MATCHERS:
        match = pattern.match(line)
        if match:
            fields[key] = extract(match)
            return True
    return False


def _consume_score_section(
    lines: list, i: int, match: re.Match, dimension: str, has_feedback_label: bool
):
    """Parse a dimension's score, then optionally consume its free-text comment block."""
    nota = _parse_score(match.group(1).strip(), dimension)
    i += 1
    comentario = None
    if not has_feedback_label:
        comentario, i = _consume_paragraphs(lines, i)
    return nota, comentario, i


def _match_dimension_field(lines: list, i: int, line: str, fields: dict, has_feedback_label: bool):
    """Try each dimension matcher against line; return the next index, or None if no match."""
    for key, pattern, dimension in _DIMENSION_MATCHERS:
        match = pattern.match(line)
        if match:
            nota, comentario, next_i = _consume_score_section(
                lines, i, match, dimension, has_feedback_label
            )
            fields[f"{key}_nota"] = nota
            fields[f"{key}_comentario"] = comentario
            return next_i
    return None


def _match_feedback_field(lines: list, i: int, line: str, fields: dict):
    """If line starts the Feedback: block, consume its (possibly multi-paragraph) text."""
    match = _FEEDBACK_RE.match(line)
    if not match:
        return None
    leading = match.group(1).strip()
    comentario, next_i = _consume_paragraphs(lines, i + 1, leading=leading)
    fields["comentario_geral"] = comentario
    return next_i


def _validate_required_fields(fields: dict) -> None:
    missing = [name for name, key in _REQUIRED_FIELDS if fields.get(key) is None]
    if missing:
        raise ValueError(f"Campo(s) obrigatório(s) ausente(s): {', '.join(missing)}")

    fornecedor = fields["fornecedor"]
    if fornecedor != _EXPECTED_FORNECEDOR:
        raise ValueError(f"Fornecedor inválido: '{fornecedor}'. Esperado: '{_EXPECTED_FORNECEDOR}'")


def parse_evaluation(text: str) -> dict:
    """
    Parse a MAG client evaluation plain-text email body.

    Raises ValueError with a descriptive message on any missing required field,
    score outside [1, 5], or Fornecedor mismatch. Never infers or defaults silently.
    """
    lines = text.splitlines()
    has_feedback_label = any(re.match(r"\s*Feedback:", line, re.IGNORECASE) for line in lines)

    fields: dict = dict.fromkeys(
        (
            "competencia",
            "nome_extraido",
            "fornecedor",
            "comportamental_nota",
            "comportamental_comentario",
            "tecnica_nota",
            "tecnica_comentario",
            "prazo_nota",
            "prazo_comentario",
            "comentario_geral",
        )
    )

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        if _match_simple_field(line, fields):
            i += 1
            continue

        next_i = _match_feedback_field(lines, i, line, fields)
        if next_i is not None:
            i = next_i
            continue

        next_i = _match_dimension_field(lines, i, line, fields, has_feedback_label)
        i = next_i if next_i is not None else i + 1

    _validate_required_fields(fields)

    return {
        "competencia": fields["competencia"],
        "nome_extraido": fields["nome_extraido"],
        "fornecedor_validado": 1,
        "comportamental_nota": fields["comportamental_nota"],
        "comportamental_comentario": fields["comportamental_comentario"],
        "tecnica_nota": fields["tecnica_nota"],
        "tecnica_comentario": fields["tecnica_comentario"],
        "prazo_nota": fields["prazo_nota"],
        "prazo_comentario": fields["prazo_comentario"],
        "comentario_geral": fields["comentario_geral"],
    }


def strip_html(content: str) -> str:
    """Strip HTML tags and unescape entities — used on the automated ingest path."""
    # Block-level tags become newlines so the line-by-line parser works on HTML emails
    content = re.sub(r"</?\s*(?:p|br|div|tr|li|h[1-6])\b[^>]*>", "\n", content, flags=re.IGNORECASE)
    content = re.sub(r"<[^>]+>", " ", content)
    return _html.unescape(content)


def _email_to_prefix(email: str) -> str:
    return email.split("@")[0]


def auto_link(nome_extraido: str, active_emails: list) -> tuple:
    """
    Attempt to link nome_extraido to an active team member via match_name().

    Uses norm() and PARTICLES (imported from gabi_engine) to validate the name
    has at least one meaningful token before attempting the match.

    Returns (user_email | None, match_status).
    """
    toks = [t for t in norm(nome_extraido).split() if t not in PARTICLES]
    if not toks:
        return None, "nao_vinculado"

    prefixes = [_email_to_prefix(e) for e in active_emails]
    matched = match_name(nome_extraido, prefixes)
    if matched is None:
        return None, "nao_vinculado"

    email = next((e for e in active_emails if _email_to_prefix(e) == matched), None)
    return email, "auto"
