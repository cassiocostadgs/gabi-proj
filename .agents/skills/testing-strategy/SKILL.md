---
name: testing-strategy
description: >
  Authoritative testing conventions for GABI. Covers the no-mock rule for the PostgreSQL
  internal database, Oracle stubbing with unittest.mock.patch, FastAPI TestClient
  integration test setup, pytest fixture patterns, and coverage thresholds. Load whenever
  writing tests, adding fixtures, configuring coverage, or deciding what to mock versus
  what to keep real.
metadata:
  type: technical-skill
---

# Testing Strategy

> **Maintaining this skill**
>
> Update it whenever the testing conventions change — new fixture patterns, coverage
> threshold revisions, or a deliberate decision to allow mocking in a new area.
> A refactor that preserves the conventions does not require an update.

## Overview of the pattern and the problem it solves

GABI's tests are **full-stack integration tests**: every test goes through the real HTTP
layer (FastAPI router → service → repository) using a real, isolated PostgreSQL database.
This constraint exists because a past incident demonstrated that mocking the database layer
allowed tests to pass while a production migration silently broke real behavior. The rule
is enforced to prevent that class of divergence from recurring.

The only component that is consistently mocked is Oracle: the external Oracle 11g database
is unavailable in CI and development environments, so Oracle-calling code (`is_oracle_configured`,
`task_repository.*`, and Oracle-mode engine functions) is stubbed with `unittest.mock.patch`.

## How to apply

### Fixture setup (`tests/conftest.py`)

Every test receives a `client` fixture that wires a real PostgreSQL database. The database
named by `TEST_DATABASE_URL` (default `postgresql://postgres:postgres@localhost:5432/gabi_test`)
has its `public` schema dropped and recreated before every test. **Do not add an in-memory
override or monkeypatch the database connection to a mock object**, and never point
`TEST_DATABASE_URL` at a database holding real data.

```python
@pytest.fixture()
def client(tmp_path, monkeypatch):
    import main
    _reset_schema()
    monkeypatch.setattr(main, "DATABASE_URL", TEST_DATABASE_URL)
    monkeypatch.setattr(main, "TASKS_DIR", tmp_path / "tasks")
    from fastapi.testclient import TestClient
    with TestClient(main.app) as c:
        yield c
```

- `_reset_schema()` gives each test an empty, isolated schema.
- `TASKS_DIR` is redirected to pytest's `tmp_path` so uploaded task files land in a temp directory.
- The `TestClient` context manager boots the full app (including `@app.on_event("startup")`),
  which seeds the default admin user and creates all tables.
- In CI, a `postgres:17` service container provides the test database.

The `auth_headers` fixture obtains a real JWT by calling `POST /auth/login` against the
seeded test database — no token is hard-coded or mocked.

### What to mock: Oracle and external services only

Oracle is unavailable in test environments. Stub the following at call sites with
`unittest.mock.patch`:

| Target | When to stub |
|--------|-------------|
| `main.is_oracle_configured` | Any test that triggers a code path gated on Oracle availability |
| `repositories.task_repository.get_task_hours` | Tests that exercise the Oracle-mode validate flow |
| `repositories.task_repository.get_task_entries` | Tests that exercise the task-entries report |
| `repositories.task_repository.responsavel_from_email` | Tests for the Oracle-mode GA processing helper |
| `repositories.task_repository.get_default_project` | Tests for the default-project endpoint |
| `main._process_ga_with_oracle` | High-level tests of the validate router (not the helper itself) |
| `main._run_file` | High-level tests of the submission preview/rerun router |
| `gabi_engine.parse_ga` / `gabi_engine.process` / `gabi_engine.process_with_task_data` | Unit tests of `_process_ga_with_oracle` in isolation |

Use `patch` as a context manager on a per-test basis. Never add a module-level mock that
persists across tests.

### What NOT to mock

- **PostgreSQL database** — never replace `main._db()`, never patch psycopg connection or
  cursor objects. Use the `client` fixture instead.
- **bcrypt / JWT helpers** — these are fast and deterministic; run them for real.
- **`gabi_engine` business logic** when the test goal is to verify business behavior
  end-to-end — mock the engine only when the test is specifically about the HTTP routing
  layer.

### Running tests

```bash
# From the repository root
python -m pytest --cov=web --cov-report=xml
```

Tests must be run from the repository root (not from `tests/`) so that `import main`
and `import repositories.task_repository` resolve correctly via `sys.path`.

## Tools and artifacts involved

- **pytest** — test runner; fixtures in `tests/conftest.py`.
- **FastAPI `TestClient`** — synchronous HTTP client that drives the full ASGI app stack.
- **`unittest.mock.patch`** — Oracle and external service stubbing; used as a context
  manager at call sites in `tests/test_api.py`.
- **`pytest-cov`** — coverage measurement; report written to `coverage.xml` for Sonar.
- **PostgreSQL (`TEST_DATABASE_URL`)** — real database whose schema is recreated by the
  `client` fixture before every test; no schema or data carries over between tests.

## Constraints and known pitfalls

- **Coverage thresholds**: Python coverage must stay at or above **80%**. The files
  `task_repository.py` and `gabi_engine.py` are excluded from the threshold because they
  require a live Oracle connection to exercise fully.
- **Import path**: `tests/test_api.py` imports `main` and `repositories.task_repository`
  by short name. Run pytest from the repository root, not from `tests/`, to avoid import
  errors.
- **Test isolation**: each `client` fixture call recreates the database schema. Tests that
  share state must explicitly set it up within the same test or through a session-scoped
  fixture — do not rely on database state left by a previous test.
- **Startup side-effects**: `TestClient` used as a context manager triggers
  `@app.on_event("startup")`, which seeds the default admin (`tiagohlatki@db1.com.br` /
  `gabi2025`). Tests that create additional users or submissions must do so within the
  test body via the API.
- **Oracle mocking scope**: `patch("main.is_oracle_configured", return_value=False)` must
  wrap every request that would otherwise attempt an Oracle connection. Forgetting it in a
  new test will cause a connection timeout rather than a clean test failure.
