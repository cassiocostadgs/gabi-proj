# G.A.B.I. — Contrato do Projeto

**Gap Auditor of Billed Input** — valida se as horas apontadas no GA (Gestão de Apontamentos) batem com o que foi faturado no Task.

---

## Arquitetura

```
web/
  main.py            → camada HTTP (FastAPI, auth, rotas)
  gabi_engine.py     → lógica pura de validação (sem I/O, sem FastAPI)
  users.db           → SQLite interno (usuários, submissões, histórico)
  tasks/             → arquivos Task.xlsx enviados pelo admin
  core/
    oracle.py        → conexão Oracle (thick mode)
  repositories/
    task_repository.py → queries ao Task DB (Oracle)

frontend/
  src/
    pages/           → componentes de rota (uma pasta por página)
    components/      → componentes reutilizáveis de UI
    hooks/           → custom hooks (TanStack Query)
    services/        → funções de acesso à API (Axios)
    types/           → interfaces e tipos TypeScript
    lib/             → utilitários puros (sem side effects)

tests/
  test_api.py        → testes de integração da API (FastAPI TestClient)
```

### Invariante de camadas

- `gabi_engine.py`: lógica pura, sem I/O, sem FastAPI.
- `repositories/`: único ponto de contato com bancos de dados externos.
- `main.py` (routers): não contém lógica de negócio — delega para services/engine.
- Frontend `services/`: não acessa o Task DB — sempre via API do G.A.B.I.

---

## Stack

### Backend
- **Python 3.11** + FastAPI + uvicorn
- **SQLite** (users.db) — dados internos do G.A.B.I.
- **oracledb** — driver Oracle, requer thick mode + Oracle Instant Client
- **python-calamine** — leitura de XLS/XLSX
- **python-jose** + **bcrypt** — JWT e senhas
- **openpyxl** — exportação XLSX
- **Ruff** — linter e formatter Python
- **Deploy**: EC2 via GitHub Actions → `systemctl restart gabi` + nginx

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **React Router DOM** — roteamento
- **TanStack Query** — server state (cache, loading, error, refetch automático)
- **Axios** — cliente HTTP
- **Shadcn/ui** + **Tailwind CSS v4** — UI e estilos
- **Lucide React** — ícones
- **Chart.js** + **react-chartjs-2** — gráficos de validação
- **SheetJS** — exportação XLSX
- **ESLint** + **Prettier** — lint e formatação
- **Vitest** — testes unitários de componentes e hooks

---

## Modelo de Usuário

**Cada funcionário loga e vê apenas seus próprios dados. Admin vê todos.**

- Identificador: **e-mail corporativo** — cruza login com registros no Task DB
- Auth: e-mail + senha gerenciados pelo G.A.B.I. (JWT, `gabi_admin_token` no localStorage)
- Fonte do GA: upload de arquivo pelo próprio funcionário
- Fonte do Task: Oracle corporativo — acesso via `oracledb` em `repositories/task_repository.py`

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

Nunca hardcodar feriados — usar `get_holidays()`. Nunca replicar lógica de dias úteis fora da engine.

---

## Qualidade de Código

### Princípios aplicados

**Clean Code**
- Nomes revelam intenção — sem abreviações (`ga_total`, não `gat`).
- Funções fazem uma coisa.
- Sem números mágicos — use constantes nomeadas (`TOLERANCE = 0.1`, `MAX_DAILY_HOURS = 8.0`).
- Comentários explicam o *porquê*, nunca o *quê*.

**SOLID (aplicado onde agrega)**
- **S** — cada módulo tem uma razão para mudar.
- **O** — novas regras de validação não devem modificar `validate()` — adicionadas como funções independentes e compostas.
- **D** — services dependem de abstrações de repositories.

**Object Calisthenics (regras aplicáveis)**
- Um nível de indentação por função.
- Sem `else` após `return` ou `raise` — early return sempre.
- Entidades pequenas — funções até ~20 linhas, arquivos até ~200 linhas como guia.
- Sem abreviações.

---

## Lint e Formatação

### Python — Ruff

```toml
[tool.ruff]
line-length = 100
target-version = "py314"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "C4", "SIM", "RUF"]
```

- `ruff check web/` — lint
- `ruff format web/` — formatação
- Roda no CI

### TypeScript/React — ESLint + Prettier

- `eslint src/ --max-warnings=0` — zero tolerância em warnings
- `prettier --check src/` — formatação
- Roda no CI

---

## Testes

### Backend
- Rodam contra **SQLite real em memória** — sem mocks de banco.
- `tests/test_api.py`: usa `TestClient` do FastAPI.
- **Nunca mockar o banco** — causou divergência teste/produção no passado.
- Cobertura mínima: **80%** (excluídos: `task_repository.py` e `gabi_engine.py` — requerem Oracle real).

### Frontend
- **Vitest** para hooks e funções puras.
- Não testar implementação de componentes de UI — testar comportamento visível.

### Gate de cobertura (Sonar)
- Quality Gate bloqueia push se não passar.
- Complexidade cognitiva máxima por função: **15** (default Sonar).

---

## Como Rodar

```bash
# Backend
cd web && uvicorn main:app --reload

# Frontend (desenvolvimento)
cd frontend && npm run dev

# Frontend (build para produção)
cd frontend && npm run build   # gera dist/ servido pelo FastAPI

# Testes Python (com coverage XML para Sonar)
python -m pytest --cov=web --cov-report=xml

# Testes frontend (com coverage lcov para Sonar)
cd frontend && npm run coverage

# Sonar (após rodar os testes acima)
./sonar-scan.sh
```

---

## Fluxo de Commit e Deploy

### Por que o Sonar roda local (não no CI)

O SonarQube roda em `localhost:9000`. Os runners do GitHub Actions não têm acesso a essa máquina, então Sonar não pode rodar no CI. Ele é o gate de qualidade real e roda antes do push, via skill `/commit`.

### Fluxo obrigatório antes de qualquer push

```
1. ruff check + ruff format          → lint e formatação Python
2. eslint + prettier --check         → lint e formatação TS/React
3. pytest                            → testes Python com coverage
4. vitest                            → testes frontend
5. ./sonar-scan.sh                   → análise Sonar local (localhost:9000)
   ↓
Falhou? → corrigir e repetir a partir do passo que falhou
Passou? → git commit + git push
```

Usar o comando `/commit` para executar esse fluxo.

Commits intermediários (trabalho em progresso) podem ser feitos sem Sonar.
**Nunca fazer push sem o Sonar passar.**

### CI/CD (GitHub Actions)

- **Push para main** → lint + testes Python + lint/format/testes frontend + build → deploy EC2

Sonar não roda no CI (sem acesso ao servidor local). O gate do Sonar é garantido pelo `/commit` antes do push.

Mensagens de commit sempre em inglês — título e corpo.

---

## O Que Não Fazer

- Não colocar lógica de negócio em routers — vai para services/engine.
- Não fazer queries SQL em services — vai para repositories.
- Não replicar lógica de validação no frontend — o backend é a fonte de verdade.
- Não usar `any` no TypeScript — use `unknown` com type guard.
- Não commitar `.secret_key`, `users.db`, arquivos de `web/tasks/`, `.env` com segredos ou `sonar-project.properties`.
- Não pular hooks de CI (`--no-verify`).
- Não fazer push com Quality Gate vermelho.

---

## Task DB — Oracle

### Conexão

| Parâmetro | Valor |
|-----------|-------|
| Host | `192.168.199.99` |
| Porta | `1521` |
| SID | `orcl` |
| Versão | Oracle 11.2.0.4.0 |
| Driver | `oracledb` (thick mode obrigatório — Oracle 11g não suporta thin) |

### Schema relevante (`TASKMANAGER`)

```
ORDEMSERVICO   — OS: CD_PROJETO, CD_TAREFA, CD_AREA, CD_NATUREZA, DS_TAREFA
TRIAGEM        — triagens da OS: CD_RESPONSAVEL, CD_TIPOTAREFA, TMP_PREVISTO, TMP_GASTO
EXECUCAO       — execuções reais: DH_INICIO, DH_TERMINO, BO_TABULADO, BO_ABONADO
```

### Filtros obrigatórios da query de horas

- `os.cd_area IN ('FATURADO', 'NAO_FATURADO')` — somente essas duas áreas
- `ex.bo_abonado <> 'S'` — excluir horas abonadas pelo gestor
- **Não filtrar** `bo_tabulado` — meses recentes têm `bo_tabulado = 'N'` até fechamento contábil

A comparação com o GA usa apenas `FATURADO`. `NAO_FATURADO` é contexto para dias sem horas faturadas.
