# G.A.B.I. — Contrato do Projeto

**Gap Auditor of Billed Input** — valida se as horas apontadas no GA (Gestão de Apontamentos) batem com o que foi faturado no Task.

---

## Arquitetura

### Estado atual

```
web/
  main.py            → camada HTTP (FastAPI, auth, rotas)
  gabi_engine.py     → lógica pura de validação (sem I/O, sem FastAPI)
  static/index.html  → frontend monolítico (HTML + CSS + JS vanilla) — em migração
  users.db           → SQLite interno (usuários, histórico de uploads Task)
  tasks/             → arquivos Task.xlsx enviados pelo admin

tests/
  test_api.py          → testes de integração da API (FastAPI TestClient)
  test_gabi_engine.py  → testes unitários da engine
  test_utils.js        → testes do JS utilitário (node --test)
```

### Arquitetura alvo (backend)

```
web/
  routers/       → endpoints HTTP, validação de input, respostas
  services/      → lógica de negócio e orquestração
  repositories/  → acesso a dados (SQLite interno + Task DB externo)
  schemas/       → Pydantic models de request/response
  core/          → config, segurança, dependências compartilhadas
  engine/        → lógica pura de validação (sem I/O) — evolução do gabi_engine.py
```

### Arquitetura alvo (frontend)

```
frontend/
  src/
    pages/        → componentes de rota (uma pasta por página)
    components/   → componentes reutilizáveis de UI
    hooks/        → custom hooks (lógica reutilizável, TanStack Query)
    services/     → funções de acesso à API (Axios)
    types/        → interfaces e tipos TypeScript
    lib/          → utilitários puros (sem side effects)
```

O frontend é uma SPA buildada com Vite. O `dist/` é servido pelo FastAPI via `StaticFiles` — sem servidor separado, sem CORS adicional.

### Invariante de camadas

- `engine/` (ex `gabi_engine.py`): lógica pura, sem I/O, sem FastAPI, sem SQLAlchemy.
- `repositories/`: único ponto de contato com bancos de dados.
- `routers/`: não contém lógica de negócio — delega para `services/`.
- `services/`: não faz queries SQL diretamente — usa `repositories/`.
- Frontend `services/`: não acessa o Task DB — sempre via API do G.A.B.I.

---

## Stack

### Backend
- **Python 3.14** + FastAPI + uvicorn
- **SQLite** (users.db) — dados internos do G.A.B.I.
- **SQLAlchemy** — ORM para acesso ao Task DB externo
- **oracledb** (pip: `oracledb`) — driver Oracle, requer thick mode + Oracle Instant Client
- **python-calamine** — leitura de XLS/XLSX
- **python-jose** + **bcrypt** — JWT e senhas
- **Ruff** — linter e formatter Python
- **Deploy**: EC2 via GitHub Actions → `systemctl restart gabi` + nginx

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **React Router DOM** — roteamento
- **TanStack Query** — server state (cache, loading, error, refetch automático)
- **Axios** — cliente HTTP (usado pelo TanStack Query)
- **Shadcn/ui** (Radix + Nova preset) + **Tailwind CSS v3** — UI e estilos
- **Lucide React** — ícones
- **Chart.js** + **react-chartjs-2** — gráficos de validação
- **SheetJS** — exportação XLSX
- **ESLint** + **Prettier** — lint e formatação
- **Vitest** — testes unitários de componentes e hooks
- **Playwright** — testes E2E das jornadas críticas

---

## Migração do Frontend

O frontend monolítico (`static/index.html`) será migrado para o projeto React em `frontend/`. A migração acontece por vista, não de uma vez:

1. Setup do projeto React (`frontend/`) com toda a stack acima
2. Migrar vista de resultados (mais complexa — Chart.js, tabelas, exportação)
3. Migrar vista de upload / validação
4. Migrar vista admin
5. Remover `static/index.html` ao completar

Durante a migração, o FastAPI serve o `frontend/dist/` no lugar de `static/`. O build do frontend passa a fazer parte do pipeline de CI antes do deploy.

---

## Modelo de Usuário

**Cada funcionário loga e vê apenas seus próprios dados. Admin vê todos.**

- Identificador: **e-mail corporativo** — cruza login com registros no Task DB
- Auth inicial: e-mail + senha gerenciados pelo G.A.B.I.
- Evolução planejada: SSO Azure AD — `AuthProvider` deve ser uma abstração desde o início para não exigir reescrita
- Fonte do GA: upload de arquivo pelo próprio funcionário (mantém)
- Fonte do Task: Oracle corporativo — acesso direto via `oracledb` na camada `repositories/`

---

## Regras de Negócio — Validação

Tolerância aplicada em todas as comparações: **0.1h**.

| Regra | Severidade | Condição | Descrição |
|-------|-----------|----------|-----------|
| **R0** | warning | Dia útil com GA = 0 e Task = 0 | Sem apontamento em nenhum sistema |
| **R1** | error | `abs(GA - Task) > 0.1` | GA difere do Task faturado |
| **R2** | warning/info | `GA > 8.0h` | warning se R3 ativo, info se mensal ok |
| **R3** | error | `GA_total > dias_úteis × 8h` | Limite mensal excedido — correção obrigatória |
| **R4** | warning | Fim de semana com GA > 0 ou Task > 0 | Apontamento em sábado/domingo |

Dias úteis = dias do mês excluindo sábados, domingos e **feriados nacionais brasileiros** (calculados algoritmicamente — incluindo Páscoa e Corpus Christi via `get_holidays()`).

`match_name` faz match fuzzy entre nome completo do GA e ID do Task no formato `primeiro.ultimo`. Partículas (`de`, `da`, `do`, `dos`, `das`, `e`) são ignoradas.

Nunca hardcodar feriados — usar `get_holidays()`. Nunca replicar lógica de dias úteis fora da engine.

---

## Qualidade de Código

### Princípios aplicados (com critério)

**Clean Code**
- Nomes revelam intenção — sem abreviações (`ga_total`, não `gat`).
- Funções fazem uma coisa. Se precisa de "e" para descrever o que ela faz, divide.
- Sem números mágicos — use constantes nomeadas (`TOLERANCE = 0.1`, `MAX_DAILY_HOURS = 8.0`).
- Comentários explicam o *porquê*, nunca o *quê*. O algoritmo de Páscoa merece comentário; um loop não.

**SOLID (aplicado onde agrega)**
- **S** — cada módulo tem uma razão para mudar: `engine/` muda com regras de negócio, `repositories/` muda com a fonte de dados, `routers/` muda com a API.
- **O** — novas regras de validação (R5, R6...) não devem modificar `validate()` — devem ser adicionadas como funções independentes e compostas.
- **I** — `AuthProvider` e `DataSource` têm interfaces específicas e mínimas. Não acople a detalhes de implementação (senha vs SSO, arquivo vs banco).
- **D** — `services/` depende de abstrações de `repositories/`, não de implementações concretas. Facilita troca de SQLite por PostgreSQL e de arquivo Task por Task DB.
- L e I de herança não se aplicam ao contexto Python/TS sem hierarquias profundas — não criar herança forçada para "cumprir" SOLID.

**Object Calisthenics (regras aplicáveis)**
- Um nível de indentação por função — lógica aninhada vira função nomeada.
- Sem `else` após `return` ou `raise` — early return sempre.
- Lei de Demeter — não encadear mais de um acesso (`user.profile.address.city` é sinal de vazamento de abstração).
- Entidades pequenas — funções até ~20 linhas, arquivos até ~200 linhas como guia. Se ultrapassar, questione antes de aceitar.
- Sem abreviações (reforça Clean Code).
- Regras Java-específicas (encapsular primitivos, máx. 2 variáveis de instância, sem getters) **não se aplicam** aqui.

**Arquitetura em camadas (não Clean Architecture completa)**
- Três camadas no backend: routers → services → repositories.
- Não criar camadas de "entities" ou "use cases" separadas — o overhead não compensa para o tamanho do projeto.
- Não criar interfaces para coisas que nunca terão segunda implementação.

---

## Lint e Formatação

### Python — Ruff

```toml
# pyproject.toml
[tool.ruff]
line-length = 100
target-version = "py314"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "C4", "SIM", "RUF"]
```

- `ruff check .` — lint
- `ruff format .` — formatação (substitui Black)
- Roda no CI e como pre-commit hook

### TypeScript/React — ESLint + Prettier

- Base: `@typescript-eslint/recommended` + `eslint-plugin-react-hooks` + `eslint-config-prettier`
- `prettier` para formatação — não discutir estilo, só formatar
- Roda no CI e como pre-commit hook

### Regras que bloqueiam CI
- Erro de lint → build falha
- Tipo `any` explícito no TS → erro (use `unknown` + type guard)
- `console.log` no código de produção → erro

---

## Testes

### Backend
- Rodam contra **SQLite real em memória** — sem mocks de banco.
- `test_api.py`: usa `TestClient` do FastAPI.
- `test_gabi_engine.py`: testa a engine em isolamento puro.
- **Nunca mockar o banco** — causou divergência teste/produção no passado.

### Frontend
- **Vitest** para hooks e funções puras (especialmente lógica de formatação e cálculos).
- **Playwright** para E2E: login, upload de GA, resultado de validação, exportação XLSX.
- Não testar implementação de componentes de UI — testar comportamento visível.

### Gate de cobertura (Sonar)
- Cobertura mínima: **80%**
- Complexidade cognitiva máxima por função: **15** (default Sonar)
- Quality Gate bloqueia deploy se não passar

---

## Como Rodar

```bash
# Backend (usar sempre o venv do projeto)
cd web && .venv/bin/uvicorn main:app --reload --reload-exclude '.venv'

# Frontend (desenvolvimento)
cd frontend && npm run dev

# Frontend (build para produção)
cd frontend && npm run build   # gera dist/ servido pelo FastAPI

# Testes Python
cd web && .venv/bin/python -m pytest

# Testes frontend
cd frontend && npm run test        # Vitest
cd frontend && npm run test:e2e    # Playwright

# Coverage completa + Sonar
cd web && .venv/bin/python -m pytest --cov=web --cov-report=xml
cd frontend && npm run coverage
./sonar-scan.sh
```

---

## Fluxo de Commit e Deploy

### Por que o Sonar roda local (não no CI)

O SonarQube roda em `localhost:9000`. Os runners do GitHub Actions não têm acesso a essa máquina, então Sonar não pode rodar no CI. Ele é o gate de qualidade real e roda antes do push, via skill `/commit`.

### Fluxo obrigatório antes de qualquer push

```
1. ruff check + ruff format          → lint e formatação Python
2. eslint + prettier --check         → lint e formatação TS/React (quando frontend existir)
3. pytest                            → testes Python com coverage
4. vitest                            → testes frontend (quando frontend existir)
5. ./sonar-scan.sh                   → análise Sonar local (localhost:9000)
   ↓
Falhou? → corrigir e repetir a partir do passo que falhou
Passou? → git commit + git push
```

Usar a skill `/commit` para executar esse fluxo — ela automatiza os passos e bloqueia o push se qualquer etapa falhar.

Commits intermediários (trabalho em progresso) podem ser feitos sem Sonar.
**Nunca fazer push sem o Sonar passar.**

### CI/CD (GitHub Actions)

- **PR para main** → lint + testes Python + testes frontend + build → bloqueia merge se falhar
- **Push para main** → tudo acima + build do frontend + deploy EC2

Sonar não roda no CI (sem acesso ao servidor local). O gate do Sonar é garantido pela skill `/commit` antes do push.

No deploy, o `frontend/dist/` é copiado para o servidor antes do `systemctl restart gabi`.
Nunca fazer push direto para main contornando CI.

Mensagens de commit sempre em inglês — título e corpo.

---

## O Que Não Fazer

- Não colocar lógica de negócio em `routers/` — vai para `services/`.
- Não colocar queries SQL em `services/` — vai para `repositories/`.
- Não replicar lógica de validação no frontend — o backend é a fonte de verdade.
- Não usar `any` no TypeScript — use `unknown` com type guard.
- Não criar abstração sem segunda implementação concreta ou iminente.
- Não commitar `.secret_key`, `users.db`, arquivos de `web/tasks/`, `.env` com segredos ou `poc_oracle.py` (credenciais hardcoded).
- Não pular hooks de CI (`--no-verify`).
- Não usar `console.log` em código de produção — use o logger configurado.

---

## Task DB — Oracle

### Conexão

| Parâmetro | Valor |
|-----------|-------|
| Host | `192.168.199.99` |
| Porta | `1521` |
| SID | `orcl` |
| Versão | Oracle 11.2.0.4.0 |
| Driver | `oracledb` (thick mode obrigatório — servidor Oracle 11g não suporta thin) |
| Dependência | Oracle Instant Client instalado no servidor |

O `oracledb` é inicializado com `oracledb.init_oracle_client(lib_dir=...)` antes da primeira conexão. `lib_dir` vem de variável de ambiente — nunca hardcoded.

### Schema relevante (schema `TASKMANAGER`)

```
ORDEMSERVICO   — OS: CD_PROJETO, CD_TAREFA, CD_AREA, CD_NATUREZA, DS_TAREFA
TRIAGEM        — triagens da OS: CD_RESPONSAVEL, CD_TIPOTAREFA, TMP_PREVISTO, TMP_GASTO
EXECUCAO       — execuções reais: DH_INICIO, DH_TERMINO, BO_TABULADO, BO_ABONADO
```

Mapeamento de usuário (email → responsável no Task):

```
AEGP_SQUAD_PESSOAS_EMAIL: DS_EMAIL → CD_ANALISTA
CD_ANALISTA = TRIAGEM.CD_RESPONSAVEL (formato: PRIMEIRO.ULTIMO)
```

### Filtros obrigatórios da query de horas

- `os.cd_area IN ('FATURADO', 'NAO_FATURADO')` — somente essas duas áreas
- `ex.bo_abonado <> 'S'` — excluir horas abonadas pelo gestor
- **Não filtrar** `bo_tabulado` — meses recentes têm `bo_tabulado = 'N'` até o fechamento contábil; filtrar eliminaria dados válidos

A comparação com o GA usa apenas `FATURADO`. `NAO_FATURADO` é trazido como contexto para dias sem horas faturadas.

### Bloqueadores pendentes (time de infra)

1. Abrir conectividade EC2 → `192.168.199.99:1521` (VPN, Direct Connect ou IP whitelist)
2. Instalar Oracle Instant Client no EC2
3. Criar usuário de serviço **read-only** no Task DB para o G.A.B.I. (hoje usa `taskconsulta`)

Localmente a POC roda via VPN corporativa. No EC2 a conectividade ainda precisa ser liberada.
