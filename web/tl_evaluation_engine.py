"""TL evaluation engine — pure module, no I/O.

Encodes all inherited business rules as static data (system prompt and tool
schemas).  The actual Anthropic API call lives in web/core/anthropic_client.py
so this module remains testable without any network access.

Prompt sections and the forbidden-voice-markers list are admin-editable at
runtime (see repositories/tl_evaluation_prompt_repository.py) — this module
stays pure by taking both as plain arguments, never reading the database
itself. The literal values below (`_SYSTEM_PROMPT`, `_FORBIDDEN_VOICE_MARKERS`)
are kept only as the source the defaults/seed data are *derived* from — never
retyped — so the seed migration and the pure-function defaults can never
diverge from each other or from this file's own history.
"""

_FORBIDDEN_VOICE_MARKERS = ("TL", "relato", "reportou")

_SYSTEM_PROMPT = """\
Você é o assistente de avaliação mensal de squad do GABI, um sistema de gestão \
interno da DB1. Sua função é ajudar o Tech Lead (TL) a documentar a avaliação \
mensal de cada profissional da squad nas três dimensões: Comportamental, Técnica \
e Prazos de Entrega, com notas de 1 a 5.

## Escala de referência
- 1-2: Insatisfatório
- 3: Regular
- 4: Bom
- 5: Excelente

Perguntas-guia para calibrar a nota:
- Nota 5: o profissional fez algo além do esperado que foi reconhecido por \
alguém além do TL? Gerou melhoria concreta e visível?
- Nota 4: cumpriu o que era esperado sem ressalvas relevantes?
- Nota 3: teve instabilidade? Às vezes cumpriu, às vezes não? Precisou de \
mais suporte do que o esperado?
- Nota 1-2: o desempenho ficou claramente abaixo do padrão na maior parte \
do mês?

Quando a dúvida for entre 4 e 5, pergunte: "houve algo reconhecido e \
confirmado além do esperado?" Se não, é 4.
Quando a dúvida for entre 2 e 3, pergunte: "houve algum período de \
atendimento ao padrão?" Se sim, é 3.

## Fluxo de trabalho

O TL fornece um relato em texto livre sobre o profissional. Você deve:
1. Mapear o relato às três dimensões.
2. Identificar lacunas de evidência que impeçam uma avaliação precisa.
3. Fazer no máximo 2 rodadas de perguntas cirúrgicas para essas lacunas, \
usando `ask_question`. Cada rodada é uma pergunta única e objetiva. Esse \
teto vale apenas para lacunas de evidência em geral — não para os gates do \
passo 4.
4. Verificar os Gates A e B e o gate de responsabilidades do papel (ver \
seções abaixo). Esses gates são obrigatórios e não contam no teto do passo \
3: use `ask_question` sempre que uma condição de gate estiver pendente, \
mesmo que as 2 rodadas de lacuna do passo 3 já tenham sido usadas.
5. Quando tiver evidência suficiente para todas as dimensões — lacunas \
endereçadas e gates satisfeitos —, usar `propose_evaluation` com nota e \
parágrafo para cada uma.

Antes de cada chamada de ferramenta, faça uma checagem interna rápida (não \
visível ao TL) cobrindo: (a) o que cada dimensão já tem de evidência concreta; \
(b) quais gates — A, B e o de responsabilidades do papel — ainda estão \
pendentes; (c) quantas rodadas de lacuna livre já foram usadas nesta \
conversa, contando as próprias perguntas anteriores no histórico. Use essa \
checagem só para decidir a próxima ação.

## Gate A — Nota 5 exige fato externo de superação

Toda vez que a avaliação convergir para nota 5 em qualquer dimensão, você DEVE \
usar `ask_question` para solicitar um fato concreto de superação reconhecido por \
alguém além do próprio TL — por exemplo: elogio do PO, reconhecimento de outro \
time, agradecimento de cliente, premiação ou destaque formal. Sem esse fato \
externamente reconhecido, a nota máxima que você pode propor é 4. Nunca proponha \
nota 5 sem que esse fato apareça explicitamente no histórico da conversa. Faça essa \
pergunta uma única vez por dimensão: se a resposta trouxer o fato, use-o e proponha \
5; se for negativa ou não trouxer o fato, proponha 4 imediatamente — nunca repita a \
mesma pergunta de Gate A para a mesma dimensão.

## Gate B — Afirmação genérica exige exemplo concreto

Adjetivos fortes ou afirmações genéricas sem fato concreto associado \
("é muito bom tecnicamente", "entrega sempre no prazo", "tem excelente postura") \
não são base suficiente para nota. Se o relato contiver esse tipo de afirmação \
sem exemplo específico, use `ask_question` para solicitar o exemplo antes de \
propor a avaliação. Nunca use a afirmação genérica como única evidência em um \
parágrafo de `propose_evaluation`. Faça essa pergunta uma única vez por \
afirmação: se a resposta trouxer o exemplo, use-o; se não trouxer (ou for \
impressão geral), descarte a afirmação genérica e calibre nota e parágrafo \
apenas pelo que for concreto — nunca repita a mesma pergunta de Gate B para a \
mesma afirmação.

## Regras de geração (inegociáveis)

1. Sem invenção: nunca inclua um exemplo ou fato não mencionado pelo TL.
2. Reciclagem com perspectiva: o mesmo fato pode aparecer em duas dimensões \
quando cada parágrafo explora um ângulo distinto — Comportamental foca no \
comportamento em si, Técnica foca na qualidade do trabalho entregue, Prazos \
foca no impacto na previsibilidade da sprint. Se os parágrafos soarem \
iguais, é reciclagem — reescreva com o ângulo correto.
3. Abertura concreta: o parágrafo deve começar com um fato ou observação \
específica deste mês — nunca com frase genérica reaproveitável.
4. Escopo temporal: descreva o que aconteceu neste mês — não expectativas \
para o próximo.
5. Sem superlativo sem evidência: palavras como "excelente", "ótimo", \
"excepcional" só aparecem com evidência explícita no histórico.
6. Teste de genericidade: se o parágrafo puder descrever qualquer pessoa em \
qualquer mês, está genérico demais e deve ser reescrito.
7. Tom neutro: para pontos negativos, descreva o comportamento e seu \
impacto sem adjetivos de intensidade sem base ("claramente", \
"sistematicamente"), a menos que o TL tenha relatado recorrência explícita.
8. Foco em comportamento, não em julgamento de caráter: descreva a ação \
observável e seu impacto, nunca um rótulo sobre a pessoa — nem negativo \
("é desorganizado", "não é comprometido", "tem perfil difícil") nem positivo \
("é muito proativo", "tem ótimo perfil") sem o comportamento por trás. Se o \
parágrafo puder ser resumido em um adjetivo de personalidade sem perder \
informação, reescreva trocando o adjetivo pelo comportamento que o gerou.
9. Janela reduzida: se o profissional esteve ausente parte do mês (férias, \
licença, início tardio), defina `janela_reduzida = true`, inclua um asterisco ao \
final do parágrafo correspondente e limite as afirmações ao período observado.

## Regra de voz (inegociável)

O parágrafo é a voz do TL registrando a observação — o profissional avaliado é \
sempre o sujeito gramatical. NUNCA use construções que narrem o TL como \
personagem. As seguintes expressões são PROIBIDAS em qualquer campo de parágrafo: \
"TL", "relato", "reportou" (quando usados para narrar o TL). \
Correto: "João entregou as definições técnicas antes do prazo." \
Incorreto: "O TL reportou que João entregou as definições técnicas antes do prazo."

## Instrução de resposta

Você DEVE sempre usar uma das duas ferramentas disponíveis. NUNCA responda com \
texto livre fora de uma ferramenta.
- Use `ask_question` quando faltar evidência para Gate A, Gate B ou para uma \
responsabilidade principal do papel avaliado, ou quando o relato for \
insuficiente para propor nota calibrada em alguma dimensão. Faça uma pergunta \
por vez, objetiva e direcionada à lacuna específica.
- Use `propose_evaluation` quando tiver evidência suficiente para propor nota e \
parágrafo nas três dimensões, respeitando todos os gates e regras acima.

### Exemplo completo (fictício — ilustra o padrão de raciocínio e o estilo \
esperado; nunca reutilize estes fatos, nomes ou números em avaliações reais)

Relato do TL: "A Ana sempre entrega bem e é super proativa, mas teve um atraso \
na Sprint 14 porque a squad de Pagamentos demorou pra responder — ela avisou \
o PO com 2 dias de antecedência."

Checagem: "sempre entrega bem" (superlativo sem evidência) e "super proativa" \
(rótulo de personalidade) não têm fato concreto por trás — Gate B e regra 8 \
pendentes. O atraso na Sprint 14 já é fato concreto e evidência suficiente \
para Prazos.

`ask_question`: "Você mencionou que a Ana sempre entrega bem e é proativa — \
tem um exemplo concreto do mês, uma entrega ou situação específica, que \
mostre isso?"

Resposta do TL: "Foi ela que sugeriu quebrar a história de checkout em duas \
antes de a squad de Pagamentos travar; isso liberou o time pra seguir com o \
resto da sprint."

`propose_evaluation` (parágrafo de Prazos, exemplo de estilo correto): "Na \
Sprint 14, o atraso na resposta da squad de Pagamentos impactou o cronograma \
da Ana; ela comunicou o risco ao PO com dois dias de antecedência, permitindo \
replanejamento antes de o impacto se concretizar." — comportamento e impacto \
descritos, sem rótulo, sem superlativo, sujeito gramatical é a profissional, \
escopo é o mês.\
"""

# ── Section boundaries — order is structural (fixed), bodies are admin data ──
#
# `_ESCALA_HEADER`/`_ESCALA_BODY` are never exposed as an editable section (the
# 1-5 range is coupled to the tool schema and to `tl_evaluations` integer
# columns — see spec 003-tl-evaluation-prompt-admin). Every other header below
# corresponds to one admin-editable row in `tl_evaluation_prompt_sections`.

_ESCALA_HEADER = "## Escala de referência"
_SECTION_HEADERS: tuple[tuple[str, str], ...] = (
    ("fluxo", "## Fluxo de trabalho"),
    ("gateA", "## Gate A — Nota 5 exige fato externo de superação"),
    ("gateB", "## Gate B — Afirmação genérica exige exemplo concreto"),
    ("regras", "## Regras de geração (inegociáveis)"),
    ("voz", "## Regra de voz (inegociável)"),
    ("instrucao", "## Instrução de resposta"),
)

# The set of `section_key` values actually stored as rows in
# `tl_evaluation_prompt_sections` / accepted by the admin PUT endpoint.
# Excludes "voz" (structured forbidden-words list, not free text — see
# `_render_voz_body`) and "escala" (hardcoded, never editable — see module
# docstring / spec 003-tl-evaluation-prompt-admin).
EDITABLE_SECTION_KEYS: tuple[str, ...] = (
    "papel",
    "fluxo",
    "gateA",
    "gateB",
    "regras",
    "instrucao",
    "adicionais",
)


def _derive_defaults() -> tuple[dict[str, str], str]:
    """Slice `_SYSTEM_PROMPT` at its own header markers to get default section
    bodies — never hand-retyped, so they cannot diverge from the literal prompt
    above. Returns (sections, escala_full_block)."""
    text = _SYSTEM_PROMPT
    escala_idx = text.index(_ESCALA_HEADER)
    markers = [(escala_idx, "escala", _ESCALA_HEADER)]
    for key, header in _SECTION_HEADERS:
        markers.append((text.index(header), key, header))
    markers.sort(key=lambda m: m[0])

    bodies: dict[str, str] = {"papel": text[: markers[0][0]].strip("\n")}
    escala_full_block = ""
    for i, (idx, key, header) in enumerate(markers):
        start = idx + len(header)
        end = markers[i + 1][0] if i + 1 < len(markers) else len(text)
        chunk = text[start:end].strip("\n")
        if key == "escala":
            escala_full_block = f"{header}\n{chunk}"
        else:
            bodies[key] = chunk
    return bodies, escala_full_block


_DEFAULT_SECTIONS, _ESCALA_FULL_BLOCK = _derive_defaults()

# `voz`'s default body embeds the default forbidden-words list inline, exactly
# as `_SYSTEM_PROMPT` does — split it out so `_render_voz_body` can re-render
# with an admin-edited word list while keeping the surrounding prose untouched.
_VOZ_DEFAULT_WORDS_REPR = ", ".join(f'"{w}"' for w in _FORBIDDEN_VOICE_MARKERS)
_VOZ_INTRO, _VOZ_OUTRO = _DEFAULT_SECTIONS["voz"].split(_VOZ_DEFAULT_WORDS_REPR)
del _DEFAULT_SECTIONS["voz"]  # not stored verbatim — rendered from forbidden_words instead

_TOOLS: list[dict] = [
    {
        "name": "ask_question",
        "description": (
            "Faça uma pergunta de esclarecimento direcionada ao TL para coletar "
            "evidência ausente (Gate A ou Gate B). Use quando o relato não for "
            "suficiente para propor uma avaliação calibrada."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "Pergunta de esclarecimento única e objetiva.",
                }
            },
            "required": ["question"],
        },
    },
    {
        "name": "propose_evaluation",
        "description": (
            "Proponha nota (1-5) e parágrafo para cada uma das três dimensões "
            "de avaliação. Use somente quando tiver evidência suficiente para "
            "todas as dimensões, respeitando os Gates A e B e a regra de voz."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "comportamental_nota": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 5,
                    "description": "Nota 1-5 para a dimensão Comportamental.",
                },
                "comportamental_paragrafo": {
                    "type": "string",
                    "description": "Parágrafo avaliativo da dimensão Comportamental.",
                },
                "tecnica_nota": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 5,
                    "description": "Nota 1-5 para a dimensão Técnica.",
                },
                "tecnica_paragrafo": {
                    "type": "string",
                    "description": "Parágrafo avaliativo da dimensão Técnica.",
                },
                "prazo_nota": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 5,
                    "description": "Nota 1-5 para a dimensão Prazos de Entrega.",
                },
                "prazo_paragrafo": {
                    "type": "string",
                    "description": "Parágrafo avaliativo da dimensão Prazos de Entrega.",
                },
                "janela_reduzida": {
                    "type": "boolean",
                    "description": (
                        "True quando o profissional esteve ausente parte do mês "
                        "(férias, licença, início tardio)."
                    ),
                },
            },
            "required": [
                "comportamental_nota",
                "comportamental_paragrafo",
                "tecnica_nota",
                "tecnica_paragrafo",
                "prazo_nota",
                "prazo_paragrafo",
                "janela_reduzida",
            ],
        },
    },
]

_CLAUDE_MODEL = "claude-sonnet-4-6"
_MAX_TOKENS = 2048


def default_sections() -> dict[str, str]:
    """The seed content for every admin-editable section (`adicionais` seeds
    empty). Used both as this module's own fallback defaults and by the DB
    migration's one-time seed step — same object, so seed and default can
    never drift apart."""
    return {**_DEFAULT_SECTIONS, "adicionais": ""}


def default_forbidden_words() -> list[str]:
    """The seed content for the forbidden-voice-markers list."""
    return list(_FORBIDDEN_VOICE_MARKERS)


def _render_voz_body(forbidden_words: list[str]) -> str:
    words_repr = ", ".join(f'"{w}"' for w in forbidden_words)
    return f"{_VOZ_INTRO}{words_repr}{_VOZ_OUTRO}"


def build_system_prompt(
    sections: dict[str, str] | None = None,
    forbidden_words: list[str] | None = None,
) -> str:
    """Compose the full system prompt from admin-editable sections plus the
    hardcoded, non-editable *Escala de referência* block. Pure — no I/O; the
    caller resolves `sections`/`forbidden_words` from the database (or omits
    both to get today's shipped defaults, e.g. in tests)."""
    sections = sections if sections is not None else _DEFAULT_SECTIONS
    if forbidden_words is None:
        forbidden_words = list(_FORBIDDEN_VOICE_MARKERS)

    parts = [sections.get("papel", _DEFAULT_SECTIONS["papel"]), _ESCALA_FULL_BLOCK]
    for key, header in _SECTION_HEADERS:
        if key == "voz":
            body = _render_voz_body(forbidden_words)
        else:
            body = sections.get(key, _DEFAULT_SECTIONS.get(key, ""))
        parts.append(f"{header}\n\n{body}")

    adicionais = (sections.get("adicionais") or "").strip()
    if adicionais:
        parts.append(f"## Instruções adicionais\n\n{adicionais}")

    return "\n\n".join(parts)


def get_tools() -> list[dict]:
    """Return the two tool schemas passed to the Anthropic Messages API."""
    return list(_TOOLS)


def escala_reference_text() -> str:
    """The hardcoded *Escala de referência* block, header included — for
    read-only display in the admin prompt screen. Never editable (see module
    docstring)."""
    return _ESCALA_FULL_BLOCK


def model_config() -> dict:
    """Model/token settings used for every chat turn — read-only display value."""
    return {"model": _CLAUDE_MODEL, "max_tokens": _MAX_TOKENS}


def _build_context_section(member_context: dict) -> str:
    """Build the system-prompt section describing squad/member/month context.

    `member_context` shape: {"squad_nome": ..., "membro_nome": ..., "senioridade": ...,
    "competencia": ...}. All keys are optional; a missing one is simply omitted so the
    section degrades gracefully if the caller cannot resolve part of the context.
    """
    lines = ["\n## Contexto da avaliação\n"]
    if member_context.get("squad_nome"):
        lines.append(f"Squad: {member_context['squad_nome']}")
    if member_context.get("membro_nome"):
        lines.append(f"Profissional avaliado: {member_context['membro_nome']}")
    if member_context.get("senioridade"):
        lines.append(f"Senioridade: {member_context['senioridade']}")
    if member_context.get("competencia"):
        lines.append(f"Competência (mês de referência): {member_context['competencia']}")
    lines.append(
        "\nEsses dados já são conhecidos pelo sistema. NUNCA pergunte ao TL sobre qual "
        "profissional, squad ou mês está sendo avaliado — use o nome do profissional "
        "acima diretamente ao se dirigir a ele ou ao gerar perguntas e parágrafos."
    )
    return "\n".join(lines)


def _build_role_section(role: dict) -> str:
    """Build the system-prompt section describing the evaluated member's role.

    `role` matches the shape returned by tl_evaluation_role_repository.get_role():
    {"nome": ..., "descricao": ...,
     "responsabilidades": [{"descricao": ..., "principal": 0|1}, ...]}

    Only *principal* responsibilities become a probing requirement (mirroring Gate
    B): with 8-14 responsibilities per role in the real catalog, treating every one
    as a mandatory question would blow past the 2-round budget. Non-principal
    responsibilities are passed as context only, to help the model map what the TL
    already said — they never trigger a question on their own.
    """
    principais = [r["descricao"] for r in role["responsabilidades"] if r["principal"]]
    secundarias = [r["descricao"] for r in role["responsabilidades"] if not r["principal"]]

    lines = [
        "\n## Papel avaliado\n",
        f"Papel: {role['nome']}",
    ]
    if role.get("descricao"):
        lines.append(f"Descrição do papel: {role['descricao']}")

    if principais:
        lines.append(
            "\nResponsabilidades PRINCIPAIS deste papel — trate a ausência de qualquer uma "
            "delas no relato como lacuna (mesmo padrão do Gate B): use `ask_question` "
            "perguntando especificamente sobre a responsabilidade não endereçada antes de "
            "propor a avaliação. Faça essa pergunta uma única vez por responsabilidade: use "
            "a resposta para mapear a dimensão correspondente; se a resposta não trouxer "
            "informação suficiente, siga com a avaliação usando o que houver disponível — "
            "nunca repita a mesma pergunta sobre a mesma responsabilidade."
        )
        lines.extend(f"- {desc}" for desc in principais)

    if secundarias:
        lines.append(
            "\nDemais responsabilidades do papel — use apenas como contexto para mapear e "
            "categorizar o que o TL já relatou; não exigem pergunta própria se não "
            "mencionadas."
        )
        lines.extend(f"- {desc}" for desc in secundarias)

    return "\n".join(lines)


def build_chat_request(
    messages: list[dict],
    role: dict | None = None,
    member_context: dict | None = None,
    sections: dict[str, str] | None = None,
    forbidden_words: list[str] | None = None,
) -> dict:
    """Assemble the complete Anthropic Messages API request body (no I/O).

    `role` — the evaluated member's catalog role (nome/descricao/responsabilidades),
    or None if the member's role has no catalog entry.

    `member_context` — squad nome, membro nome, senioridade and competência, or None.

    `sections`/`forbidden_words` — admin-editable prompt content, resolved by the
    caller from `tl_evaluation_prompt_repository` (or omitted to fall back to
    today's shipped defaults). Purely data-driven, no I/O in this function.
    """
    system = build_system_prompt(sections, forbidden_words)
    if member_context is not None:
        system = system + _build_context_section(member_context)
    if role is not None:
        system = system + _build_role_section(role)
    return {
        "model": _CLAUDE_MODEL,
        "max_tokens": _MAX_TOKENS,
        "system": system,
        "tools": _TOOLS,
        "tool_choice": {"type": "any"},
        "messages": messages,
    }


def _find_tool_use(response: dict) -> tuple[str, dict] | None:
    """Return (name, input) for the first tool_use block in a response, or None."""
    for block in response.get("content", []):
        if block.get("type") == "tool_use":
            return block["name"], block["input"]
    return None


def parse_tool_response(response: dict, forbidden_words: list[str] | None = None) -> dict:
    """Convert a raw Anthropic Messages API response into a structured chat turn.

    Returns either:
      {"type": "ask_question", "question": "..."}
      {"type": "propose_evaluation", "comportamental_nota": int, ...}

    Raises ValueError if no tool_use block is found or paragraphs violate the
    voice rule. `forbidden_words` must be the same list used to render the
    prompt for this turn (via `build_chat_request`) — passing a different list
    here would let the validator drift from what the model was actually told.
    """
    found = _find_tool_use(response)
    if found is None:
        raise ValueError("Nenhum bloco tool_use encontrado na resposta da API")
    name, inp = found
    if name == "ask_question":
        return {"type": "ask_question", "question": inp["question"]}
    _check_voice_rule(inp, forbidden_words)
    return {"type": "propose_evaluation", **inp}


_PARAGRAPH_FIELDS = (
    "comportamental_paragrafo",
    "tecnica_paragrafo",
    "prazo_paragrafo",
)


def check_voice_violation(
    evaluation: dict, forbidden_words: list[str] | None = None
) -> tuple[str, str] | None:
    """Return (field, marker) for the first forbidden-voice violation in a
    propose_evaluation input, or None if no paragraph violates the rule."""
    markers = forbidden_words if forbidden_words is not None else _FORBIDDEN_VOICE_MARKERS
    for field in _PARAGRAPH_FIELDS:
        text = evaluation.get(field) or ""
        for marker in markers:
            if marker in text:
                return field, marker
    return None


def _check_voice_rule(evaluation: dict, forbidden_words: list[str] | None = None) -> None:
    """Raise ValueError if any paragraph field contains forbidden narration markers."""
    violation = check_voice_violation(evaluation, forbidden_words)
    if violation is not None:
        field, marker = violation
        raise ValueError(
            f"Parágrafo '{field}' contém marcador de narração proibido: '{marker}'"
        )


def check_response_voice_violation(
    response: dict, forbidden_words: list[str] | None = None
) -> tuple[str, str] | None:
    """Peek at a raw propose_evaluation response for a voice-rule violation without
    raising, so the caller (the I/O layer) can retry before surfacing an error to
    the TL. Returns None for ask_question turns and for compliant proposals."""
    found = _find_tool_use(response)
    if found is None:
        return None
    name, inp = found
    if name != "propose_evaluation":
        return None
    return check_voice_violation(inp, forbidden_words)


def build_voice_retry_request(
    request_body: dict, response: dict, field: str, marker: str
) -> dict:
    """Build a follow-up request that asks the model to rewrite a proposal that
    violated the voice rule, by feeding its own tool_use turn back with a
    tool_result naming exactly which field/marker to fix — a single targeted
    self-correction pass instead of a blind resend of the same conversation."""
    tool_use_block = next(b for b in response["content"] if b.get("type") == "tool_use")
    correction = (
        f"A proposta anterior violou a regra de voz: o parágrafo '{field}' contém "
        f"o marcador proibido '{marker}'. Reescreva a proposta completa com o "
        "profissional avaliado como sujeito gramatical em todos os parágrafos, sem "
        "usar esse marcador, mantendo as mesmas notas e o mesmo conteúdo factual."
    )
    messages = [
        *request_body["messages"],
        {"role": "assistant", "content": response["content"]},
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": tool_use_block["id"],
                    "content": correction,
                    "is_error": True,
                }
            ],
        },
    ]
    return {**request_body, "messages": messages}
