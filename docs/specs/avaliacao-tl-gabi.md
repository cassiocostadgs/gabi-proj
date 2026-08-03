# Spec — Avaliação Mensal da Squad pelo TL (MAG) no GABI

**Status**: Rascunho para desenvolvimento
**Autor**: Tiago (DM conta MAG)
**Data**: 2026-07-15
**Bounded context proposto**: `tl-evaluation` (novo domínio no GABI, ver `.agents/maps/functional-map.md` e `.agents/specs/002-tl-evaluation/spec.md`)

> **Nota de nomenclatura**: este domínio **não é uma autoavaliação do TL**. É a avaliação que o **TL faz de cada profissional da própria squad**, mês a mês, para servir de insumo técnico ao PO. O documento `.agents/specs/001-team-billing-client-evaluations/spec.md` (linha "Merging or comparing with TL self-evaluation") e `docs/specs/avaliacao-cliente-mag.md` (linha "Cruzamento com autoavaliação do TL") usam o rótulo "autoavaliação" de forma imprecisa — vale corrigi-lo nesses dois documentos numa revisão futura, fora do escopo desta spec.

---

## Problem Statement

Hoje o TL fornece o insumo técnico da avaliação mensal ao PO através de uma skill de IA (Claude Cowork) que roda **localmente, na conta individual de cada TL**. A skill conduz um relato em texto livre por profissional da squad, interpreta o relato em três dimensões (Comportamental, Técnica, Prazos de Entrega), aplica gates de qualidade antes de sugerir nota (evidência obrigatória para nota 5; exemplo concreto obrigatório para afirmação genérica), gera um PDF calibrado e mantém histórico por squad em arquivos locais (`avaliacoes/<squad>/historico.json`).

Esse desenho tem três problemas estruturais:

1. **Atualização fragmentada.** Qualquer ajuste de regra (ex.: a correção de voz gramatical que motivou esta spec — parágrafos que saíam em 3ª pessoa, "o TL reportou...", em vez da voz do próprio TL) precisa ser distribuído e instalado manualmente por cada TL, um a um, via botão de instalar/atualizar no Cowork. Não há garantia de que todos estejam na versão mais recente.
2. **Lógica de negócio fora do sistema.** As regras de avaliação (escala, gates, tom) não vivem versionadas no GABI, que é o sistema de gestão de squad/billing/cliente já em produção para a conta MAG — vivem numa skill externa, sem histórico de mudança rastreável junto ao resto do domínio.
3. **Billing fragmentado.** Se cada TL precisasse de uma chave de API própria para essa IA, o custo e a governança ficariam pulverizados por pessoa, em vez de centralizados como o restante da operação da conta.

Esta spec propõe mover esse processo para dentro do GABI como um domínio novo, preservando o fluxo interativo (relato livre + perguntas de esclarecimento) que a skill já validou em uso real, e centralizando a chamada à API da Claude numa única credencial da organização.

## Evidência real (regras herdadas da skill Cowork `avaliacao-mensal-tl`)

A skill hoje em uso é a fonte da verdade operacional das regras de negócio deste domínio. Resumo do que ela já implementa e que este domínio deve herdar 1:1:

- **3 dimensões, nota de 1 a 5**: Comportamental, Técnica, Prazos de Entrega — com escala de referência obrigatória (1–2 Insatisfatório, 3 Regular, 4 Bom, 5 Excelente) e perguntas-guia de calibração por faixa.
- **Fluxo por profissional**: relato livre → mapeamento às 3 dimensões → identificação de lacunas → complementação via perguntas cirúrgicas (no máximo 2 rodadas) → geração → confirmação.
- **Gate A (nota 5)**: toda vez que a avaliação convergir para nota 5, exige um fato concreto de superação reconhecido por alguém além do TL (PO, outro time, cliente); sem isso, a nota cai para 4.
- **Gate B (afirmação sem exemplo)**: adjetivo ou afirmação forte sem fato concreto associado ("é muito bom tecnicamente") não é aceito como base de nota — o sistema questiona antes de convergir.
- **Regras de geração inegociáveis**: sem invenção de exemplo não mencionado pelo TL; abertura de parágrafo concreta (nunca frase genérica reaproveitável); sem superlativo sem evidência; teste de genericidade (se o parágrafo serve para qualquer pessoa/mês, está genérico demais); janela reduzida sinalizada com asterisco quando o profissional esteve ausente parte do mês.
- **Regra de voz (adicionada nesta rodada)**: o parágrafo é a voz do próprio TL registrando a observação — nunca uma narração sobre o TL ("o TL reportou...", "segundo o TL..."). O profissional avaliado é sempre o sujeito da ação.
- **Persistência hoje**: `historico.json` por squad (metadados de squad/TL/profissionais + notas históricas), `avaliacao_<MesAno>.json` (avaliação do mês corrente) e PDF gerado via script Python com `weasyprint` (`scripts/generate_pdf.py`).

## Contexto e decisões já tomadas

Estas decisões foram validadas com o solicitante nesta rodada e **não são reabertas** neste documento:

| Decisão | Resolução |
|---|---|
| Onde o sistema roda | Dentro do **GABI** — novo domínio `tl-evaluation`, ao lado dos já existentes (incluindo `client-evaluation`, que resolve o lado inverso do mesmo processo: a nota que o cliente devolve) |
| Natureza da avaliação | O TL avalia **cada profissional da própria squad** — não é autoavaliação do TL. Ver nota de nomenclatura no topo do documento |
| Fluxo de interação | **Chat interativo fiel à skill atual** — relato livre por profissional, com a IA perguntando de volta quando falta evidência para os Gates A/B, em vez de um formulário único de preenchimento |
| Motor de geração | Chamada à **API da Claude (Messages API, com tool use)** a partir do backend do GABI. Diferente de `client-evaluation` (parser determinístico, sem LLM) — este é o primeiro domínio do GABI com dependência de IA generativa |
| Billing/autenticação da API da Claude | **Uma única API key da organização Anthropic da DB1, em Workspace dedicado** (ex. "GABI"). Decisões descartadas nesta rodada: (a) usar a assinatura pessoal (Pro/Max) de cada TL — o OAuth de assinatura é restrito por termos da Anthropic a uso individual em apps nativos, não a um backend compartilhado servindo várias pessoas; (b) reaproveitar a key de outro sistema interno já existente (Amelia) — mistura rate limit, custo e superfície de risco de segurança entre dois sistemas não relacionados. Ambas descartadas em favor de Workspace próprio dentro da mesma organização Anthropic, faturado junto com o resto |
| Regras de negócio (dimensões, notas, gates, tom) | Herdadas 1:1 da skill Cowork existente — ela é a fonte da verdade até serem versionadas neste domínio; qualquer dúvida de comportamento remete a ela (ver seção "Evidência real" acima) |
| Squad como conceito de dados | **Não existe hoje** em `team_members` (só `profile`/`subcontrato`/`cpf`) — gap já registrado como aberto em `.agents/specs/001-team-billing-client-evaluations/spec.md` ("Squad concept not yet in the data model"). Este domínio precisa resolvê-lo: introduz `squads` e `squad_members` |
| Perfil de TL — flag ou derivação | **Derivado, sem coluna nova.** "Ser TL" não é um atributo armazenado em conta de usuário — é consequência direta de constar como `squads.tech_lead_user_email` de alguma squad. Se o admin reatribuir a squad a outra pessoa, o TL anterior perde acesso automaticamente, sem nenhum campo para "desmarcar" em outro lugar. Quatro opções comparadas nesta rodada: (A) derivado — adotado; (B) flag global em `team_members`/`users`; (C) híbrido, com um retrato cacheado no JWT; (D) flag + squad obrigatória dentro do cadastro de equipe. B e D foram descartadas por criarem uma segunda fonte de verdade sem garantia de banco (a obrigatoriedade é só validação de formulário) e por colocarem um conceito do domínio `tl-evaluation` dentro da tabela `team_members`, que pertence ao domínio Team & Billing. C foi descartada por resolver um custo de performance que não existe nesta escala |
| Cardinalidade squad × TL | **1:1 confirmado.** Uma squad tem um TL só, e um TL lidera no máximo uma squad ao mesmo tempo. Isso permite declarar `squads.tech_lead_user_email` como `UNIQUE` (não só `NOT NULL`) — o banco impede estruturalmente atribuir a mesma pessoa como TL de duas squads |
| Onde o TL é atribuído | **Só na tela de squads (`/admin/squads`), não no cadastro de equipe.** Decisão desta rodada: a gestão de membros por parte do TL já vai exigir uma tela própria de qualquer forma (RF02/RF03), então não há ganho em duplicar a atribuição de TL dentro do cadastro de equipe — evita duas superfícies de UI escrevendo no mesmo dado |
| Gestão de membros da squad | **Escrita é do TL, não do admin.** O admin só cadastra a squad e diz quem é o TL responsável; a partir daí, é o próprio TL quem cria/edita/desativa os membros (nome, papel, senioridade, fornecedor) da própria squad. Correção desta rodada — a primeira versão desta spec havia colocado a gestão de membros como responsabilidade do admin |
| Visibilidade dos membros | **Admin tem leitura de qualquer squad.** Mesmo sem poder criar/editar/desativar, o admin precisa conseguir visualizar os membros que cada TL cadastrou, para acompanhamento — leitura compartilhada, escrita exclusiva do TL |
| Seleção do TL responsável | **A partir de usuário já cadastrado no GABI, nunca texto livre.** Ao criar/editar uma squad, o admin escolhe o TL de uma lista de contas já existentes (`team_members`/`users`) — não digita nome nem e-mail à mão. Elimina erro de digitação e garante que todo TL responsável já tem login no sistema |
| Identidade do membro da squad | **A maioria são terceiros de outros fornecedores, sem conta no GABI.** `squad_members` não tem vínculo com `team_members`/login — guarda apenas texto livre: Nome, Papel, Senioridade, Fornecedor. Só o TL (que lidera a squad) precisa ser um usuário GABI de verdade |
| PDF | Reaproveita o script já existente na skill (`generate_pdf.py`, `weasyprint`), portado para módulo do GABI |
| Convivência com a skill Cowork atual | Convivem durante a transição — a skill não é desligada por esta spec; desligamento é decisão futura, após validação do fluxo no GABI |
| Cruzamento com `client-evaluation` | Não nesta versão — registros paralelos, mesma decisão já tomada para o domínio irmão |

## Non-Goals (v1)

- **Autoavaliação do TL sobre si mesmo** — não é o que este domínio faz; o nome e a UI não devem sugerir isso.
- **Cruzamento ou consolidação com a nota do cliente** (`client-evaluation`) — ficam como registros paralelos, mesmo princípio já adotado no domínio irmão.
- **Envio automático do PDF ao PO** — o TL continua enviando manualmente (e-mail ou outro canal) depois de gerar o PDF no GABI.
- **Papel de TL com permissões amplas de admin** — TL só vê/opera a própria squad; não vira um segundo tipo de admin geral.
- **Visão do profissional avaliado sobre a própria nota do TL** — diferente de `client-evaluation`, que já expõe ao profissional; aqui o consumidor final nesta versão é o PO, fora do GABI. Nem é tecnicamente possível sem mudança maior: a maioria dos membros de squad avaliados é terceiro sem conta no GABI.
- **Migração automática do histórico já existente** em `historico.json` nas pastas locais dos TLs — fica como tarefa separada de importação, se decidido.

## Usuários e Personas

- **Tech Lead (TL)**: usuário comum já autenticado no GABI (`is_admin=false`), vinculado a uma ou mais squads como responsável (`squads.tech_lead_user_email`). É a única persona que precisa de conta no GABI para operar este domínio. Consome: cadastro dos próprios membros de squad (nome, papel, senioridade, fornecedor), chat de avaliação por membro, histórico da própria squad, geração de PDF.
- **Admin**: cadastra squads e define quem é o TL responsável por cada uma; pode consultar avaliações de qualquer squad (mesmo padrão de admin já usado no restante do GABI). Não gerencia membros de squad — isso é do TL.
- **Membro da squad avaliado**: não é usuário do GABI. Majoritariamente terceiro, de outro fornecedor, sem login no sistema — existe apenas como registro (nome, papel, senioridade, fornecedor) dentro de `squad_members`, mantido pelo TL. Recebe o resultado indiretamente, via PDF que o TL envia ao PO fora do GABI.

## User Stories

1. Como TL, quero relatar em texto livre o mês de cada profissional da minha squad e ser guiado por perguntas de esclarecimento quando faltar evidência, para não preencher um formulário rígido.
2. Como TL, quero que o sistema não sugira nota 5 sem eu confirmar um fato de superação reconhecido além de mim, para manter a calibração da escala.
3. Como TL, quero que afirmações genéricas ("é muito bom tecnicamente") sejam questionadas antes de virar texto final, para evitar avaliação vaga.
4. Como TL, quero revisar e confirmar nota e parágrafo por dimensão antes de fechar, podendo ajustar qualquer um dos dois.
5. Como TL, quero gerar o PDF da squad no mês, no mesmo layout que já uso hoje, para enviar ao PO sem mudar meu processo de entrega.
6. Como TL, quero ver o histórico de notas da minha squad ao longo dos meses, para calibrar a nota atual com o padrão anterior.
7. Como admin, quero cadastrar squads e atribuir o TL responsável, para que o vínculo de acesso exista antes do TL configurar e avaliar a própria squad.
8. Como TL, quero cadastrar e manter os membros da minha squad (nome, papel, senioridade, fornecedor), para manter a squad atualizada sem depender do admin — a maioria são terceiros de outros fornecedores, sem conta no GABI.
9. Como TL, quero acessar apenas as squads onde sou responsável — não quero ver ou editar a squad de outro TL.

## Requisitos

### Must-Have (P0)

**RF01 — Cadastro de squads e atribuição do TL responsável (admin)**
- Nova entidade `squads` (nome, e-mail do TL responsável). Ação exclusiva do admin: criar a squad e vincular o TL — nada de gestão de membros aqui.
- O TL é **selecionado a partir da lista de usuários já cadastrados no GABI** — a tela não tem campo de texto livre para nome ou e-mail; o admin escolhe entre contas já existentes.
- Critério de aceite:
  - [ ] Um TL só enxerga e opera a(s) squad(s) onde `tech_lead_user_email` é o próprio e-mail.
  - [ ] Reatribuir `tech_lead_user_email` a outra pessoa transfere o acesso de TL imediatamente — sem nenhum campo adicional para atualizar.
  - [ ] Só é possível atribuir como TL um usuário que já existe no GABI; não há como digitar um nome/e-mail novo na hora do cadastro da squad.

**RF02 — Gestão de membros da squad (TL escreve, admin visualiza)**
- Nova entidade `squad_members`, mantida inteiramente pelo TL responsável pela squad: adicionar, editar e desativar membros — Nome, Papel, Senioridade e Fornecedor, texto livre, **sem exigir conta no GABI** (a maioria dos membros avaliados é terceiro de outro fornecedor).
- O admin não cria, edita nem desativa membros — mas precisa conseguir **visualizar** os membros de qualquer squad, para acompanhamento.
- Critério de aceite:
  - [ ] TL cria/edita/desativa membros apenas da própria squad.
  - [ ] Admin visualiza (somente leitura) os membros de qualquer squad, sem opção de criar/editar/desativar na própria tela de admin.
  - [ ] Membro desativado não aparece na avaliação do mês corrente, mas seu histórico de notas anteriores é preservado.

**RF03 — Sessão de chat de avaliação por membro da squad**
- Endpoint que recebe o histórico de mensagens da conversa e devolve a próxima interação da IA, usando tool use da API da Claude para diferenciar duas formas estruturadas: pergunta de esclarecimento (equivalente ao AskUserQuestion da skill) ou proposta de avaliação (nota + parágrafo por dimensão).
- As regras herdadas (escala, Gates A/B, tom, regra de voz) vivem como lógica de prompt/schema no backend — não repetidas no frontend.
- Critério de aceite:
  - [ ] Convergência para nota 5 sem fato de superação reconhecido é sempre seguida de uma pergunta de esclarecimento, nunca aceita direto.
  - [ ] Afirmação genérica sem exemplo concreto é sempre seguida de pergunta antes de virar texto final.
  - [ ] Nenhum parágrafo final contém "TL", "relato" ou "reportou" como narração em 3ª pessoa.

**RF04 — Confirmação e persistência da avaliação**
- TL confirma nota e parágrafo por dimensão antes de fechar; pode ajustar qualquer um antes de confirmar.
- Critério de aceite:
  - [ ] Avaliação não confirmada não aparece no PDF nem no histórico.
  - [ ] Avaliação confirmada fica associada a squad, competência e membro da squad, sem permitir duplicata do mesmo trio.

**RF05 — Geração de PDF por squad/competência**
- Reaproveita layout e lógica de `generate_pdf.py` (weasyprint), portado para módulo do backend.
- Critério de aceite:
  - [ ] PDF agrega todos os membros confirmados da squad na competência selecionada, no mesmo layout hoje usado pela skill.
  - [ ] Geração só é permitida com ao menos uma avaliação confirmada na competência.

**RF06 — Histórico por squad**
- TL consulta competências anteriores (nota + texto) da própria squad, mesmo espírito do `historico.json` hoje.
- Critério de aceite:
  - [ ] Histórico inclui membros já desativados da squad, sem misturá-los na lista de avaliação do mês corrente.

**RF07 — Isolamento de acesso por squad**
- Critério de aceite:
  - [ ] TL autenticado que tenta acessar squad (avaliação ou gestão de membros) onde não é responsável recebe `403`.
  - [ ] Admin acessa qualquer squad sem essa restrição, mas não tem endpoint de gestão de membros neste domínio (RF02 é exclusivo do TL).

### Nice-to-Have (P1)

- **RF08** — Exportação do histórico em XLSX (reaproveitando `openpyxl`, já usado no domínio `team-billing`).

### Future Considerations (P2)

- Cruzamento com `client-evaluation` numa tela comparativa — mesma direção já mapeada em `001-team-billing-client-evaluations/spec.md`.
- Envio automático do PDF por e-mail ao PO.
- Visão do próprio profissional avaliado sobre a nota do TL.
- Migração/importação do histórico legado em `historico.json`.
- Desligamento da skill Cowork `avaliacao-mensal-tl`, após validação do fluxo no GABI por um ou mais ciclos mensais completos.

## Fluxo de Chat / Integração com a API da Claude

- Endpoint único e sem estado no servidor: o histórico completo da conversa (mensagens do TL e da IA) é enviado a cada chamada pelo frontend — padrão comum de integração de chat com LLM, evita precisar persistir estado de conversa antes da avaliação ser confirmada.
- **Tool use** da API da Claude força a resposta da IA a uma de duas formas estruturadas: `ask_question` (pergunta + opções, equivalente ao AskUserQuestion da skill) ou `propose_evaluation` (nota 1–5 e parágrafo por dimensão). O frontend renderiza cada uma de forma diferente (bolha de pergunta com botões vs. cartão de revisão).
- Autenticação com a Claude: API key própria da DB1, em Workspace dedicado dentro da organização Anthropic já usada pela empresa — nunca a assinatura pessoal de um TL, nunca a key de outro sistema interno.
- Custo esperado: irrisório face ao volume (poucas avaliações por squad por mês, poucos milhares de tokens por sessão) — não é um fator de decisão de arquitetura, mas deve ser revisitado se o volume de squads crescer muito.

## Modelo de Dados (proposta inicial)

Três tabelas novas em `web/users.db`, seguindo a convenção já usada (`ga_submissions`, `client_evaluations`):

```
squads
  id                    INTEGER PK
  nome                  TEXT NOT NULL UNIQUE
  tech_lead_user_email  TEXT NOT NULL UNIQUE  -- FK lógica -> team_members.user_email (o TL É um usuário GABI real); UNIQUE porque 1 TL lidera no máximo 1 squad
  created_at            TIMESTAMP

squad_members
  id            INTEGER PK
  squad_id      INTEGER NOT NULL           -- FK -> squads.id
  nome          TEXT NOT NULL              -- texto livre, digitado pelo TL — sem conta no GABI
  papel         TEXT NOT NULL              -- ex.: "Dev", "QA", "PO" — atributo da squad, não do cadastro de billing
  senioridade   TEXT NOT NULL              -- ex.: "Júnior", "Pleno", "Sênior"
  fornecedor    TEXT NOT NULL              -- ex.: "DB1 Global Software" ou outro fornecedor terceiro
  ativo         BOOLEAN NOT NULL DEFAULT true
  created_at    TIMESTAMP
  removed_at    TIMESTAMP                  -- preenchido quando o membro sai da squad; histórico de notas não é apagado

tl_evaluations
  id                        INTEGER PK
  squad_id                  INTEGER NOT NULL     -- FK -> squads.id
  competencia                TEXT NOT NULL        -- "YYYY-MM"
  squad_member_id             INTEGER NOT NULL     -- FK -> squad_members.id (não há user_email: o avaliado não é um usuário GABI)
  comportamental_nota        INTEGER              -- 1-5
  comportamental_texto       TEXT
  tecnica_nota                INTEGER
  tecnica_texto               TEXT
  prazo_nota                  INTEGER
  prazo_texto                  TEXT
  janela_reduzida              BOOLEAN NOT NULL DEFAULT false
  status                       TEXT NOT NULL DEFAULT 'rascunho'   -- rascunho | confirmado
  tech_lead_email               TEXT NOT NULL
  created_at                    TIMESTAMP
  confirmed_at                  TIMESTAMP

  UNIQUE (squad_id, competencia, squad_member_id)
```

Notas de nível arquitetural (mantendo os invariantes já documentados em `AGENTS.md`):
- **`squad_members` não tem nenhum vínculo com `team_members`/login.** Ao contrário de todas as outras entidades do GABI, o "objeto" avaliado aqui não é um usuário do sistema — é um registro de texto livre mantido pelo TL. Só `squads.tech_lead_user_email` referencia um usuário GABI real.
- O histórico de mensagens da conversa em andamento **não é persistido** em tabela própria nesta versão — trafega inteiro a cada chamada do frontend, e só vira registro em `tl_evaluations` na confirmação.
- Diferente de todos os domínios existentes, este é o primeiro com dependência de chamada externa a um LLM — a chamada à API da Claude deve ficar isolada num módulo próprio (mesmo espírito de `core/oracle.py`), nunca espalhada em routers.
- `squads` é criada por este domínio e resolve também um gap já registrado no domínio `client-evaluation` (filtro de dashboard por squad) — outros domínios podem reaproveitar essa tabela no futuro. `squad_members`, por não ter vínculo com `team_members`, é específica deste domínio.

## Success Metrics

**Leading (semanas):**
- % de TLs que completam ao menos uma squad inteira via GABI em vez da skill Cowork — meta: crescente mês a mês após o lançamento.
- Nº de perguntas de esclarecimento por profissional (proxy de quanto o relato inicial já vem completo).
- Tempo entre início do relato e confirmação de todos os profissionais da squad.

**Lagging (meses):**
- % de squads que migraram inteiramente para o fluxo GABI, abandonando a skill Cowork.
- Redução de reclamação de texto em 3ª pessoa ou fora de tom nos PDFs gerados (objetivo original que motivou esta spec).

## Open Questions

- Layout exato da tela de chat (uma pergunta por vez em tela cheia vs. chat contínuo lateral) — não validado com um TL real ainda.
- Squads são um conceito válido para todas as contas do GABI ou específico da conta MAG? Hoje o GABI parece operar só na conta MAG — confirmar antes de generalizar o nome das tabelas.
- `Fornecedor` em `squad_members`: texto livre digitado pelo TL, ou lista padronizada (para permitir agregações futuras por fornecedor)? Fica como texto livre nesta versão; padronização é decisão de fast-follow se a variação de grafia atrapalhar relatórios.
- Critério e momento de desligar a skill Cowork `avaliacao-mensal-tl` depois que o fluxo no GABI estiver estável.
- Qual modelo Claude usar (custo/qualidade) — decisão técnica a fechar na spec técnica (`plan.md`), não neste documento de produto.
- ~~Fechamento mensal da squad~~ — **resolvido durante a prototipação** (protótipo aprovado). RF04/RF05 originalmente só falavam de confirmação por profissional; nada representava "o TL terminou a squad inteira do mês". Decisão: nova entidade `squad_competencia_closures` (ação explícita do TL, separada de confirmar cada profissional), com o mesmo padrão de UX já usado em Aprovações/faturamento — fechamento direto se todos confirmados, ou um passo extra de confirmação ("encerrar assim mesmo") se sobrar alguém pendente. PDF passa a depender dessa entidade, não de "pelo menos um confirmado". Ver spec técnica (`002-tl-evaluation/spec.md`, seção Risks) para o detalhe.

## Timeline Considerations

- Sem prazo contratual externo conhecido — cadência acompanha o ciclo de avaliação mensal já existente.
- Depende da criação de uma API key da Claude em Workspace dedicado da organização Anthropic da DB1 antes do início da implementação de RF03–RF05.
- RF01–RF07 (P0) formam o fluxo mínimo completo (cadastro de squad+TL → gestão de membros pelo TL → chat → confirmação → PDF → histórico → isolamento de acesso); RF08 (P1) e as Future Considerations (P2) como fast-follow após validação com pelo menos uma squad piloto.
