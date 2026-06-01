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
        assert resp.json()["email"] == "tiagohlatki@db1.com.br"

    def test_unauthenticated(self, client):
        assert client.get("/auth/me").status_code == 401

    def test_invalid_token(self, client):
        assert client.get("/auth/me", headers={"Authorization": "Bearer bad.token.here"}).status_code == 401

    def test_inactive_user(self, client, auth_headers):
        import main
        with main._db() as conn:
            conn.execute("UPDATE users SET is_active=0 WHERE email=?", ("tiagohlatki@db1.com.br",))
        resp = client.get("/auth/me", headers=auth_headers)
        assert resp.status_code == 401


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
        resp = client.post(
            "/auth/change-password",
            params={"current_password": "gabi2025", "new_password": "newsecure123"},
        )
        assert resp.status_code == 401


# ── Task status (public) ──────────────────────────────────────────────────────

class TestTaskStatus:
    def test_no_task(self, client):
        resp = client.get("/api/task/status")
        assert resp.status_code == 200
        assert resp.json()["available"] is False

    def test_with_task(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        resp = client.get("/api/task/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["available"] is True
        assert data["competencia"] == "2025-01"
        assert "filename" in data


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
        assert resp.json()["competencia"] == "2025-01"

    def test_upload_requires_auth(self, client):
        resp = client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
        )
        assert resp.status_code == 401

    def test_list_tasks_empty(self, client, auth_headers):
        resp = client.get("/api/admin/tasks", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["tasks"] == []

    def test_list_tasks_after_upload(self, client, auth_headers):
        self._upload(client, auth_headers)
        resp = client.get("/api/admin/tasks", headers=auth_headers)
        assert resp.status_code == 200
        tasks = resp.json()["tasks"]
        assert len(tasks) == 1
        assert tasks[0]["competencia"] == "2025-01"

    def test_list_requires_auth(self, client):
        assert client.get("/api/admin/tasks").status_code == 401

    def test_delete_success(self, client, auth_headers):
        self._upload(client, auth_headers)
        task_id = client.get("/api/admin/tasks", headers=auth_headers).json()["tasks"][0]["id"]
        resp = client.delete(f"/api/admin/task/{task_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        # Confirm removal
        tasks = client.get("/api/admin/tasks", headers=auth_headers).json()["tasks"]
        assert tasks == []

    def test_delete_not_found(self, client, auth_headers):
        resp = client.delete("/api/admin/task/9999", headers=auth_headers)
        assert resp.status_code == 404

    def test_delete_requires_auth(self, client):
        assert client.delete("/api/admin/task/1").status_code == 401


# ── Competencias ──────────────────────────────────────────────────────────────

class TestCompetencias:
    def test_empty(self, client):
        resp = client.get("/api/task/competencias")
        assert resp.status_code == 200
        assert resp.json()["competencias"] == []

    def test_with_upload(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        resp = client.get("/api/task/competencias")
        assert resp.status_code == 200
        comps = resp.json()["competencias"]
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
        resp = client.get("/api/task/competencias")
        assert len(resp.json()["competencias"]) == 1


# ── Validate endpoint ─────────────────────────────────────────────────────────

class TestValidateEndpoint:
    _GA_FILE = [("ga", ("ga.xls", b"fake", "application/octet-stream"))]

    def test_no_task_returns_422(self, client):
        resp = client.post("/api/validate", files=self._GA_FILE)
        assert resp.status_code == 422
        assert "Task" in resp.json()["detail"]

    def test_missing_file_on_disk_returns_422(self, client, auth_headers, tmp_path):
        import main
        fake_path = str(tmp_path / "nonexistent.xlsx")
        with main._db() as conn:
            conn.execute(
                "INSERT INTO task_uploads (filename, path, competencia, uploaded_by) VALUES (?,?,?,?)",
                ("task.xlsx", fake_path, "2025-01", "test@test.com"),
            )
        resp = client.post("/api/validate", files=self._GA_FILE)
        assert resp.status_code == 422
        assert "não encontrado" in resp.json()["detail"]

    def test_validate_success(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        mock_persons = [{"name": "Test", "days": []}]
        with patch("gabi_engine.process", return_value=(mock_persons, [])):
            resp = client.post("/api/validate", files=self._GA_FILE)
        assert resp.status_code == 200
        assert resp.json()["persons"] == mock_persons
        assert resp.json()["errors"] == []

    def test_validate_partial_success(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        with patch("gabi_engine.process", return_value=([{"name": "X"}], ["warn"])):
            resp = client.post("/api/validate", files=self._GA_FILE)
        assert resp.status_code == 200
        assert len(resp.json()["errors"]) == 1

    def test_validate_engine_exception(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        with patch("gabi_engine.process", side_effect=Exception("Parse error")):
            resp = client.post("/api/validate", files=self._GA_FILE)
        assert resp.status_code == 422
        assert "Parse error" in resp.json()["detail"]

    def test_validate_no_persons_with_errors(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-01"},
            headers=auth_headers,
        )
        with patch("gabi_engine.process", return_value=([], ["Pessoa não encontrada"])):
            resp = client.post("/api/validate", files=self._GA_FILE)
        assert resp.status_code == 422
        assert "Pessoa não encontrada" in resp.json()["detail"]

    def test_validate_with_competencia(self, client, auth_headers):
        client.post(
            "/api/admin/task",
            files={"task": ("Task.xlsx", b"content", "application/octet-stream")},
            data={"competencia": "2025-02"},
            headers=auth_headers,
        )
        with patch("gabi_engine.process", return_value=([{"name": "X"}], [])):
            resp = client.post(
                "/api/validate",
                files=self._GA_FILE,
                data={"competencia": "2025-02"},
            )
        assert resp.status_code == 200

    def test_validate_nonexistent_competencia_422(self, client):
        resp = client.post(
            "/api/validate",
            files=self._GA_FILE,
            data={"competencia": "2025-99"},
        )
        assert resp.status_code == 422
