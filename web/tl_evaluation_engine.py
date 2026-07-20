"""TL evaluation engine — pure module, no I/O.

Encodes all inherited business rules as static data (system prompt and tool
schemas).  The actual Anthropic API call lives in web/core/anthropic_client.py
so this module remains testable without any network access.
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

## Fluxo de trabalho

O TL fornece um relato em texto livre sobre o profissional. Você deve:
1. Mapear o relato às três dimensões.
2. Identificar lacunas de evidência que impeçam uma avaliação precisa.
3. Fazer no máximo 2 rodadas de perguntas cirúrgicas, usando `ask_question`. \
Cada rodada é uma pergunta única e objetiva.
4. Quando tiver evidência suficiente para todas as dimensões, usar \
`propose_evaluation` com nota e parágrafo para cada uma.

## Gate A — Nota 5 exige fato externo de superação

Toda vez que a avaliação convergir para nota 5 em qualquer dimensão, você DEVE \
usar `ask_question` para solicitar um fato concreto de superação reconhecido por \
alguém além do próprio TL — por exemplo: elogio do PO, reconhecimento de outro \
time, agradecimento de cliente, premiação ou destaque formal. Sem esse fato \
externamente reconhecido, a nota máxima que você pode propor é 4. Nunca proponha \
nota 5 sem que esse fato apareça explicitamente no histórico da conversa.

## Gate B — Afirmação genérica exige exemplo concreto

Adjetivos fortes ou afirmações genéricas sem fato concreto associado \
("é muito bom tecnicamente", "entrega sempre no prazo", "tem excelente postura") \
não são base suficiente para nota. Se o relato contiver esse tipo de afirmação \
sem exemplo específico, use `ask_question` para solicitar o exemplo antes de \
propor a avaliação. Nunca use a afirmação genérica como única evidência em um \
parágrafo de `propose_evaluation`.

## Regras de geração (inegociáveis)

1. Sem invenção: nunca inclua um exemplo ou fato não mencionado pelo TL.
2. Abertura concreta: o parágrafo deve começar com um fato ou observação \
específica deste mês — nunca com frase genérica reaproveitável.
3. Sem superlativo sem evidência: palavras como "excelente", "ótimo", \
"excepcional" só aparecem com evidência explícita no histórico.
4. Teste de genericidade: se o parágrafo puder descrever qualquer pessoa em \
qualquer mês, está genérico demais e deve ser reescrito.
5. Janela reduzida: se o profissional esteve ausente parte do mês (férias, \
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
- Use `ask_question` quando faltar evidência para Gate A ou Gate B, ou quando \
o relato for insuficiente para propor nota calibrada em alguma dimensão. Faça \
uma pergunta por vez, objetiva e direcionada à lacuna específica.
- Use `propose_evaluation` quando tiver evidência suficiente para propor nota e \
parágrafo nas três dimensões, respeitando todos os gates e regras acima.\
"""

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


def build_system_prompt() -> str:
    """Return the static system prompt encoding all business rules."""
    return _SYSTEM_PROMPT


def get_tools() -> list[dict]:
    """Return the two tool schemas passed to the Anthropic Messages API."""
    return list(_TOOLS)


def build_chat_request(messages: list[dict]) -> dict:
    """Assemble the complete Anthropic Messages API request body (no I/O)."""
    return {
        "model": _CLAUDE_MODEL,
        "max_tokens": _MAX_TOKENS,
        "system": _SYSTEM_PROMPT,
        "tools": _TOOLS,
        "tool_choice": {"type": "any"},
        "messages": messages,
    }


def parse_tool_response(response: dict) -> dict:
    """Convert a raw Anthropic Messages API response into a structured chat turn.

    Returns either:
      {"type": "ask_question", "question": "..."}
      {"type": "propose_evaluation", "comportamental_nota": int, ...}

    Raises ValueError if no tool_use block is found or paragraphs violate the
    voice rule.
    """
    for block in response.get("content", []):
        if block.get("type") != "tool_use":
            continue
        name = block["name"]
        inp = block["input"]
        if name == "ask_question":
            return {"type": "ask_question", "question": inp["question"]}
        if name == "propose_evaluation":
            _check_voice_rule(inp)
            return {"type": "propose_evaluation", **inp}
    raise ValueError("Nenhum bloco tool_use encontrado na resposta da API")


def _check_voice_rule(evaluation: dict) -> None:
    """Raise ValueError if any paragraph field contains forbidden narration markers."""
    paragraph_fields = (
        "comportamental_paragrafo",
        "tecnica_paragrafo",
        "prazo_paragrafo",
    )
    for field in paragraph_fields:
        text = evaluation.get(field) or ""
        for marker in _FORBIDDEN_VOICE_MARKERS:
            if marker in text:
                raise ValueError(
                    f"Parágrafo '{field}' contém marcador de narração proibido: '{marker}'"
                )
