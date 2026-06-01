import pytest


@pytest.fixture()
def client(tmp_path, monkeypatch):
    import main
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(main, "TASKS_DIR", tmp_path / "tasks")
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
