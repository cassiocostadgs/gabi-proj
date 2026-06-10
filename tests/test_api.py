from datetime import date
from unittest.mock import patch


# ── Auth ──────────────────────────────────────────────────────────────────────

class TestLogin:
    def test_success(self, client):
        resp = client.post("/auth/login", data={"username": "tiagohlatki@db1.com.br", "password": "gabi2025"})
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_wrong_password(self, client):
        resp = client.post("/auth/login", data={"username": "tiagohlatki@db1.com.br", "password": "wrong"})
        assert resp.status_code == 401

    def test_unknown_user(self, client):
        resp = client.post("/auth/login", data={"username": "nobody@x.com", "password": "pass"})
        assert resp.status_code == 401


class TestMe:
    def test_authenticated(self, client, auth_headers):
        resp = client.get("/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "tiagohlatki@db1.com.br"
        assert "is_admin" in data

    def test_unauthenticated(self, client):
        assert client.get("/auth/me").status_code == 401

    def test_invalid_token(self, client):
        assert client.get("/auth/me", headers={"Authorization": "Bearer bad.token.here"}).status_code == 401

    def test_inactive_user(self, client, auth_headers):
        import main
        with main._db() as conn:
            conn.execute("UPDATE users SET is_active=0 WHERE email=?", ("tiagohlatki@db1.com.br",))
        assert client.get("/auth/me", headers=auth_headers).status_code == 401


class TestChangePassword:
    def test_success(self, client, auth_headers):
        resp = client.post(
            "/auth/change-password",
            params={"current_password": "gabi2025", "new_password": "newsecure123"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_wrong_current_password(self, client, auth_headers):
        resp = client.post(
            "/auth/change-password",
            params={"current_password": "wrongpass", "new_password": "newsecure123"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_new_password_too_short(self, client, auth_headers):
        resp = client.post(
            "/auth/change-password",
            params={"current_password": "gabi2025", "new_password": "abc"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_requires_auth(self, client):
        assert client.post(
            "/auth/change-password",
            params={"current_password": "gabi2025", "new_password": "newsecure123"},
        ).status_code == 401


# ── Admin: user management ────────────────────────────────────────────────────

class TestAdminUsers:
    def _create(self, client, auth_headers, email="novo@db1.com.br", password="senha123", is_admin=False):
        return client.post(
            "/api/admin/users",
            json={"email": email, "password": password, "is_admin": is_admin},
            headers=auth_headers,
        )

    def test_create_success(self, client, auth_headers):
        resp = self._create(client, auth_headers)
        assert resp.status_code == 201
        assert resp.json()["email"] == "novo@db1.com.br"

    def test_create_duplicate_returns_409(self, client, auth_headers):
        self._create(client, auth_headers)
        assert self._create(client, auth_headers).status_code == 409

    def test_create_short_password_returns_400(self, client, auth_headers):
        assert self._create(client, auth_headers, password="abc").status_code == 400

    def test_create_requires_admin(self, client, auth_headers):
        self._create(client, auth_headers, email="regular@db1.com.br")
        resp = client.post(
            "/auth/login", data={"username": "regular@db1.com.br", "password": "senha123"}
        )
        regular_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        assert client.post(
            "/api/admin/users",
            json={"email": "other@db1.com.br", "password": "senha123"},
            headers=regular_headers,
        ).status_code == 403

    def test_create_requires_auth(self, client):
        assert client.post("/api/admin/users", json={"email": "x@x.com", "password": "abc123"}).status_code == 401

    def test_list_users(self, client, auth_headers):
        resp = client.get("/api/admin/users", headers=auth_headers)
        assert resp.status_code == 200
        users = resp.json()["users"]
        assert len(users) >= 1
        assert any(u["email"] == "tiagohlatki@db1.com.br" for u in users)

    def test_list_requires_admin(self, client, auth_headers):
        self._create(client, auth_headers, email="regular@db1.com.br")
        resp = client.post("/auth/login", data={"username": "regular@db1.com.br", "password": "senha123"})
        regular_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        assert client.get("/api/admin/users", headers=regular_headers).status_code == 403

    def test_delete_success(self, client, auth_headers):
        self._create(client, auth_headers, email="todelete@db1.com.br")
        users = client.get("/api/admin/users", headers=auth_headers).json()["users"]
        user_id = next(u["id"] for u in users if u["email"] == "todelete@db1.com.br")
        resp = client.delete(f"/api/admin/users/{user_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        remaining = client.get("/api/admin/users", headers=auth_headers).json()["users"]
        assert not any(u["email"] == "todelete@db1.com.br" for u in remaining)

    def test_delete_self_returns_400(self, client, auth_headers):
        users = client.get("/api/admin/users", headers=auth_headers).json()["users"]
        admin_id = next(u["id"] for u in users if u["email"] == "tiagohlatki@db1.com.br")
        assert client.delete(f"/api/admin/users/{admin_id}", headers=auth_headers).status_code == 400

    def test_delete_not_found(self, client, auth_headers):
        assert client.delete("/api/admin/users/9999", headers=auth_headers).status_code == 404

    def test_toggle_deactivates_active_user(self, client, auth_headers):
        self._create(client, auth_headers, email="totoggle@db1.com.br")
        users = client.get("/api/admin/users", headers=auth_headers).json()["users"]
        user_id = next(u["id"] for u in users if u["email"] == "totoggle@db1.com.br")
        resp = client.patch(f"/api/admin/users/{user_id}/toggle", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        assert resp.json()["is_active"] is False
        users_after = client.get("/api/admin/users", headers=auth_headers).json()["users"]
        assert not next(u for u in users_after if u["id"] == user_id)["is_active"]

    def test_toggle_activates_inactive_user(self, client, auth_headers):
        self._create(client, auth_headers, email="totoggle2@db1.com.br")
        users = client.get("/api/admin/users", headers=auth_headers).json()["users"]
        user_id = next(u["id"] for u in users if u["email"] == "totoggle2@db1.com.br")
        client.patch(f"/api/admin/users/{user_id}/toggle", headers=auth_headers)
        resp = client.patch(f"/api/admin/users/{user_id}/toggle", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True

    def test_toggle_self_returns_400(self, client, auth_headers):
        users = client.get("/api/admin/users", headers=auth_headers).json()["users"]
        admin_id = next(u["id"] for u in users if u["email"] == "tiagohlatki@db1.com.br")
        assert client.patch(f"/api/admin/users/{admin_id}/toggle", headers=auth_headers).status_code == 400

    def test_toggle_not_found(self, client, auth_headers):
        assert client.patch("/api/admin/users/9999/toggle", headers=auth_headers).status_code == 404


# ── Task status (public) ──────────────────────────────────────────────────────

class TestTaskStatus:
    def test_no_task(self, client):
        assert client.get("/api/task/status").json()["available"] is False

    def test_with_task(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        data = client.get("/api/task/status").json()
        assert data["available"] is True
        assert data["competencia"] == "2025-01"


# ── Oracle status (public) ────────────────────────────────────────────────────

class TestOracleStatus:
    def test_not_configured(self, client):
        with patch("main.is_oracle_configured", return_value=False):
            resp = client.get("/api/oracle/status")
        assert resp.status_code == 200
        assert resp.json()["available"] is False


# ── Admin task management ──────────────────────────────────────────────────────

class TestAdminTask:
    def _upload(self, client, auth_headers, competencia="2025-01"):
        return client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": competencia},
            headers=auth_headers,
        )

    def test_upload_success(self, client, auth_headers):
        resp = self._upload(client, auth_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_upload_requires_admin(self, client, auth_headers):
        # Create a regular (non-admin) user
        client.post(
            "/api/admin/users",
            json={"email": "regular@db1.com.br", "password": "senha123", "is_admin": False},
            headers=auth_headers,
        )
        resp = client.post("/auth/login", data={"username": "regular@db1.com.br", "password": "senha123"})
        regular_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        assert client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=regular_headers,
        ).status_code == 403

    def test_upload_requires_auth(self, client):
        assert client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
        ).status_code == 401

    def test_list_tasks_empty(self, client, auth_headers):
        assert client.get("/api/admin/tasks", headers=auth_headers).json()["tasks"] == []

    def test_list_tasks_after_upload(self, client, auth_headers):
        self._upload(client, auth_headers)
        tasks = client.get("/api/admin/tasks", headers=auth_headers).json()["tasks"]
        assert len(tasks) == 1
        assert tasks[0]["competencia"] == "2025-01"

    def test_list_requires_auth(self, client):
        assert client.get("/api/admin/tasks").status_code == 401

    def test_delete_success(self, client, auth_headers):
        self._upload(client, auth_headers)
        task_id = client.get("/api/admin/tasks", headers=auth_headers).json()["tasks"][0]["id"]
        resp = client.delete(f"/api/admin/task/{task_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert client.get("/api/admin/tasks", headers=auth_headers).json()["tasks"] == []

    def test_delete_not_found(self, client, auth_headers):
        assert client.delete("/api/admin/task/9999", headers=auth_headers).status_code == 404

    def test_delete_requires_auth(self, client):
        assert client.delete("/api/admin/task/1").status_code == 401


# ── Competencias ──────────────────────────────────────────────────────────────

class TestCompetencias:
    def test_empty(self, client):
        assert client.get("/api/task/competencias").json()["competencias"] == []

    def test_with_upload(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        comps = client.get("/api/task/competencias").json()["competencias"]
        assert len(comps) == 1
        assert comps[0]["competencia"] == "2025-01"

    def test_deduplicates_by_competencia(self, client, auth_headers):
        for _ in range(3):
            client.post(
                "/api/admin/task",
                files={"task": ("Task.xlsx", b"x", "application/octet-stream")},
                data={"competencia": "2025-01"},
                headers=auth_headers,
            )
        assert len(client.get("/api/task/competencias").json()["competencias"]) == 1


# ── Validate endpoint ─────────────────────────────────────────────────────────

class TestValidateEndpoint:
    _GA_FILE = [("ga", ("ga.xls", b"fake", "application/octet-stream"))]
    _FILE_DATA = {
        "start_date": "2025-01-01",
        "end_date": "2025-01-31",
        "use_file_fallback": "true",
        "competencia": "2025-01",
    }

    def test_requires_auth(self, client):
        resp = client.post("/api/validate", files=self._GA_FILE)
        assert resp.status_code == 401

    def test_no_task_returns_422(self, client, auth_headers):
        with patch("main.is_oracle_configured", return_value=False):
            resp = client.post(
                "/api/validate", files=self._GA_FILE, data=self._FILE_DATA, headers=auth_headers
            )
        assert resp.status_code == 422
        assert "Task" in resp.json()["detail"]

    def test_oracle_error_returns_422(self, client, auth_headers):
        """When oracle is configured but call fails, returns 422 with error detail."""
        with patch("main.is_oracle_configured", return_value=True), \
             patch("main._process_ga_with_oracle", side_effect=Exception("Connection refused")):
            resp = client.post(
                "/api/validate",
                files=self._GA_FILE,
                data={"start_date": "2025-01-01", "end_date": "2025-01-31"},
                headers=auth_headers,
            )
        assert resp.status_code == 422

    def test_missing_file_on_disk_returns_422(self, client, auth_headers, tmp_path):
        import main
        fake_path = str(tmp_path / "nonexistent.xlsx")
        with main._db() as conn:
            conn.execute(
                "INSERT INTO task_uploads (filename, path, competencia, uploaded_by) VALUES (?,?,?,?)",
                ("task.xlsx", fake_path, "2025-01", "test@test.com"),
            )
        with patch("main.is_oracle_configured", return_value=False):
            resp = client.post(
                "/api/validate", files=self._GA_FILE, data=self._FILE_DATA, headers=auth_headers
            )
        assert resp.status_code == 422
        assert "não encontrado" in resp.json()["detail"]

    def test_validate_success_file_mode(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        mock_persons = [{"name": "Test", "days": []}]
        with patch("main.is_oracle_configured", return_value=False), \
             patch("gabi_engine.process", return_value=(mock_persons, [])):
            resp = client.post(
                "/api/validate", files=self._GA_FILE, data=self._FILE_DATA, headers=auth_headers
            )
        assert resp.status_code == 200
        assert resp.json()["persons"] == mock_persons

    def test_validate_partial_success(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        with patch("main.is_oracle_configured", return_value=False), \
             patch("gabi_engine.process", return_value=([{"name": "X"}], ["warn"])):
            resp = client.post(
                "/api/validate", files=self._GA_FILE, data=self._FILE_DATA, headers=auth_headers
            )
        assert resp.status_code == 200
        assert len(resp.json()["errors"]) == 1

    def test_validate_engine_exception(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        with patch("main.is_oracle_configured", return_value=False), \
             patch("gabi_engine.process", side_effect=Exception("Parse error")):
            resp = client.post(
                "/api/validate", files=self._GA_FILE, data=self._FILE_DATA, headers=auth_headers
            )
        assert resp.status_code == 422

    def test_validate_no_persons_with_errors(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        with patch("main.is_oracle_configured", return_value=False), \
             patch("gabi_engine.process", return_value=([], ["Pessoa não encontrada"])):
            resp = client.post(
                "/api/validate", files=self._GA_FILE, data=self._FILE_DATA, headers=auth_headers
            )
        assert resp.status_code == 422
        assert "Pessoa não encontrada" in resp.json()["detail"]

    def test_validate_falls_back_to_file_when_oracle_not_configured(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        with patch("main.is_oracle_configured", return_value=False), \
             patch("gabi_engine.process", return_value=([{"name": "X"}], [])):
            resp = client.post(
                "/api/validate",
                files=self._GA_FILE,
                data={"start_date": "2025-01-01", "end_date": "2025-01-31", "competencia": "2025-01"},
                headers=auth_headers,
            )
        assert resp.status_code == 200

    def test_oracle_success_returns_person(self, client, auth_headers):
        mock_person = {"name": "Pedro Santos", "days": []}
        with patch("main.is_oracle_configured", return_value=True), \
             patch("main._process_ga_with_oracle", return_value=(mock_person, None)):
            resp = client.post(
                "/api/validate",
                files=self._GA_FILE,
                data={"start_date": "2025-01-01", "end_date": "2025-01-31"},
                headers=auth_headers,
            )
        assert resp.status_code == 200
        assert resp.json()["persons"] == [mock_person]


class TestProcessGaWithOracle:
    """Unit tests for _process_ga_with_oracle — mocks repository and engine."""

    def _call(self, **overrides):
        import main

        kwargs = {
            "ga_path": "/tmp/fake.xls",
            "email": "pedro@db1.com.br",
            "sd": date(2025, 1, 1),
            "ed": date(2025, 1, 31),
            "year": 2025,
            "month": 1,
            **overrides,
        }
        return main._process_ga_with_oracle(**kwargs)

    def test_parse_ga_error_returns_error_message(self):
        with patch("gabi_engine.parse_ga", side_effect=ValueError("arquivo inválido")):
            person, error = self._call()
        assert person is None
        assert "arquivo inválido" in error

    def test_get_task_hours_error_returns_error_message(self):
        with (
            patch("gabi_engine.parse_ga", return_value=("Pedro Santos", {}, [], [])),
            patch("repositories.task_repository.responsavel_from_email", return_value="PEDRO.SANTOS"),
            patch("repositories.task_repository.get_task_hours", side_effect=Exception("DB unavailable")),
        ):
            person, error = self._call()
        assert person is None
        assert "Task DB" in error

    def test_success_returns_person(self):
        mock_person = {"name": "Pedro Santos", "days": []}
        with (
            patch("gabi_engine.parse_ga", return_value=("Pedro Santos", {}, [], [])),
            patch("repositories.task_repository.responsavel_from_email", return_value="PEDRO.SANTOS"),
            patch("repositories.task_repository.get_task_hours", return_value=({}, {})),
            patch("gabi_engine.process_with_task_data", return_value=mock_person),
        ):
            person, error = self._call()
        assert error is None
        assert person == mock_person
