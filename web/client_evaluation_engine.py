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
    except ValueError, TypeError:
        raise ValueError(
            f"Nota inválida para '{dimension}': '{value}' não é um número inteiro"
        ) from None
    if not (1 <= score <= 5):
        raise ValueError(f"Nota fora do intervalo para '{dimension}': {score} (esperado: 1-5)")
    return score


def _next_non_empty(lines: list, start: int) -> tuple:
    """Return (index, stripped_line) of the first non-empty line at or after start."""
    j = start
    while j < len(lines) and not lines[j].strip():
        j += 1
    return j, (lines[j].strip() if j < len(lines) else "")


def parse_evaluation(text: str) -> dict:
    """
    Parse a MAG client evaluation plain-text email body.

    Raises ValueError with a descriptive message on any missing required field,
    score outside [1, 5], or Fornecedor mismatch. Never infers or defaults silently.
    """
    lines = text.splitlines()
    has_feedback_label = any(re.match(r"\s*Feedback:", line, re.IGNORECASE) for line in lines)

    competencia = None
    nome_extraido = None
    fornecedor = None
    comportamental_nota = None
    comportamental_comentario = None
    tecnica_nota = None
    tecnica_comentario = None
    prazo_nota = None
    prazo_comentario = None
    comentario_geral = None

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        m = _COMPETENCIA_RE.match(line)
        if m:
            month, year = int(m.group(1)), int(m.group(2))
            competencia = f"{year:04d}-{month:02d}"
            i += 1
            continue

        m = _COLABORADOR_RE.match(line)
        if m:
            nome_extraido = m.group(1).strip()
            i += 1
            continue

        m = _FORNECEDOR_RE.match(line)
        if m:
            fornecedor = m.group(1).strip()
            i += 1
            continue

        m = _COMPORTAMENTAL_RE.match(line)
        if m:
            comportamental_nota = _parse_score(m.group(1).strip(), "Comportamental")
            i += 1
            if not has_feedback_label:
                j, next_line = _next_non_empty(lines, i)
                if next_line and not _IS_SECTION_RE.match(next_line):
                    comportamental_comentario = next_line
                    i = j + 1
            continue

        m = _TECNICA_RE.match(line)
        if m:
            tecnica_nota = _parse_score(m.group(1).strip(), "Técnica")
            i += 1
            if not has_feedback_label:
                j, next_line = _next_non_empty(lines, i)
                if next_line and not _IS_SECTION_RE.match(next_line):
                    tecnica_comentario = next_line
                    i = j + 1
            continue

        m = _PRAZO_RE.match(line)
        if m:
            prazo_nota = _parse_score(m.group(1).strip(), "Prazos de entrega")
            i += 1
            if not has_feedback_label:
                j, next_line = _next_non_empty(lines, i)
                if next_line and not _IS_SECTION_RE.match(next_line):
                    prazo_comentario = next_line
                    i = j + 1
            continue

        m = _FEEDBACK_RE.match(line)
        if m:
            comentario_geral = m.group(1).strip()
            i += 1
            continue

        i += 1

    missing = [
        name
        for name, val in [
            ("Competência", competencia),
            ("Colaborador", nome_extraido),
            ("Fornecedor", fornecedor),
            ("Avaliação Comportamental", comportamental_nota),
            ("Avaliação Técnica", tecnica_nota),
            ("Avaliação Prazos de entrega", prazo_nota),
        ]
        if val is None
    ]
    if missing:
        raise ValueError(f"Campo(s) obrigatório(s) ausente(s): {', '.join(missing)}")

    if fornecedor != _EXPECTED_FORNECEDOR:
        raise ValueError(f"Fornecedor inválido: '{fornecedor}'. Esperado: '{_EXPECTED_FORNECEDOR}'")

    return {
        "competencia": competencia,
        "nome_extraido": nome_extraido,
        "fornecedor_validado": 1,
        "comportamental_nota": comportamental_nota,
        "comportamental_comentario": comportamental_comentario,
        "tecnica_nota": tecnica_nota,
        "tecnica_comentario": tecnica_comentario,
        "prazo_nota": prazo_nota,
        "prazo_comentario": prazo_comentario,
        "comentario_geral": comentario_geral,
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
