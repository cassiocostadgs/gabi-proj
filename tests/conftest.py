import os

import psycopg
import pytest

# Dedicated test database — wiped before every test, so never point this at real data.
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/gabi_test"
)


@pytest.fixture(scope="session")
def _fresh_schema():
    # Dropped once per run so schema changes always apply; tests then only truncate.
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        conn.execute("DROP SCHEMA IF EXISTS public CASCADE")
        conn.execute("CREATE SCHEMA public")


def _truncate_all_tables() -> None:
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        tables = [
            row[0]
            for row in conn.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        ]
        if tables:
            conn.execute(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE")


@pytest.fixture()
def client(tmp_path, monkeypatch, _fresh_schema):
    import main
    _truncate_all_tables()
    monkeypatch.setattr(main, "DATABASE_URL", TEST_DATABASE_URL)
    from fastapi.testclient import TestClient
    with TestClient(main.app) as c:
        yield c


@pytest.fixture()
def auth_headers(client):
    resp = client.post(
        "/auth/login",
        data={"username": "tiagohlatki@db1.com.br", "password": "gabi2025"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
