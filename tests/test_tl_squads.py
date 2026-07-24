"""Integration tests for the tl-evaluation admin squad endpoints (T6).

All tests use the shared `client` fixture (conftest.py) which creates a fresh
in-memory SQLite DB for each test via monkeypatch on main.DB_PATH.
"""

import pytest

ADMIN_EMAIL = "tiagohlatki@db1.com.br"
REGULAR_EMAIL = "regular_tl@db1.com.br"
OTHER_TL_EMAIL = "other_tl@db1.com.br"


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture()
def non_admin_headers(client, auth_headers):
    """Headers for a freshly created non-admin user."""
    client.post(
        "/api/admin/users",
        json={"email": REGULAR_EMAIL, "password": "senha123", "is_admin": False},
        headers=auth_headers,
    )
    login = client.post("/auth/login", data={"username": REGULAR_EMAIL, "password": "senha123"})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


# ── Admin squads CRUD ─────────────────────────────────────────────────────────


class TestAdminCreateSquad:
    def test_valid_tl_email_returns_201(self, client, auth_headers):
        resp = client.post(
            "/api/admin/squads",
            json={"nome": "Squad Alpha", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["nome"] == "Squad Alpha"
        assert data["tech_lead_user_email"] == ADMIN_EMAIL
        assert "id" in data

    def test_nonexistent_tl_email_returns_422(self, client, auth_headers):
        resp = client.post(
            "/api/admin/squads",
            json={"nome": "Squad Beta", "tech_lead_user_email": "nobody@example.com"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_non_admin_returns_403(self, client, non_admin_headers):
        resp = client.post(
            "/api/admin/squads",
            json={"nome": "Squad Gamma", "tech_lead_user_email": ADMIN_EMAIL},
            headers=non_admin_headers,
        )
        assert resp.status_code == 403

    def test_unauthenticated_returns_401(self, client):
        resp = client.post(
            "/api/admin/squads",
            json={"nome": "Squad Delta", "tech_lead_user_email": ADMIN_EMAIL},
        )
        assert resp.status_code == 401

    def test_team_member_email_is_valid_tl(self, client, auth_headers):
        """A user in team_members (not in users) is also a valid TL email."""
        import main

        with main._db() as conn:
            conn.execute(
                "INSERT INTO team_members (user_email, cpf, subcontrato, profile, nome_completo)"
                " VALUES ('tl_tm@db1.com.br', '123.456.789-00', 'DB1', 'Dev', 'TL Team Member')"
            )
        resp = client.post(
            "/api/admin/squads",
            json={"nome": "Squad TM", "tech_lead_user_email": "tl_tm@db1.com.br"},
            headers=auth_headers,
        )
        assert resp.status_code == 201


class TestAdminListSquads:
    def test_returns_empty_list_initially(self, client, auth_headers):
        resp = client.get("/api/admin/squads", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["squads"] == []

    def test_returns_created_squad(self, client, auth_headers):
        client.post(
            "/api/admin/squads",
            json={"nome": "Squad List Test", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        )
        resp = client.get("/api/admin/squads", headers=auth_headers)
        assert resp.status_code == 200
        squads = resp.json()["squads"]
        assert any(s["nome"] == "Squad List Test" for s in squads)

    def test_non_admin_returns_403(self, client, non_admin_headers):
        assert client.get("/api/admin/squads", headers=non_admin_headers).status_code == 403


class TestAdminUpdateSquad:
    def _create(self, client, auth_headers, nome="Squad Update", email=ADMIN_EMAIL):
        return client.post(
            "/api/admin/squads",
            json={"nome": nome, "tech_lead_user_email": email},
            headers=auth_headers,
        ).json()

    def test_rename_returns_200(self, client, auth_headers):
        squad = self._create(client, auth_headers)
        resp = client.put(
            f"/api/admin/squads/{squad['id']}",
            json={"nome": "Squad Renamed"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["nome"] == "Squad Renamed"

    def test_valid_reassignment_returns_200(self, client, auth_headers):
        client.post(
            "/api/admin/users",
            json={"email": OTHER_TL_EMAIL, "password": "senha123"},
            headers=auth_headers,
        )
        squad = self._create(client, auth_headers)
        resp = client.put(
            f"/api/admin/squads/{squad['id']}",
            json={"tech_lead_user_email": OTHER_TL_EMAIL},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["tech_lead_user_email"] == OTHER_TL_EMAIL

    def test_nonexistent_tl_email_returns_422(self, client, auth_headers):
        squad = self._create(client, auth_headers)
        resp = client.put(
            f"/api/admin/squads/{squad['id']}",
            json={"tech_lead_user_email": "ghost@example.com"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_squad_not_found_returns_404(self, client, auth_headers):
        resp = client.put(
            "/api/admin/squads/9999",
            json={"nome": "Should Fail"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_non_admin_returns_403(self, client, auth_headers, non_admin_headers):
        squad = self._create(client, auth_headers)
        resp = client.put(
            f"/api/admin/squads/{squad['id']}",
            json={"nome": "Blocked"},
            headers=non_admin_headers,
        )
        assert resp.status_code == 403


# ── Admin squad member listing ────────────────────────────────────────────────


class TestAdminListSquadMembers:
    def _create_squad(self, client, auth_headers):
        return client.post(
            "/api/admin/squads",
            json={"nome": "Members Test Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        ).json()

    def test_empty_squad_returns_empty_list(self, client, auth_headers):
        squad = self._create_squad(client, auth_headers)
        resp = client.get(f"/api/admin/squads/{squad['id']}/members", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["members"] == []

    def test_includes_active_and_deactivated_members(self, client, auth_headers):
        import main

        squad = self._create_squad(client, auth_headers)
        with main._db() as conn:
            conn.execute(
                "INSERT INTO squad_members (squad_id, nome, role_id, senioridade, fornecedor, ativo)"
                " VALUES (?, 'Alice Silva', 1, 'Sênior', 'DB1', 1)",
                (squad["id"],),
            )
            conn.execute(
                "INSERT INTO squad_members (squad_id, nome, role_id, senioridade, fornecedor, ativo)"
                " VALUES (?, 'Bob Santos', 2, 'Pleno', 'DB1', 0)",
                (squad["id"],),
            )

        resp = client.get(f"/api/admin/squads/{squad['id']}/members", headers=auth_headers)
        assert resp.status_code == 200
        members = resp.json()["members"]
        assert len(members) == 2
        names = {m["nome"] for m in members}
        assert "Alice Silva" in names
        assert "Bob Santos" in names

    def test_non_admin_returns_403(self, client, auth_headers, non_admin_headers):
        squad = self._create_squad(client, auth_headers)
        resp = client.get(f"/api/admin/squads/{squad['id']}/members", headers=non_admin_headers)
        assert resp.status_code == 403

    def test_squad_not_found_returns_404(self, client, auth_headers):
        resp = client.get("/api/admin/squads/9999/members", headers=auth_headers)
        assert resp.status_code == 404

    def test_post_members_route_does_not_exist(self, client, auth_headers):
        """No write route under /api/admin/squads/*/members — returns 404 or 405."""
        squad = self._create_squad(client, auth_headers)
        resp = client.post(
            f"/api/admin/squads/{squad['id']}/members",
            json={"nome": "Eve", "role_id": 1, "senioridade": "Júnior", "fornecedor": "DB1"},
            headers=auth_headers,
        )
        assert resp.status_code in (404, 405)

    def test_patch_members_route_does_not_exist(self, client, auth_headers):
        """No PATCH route under /api/admin/squads/*/members/{id} — returns 404."""
        resp = client.patch(
            "/api/admin/squads/1/members/1",
            json={"nome": "Edited"},
            headers=auth_headers,
        )
        assert resp.status_code in (404, 405)


# ── TL squads listing ─────────────────────────────────────────────────────────


class TestTlListSquads:
    def test_own_squad_appears(self, client, auth_headers):
        client.post(
            "/api/admin/squads",
            json={"nome": "My Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        )
        resp = client.get("/api/tl/squads", headers=auth_headers)
        assert resp.status_code == 200
        squads = resp.json()["squads"]
        assert any(s["nome"] == "My Squad" for s in squads)

    def test_non_tl_gets_empty_list(self, client, auth_headers, non_admin_headers):
        client.post(
            "/api/admin/squads",
            json={"nome": "Admin Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        )
        resp = client.get("/api/tl/squads", headers=non_admin_headers)
        assert resp.status_code == 200
        assert resp.json()["squads"] == []

    def test_unauthenticated_returns_401(self, client):
        assert client.get("/api/tl/squads").status_code == 401


# ── TL member CRUD ────────────────────────────────────────────────────────────

_MEMBER_BODY = {
    "nome": "João Silva",
    "role_id": 1,  # seeded role catalog — see seed_default_roles()
    "senioridade": "Pleno",
    "fornecedor": "DB1",
}


class TestTlMemberCRUD:
    def _create_squad(self, client, auth_headers):
        return client.post(
            "/api/admin/squads",
            json={"nome": "Member Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        ).json()

    def test_create_member_returns_201(self, client, auth_headers):
        squad = self._create_squad(client, auth_headers)
        resp = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json=_MEMBER_BODY,
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["nome"] == "João Silva"
        assert "id" in data

    def test_non_tl_create_returns_403(self, client, auth_headers, non_admin_headers):
        squad = self._create_squad(client, auth_headers)
        resp = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json=_MEMBER_BODY,
            headers=non_admin_headers,
        )
        assert resp.status_code == 403

    def test_create_member_invalid_role_id_returns_422(self, client, auth_headers):
        squad = self._create_squad(client, auth_headers)
        resp = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json={**_MEMBER_BODY, "role_id": 9999},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_list_returns_only_active(self, client, auth_headers):
        squad = self._create_squad(client, auth_headers)
        m1 = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json={**_MEMBER_BODY, "nome": "Active"},
            headers=auth_headers,
        ).json()
        m2 = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json={**_MEMBER_BODY, "nome": "Inactive"},
            headers=auth_headers,
        ).json()
        client.patch(
            f"/api/tl/squads/{squad['id']}/members/{m2['id']}",
            json={"ativo": False},
            headers=auth_headers,
        )
        resp = client.get(f"/api/tl/squads/{squad['id']}/members", headers=auth_headers)
        assert resp.status_code == 200
        names = {m["nome"] for m in resp.json()["members"]}
        assert "Active" in names
        assert "Inactive" not in names

    def test_list_include_inactive_returns_both(self, client, auth_headers):
        squad = self._create_squad(client, auth_headers)
        client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json={**_MEMBER_BODY, "nome": "Active"},
            headers=auth_headers,
        )
        m2 = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json={**_MEMBER_BODY, "nome": "Inactive"},
            headers=auth_headers,
        ).json()
        client.patch(
            f"/api/tl/squads/{squad['id']}/members/{m2['id']}",
            json={"ativo": False},
            headers=auth_headers,
        )
        resp = client.get(
            f"/api/tl/squads/{squad['id']}/members",
            params={"include_inactive": True},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        names = {m["nome"] for m in resp.json()["members"]}
        assert "Active" in names
        assert "Inactive" in names

    def test_list_include_inactive_non_tl_returns_403(self, client, auth_headers, non_admin_headers):
        squad = self._create_squad(client, auth_headers)
        resp = client.get(
            f"/api/tl/squads/{squad['id']}/members",
            params={"include_inactive": True},
            headers=non_admin_headers,
        )
        assert resp.status_code == 403

    def test_patch_deactivate_returns_200(self, client, auth_headers):
        squad = self._create_squad(client, auth_headers)
        member = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json=_MEMBER_BODY,
            headers=auth_headers,
        ).json()
        resp = client.patch(
            f"/api/tl/squads/{squad['id']}/members/{member['id']}",
            json={"ativo": False},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["ativo"] == 0

    def test_patch_member_not_found_returns_404(self, client, auth_headers):
        squad = self._create_squad(client, auth_headers)
        resp = client.patch(
            f"/api/tl/squads/{squad['id']}/members/9999",
            json={"nome": "Ghost"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_patch_non_tl_returns_403(self, client, auth_headers, non_admin_headers):
        squad = self._create_squad(client, auth_headers)
        member = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json=_MEMBER_BODY,
            headers=auth_headers,
        ).json()
        resp = client.patch(
            f"/api/tl/squads/{squad['id']}/members/{member['id']}",
            json={"nome": "Changed"},
            headers=non_admin_headers,
        )
        assert resp.status_code == 403


# ── TL historico ──────────────────────────────────────────────────────────────

_EVAL_BODY = {
    "comportamental_nota": 4,
    "comportamental_paragrafo": "Manteve boa postura.",
    "tecnica_nota": 4,
    "tecnica_paragrafo": "Entregou as implementações.",
    "prazo_nota": 4,
    "prazo_paragrafo": "Cumpriu os prazos.",
    "janela_reduzida": False,
}


class TestTlHistorico:
    def _setup(self, client, auth_headers):
        squad = client.post(
            "/api/admin/squads",
            json={"nome": "Historico Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        ).json()
        member = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json=_MEMBER_BODY,
            headers=auth_headers,
        ).json()
        return squad, member

    def test_prior_competencia_appears(self, client, auth_headers):
        squad, member = self._setup(client, auth_headers)
        client.post(
            "/api/tl-evaluations",
            json={
                "squad_id": squad["id"],
                "competencia": "2024-01",
                "squad_member_id": member["id"],
                **_EVAL_BODY,
            },
            headers=auth_headers,
        )
        resp = client.get(
            f"/api/tl/squads/{squad['id']}/historico", headers=auth_headers
        )
        assert resp.status_code == 200
        historico = resp.json()["historico"]
        assert any(h["competencia"] == "2024-01" for h in historico)

    def test_current_competencia_excluded(self, client, auth_headers):
        from datetime import datetime

        squad, member = self._setup(client, auth_headers)
        current = datetime.now().strftime("%Y-%m")
        client.post(
            "/api/tl-evaluations",
            json={
                "squad_id": squad["id"],
                "competencia": current,
                "squad_member_id": member["id"],
                **_EVAL_BODY,
            },
            headers=auth_headers,
        )
        resp = client.get(
            f"/api/tl/squads/{squad['id']}/historico", headers=auth_headers
        )
        assert resp.status_code == 200
        assert not any(h["competencia"] == current for h in resp.json()["historico"])

    def test_non_tl_returns_403(self, client, auth_headers, non_admin_headers):
        squad, _ = self._setup(client, auth_headers)
        resp = client.get(
            f"/api/tl/squads/{squad['id']}/historico", headers=non_admin_headers
        )
        assert resp.status_code == 403


# ── TL chat turn ──────────────────────────────────────────────────────────────


class TestTlChatTurn:
    def _setup(self, client, auth_headers):
        squad = client.post(
            "/api/admin/squads",
            json={"nome": "Chat Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        ).json()
        member = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json=_MEMBER_BODY,
            headers=auth_headers,
        ).json()
        return squad, member

    def test_valid_chat_returns_ask_question(self, client, auth_headers, monkeypatch):
        import main

        squad, member = self._setup(client, auth_headers)
        mock_response = {
            "content": [
                {
                    "type": "tool_use",
                    "name": "ask_question",
                    "input": {"question": "Pode dar um exemplo concreto?"},
                }
            ]
        }
        monkeypatch.setattr(main.anthropic_client, "complete", lambda req: mock_response)
        resp = client.post(
            "/api/tl-evaluations/chat",
            json={
                "squad_id": squad["id"],
                "competencia": "2026-07",
                "squad_member_id": member["id"],
                "messages": [{"role": "user", "content": "É muito bom tecnicamente."}],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "ask_question"
        assert "question" in data

    def test_non_tl_non_admin_returns_403(self, client, auth_headers, non_admin_headers):
        squad, member = self._setup(client, auth_headers)
        resp = client.post(
            "/api/tl-evaluations/chat",
            json={
                "squad_id": squad["id"],
                "competencia": "2026-07",
                "squad_member_id": member["id"],
                "messages": [{"role": "user", "content": "Relato..."}],
            },
            headers=non_admin_headers,
        )
        assert resp.status_code == 403

    def test_chat_request_carries_squad_member_and_competencia_context(
        self, client, auth_headers, monkeypatch
    ):
        """The system prompt sent to Claude must already know who/where/when —
        the model must never need to ask the TL who is being evaluated."""
        import main

        squad, member = self._setup(client, auth_headers)
        mock_response = {
            "content": [
                {
                    "type": "tool_use",
                    "name": "ask_question",
                    "input": {"question": "Pode dar um exemplo concreto?"},
                }
            ]
        }
        captured = {}

        def fake_complete(req):
            captured["request"] = req
            return mock_response

        monkeypatch.setattr(main.anthropic_client, "complete", fake_complete)
        client.post(
            "/api/tl-evaluations/chat",
            json={
                "squad_id": squad["id"],
                "competencia": "2026-07",
                "squad_member_id": member["id"],
                "messages": [{"role": "user", "content": "Relato inicial."}],
            },
            headers=auth_headers,
        )
        system_prompt = captured["request"]["system"]
        assert squad["nome"] in system_prompt
        assert member["nome"] in system_prompt
        assert member["senioridade"] in system_prompt
        assert "2026-07" in system_prompt


# ── TL evaluation confirmation ────────────────────────────────────────────────


class TestTlEvaluationConfirm:
    def _setup(self, client, auth_headers):
        squad = client.post(
            "/api/admin/squads",
            json={"nome": "Confirm Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        ).json()
        member = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json=_MEMBER_BODY,
            headers=auth_headers,
        ).json()
        return squad, member

    def _confirm(self, client, auth_headers, squad_id, member_id, competencia="2026-07"):
        return client.post(
            "/api/tl-evaluations",
            json={
                "squad_id": squad_id,
                "competencia": competencia,
                "squad_member_id": member_id,
                **_EVAL_BODY,
            },
            headers=auth_headers,
        )

    def test_confirmation_returns_201(self, client, auth_headers):
        squad, member = self._setup(client, auth_headers)
        resp = self._confirm(client, auth_headers, squad["id"], member["id"])
        assert resp.status_code == 201
        assert resp.json()["ok"] is True

    def test_second_confirmation_upserts_not_duplicates(self, client, auth_headers):
        import main

        squad, member = self._setup(client, auth_headers)
        self._confirm(client, auth_headers, squad["id"], member["id"])
        self._confirm(client, auth_headers, squad["id"], member["id"])
        with main._db() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM tl_evaluations WHERE squad_id=? AND squad_member_id=?",
                (squad["id"], member["id"]),
            ).fetchone()[0]
        assert count == 1

    def test_non_tl_returns_403(self, client, auth_headers, non_admin_headers):
        squad, member = self._setup(client, auth_headers)
        resp = client.post(
            "/api/tl-evaluations",
            json={
                "squad_id": squad["id"],
                "competencia": "2026-07",
                "squad_member_id": member["id"],
                **_EVAL_BODY,
            },
            headers=non_admin_headers,
        )
        assert resp.status_code == 403


# ── TL evaluation list ────────────────────────────────────────────────────────


class TestTlEvaluationList:
    def _setup_with_eval(self, client, auth_headers, competencia="2026-07"):
        squad = client.post(
            "/api/admin/squads",
            json={"nome": "List Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        ).json()
        member = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json=_MEMBER_BODY,
            headers=auth_headers,
        ).json()
        client.post(
            "/api/tl-evaluations",
            json={
                "squad_id": squad["id"],
                "competencia": competencia,
                "squad_member_id": member["id"],
                **_EVAL_BODY,
            },
            headers=auth_headers,
        )
        return squad, member

    def test_list_returns_confirmed_evaluations(self, client, auth_headers):
        squad, _ = self._setup_with_eval(client, auth_headers)
        resp = client.get(
            "/api/tl-evaluations",
            params={"squad_id": squad["id"], "competencia": "2026-07"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert len(resp.json()["evaluations"]) == 1

    def test_list_empty_when_no_evaluations(self, client, auth_headers):
        squad = client.post(
            "/api/admin/squads",
            json={"nome": "Empty Eval Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        ).json()
        resp = client.get(
            "/api/tl-evaluations",
            params={"squad_id": squad["id"], "competencia": "2026-07"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["evaluations"] == []

    def test_non_tl_returns_403(self, client, auth_headers, non_admin_headers):
        squad, _ = self._setup_with_eval(client, auth_headers)
        resp = client.get(
            "/api/tl-evaluations",
            params={"squad_id": squad["id"], "competencia": "2026-07"},
            headers=non_admin_headers,
        )
        assert resp.status_code == 403


# ── TL reopen evaluation ──────────────────────────────────────────────────────


class TestTlReopenEvaluation:
    def _setup_with_eval(self, client, auth_headers, competencia="2026-07"):
        squad = client.post(
            "/api/admin/squads",
            json={"nome": "Reopen Eval Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        ).json()
        member = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json=_MEMBER_BODY,
            headers=auth_headers,
        ).json()
        client.post(
            "/api/tl-evaluations",
            json={
                "squad_id": squad["id"],
                "competencia": competencia,
                "squad_member_id": member["id"],
                **_EVAL_BODY,
            },
            headers=auth_headers,
        )
        return squad, member

    def test_reopen_removes_it_from_the_confirmed_list(self, client, auth_headers):
        squad, member = self._setup_with_eval(client, auth_headers)
        resp = client.post(
            f"/api/tl-evaluations/{squad['id']}/2026-07/{member['id']}/reopen",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        listed = client.get(
            "/api/tl-evaluations",
            params={"squad_id": squad["id"], "competencia": "2026-07"},
            headers=auth_headers,
        ).json()["evaluations"]
        assert listed == []

    def test_reopen_keeps_the_row_for_re_confirmation(self, client, auth_headers):
        import main

        squad, member = self._setup_with_eval(client, auth_headers)
        client.post(
            f"/api/tl-evaluations/{squad['id']}/2026-07/{member['id']}/reopen",
            headers=auth_headers,
        )
        with main._db() as conn:
            row = conn.execute(
                "SELECT status FROM tl_evaluations WHERE squad_id=? AND squad_member_id=?",
                (squad["id"], member["id"]),
            ).fetchone()
        assert row["status"] == "rascunho"

    def test_reopen_also_reopens_the_closed_competencia(self, client, auth_headers):
        import main

        squad, member = self._setup_with_eval(client, auth_headers)
        client.post(f"/api/tl-evaluations/{squad['id']}/2026-07/close", headers=auth_headers)
        client.post(
            f"/api/tl-evaluations/{squad['id']}/2026-07/{member['id']}/reopen",
            headers=auth_headers,
        )
        with main._db() as conn:
            row = conn.execute(
                "SELECT 1 FROM squad_competencia_closures WHERE squad_id=? AND competencia=?",
                (squad["id"], "2026-07"),
            ).fetchone()
        assert row is None

    def test_reconfirm_after_reopen_restores_it_to_confirmado(self, client, auth_headers):
        squad, member = self._setup_with_eval(client, auth_headers)
        client.post(
            f"/api/tl-evaluations/{squad['id']}/2026-07/{member['id']}/reopen",
            headers=auth_headers,
        )
        client.post(
            "/api/tl-evaluations",
            json={
                "squad_id": squad["id"],
                "competencia": "2026-07",
                "squad_member_id": member["id"],
                **_EVAL_BODY,
            },
            headers=auth_headers,
        )
        listed = client.get(
            "/api/tl-evaluations",
            params={"squad_id": squad["id"], "competencia": "2026-07"},
            headers=auth_headers,
        ).json()["evaluations"]
        assert len(listed) == 1

    def test_reopen_nonexistent_evaluation_is_a_noop(self, client, auth_headers):
        squad = client.post(
            "/api/admin/squads",
            json={"nome": "No Eval Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        ).json()
        resp = client.post(
            f"/api/tl-evaluations/{squad['id']}/2026-07/9999/reopen",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    def test_non_tl_returns_403(self, client, auth_headers, non_admin_headers):
        squad, member = self._setup_with_eval(client, auth_headers)
        resp = client.post(
            f"/api/tl-evaluations/{squad['id']}/2026-07/{member['id']}/reopen",
            headers=non_admin_headers,
        )
        assert resp.status_code == 403


# ── TL close competência ──────────────────────────────────────────────────────


class TestTlCloseCompetencia:
    def _setup_with_eval(self, client, auth_headers, competencia="2026-07"):
        squad = client.post(
            "/api/admin/squads",
            json={"nome": "Close Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        ).json()
        member = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json=_MEMBER_BODY,
            headers=auth_headers,
        ).json()
        client.post(
            "/api/tl-evaluations",
            json={
                "squad_id": squad["id"],
                "competencia": competencia,
                "squad_member_id": member["id"],
                **_EVAL_BODY,
            },
            headers=auth_headers,
        )
        return squad, member

    def test_close_returns_201(self, client, auth_headers):
        squad, _ = self._setup_with_eval(client, auth_headers)
        resp = client.post(
            f"/api/tl-evaluations/{squad['id']}/2026-07/close",
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["squad_id"] == squad["id"]
        assert "closed_at" in data

    def test_close_creates_closure_row(self, client, auth_headers):
        import main

        squad, _ = self._setup_with_eval(client, auth_headers)
        client.post(
            f"/api/tl-evaluations/{squad['id']}/2026-07/close",
            headers=auth_headers,
        )
        with main._db() as conn:
            row = conn.execute(
                "SELECT 1 FROM squad_competencia_closures WHERE squad_id=? AND competencia=?",
                (squad["id"], "2026-07"),
            ).fetchone()
        assert row is not None

    def test_reconfirm_after_close_deletes_closure(self, client, auth_headers):
        import main

        squad, member = self._setup_with_eval(client, auth_headers)
        client.post(
            f"/api/tl-evaluations/{squad['id']}/2026-07/close",
            headers=auth_headers,
        )
        # Re-confirm — must delete closure row
        client.post(
            "/api/tl-evaluations",
            json={
                "squad_id": squad["id"],
                "competencia": "2026-07",
                "squad_member_id": member["id"],
                **_EVAL_BODY,
            },
            headers=auth_headers,
        )
        with main._db() as conn:
            row = conn.execute(
                "SELECT 1 FROM squad_competencia_closures WHERE squad_id=? AND competencia=?",
                (squad["id"], "2026-07"),
            ).fetchone()
        assert row is None

    def test_non_tl_returns_403(self, client, auth_headers, non_admin_headers):
        squad, _ = self._setup_with_eval(client, auth_headers)
        resp = client.post(
            f"/api/tl-evaluations/{squad['id']}/2026-07/close",
            headers=non_admin_headers,
        )
        assert resp.status_code == 403


# ── TL closure status + reopen ────────────────────────────────────────────────


class TestTlClosureStatus:
    def _setup_with_eval(self, client, auth_headers, competencia="2026-07"):
        squad = client.post(
            "/api/admin/squads",
            json={"nome": "Closure Status Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        ).json()
        member = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json=_MEMBER_BODY,
            headers=auth_headers,
        ).json()
        client.post(
            "/api/tl-evaluations",
            json={
                "squad_id": squad["id"],
                "competencia": competencia,
                "squad_member_id": member["id"],
                **_EVAL_BODY,
            },
            headers=auth_headers,
        )
        return squad, member

    def test_status_closed_false_before_closing(self, client, auth_headers):
        squad, _ = self._setup_with_eval(client, auth_headers)
        resp = client.get(
            f"/api/tl-evaluations/{squad['id']}/2026-07/close",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == {"closed": False}

    def test_status_closed_true_after_closing(self, client, auth_headers):
        squad, _ = self._setup_with_eval(client, auth_headers)
        client.post(f"/api/tl-evaluations/{squad['id']}/2026-07/close", headers=auth_headers)
        resp = client.get(
            f"/api/tl-evaluations/{squad['id']}/2026-07/close",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["closed"] is True
        assert "closed_at" in data
        assert data["closed_by"] == ADMIN_EMAIL

    def test_status_non_tl_returns_403(self, client, auth_headers, non_admin_headers):
        squad, _ = self._setup_with_eval(client, auth_headers)
        resp = client.get(
            f"/api/tl-evaluations/{squad['id']}/2026-07/close",
            headers=non_admin_headers,
        )
        assert resp.status_code == 403

    def test_reopen_deletes_closure_row(self, client, auth_headers):
        import main

        squad, _ = self._setup_with_eval(client, auth_headers)
        client.post(f"/api/tl-evaluations/{squad['id']}/2026-07/close", headers=auth_headers)
        resp = client.delete(
            f"/api/tl-evaluations/{squad['id']}/2026-07/close",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == {"closed": False}
        with main._db() as conn:
            row = conn.execute(
                "SELECT 1 FROM squad_competencia_closures WHERE squad_id=? AND competencia=?",
                (squad["id"], "2026-07"),
            ).fetchone()
        assert row is None

    def test_reopen_preserves_confirmed_evaluations(self, client, auth_headers):
        import main

        squad, member = self._setup_with_eval(client, auth_headers)
        client.post(f"/api/tl-evaluations/{squad['id']}/2026-07/close", headers=auth_headers)
        client.delete(f"/api/tl-evaluations/{squad['id']}/2026-07/close", headers=auth_headers)
        with main._db() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM tl_evaluations WHERE squad_id=? AND squad_member_id=?",
                (squad["id"], member["id"]),
            ).fetchone()[0]
        assert count == 1

    def test_reopen_when_never_closed_is_a_noop(self, client, auth_headers):
        squad, _ = self._setup_with_eval(client, auth_headers)
        resp = client.delete(
            f"/api/tl-evaluations/{squad['id']}/2026-07/close",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == {"closed": False}

    def test_reopen_non_tl_returns_403(self, client, auth_headers, non_admin_headers):
        squad, _ = self._setup_with_eval(client, auth_headers)
        resp = client.delete(
            f"/api/tl-evaluations/{squad['id']}/2026-07/close",
            headers=non_admin_headers,
        )
        assert resp.status_code == 403


# ── TL PDF endpoint ───────────────────────────────────────────────────────────


class TestTlPdfEndpoint:
    def _setup_with_eval(self, client, auth_headers, competencia="2026-07"):
        squad = client.post(
            "/api/admin/squads",
            json={"nome": "PDF Squad", "tech_lead_user_email": ADMIN_EMAIL},
            headers=auth_headers,
        ).json()
        member = client.post(
            f"/api/tl/squads/{squad['id']}/members",
            json=_MEMBER_BODY,
            headers=auth_headers,
        ).json()
        client.post(
            "/api/tl-evaluations",
            json={
                "squad_id": squad["id"],
                "competencia": competencia,
                "squad_member_id": member["id"],
                **_EVAL_BODY,
            },
            headers=auth_headers,
        )
        return squad, member

    def test_pdf_returns_404_when_no_closure(self, client, auth_headers):
        squad, _ = self._setup_with_eval(client, auth_headers)
        resp = client.get(
            f"/api/tl-evaluations/{squad['id']}/2026-07/pdf",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_pdf_returns_200_when_closed(self, client, auth_headers, monkeypatch):
        import main

        squad, _ = self._setup_with_eval(client, auth_headers)
        client.post(
            f"/api/tl-evaluations/{squad['id']}/2026-07/close",
            headers=auth_headers,
        )
        monkeypatch.setattr(
            main.tl_evaluation_pdf,
            "generate_squad_pdf",
            lambda squad_name, competencia, evaluations, *, tech_lead_nome, historico=(): (
                b"%PDF-1.4 mock"
            ),
        )
        resp = client.get(
            f"/api/tl-evaluations/{squad['id']}/2026-07/pdf",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert b"%PDF" in resp.content

    def test_non_tl_non_admin_returns_403(self, client, auth_headers, non_admin_headers):
        squad, _ = self._setup_with_eval(client, auth_headers)
        resp = client.get(
            f"/api/tl-evaluations/{squad['id']}/2026-07/pdf",
            headers=non_admin_headers,
        )
        assert resp.status_code == 403

    def test_generate_squad_pdf_renders_real_document(self):
        """Exercises the real WeasyPrint template end-to-end — the endpoint tests
        above only ever mock generate_squad_pdf out, so this is the only test that
        would catch a broken HTML/CSS template."""
        import tl_evaluation_pdf

        evaluations = [
            {
                "squad_member_id": 1,
                "nome": "Miranda Taylor",
                "papel_nome": "Desenvolvedor",
                "senioridade": "Pleno",
                "competencia": "2026-07",
                "comportamental_nota": 1,
                "comportamental_paragrafo": "Não reportou impedimentos nas dailys.",
                "tecnica_nota": 2,
                "tecnica_paragrafo": "Entrega com problemas de qualidade.",
                "prazo_nota": 1,
                "prazo_paragrafo": "Nenhuma US entregue na sprint.",
                "janela_reduzida": False,
            },
            {
                "squad_member_id": 2,
                "nome": "Ludwig MacAlister",
                "papel_nome": "Desenvolvedor",
                "senioridade": "Junior",
                "competencia": "2026-07",
                "comportamental_nota": 5,
                "comportamental_paragrafo": "Participação ativa e proatividade.",
                "tecnica_nota": 5,
                "tecnica_paragrafo": "Entregas de alta qualidade.",
                "prazo_nota": 4,
                "prazo_paragrafo": "Entregas dentro do prazo.",
                "janela_reduzida": True,
            },
        ]
        historico = [
            {
                "squad_member_id": 1,
                "competencia": "2026-06",
                "comportamental_nota": 2,
                "tecnica_nota": 2,
                "prazo_nota": 1,
            },
            {
                "squad_member_id": 1,
                "competencia": "2026-05",
                "comportamental_nota": 2,
                "tecnica_nota": 2,
                "prazo_nota": 1,
            },
        ]

        pdf_bytes = tl_evaluation_pdf.generate_squad_pdf(
            squad_name="Pagamentos",
            competencia="2026-07",
            evaluations=evaluations,
            tech_lead_nome="John MacClane",
            historico=historico,
        )
        assert pdf_bytes.startswith(b"%PDF")
        assert len(pdf_bytes) > 2000


# ── Role catalog ──────────────────────────────────────────────────────────────


class TestRoleCatalogRead:
    def test_seeded_roles_are_listed(self, client, auth_headers):
        resp = client.get("/api/tl-evaluation/roles", headers=auth_headers)
        assert resp.status_code == 200
        roles = resp.json()["roles"]
        assert len(roles) == 6
        nomes = {r["nome"] for r in roles}
        assert "Tech Lead" in nomes
        assert "Desenvolvedor" in nomes

    def test_role_includes_nested_responsibilities_with_principal_flag(
        self, client, auth_headers
    ):
        roles = client.get("/api/tl-evaluation/roles", headers=auth_headers).json()["roles"]
        tech_lead = next(r for r in roles if r["nome"] == "Tech Lead")
        assert len(tech_lead["responsabilidades"]) > 0
        assert any(r["principal"] for r in tech_lead["responsabilidades"])
        assert any(not r["principal"] for r in tech_lead["responsabilidades"])

    def test_readable_by_non_admin_tl(self, client, non_admin_headers):
        """Any authenticated user can read the catalog — needed to populate the member form."""
        resp = client.get("/api/tl-evaluation/roles", headers=non_admin_headers)
        assert resp.status_code == 200

    def test_unauthenticated_returns_401(self, client):
        assert client.get("/api/tl-evaluation/roles").status_code == 401


class TestRoleCatalogAdminCrud:
    def test_create_role_returns_201(self, client, auth_headers):
        resp = client.post(
            "/api/admin/tl-evaluation/roles",
            json={"nome": "Designer", "descricao": "UX/UI", "categoria": "Produto"},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["nome"] == "Designer"
        assert "id" in data

    def test_duplicate_name_returns_409(self, client, auth_headers):
        client.post(
            "/api/admin/tl-evaluation/roles",
            json={"nome": "Designer Dup", "descricao": "", "categoria": ""},
            headers=auth_headers,
        )
        resp = client.post(
            "/api/admin/tl-evaluation/roles",
            json={"nome": "Designer Dup", "descricao": "", "categoria": ""},
            headers=auth_headers,
        )
        assert resp.status_code == 409

    def test_non_admin_create_returns_403(self, client, non_admin_headers):
        resp = client.post(
            "/api/admin/tl-evaluation/roles",
            json={"nome": "Blocked Role"},
            headers=non_admin_headers,
        )
        assert resp.status_code == 403

    def test_update_role_returns_200(self, client, auth_headers):
        role = client.post(
            "/api/admin/tl-evaluation/roles",
            json={"nome": "Role To Update", "descricao": "old", "categoria": "old"},
            headers=auth_headers,
        ).json()
        resp = client.patch(
            f"/api/admin/tl-evaluation/roles/{role['id']}",
            json={"descricao": "new"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["descricao"] == "new"

    def test_update_nonexistent_role_returns_404(self, client, auth_headers):
        resp = client.patch(
            "/api/admin/tl-evaluation/roles/9999",
            json={"descricao": "new"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_add_responsibility_returns_201_and_appears_in_role(self, client, auth_headers):
        role = client.post(
            "/api/admin/tl-evaluation/roles",
            json={"nome": "Role With Resp", "descricao": "", "categoria": ""},
            headers=auth_headers,
        ).json()
        resp = client.post(
            f"/api/admin/tl-evaluation/roles/{role['id']}/responsibilities",
            json={"descricao": "Faz X", "principal": True},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        listed = client.get("/api/tl-evaluation/roles", headers=auth_headers).json()["roles"]
        updated_role = next(r for r in listed if r["id"] == role["id"])
        assert len(updated_role["responsabilidades"]) == 1
        assert updated_role["responsabilidades"][0]["descricao"] == "Faz X"
        assert updated_role["responsabilidades"][0]["principal"] == 1

    def test_add_responsibility_to_nonexistent_role_returns_404(self, client, auth_headers):
        resp = client.post(
            "/api/admin/tl-evaluation/roles/9999/responsibilities",
            json={"descricao": "Faz X"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_update_responsibility_toggles_principal(self, client, auth_headers):
        role = client.post(
            "/api/admin/tl-evaluation/roles",
            json={"nome": "Role Toggle", "descricao": "", "categoria": ""},
            headers=auth_headers,
        ).json()
        resp = client.post(
            f"/api/admin/tl-evaluation/roles/{role['id']}/responsibilities",
            json={"descricao": "Faz Y", "principal": False},
            headers=auth_headers,
        )
        # POST returns the whole updated role (consistent with PATCH/DELETE) — pull the
        # responsibility's own id from the nested list, not resp.json()["id"] (role id).
        resp_id = resp.json()["responsabilidades"][0]["id"]
        patch_resp = client.patch(
            f"/api/admin/tl-evaluation/roles/{role['id']}/responsibilities/{resp_id}",
            json={"principal": True},
            headers=auth_headers,
        )
        assert patch_resp.status_code == 200
        listed = client.get("/api/tl-evaluation/roles", headers=auth_headers).json()["roles"]
        updated_role = next(r for r in listed if r["id"] == role["id"])
        assert updated_role["responsabilidades"][0]["principal"] == 1

    def test_delete_responsibility_removes_it(self, client, auth_headers):
        role = client.post(
            "/api/admin/tl-evaluation/roles",
            json={"nome": "Role Delete", "descricao": "", "categoria": ""},
            headers=auth_headers,
        ).json()
        resp = client.post(
            f"/api/admin/tl-evaluation/roles/{role['id']}/responsibilities",
            json={"descricao": "Faz Z"},
            headers=auth_headers,
        )
        resp_id = resp.json()["responsabilidades"][0]["id"]
        del_resp = client.delete(
            f"/api/admin/tl-evaluation/roles/{role['id']}/responsibilities/{resp_id}",
            headers=auth_headers,
        )
        assert del_resp.status_code == 200
        listed = client.get("/api/tl-evaluation/roles", headers=auth_headers).json()["roles"]
        updated_role = next(r for r in listed if r["id"] == role["id"])
        assert updated_role["responsabilidades"] == []

    def test_delete_nonexistent_responsibility_returns_404(self, client, auth_headers):
        role = client.post(
            "/api/admin/tl-evaluation/roles",
            json={"nome": "Role Delete 404", "descricao": "", "categoria": ""},
            headers=auth_headers,
        ).json()
        resp = client.delete(
            f"/api/admin/tl-evaluation/roles/{role['id']}/responsibilities/9999",
            headers=auth_headers,
        )
        assert resp.status_code == 404
