"""Integration tests for the tl-evaluation prompt-admin endpoints
(spec 003-tl-evaluation-prompt-admin).

Uses the shared `client`/`auth_headers` fixtures (conftest.py) — fresh
isolated PostgreSQL schema per test (see conftest.client).
"""

import pytest

ADMIN_EMAIL = "tiagohlatki@db1.com.br"
REGULAR_EMAIL = "regular_tl@db1.com.br"


@pytest.fixture()
def non_admin_headers(client, auth_headers):
    client.post(
        "/api/admin/users",
        json={"email": REGULAR_EMAIL, "password": "senha123", "is_admin": False},
        headers=auth_headers,
    )
    login = client.post("/auth/login", data={"username": REGULAR_EMAIL, "password": "senha123"})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.fixture()
def squad_and_member(client, auth_headers):
    """A squad with one member, TL'd by the admin — enough context for the
    preview endpoint's role/member_context resolution."""
    squad = client.post(
        "/api/admin/squads",
        json={"nome": "Squad Preview", "tech_lead_user_email": ADMIN_EMAIL},
        headers=auth_headers,
    ).json()
    roles = client.get("/api/tl-evaluation/roles", headers=auth_headers).json()["roles"]
    role_id = roles[0]["id"]
    member = client.post(
        f"/api/tl/squads/{squad['id']}/members",
        json={
            "nome": "Profissional Teste",
            "role_id": role_id,
            "senioridade": "Pleno",
            "fornecedor": "DB1 Global Software",
        },
        headers=auth_headers,
    ).json()
    return squad, member


# ── GET /api/admin/tl-evaluation-prompt ──────────────────────────────────────


class TestGetPromptSettings:
    def test_returns_all_editable_sections_seeded(self, client, auth_headers):
        resp = client.get("/api/admin/tl-evaluation-prompt", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        for key in ("papel", "fluxo", "gateA", "gateB", "regras", "instrucao", "adicionais"):
            assert key in data["sections"], f"seção '{key}' ausente"
        assert data["sections"]["adicionais"]["content"] == ""

    def test_escala_and_model_config_present(self, client, auth_headers):
        data = client.get("/api/admin/tl-evaluation-prompt", headers=auth_headers).json()
        assert "## Escala de referência" in data["escala_referencia"]
        assert data["model"]
        assert data["max_tokens"] > 0

    def test_forbidden_words_seeded_from_legacy_defaults(self, client, auth_headers):
        data = client.get("/api/admin/tl-evaluation-prompt", headers=auth_headers).json()
        assert set(data["forbidden_words"]) == {"TL", "relato", "reportou"}

    def test_non_admin_returns_403(self, client, non_admin_headers):
        resp = client.get("/api/admin/tl-evaluation-prompt", headers=non_admin_headers)
        assert resp.status_code == 403

    def test_unauthenticated_returns_401(self, client):
        assert client.get("/api/admin/tl-evaluation-prompt").status_code == 401


# ── PUT /api/admin/tl-evaluation-prompt/sections/{key} ───────────────────────


class TestUpdatePromptSection:
    def test_updates_content_and_records_audit(self, client, auth_headers):
        resp = client.put(
            "/api/admin/tl-evaluation-prompt/sections/adicionais",
            json={"content": "Pergunte sobre câmera ligada nas calls."},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["content"] == "Pergunte sobre câmera ligada nas calls."
        assert data["updated_by"] == ADMIN_EMAIL

    def test_second_edit_pushes_first_value_to_history(self, client, auth_headers):
        """Oldest-first history: the seeded default is entry 0 (logged on the
        first PUT), "Versão 1" is entry 1 (logged on the second PUT) — the
        current live value ("Versão 2") is never itself a history row."""
        client.put(
            "/api/admin/tl-evaluation-prompt/sections/gateA",
            json={"content": "Versão 1 da regra."},
            headers=auth_headers,
        )
        client.put(
            "/api/admin/tl-evaluation-prompt/sections/gateA",
            json={"content": "Versão 2 da regra."},
            headers=auth_headers,
        )
        history = client.get(
            "/api/admin/tl-evaluation-prompt/sections/gateA/history", headers=auth_headers
        ).json()["history"]
        assert len(history) == 2
        assert history[-1]["content"] == "Versão 1 da regra."

    def test_escala_is_not_editable(self, client, auth_headers):
        resp = client.put(
            "/api/admin/tl-evaluation-prompt/sections/escala",
            json={"content": "tentativa de editar escala"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_voz_is_not_editable_as_free_text(self, client, auth_headers):
        resp = client.put(
            "/api/admin/tl-evaluation-prompt/sections/voz",
            json={"content": "tentativa de editar voz como texto livre"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_unknown_key_returns_404(self, client, auth_headers):
        resp = client.put(
            "/api/admin/tl-evaluation-prompt/sections/nao_existe",
            json={"content": "qualquer coisa"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_non_admin_returns_403(self, client, non_admin_headers):
        resp = client.put(
            "/api/admin/tl-evaluation-prompt/sections/papel",
            json={"content": "tentativa"},
            headers=non_admin_headers,
        )
        assert resp.status_code == 403

    def test_edit_is_reflected_in_chat_prompt(self, client, auth_headers, squad_and_member):
        squad, member = squad_and_member
        client.put(
            "/api/admin/tl-evaluation-prompt/sections/adicionais",
            json={"content": "Pergunte sobre câmera ligada nas calls."},
            headers=auth_headers,
        )
        preview = client.get(
            "/api/admin/tl-evaluation-prompt/preview",
            params={
                "squad_id": squad["id"],
                "squad_member_id": member["id"],
                "competencia": "2026-07",
            },
            headers=auth_headers,
        ).json()
        assert "Pergunte sobre câmera ligada nas calls." in preview["system"]


# ── Voice-word CRUD ───────────────────────────────────────────────────────────


class TestForbiddenWords:
    def test_add_word_returns_updated_list(self, client, auth_headers):
        resp = client.post(
            "/api/admin/tl-evaluation-prompt/voice-words",
            json={"palavra": "acompanhou"},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        assert "acompanhou" in resp.json()["forbidden_words"]

    def test_add_duplicate_returns_422(self, client, auth_headers):
        client.post(
            "/api/admin/tl-evaluation-prompt/voice-words",
            json={"palavra": "acompanhou"},
            headers=auth_headers,
        )
        resp = client.post(
            "/api/admin/tl-evaluation-prompt/voice-words",
            json={"palavra": "acompanhou"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_add_short_word_returns_422(self, client, auth_headers):
        resp = client.post(
            "/api/admin/tl-evaluation-prompt/voice-words",
            json={"palavra": "ok"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_remove_word_returns_updated_list(self, client, auth_headers):
        client.post(
            "/api/admin/tl-evaluation-prompt/voice-words",
            json={"palavra": "acompanhou"},
            headers=auth_headers,
        )
        resp = client.delete(
            "/api/admin/tl-evaluation-prompt/voice-words/acompanhou", headers=auth_headers
        )
        assert resp.status_code == 200
        assert "acompanhou" not in resp.json()["forbidden_words"]

    def test_add_and_remove_logged_to_history(self, client, auth_headers):
        client.post(
            "/api/admin/tl-evaluation-prompt/voice-words",
            json={"palavra": "acompanhou"},
            headers=auth_headers,
        )
        client.delete(
            "/api/admin/tl-evaluation-prompt/voice-words/acompanhou", headers=auth_headers
        )
        history = client.get(
            "/api/admin/tl-evaluation-prompt/sections/voz/history", headers=auth_headers
        ).json()["history"]
        assert len(history) == 2

    def test_non_admin_cannot_add_word(self, client, non_admin_headers):
        resp = client.post(
            "/api/admin/tl-evaluation-prompt/voice-words",
            json={"palavra": "acompanhou"},
            headers=non_admin_headers,
        )
        assert resp.status_code == 403


# ── GET /api/admin/tl-evaluation-prompt/preview ──────────────────────────────


class TestPreviewPrompt:
    def test_preview_includes_squad_member_and_role_sections(
        self, client, auth_headers, squad_and_member
    ):
        squad, member = squad_and_member
        resp = client.get(
            "/api/admin/tl-evaluation-prompt/preview",
            params={
                "squad_id": squad["id"],
                "squad_member_id": member["id"],
                "competencia": "2026-07",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        system = resp.json()["system"]
        assert squad["nome"] in system
        assert member["nome"] in system
        assert "## Contexto da avaliação" in system
        assert "## Papel avaliado" in system
        assert "2026-07" in system

    def test_preview_never_calls_anthropic(
        self, client, auth_headers, squad_and_member, monkeypatch
    ):
        import core.anthropic_client as anthropic_client

        def _boom(*_args, **_kwargs):
            raise AssertionError("preview must not call the Anthropic API")

        monkeypatch.setattr(anthropic_client, "complete", _boom)
        squad, member = squad_and_member
        resp = client.get(
            "/api/admin/tl-evaluation-prompt/preview",
            params={
                "squad_id": squad["id"],
                "squad_member_id": member["id"],
                "competencia": "2026-07",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200

    def test_nonexistent_member_returns_404(self, client, auth_headers, squad_and_member):
        squad, _member = squad_and_member
        resp = client.get(
            "/api/admin/tl-evaluation-prompt/preview",
            params={"squad_id": squad["id"], "squad_member_id": 999999, "competencia": "2026-07"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_non_admin_returns_403(self, client, non_admin_headers, squad_and_member):
        squad, member = squad_and_member
        resp = client.get(
            "/api/admin/tl-evaluation-prompt/preview",
            params={
                "squad_id": squad["id"],
                "squad_member_id": member["id"],
                "competencia": "2026-07",
            },
            headers=non_admin_headers,
        )
        assert resp.status_code == 403
