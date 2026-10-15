"""Repository for the tl-evaluation domain — role catalog (papel → responsabilidades).

The catalog is global (shared across every squad in the account), maintained by
admins, and referenced by squad_members.role_id. Plain CRUD, no version history —
unlike the append-only pattern used for evaluation confirmations, edits here are
structural (add/remove/edit a responsibility row), not freeform prose.
"""

from db import _db

# ── Seed data — the account's real role catalog ──────────────────────────────

SEED_ROLES: list[dict] = [
    {
        "nome": "Líder de Produto (PO)",
        "descricao": (
            'Responsável pelo "o quê": valor e prioridade. Ponto focal, zela pelo '
            "produto, indicadores, orçamento e prazos. Atua no Discovery e guia "
            "decisões estratégicas."
        ),
        "categoria": "Visão de Produto",
        "responsabilidades": [
            (True, "Define o roadmap de desenvolvimento do produto"),
            (True, "Certifica que a entrega esteja alinhada ao valor esperado na sprint e na PI"),
            (False, "Evolui o produto alinhado à estratégia da CIA"),
            (False, "Lidera o processo de discovery (A3, features)"),
            (False, "Toma decisões baseadas em dados"),
            (False, "Lidera o time sob a visão do produto"),
            (False, "Atua com visão crítica para gerar soluções escaláveis"),
            (False, "Realiza interlocução direta com os stakeholders"),
            (False, "Avalia constantemente a formação do time para os desafios do produto"),
            (False, "Garante a execução e evolução do GD"),
            (False, "Define e acompanha as métricas do produto e entregas (OnePage)"),
            (False, "Coordena a estratégia de comunicação do produto"),
            (False, "Acompanha de perto a operação e feedback dos usuários (GEMBA)"),
        ],
    },
    {
        "nome": "Tech Lead",
        "descricao": (
            'Responsável pelo "como" e pela capacidade de entrega. Lidera o '
            "desenvolvimento, garante a qualidade, eficiência e colabora com o "
            "Arquiteto nas decisões técnicas."
        ),
        "categoria": "Liderança Técnica",
        "responsabilidades": [
            (True, "Responsável técnico pelo sucesso da sprint"),
            (True, "Define a viabilidade técnica (Discovery técnico)"),
            (True, "Atua na distribuição da capacidade do time para maximizar valor entregue"),
            (False, "Planeja requisitos não funcionais e entregas habilitadoras"),
            (False, "Valida com arquitetura modelos e padrões técnicos"),
            (False, "Suporta o time técnico em busca de alta performance"),
            (False, "Garante a qualidade do produto e atualizações tecnológicas"),
            (False, "Atua ativamente na mitigação e comunicação de riscos"),
            (False, "Responsável pela documentação de uso da solução"),
            (False, "Garante a viabilidade das integrações"),
            (False, "Escreve a DOD das demandas"),
            (False, "Ajusta escopo técnico na sprint quando necessário"),
            (
                False,
                "Acompanha indicadores técnicos do produto (performance, latência, taxa de erros)",
            ),
            (False, "Busca apoio técnico proativo (Arquitetura, Dados, Infra)"),
        ],
    },
    {
        "nome": "Analista de Produto",
        "descricao": (
            "Responsável por garantir que o compromisso seja claro, viável e "
            "validado. Facilita a comunicação, garantindo que demandas estejam "
            "bem definidas e alinhadas aos padrões de qualidade."
        ),
        "categoria": "Visão de Produto",
        "responsabilidades": [
            (True, "Define critérios de aceitação das histórias"),
            (True, "Mantém o backlog e priorização junto ao PO"),
            (False, "Responsável de produto pelo sucesso da sprint"),
            (False, "Garante que a entrega esteja alinhada ao valor esperado na sprint e na PI"),
            (False, "Detalha requisitos priorizando o valor da entrega"),
            (False, "Escreve a DOR junto com o PO"),
            (False, "Conduz testes de aceitação e apoia homologações"),
            (False, "Facilita conversas internas e entre times"),
            (False, "Apoia a qualidade e consistência dos ritos"),
            (False, "Dá visibilidade de progresso e riscos da sprint"),
            (False, "Valida ajustes de escopo com foco em valor"),
        ],
    },
    {
        "nome": "Analista de Dados",
        "descricao": (
            "Responsável por transformar dados em insights acionáveis para o "
            "negócio. Atua com foco em análise, mensuração e suporte à decisão "
            "para elevar o valor entregue pelo produto."
        ),
        "categoria": "Dados e Insights",
        "responsabilidades": [
            (True, "Estruturar e manter indicadores-chave do produto"),
            (True, "Transformar dados em insights para decisões de negócio e produto"),
            (True, "Apoiar priorização com análise de impacto e viabilidade"),
            (False, "Construir e evoluir dashboards e relatórios de acompanhamento"),
            (False, "Garantir qualidade, consistência e confiabilidade dos dados analisados"),
            (False, "Mapear hipóteses e desenhar análises para validação de resultados"),
            (False, "Facilitar a leitura dos dados para stakeholders e times"),
            (False, "Monitorar tendências, riscos e oportunidades no desempenho do produto"),
            (False, "Apoiar discovery com evidências quantitativas e qualitativas"),
            (False, "Promover cultura data-driven no dia a dia do time"),
        ],
    },
    {
        "nome": "Desenvolvedor",
        "descricao": (
            "Responsável por implementar e entregar o compromisso com qualidade. "
            "Implementa as funcionalidades acordadas, preza pela qualidade das "
            "entregas e a performance das aplicações."
        ),
        "categoria": "Entrega Técnica",
        "responsabilidades": [
            (True, "Desenvolve e testa funcionalidades"),
            (True, "Responsável por cumprir o DOD"),
            (False, "Assegura o entendimento técnico para execução"),
            (False, "Contribui na definição do DOD"),
            (False, "Cria as tarefas de desenvolvimento conforme o fluxo estabelecido"),
            (False, "Preza pela qualidade do produto"),
            (False, "Implementa requisitos não funcionais e habilitadores"),
            (False, "Participa de revisões de código"),
            (False, "Colabora com o time nas entregas"),
            (False, "Sinaliza impedimentos e riscos com clareza"),
        ],
    },
    {
        "nome": "Arquiteto de Soluções",
        "descricao": (
            "Visão arquitetural de longo prazo. Define a visão arquitetural da "
            "solução, garantindo alinhamento entre negócio, padrões técnicos, "
            "segurança e evolução tecnológica."
        ),
        "categoria": "Estratégia",
        "responsabilidades": [
            (True, "Assegura que decisões de curto prazo não comprometam a arquitetura futura"),
            (True, "Define a visão arquitetural de médio e longo prazo"),
            (True, "Orquestra o processo de tomada de decisão arquitetural"),
            (False, "Mitiga riscos estruturais e de integração"),
            (False, "Promove escalabilidade e sustentabilidade tecnológica"),
            (False, "Desenha arquiteturas técnicas alinhadas ao negócio"),
            (False, "Seleciona tecnologias e padrões de integração"),
            (False, "Garante conformidade com requisitos de segurança"),
            (False, "Valida soluções com times técnicos e de negócio"),
            (False, "Documenta e comunica decisões arquiteturais"),
            (False, "Define padrões de arquitetura reutilizáveis entre squads"),
            (False, "Apoia escalabilidade, performance e resiliência da solução"),
            (False, "Avalia impactos técnicos de mudanças estratégicas"),
            (False, "Apoia decisões de modernização e redução de débito técnico"),
            (False, "Promove padronização entre produtos e times"),
        ],
    },
]


def seed_default_roles(conn) -> None:
    """Populate the role catalog with the account's real roles. Idempotent caller
    guard: main.py only calls this when tl_evaluation_roles is empty. Takes an
    already-open connection — runs inside the same startup transaction as the
    table creation, not its own."""
    for role in SEED_ROLES:
        cursor = conn.execute(
            "INSERT INTO tl_evaluation_roles (nome, descricao, categoria) VALUES (%s, %s, %s)"
            " RETURNING id",
            (role["nome"], role["descricao"], role["categoria"]),
        )
        role_id = cursor.fetchone()["id"]
        for ordem, (principal, descricao) in enumerate(role["responsabilidades"]):
            conn.execute(
                "INSERT INTO tl_evaluation_role_responsibilities"
                " (role_id, descricao, principal, ordem) VALUES (%s, %s, %s, %s)",
                (role_id, descricao, int(principal), ordem),
            )


# ── CRUD ──────────────────────────────────────────────────────────────────────


def create_role(nome: str, descricao: str | None, categoria: str | None):
    with _db() as conn:
        return conn.execute(
            "INSERT INTO tl_evaluation_roles (nome, descricao, categoria) VALUES (%s, %s, %s)"
            " RETURNING *",
            (nome, descricao, categoria),
        ).fetchone()


def update_role(role_id: int, fields: dict) -> int:
    if not fields:
        return 0
    set_clause = ", ".join(k + " = %s" for k in fields)
    sql = f"UPDATE tl_evaluation_roles SET {set_clause} WHERE id = %s"
    values = [*fields.values(), role_id]
    with _db() as conn:
        result = conn.execute(sql, values)
    return result.rowcount


def _attach_responsibilities(conn, roles: list) -> list[dict]:
    role_ids = [r["id"] for r in roles]
    if not role_ids:
        return []
    placeholders = ", ".join("%s" for _ in role_ids)
    resp_rows = conn.execute(
        f"SELECT * FROM tl_evaluation_role_responsibilities"
        f" WHERE role_id IN ({placeholders}) ORDER BY ordem, id",
        role_ids,
    ).fetchall()
    by_role: dict[int, list] = {rid: [] for rid in role_ids}
    for row in resp_rows:
        by_role[row["role_id"]].append(dict(row))
    return [{**dict(r), "responsabilidades": by_role[r["id"]]} for r in roles]


def list_roles() -> list[dict]:
    """All roles with their responsibilities nested."""
    with _db() as conn:
        roles = conn.execute("SELECT * FROM tl_evaluation_roles ORDER BY nome").fetchall()
        return _attach_responsibilities(conn, roles)


def get_role(role_id: int) -> dict | None:
    """A single role with responsibilities nested, or None."""
    with _db() as conn:
        role = conn.execute(
            "SELECT * FROM tl_evaluation_roles WHERE id = %s", (role_id,)
        ).fetchone()
        if role is None:
            return None
        return _attach_responsibilities(conn, [role])[0]


def add_responsibility(role_id: int, descricao: str, principal: bool, ordem: int):
    with _db() as conn:
        return conn.execute(
            "INSERT INTO tl_evaluation_role_responsibilities"
            " (role_id, descricao, principal, ordem) VALUES (%s, %s, %s, %s) RETURNING *",
            (role_id, descricao, int(principal), ordem),
        ).fetchone()


def update_responsibility(resp_id: int, fields: dict) -> int:
    if not fields:
        return 0
    updated = dict(fields)
    if "principal" in updated:
        updated["principal"] = int(updated["principal"])
    set_clause = ", ".join(k + " = %s" for k in updated)
    sql = f"UPDATE tl_evaluation_role_responsibilities SET {set_clause} WHERE id = %s"
    values = [*updated.values(), resp_id]
    with _db() as conn:
        result = conn.execute(sql, values)
    return result.rowcount


def delete_responsibility(resp_id: int) -> int:
    with _db() as conn:
        result = conn.execute(
            "DELETE FROM tl_evaluation_role_responsibilities WHERE id = %s", (resp_id,)
        )
    return result.rowcount
