# Spec — Avaliação Mensal do Cliente (MAG) no GABI

**Status**: Rascunho para desenvolvimento
**Autor**: Tiago (DM conta MAG)
**Data**: 2026-07-10 (revisado após análise de e-mails reais)
**Bounded context proposto**: `client-evaluation` (novo domínio no GABI, ver `.agents/maps/functional-map.md`)

---

## Problem Statement

A MAG avalia mensalmente o desempenho dos profissionais DB1 alocados na conta, em três dimensões (comportamental, técnica, prazo, notas de 1 a 5). Diferente do que se supunha inicialmente, essa avaliação **não chega como um e-mail único consolidado por squad com texto livre**: chega como um **e-mail automático por colaborador, por competência**, disparado pelo sistema de faturamento da MAG (`notasti@mag.com.br`) no momento em que o timesheet daquele colaborador é aprovado. O corpo é semiestruturado, com labels fixos por dimensão.

Hoje esse conteúdo fica só na caixa de entrada pessoal do DM: não é estruturado no GABI, não é compartilhado com o profissional avaliado, e não existe histórico consultável ao longo dos meses. Isso tem dois custos: o profissional não recebe o feedback do cliente diretamente (só o que o TL filtra em 1x1), e o DM/TLs não têm uma visão compilada para identificar tendências por pessoa, squad ou dimensão.

Este documento especifica a ingestão desses e-mails, a extração estruturada do conteúdo, um fluxo de revisão humana obrigatória antes da publicação, e duas superfícies de consumo: histórico individual (login do profissional) e dashboard compilado (admin).

## Evidência real (formato do e-mail)

Analisados 4 e-mails reais (`notasti@mag.com.br`, assunto `Notificação ao Fornecedor: [Nome] - MM / YYYY - Timesheet aprovado - MAG Seguros`), destinados a Tiago Hlatki + lista "Faturamento", cc Fernando Nicolodi + `notasti@mag.com.br`. Corpo segue o padrão:

```
Competência: MM / YYYY
Colaborador: [Nome, formato variável: Title Case ou CAIXA ALTA]
Fornecedor: DB1 Global Software
Total de horas(horas): HH:MM
Total de horas(decimal): XX,XX

Resultado da avaliação do Profissional:

Avaliação Comportamental: N
[opcional: comentário específico da dimensão, uma ou mais linhas]

Avaliação Técnica: N
[opcional: comentário específico da dimensão]

Avaliação Prazos de entrega: N
[opcional: comentário específico da dimensão]

[opcional, alternativo ao padrão acima: "Feedback: <parágrafo único cobrindo as 3 dimensões>"]

OBS: Notas de 1 à 5.
Legenda: [texto fixo da escala 1–5, igual em todos os e-mails]
```

Achados relevantes para o design:
- As **3 notas sempre vêm preenchidas** nos 4 exemplos — não há dimensão omitida. Isso resolve a dúvida original sobre cobertura parcial.
- O **comentário varia de posição**: às vezes um comentário por dimensão (logo abaixo de cada nota), às vezes um único parágrafo "Feedback:" no final cobrindo as 3 dimensões juntas. O parser precisa reconhecer os dois padrões.
- `Fornecedor: DB1 Global Software` é um campo de validação útil — serve para o parser recusar/sinalizar corpo colado que não seja de um fornecedor DB1.
- `Total de horas` não é dado de avaliação — pertence ao domínio de horas/faturamento já coberto por outras partes do GABI (`task-data-access`, `ga-validation`). O parser ignora esses campos.
- Nome do colaborador vem em formatos diferentes (Title Case, CAIXA ALTA) — a normalização de nome já existente em `gabi_engine.py` (NFD, lowercase, remoção de partículas) cobre esse caso.

## Contexto e decisões já tomadas

Estas decisões foram validadas com o solicitante e **não são reabertas** neste documento:

| Decisão | Resolução |
|---|---|
| Onde o sistema roda | Dentro do **GABI** (app já em produção: FastAPI + SQLite + React/TS, JWT, `is_admin` flag) — novo domínio, não um app novo |
| Unidade de ingestão | **1 e-mail = 1 registro** (um colaborador, uma competência, 3 notas). Não existe conceito de lote/batch — cada e-mail colado gera exatamente um registro |
| Estratégia de extração | **Parser determinístico** (regex sobre os labels fixos do corpo) — não é necessário LLM, dado que o formato é gerado por sistema e é estável. Extração fica como lógica pura (sem I/O), no mesmo espírito de `gabi_engine.py` |
| Revisão antes da publicação | **Obrigatória** — nenhuma nota chega ao profissional sem aprovação de um admin (mesmo com parser determinístico, a revisão cobre casos de anomalia, duplicata e vínculo de nome) |
| Deduplicação | Tiago recebe o mesmo e-mail em duplicidade (como responsável financeiro e como ponto focal) — o sistema precisa detectar e tratar isso antes de criar um segundo registro para a mesma pessoa/competência |
| Origem do e-mail | Chega apenas na caixa pessoal do Tiago, sem caixa compartilhada — relevante caso se avalie automação de ingestão no futuro (torna esse caminho mais sensível de implementar, por depender de acesso à caixa pessoal) |
| Cruzamento com autoavaliação do TL (`avaliacao-mensal-tl`, dados em `avaliacoes/*/avaliacao_*.json` no Drive da conta) | **Não** nesta versão — fontes independentes, sem merge de dado |
| Modelo de acesso | Reaproveita o modelo existente do GABI: cada usuário vê só o próprio dado; `is_admin=true` vê tudo. Não há papel intermediário (ex.: TL vendo só a própria squad) nesta versão |
| Granularidade de aprovação | Por registro individual — já é a unidade natural, dado que 1 e-mail = 1 registro |
| SLA de publicação | Não há compromisso formal de prazo entre recebimento do e-mail e publicação — acompanhado como leading indicator, sem meta rígida |
| Ingestão | **Automatizada via n8n (DB1)** — confirmado após comparação com Power Automate e Azure Logic Apps. GABI está publicado numa máquina AWS fora da rede corporativa, então recebe chamadas HTTP externas sem exigir infra nova. Não há trigger nativo de "novo e-mail" para Outlook no n8n disponível hoje — o caminho é polling agendado (Schedule Trigger) + node Microsoft Outlook (`message: getAll`), não webhook em tempo real. Decisão mantida mesmo com licenciamento Power Automate Premium/Azure já disponível no DB1: n8n já é ambiente compartilhado e gerido pelo DB1 (workflow versionável, não preso a conta pessoal), e a configuração da credencial Outlook já foi iniciada |
| Cadência do polling | 1x ao dia |
| Idempotência na caixa do Outlook | Após ingestão bem-sucedida no GABI: marcar mensagem como lida **e** mover para pasta "Processados" |

## Non-Goals (v1)

- **Processamento de "Total de horas"** — esse dado já é tratado por outros domínios do GABI (Task/GA); o parser de avaliação do cliente o ignora.
- **Cruzamento ou consolidação com a nota do TL** (`avaliacao-mensal-tl`). Ficam como registros paralelos.
- **Edição da nota pelo profissional.** A tela do colaborador é somente leitura.
- **Notificação proativa** (e-mail/push) ao profissional quando uma nota é publicada. V1 exige que o colaborador acesse o GABI para ver.
- **Papel de admin escopado por squad.** V1 usa o `is_admin` binário já existente no GABI.
- **Multi-cliente.** Escopo funcional é a conta MAG; evitar acoplamento rígido ao nome "MAG" na modelagem por prudência de engenharia, sem requisito de suportar outros clientes agora.

## Usuários e Personas

- **Profissional DB1** alocado na conta MAG, já cadastrado em `team_members` (tabela existente do GABI). Consome: histórico das próprias notas/comentários por competência.
- **Admin** (hoje: Tiago; tecnicamente qualquer usuário `is_admin=true` no GABI). Consome: ingestão do e-mail, revisão/edição da extração, aprovação/rejeição, dashboard compilado.

## User Stories

1. Como **admin**, quero colar o corpo de um e-mail de notificação da MAG e receber um rascunho estruturado (colaborador, competência, 3 notas e comentários), para não transcrever manualmente.
2. Como **admin**, quero que o sistema me avise quando eu colar um e-mail duplicado (mesma pessoa, mesma competência), para não criar registros repetidos por causa do e-mail que chega em duplicidade.
3. Como **admin**, quero revisar o rascunho lado a lado com o texto original antes de publicar, corrigindo nota, comentário ou o vínculo com o profissional quando o nome não bater com o cadastro.
4. Como **admin**, quero aprovar (publicar) ou rejeitar (descartar) cada registro individualmente, para controlar exatamente o que cada profissional vê.
5. Como **admin**, quero um dashboard com a evolução das notas por profissional, por squad e por dimensão ao longo dos meses, para embasar conversas de desenvolvimento e identificar padrões.
6. Como **profissional**, quero ver meu próprio histórico de notas e comentários do cliente por competência, para entender como sou percebido e onde focar.
7. Como **profissional**, quero que meus dados fiquem restritos a mim — não quero ver a nota de colegas, e não quero que minha nota fique visível antes de ser aprovada por um admin.
8. Como **admin**, quando o nome citado pelo cliente não corresponde a nenhum `team_member` ativo, quero ser avisado explicitamente e resolver o vínculo manualmente antes de aprovar.

## Requisitos

### Must-Have (P0)

**RF01 — Ingestão do e-mail (por colaborador)**
- Caminho primário: **automatizado via n8n** (ver seção "Automação de Ingestão (n8n)" abaixo) — um workflow busca e-mails novos de `notasti@mag.com.br` e envia o corpo para um endpoint de ingestão do GABI.
- Caminho secundário (fallback manual, mantido): tela admin (`/admin/avaliacao-cliente`) com campo de texto livre para colar o corpo de **um** e-mail por vez — útil para os e-mails históricos (os 4 já coletados) e para qualquer caso em que a automação falhe ou esteja indisponível.
- Em ambos os caminhos, o sistema detecta duplicata antes de criar o registro: primeiro por `email_message_id` (quando disponível, vindo da automação), depois por (nome normalizado, ou `user_email` já vinculado) + competência contra registros existentes (`rascunho`, `aprovado` ou `rejeitado`). Se encontrar:
  - Se o existente é `rascunho` ou `rejeitado`: ignora silenciosamente se veio da automação (mesmo `email_message_id`, reprocessamento) ou avisa o admin se veio do caminho manual.
  - Se o existente é `aprovado`: bloqueia sobrescrita silenciosa — exige confirmação explícita de que é uma correção intencional.
- Critério de aceite:
  - [ ] Um e-mail processado (automático ou colado) cria exatamente 1 registro (colaborador × competência).
  - [ ] O mesmo e-mail chegando em duplicidade (caso comum: Tiago recebe como financeiro e como ponto focal) não gera um segundo registro sem tratamento.
  - [ ] Falha da automação (endpoint fora do ar, e-mail não localizado) não impede o fallback manual de continuar funcionando.

**RF02 — Extração determinística (parser)**
- Função pura (sem I/O, mesma convenção de `gabi_engine.py`) que localiza os labels fixos no corpo colado e extrai: `Competência` (normalizada para `"YYYY-MM"`), `Colaborador` (nome como escrito), `Fornecedor` (validação: deve ser `"DB1 Global Software"` — caso contrário, sinaliza anomalia e não processa), as 3 notas e seus comentários.
- Reconhece os dois padrões de comentário observados: comentário por dimensão (associado à nota correspondente) ou parágrafo único `Feedback:` (armazenado em campo `comentario_geral`, não duplicado nas 3 dimensões).
- Se algum dos 3 labels de nota não for encontrado, ou o valor não for um inteiro de 1 a 5, o parser falha explicitamente — nunca infere ou arredonda. A tela de revisão mostra o erro e o texto original para resolução manual.
- Critério de aceite:
  - [ ] As 4 amostras reais já coletadas são parseadas corretamente (3 notas + comentário, nos dois padrões de comentário observados).
  - [ ] Corpo fora do formato esperado (label ausente, nota fora de 1–5, campo `Fornecedor` diferente do esperado) gera erro explícito, nunca dado inventado.

**RF03 — Vínculo com profissional cadastrado**
- Reaproveita a lógica de normalização de nome já existente em `gabi_engine.py` (NFD, lowercase, remoção de partículas) para casar o nome extraído (Title Case ou CAIXA ALTA) com `team_members.user_email`.
- Quando não houver match automático, o registro fica com status "não vinculado" e exige resolução manual do admin.
- Critério de aceite:
  - [ ] Nome extraído bate automaticamente com profissional cadastrado independente de caixa alta/baixa ou acentuação.
  - [ ] Nome sem match algum não é publicado silenciosamente — aparece como pendência explícita na tela de revisão.

**RF04 — Revisão e edição antes da publicação**
- Tela de revisão mostra, por registro: nome vinculado, notas extraídas (editáveis), comentários extraídos (editáveis), e o texto original correspondente para conferência.
- Admin pode editar qualquer nota/comentário ou o vínculo de nome.
- Critério de aceite:
  - [ ] Toda alteração manual fica registrada (quem editou, quando) — mesmo padrão de auditoria de `ga_submissions.reviewed_by/reviewed_at`.
  - [ ] Nenhum dado é visível ao profissional antes da aprovação explícita.

**RF05 — Fluxo de aprovação/rejeição**
- Estados por registro: `rascunho` → `aprovado` | `rejeitado` (mesmo padrão de lifecycle de `submission-workflow`, adaptado).
- Critério de aceite:
  - [ ] Um registro `aprovado` fica imutável (mesmo princípio de `is_immutable` usado em `ga_submissions` aprovadas); correção posterior exige fluxo explícito de exceção (reabrir com justificativa), não edição direta.
  - [ ] Um registro `rejeitado` nunca aparece na tela do profissional nem no dashboard.

**RF06 — Histórico individual do profissional**
- Nova rota `/minhas-avaliacoes` (ou seção equivalente) mostrando, por competência aprovada, as 3 notas e respectivos comentários (ou o comentário geral, quando aplicável).
- Critério de aceite:
  - [ ] Profissional só vê os próprios dados aprovados (nunca rascunho/rejeitado, nunca dado de outro profissional).
  - [ ] Ausência de dado aprovado no mês exibe estado vazio claro (não erro).

**RF07 — Dashboard admin compilado**
- Visão agregada por profissional, squad e dimensão ao longo do tempo (linha/tendência), reaproveitando Chart.js já usado no GABI (`PersonCard`).
- Critério de aceite:
  - [ ] Admin filtra por squad, por profissional e por intervalo de competência.
  - [ ] Dashboard mostra apenas registros `aprovado` (nunca rascunho/rejeitado).

**RF12 — Endpoint de ingestão automatizada**
- Novo endpoint no GABI (ex.: `POST /api/integrations/mag-evaluation`), autenticado separadamente do login de usuário (JWT de sessão não se aplica a uma chamada máquina-a-máquina) — usar uma API key estática via header (ex.: `X-API-Key`), validada contra variável de ambiente, no mesmo espírito de `SECRET_KEY`/`ADMIN_EMAIL` já usados no projeto.
- Recebe: corpo do e-mail (`body.content`, HTML ou texto), `subject`, `internetMessageId`, `receivedDateTime`, `from`. Delega a extração ao mesmo parser de RF02 (HTML é convertido para texto antes de aplicar o parser — a lógica de conversão/parsing fica inteiramente no GABI, não no workflow do n8n).
- Cria o registro como `rascunho`, com `email_message_id` preenchido — segue para revisão manual normalmente (RF04/RF05), sem nenhum atalho de publicação automática.
- Critério de aceite:
  - [ ] Endpoint rejeita chamadas sem a API key correta.
  - [ ] Endpoint é idempotente por `internetMessageId`: reenviar o mesmo `internetMessageId` não cria um segundo registro.

## Automação de Ingestão (n8n)

Arquitetura validada contra os nodes disponíveis no n8n do DB1 (não há trigger nativo de "novo e-mail" para Outlook — o caminho é polling agendado):

1. **Schedule Trigger** — 1x ao dia.
2. **Microsoft Outlook → Message: Get All** — filtro `sender = notasti@mag.com.br`, `readStatus = unread`. Retorna, por mensagem: `internetMessageId`, `body.content`, `subject`, `from`, `receivedDateTime`.
3. **HTTP Request** — para cada mensagem, `POST` para RF12 (`/api/integrations/mag-evaluation`) com os campos acima, autenticado via API key.
4. **Microsoft Outlook → Message: Update** (`isRead = true`) **+ Message: Move** (para pasta "Processados") — só executado após confirmação de sucesso do passo 3, garantindo que a mensagem não seja reprocessada no próximo polling.

Pré-requisitos para ativar (fora do escopo desta spec, ações do Tiago/infra):
- Conectar uma credencial `microsoftOutlookOAuth2Api` no n8n do DB1 (hoje não existe nenhuma — precisa de autorização OAuth interativa do Tiago, uma única vez).
- Criar a pasta "Processados" na caixa do Tiago (ou subpasta equivalente) para o passo 4.
- Definir e distribuir a API key de RF12 como credencial no n8n (tipo Header Auth) e como variável de ambiente no GABI.

O fallback manual (RF01, caminho secundário) continua existindo — a automação reduz o trabalho de rotina, mas não é ponto único de falha: se o workflow n8n parar, o admin ainda consegue colar o e-mail manualmente.

### Nice-to-Have (P1)

- **RF08** — Exportação do dashboard/histórico em XLSX (reaproveitando `openpyxl`, já usado no domínio `team-billing`).
- **RF09** — Upload de `.eml` além de colar texto (reduz transcrição manual do admin).
- **RF10** — Detecção de drift de formato: se o corpo colado não bater com o template conhecido, registrar isso separadamente para sinalizar que a MAG pode ter mudado o template do sistema de notificação.
- **RF11** — Notificação in-app (badge) ao profissional quando uma nova avaliação aprovada estiver disponível.

### Future Considerations (P2)

- Cruzamento com a autoavaliação do TL (`avaliacao-mensal-tl`) num mesmo registro/tela comparativa.
- Papel de admin escopado por squad.
- Suporte a múltiplas contas/clientes além da MAG.
- LLM como camada de tolerância a mudança de template (caso a MAG altere o formato do e-mail e o parser determinístico passe a falhar com frequência).
- Caminho explícito de "correção intencional" para reavaliação legítima do mesmo colaborador na mesma competência (distinto de duplicata) — nunca ocorreu até hoje; mapeado aqui para não ser esquecido caso apareça.

## Modelo de Dados (proposta inicial)

Uma tabela nova em `web/users.db`, seguindo a convenção já usada (`ga_submissions`, `team_members`):

```
client_evaluations
  id                          INTEGER PK
  competencia                 TEXT NOT NULL        -- "YYYY-MM", extraído do corpo do e-mail
  nome_extraido                TEXT NOT NULL        -- "Colaborador:" como veio no e-mail
  user_email                   TEXT                 -- FK lógica -> team_members.user_email; NULL se não vinculado
  match_status                 TEXT NOT NULL        -- auto | manual | nao_vinculado
  fornecedor_validado           BOOLEAN NOT NULL     -- true se "Fornecedor:" == "DB1 Global Software"
  comportamental_nota           INTEGER              -- 1-5
  comportamental_comentario     TEXT
  tecnica_nota                  INTEGER
  tecnica_comentario            TEXT
  prazo_nota                    INTEGER
  prazo_comentario              TEXT
  comentario_geral              TEXT                -- usado quando o e-mail traz um único "Feedback:" em vez de comentário por dimensão
  raw_email_text                TEXT NOT NULL        -- corpo colado ou recebido via automação, preservado para auditoria/reprocessamento
  email_message_id               TEXT                -- internetMessageId do Outlook; NULL quando o registro veio do fallback manual (paste)
  origem                         TEXT NOT NULL        -- automacao | manual
  status                        TEXT NOT NULL        -- rascunho | aprovado | rejeitado
  created_by                    TEXT NOT NULL        -- email do admin que ingeriu
  created_at                    TIMESTAMP
  reviewed_by                   TEXT
  reviewed_at                   TIMESTAMP
  edited_by                     TEXT
  edited_at                     TIMESTAMP
```

Regra de deduplicação (RF01/RF12): antes do insert, buscar registro existente, nesta ordem de prioridade:
1. Por `email_message_id` (quando o e-mail vem da automação) — cobre reprocessamento acidental do mesmo e-mail físico.
2. Por (`user_email`, `competencia`) quando `user_email` já está resolvido, ou por (`nome_extraido` normalizado, `competencia`) quando ainda não vinculado — cobre o caso de e-mails fisicamente distintos com o mesmo conteúdo (Tiago recebe como financeiro e como ponto focal, cada um com seu próprio `email_message_id`).

Índice único em `(user_email, competencia)` aplicado apenas quando `user_email IS NOT NULL`, para permitir múltiplos registros "não vinculados" temporários sem quebrar constraint, mas impedir duplicata depois que o vínculo é resolvido. Índice único em `email_message_id` quando não nulo.

Notas de nível arquitetural (mantendo os invariantes já documentados em `AGENTS.md`):
- O parser é lógica pura (sem I/O), podendo viver como novas funções em `gabi_engine.py` (reaproveitando `match_name()`) ou em módulo próprio (`client_evaluation_engine.py`) seguindo o mesmo princípio. Como não há chamada externa a LLM, não há exceção arquitetural a documentar — o parser segue o mesmo padrão de `parse_task()`/`parse_ga()` já existentes.
- Nenhuma lógica de negócio nos routers do `main.py`, consistente com o restante do projeto.

## Success Metrics

**Leading (semanas):**
- % dos e-mails mensais da MAG processados pelo fluxo novo (vs. tratamento manual fora do sistema) — meta: 100% a partir do 2º mês de uso.
- Tempo entre colar o e-mail e publicar (aprovação) — meta: < 1 dia útil.
- % de e-mails colados que falham no parser (formato inesperado) — métrica de estabilidade do template da MAG; sem meta inicial, linha de base a estabelecer nos 2 primeiros meses.
- Nº de duplicatas detectadas e tratadas corretamente (vs. duplicatas que escapam como registro novo).

**Lagging (meses):**
- % de profissionais elegíveis que acessam o próprio histórico ao menos uma vez por competência.
- Redução do tempo do admin gasto compilando/repassando essas notas manualmente (hoje: 100% manual).

## Open Questions

Nenhuma pendência bloqueante no momento — todas as questões em aberto da versão anterior foram resolvidas:
- "Feedback:" único vai para `comentario_geral`, sem duplicar nas 3 dimensões (confirmado).
- Reavaliação legítima do mesmo colaborador/competência nunca ocorreu até hoje; dedup simples é suficiente por ora. Caminho de "correção intencional" fica mapeado em Future Considerations (P2) caso o caso apareça.
- As 4 amostras reais já coletadas são suficientes para iniciar a implementação do parser (RF02); casos de borda não previstos serão tratados pela regra de "falhar explicitamente, nunca inventar dado" e endereçados conforme aparecerem.

## Timeline Considerations

- Sem prazo contratual externo conhecido; cadência acompanha o ritmo de aprovação de timesheet da MAG (um e-mail por colaborador, não necessariamente todos no mesmo dia do mês).
- Sem dependência externa de credencial/API (parser é determinístico, sem custo de LLM) — reduz o risco de bloqueio em relação à primeira versão desta spec.
- Sem pendências bloqueantes restantes — spec pronta para dar início à implementação de RF01–RF07 (P0), validando o parser contra as 4 amostras reais já coletadas; RF08–RF11 (P1) e Future Considerations (P2) como fast-follow após 1–2 ciclos mensais de uso real.
