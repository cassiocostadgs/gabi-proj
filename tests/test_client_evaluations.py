"""Integration tests for the client-evaluation domain endpoints.

All tests use the shared `client` fixture (conftest.py) which creates a fresh
in-memory SQLite DB for each test via monkeypatch on main.DB_PATH.
"""

import pytest

# ── Reference email bodies (from test-cases.md) ───────────────────────────────

BODY_A = """\
Competência: 06 / 2025
Colaborador: Pedro Santos
Fornecedor: DB1 Global Software
Total de horas(horas): 168:00
Total de horas(decimal): 168,00

Resultado da avaliação do Profissional:

Avaliação Comportamental: 4
Excelente postura profissional.

Avaliação Técnica: 5
Entregas de alta qualidade.

Avaliação Prazos de entrega: 4
Cumpre os prazos acordados.

OBS: Notas de 1 à 5.
"""

BODY_B = """\
Competência: 07 / 2025
Colaborador: Pedro Santos
Fornecedor: DB1 Global Software
Total de horas(horas): 168:00
Total de horas(decimal): 168,00

Resultado da avaliação do Profissional:

Avaliação Comportamental: 3
Avaliação Técnica: 4
Avaliação Prazos de entrega: 3

Feedback: Bom desempenho no geral, com espaço para melhoria técnica.

OBS: Notas de 1 à 5.
"""

BODY_C_WRONG_FORNECEDOR = """\
Competência: 06 / 2025
Colaborador: Pedro Santos
Fornecedor: Outro Fornecedor Ltda
Total de horas(horas): 168:00

Avaliação Comportamental: 4
Avaliação Técnica: 5
Avaliação Prazos de entrega: 4

OBS: Notas de 1 à 5.
"""

BODY_D_CARLOS = """\
Competência: 06 / 2025
Colaborador: CARLOS PEREIRA
Fornecedor: DB1 Global Software
Total de horas(horas): 160:00
Total de horas(decimal): 160,00

Avaliação Comportamental: 5
Avaliação Técnica: 5
Avaliação Prazos de entrega: 5

Feedback: Desempenho exemplar em todos os critérios.

OBS: Notas de 1 à 5.
"""

BODY_UNKNOWN = """\
Competência: 06 / 2025
Colaborador: Nome Totalmente Desconhecido
Fornecedor: DB1 Global Software
Total de horas(horas): 160:00

Avaliação Comportamental: 3
Avaliação Técnica: 3
Avaliação Prazos de entrega: 3

Feedback: Feedback genérico.

OBS: Notas de 1 à 5.
"""

API_KEY = "test-api-key-123"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def admin_h(client):
    """Auth headers for the default admin (tiagohlatki@db1.com.br)."""
    resp = client.post(
        "/auth/login",
        data={"username": "tiagohlatki@db1.com.br", "password": "gabi2025"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture()
def with_team_members(client, admin_h):
    """Seed users and team members required for auto-linking in ingest tests.

    Creates user accounts first (team-member endpoint validates users exist),
    then the billing rate, and finally the team_members rows.
    """
    for email in ("pedro.santos@db1.com.br", "carlos.pereira@db1.com.br"):
        client.post(
            "/api/admin/users",
            json={"email": email, "password": "prof123"},
            headers=admin_h,
        )
    client.post(
        "/api/admin/billing-rates",
        json={"profile": "DEV", "valor_hora": 100.0},
        headers=admin_h,
    )
    client.post(
        "/api/admin/team",
        json={"user_email": "pedro.santos@db1.com.br", "cpf": "111", "subcontrato": "SC1", "profile": "DEV"},
        headers=admin_h,
    )
    client.post(
        "/api/admin/team",
        json={"user_email": "carlos.pereira@db1.com.br", "cpf": "222", "subcontrato": "SC1", "profile": "DEV"},
        headers=admin_h,
    )


@pytest.fixture()
def prof_h(client, with_team_members):
    """Auth headers for pedro.santos@db1.com.br — depends on with_team_members for user creation."""
    resp = client.post(
        "/auth/login",
        data={"username": "pedro.santos@db1.com.br", "password": "prof123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture()
def prof2_h(client, with_team_members):
    """Auth headers for carlos.pereira@db1.com.br — depends on with_team_members for user creation."""
    resp = client.post(
        "/auth/login",
        data={"username": "carlos.pereira@db1.com.br", "password": "prof123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture()
def api_key_env(monkeypatch):
    """Set MAG_EVAL_API_KEY env var for integration endpoint tests."""
    monkeypatch.setenv("MAG_EVAL_API_KEY", API_KEY)


def _ingest(client, headers, body_text, confirm_override=False):
    url = "/api/admin/client-evaluations/ingest"
    if confirm_override:
        url += "?confirm_override=true"
    return client.post(url, json={"email_body": body_text}, headers=headers)


def _approve(client, headers, record_id):
    return client.post(f"/api/admin/client-evaluations/{record_id}/approve", headers=headers)


def _reject(client, headers, record_id):
    return client.post(f"/api/admin/client-evaluations/{record_id}/reject", headers=headers)


# ── Story 1 — Manual ingest (TC-1 to TC-7) ───────────────────────────────────

class TestManualIngest:
    def test_tc1_successful_ingest_creates_rascunho(self, client, admin_h, with_team_members):
        resp = _ingest(client, admin_h, BODY_A)
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "rascunho"
        assert data["origem"] == "manual"
        assert data["competencia"] == "2025-06"

    def test_tc2_raw_email_text_preserved_verbatim(self, client, admin_h, with_team_members):
        resp = _ingest(client, admin_h, BODY_A)
        record_id = resp.json()["id"]
        get_resp = client.get(f"/api/admin/client-evaluations/{record_id}", headers=admin_h)
        assert get_resp.json()["raw_email_text"] == BODY_A

    def test_tc3_feedback_block_pattern(self, client, admin_h, with_team_members):
        resp = _ingest(client, admin_h, BODY_B)
        assert resp.status_code == 201
        record_id = resp.json()["id"]
        get_resp = client.get(f"/api/admin/client-evaluations/{record_id}", headers=admin_h)
        data = get_resp.json()
        assert data["comportamental_nota"] == 3
        assert data["tecnica_nota"] == 4
        assert data["prazo_nota"] == 3
        assert data["comentario_geral"] == "Bom desempenho no geral, com espaço para melhoria técnica."
        assert data["comportamental_comentario"] is None
        assert data["tecnica_comentario"] is None
        assert data["prazo_comentario"] is None

    def test_tc4_wrong_fornecedor_returns_422_no_record(self, client, admin_h, with_team_members):
        resp = _ingest(client, admin_h, BODY_C_WRONG_FORNECEDOR)
        assert resp.status_code == 422
        list_resp = client.get("/api/admin/client-evaluations", headers=admin_h)
        assert list_resp.json()["evaluations"] == []

    def test_tc5_missing_score_label_returns_422(self, client, admin_h, with_team_members):
        body = BODY_A.replace("Avaliação Técnica: 5\nEntregas de alta qualidade.\n", "")
        resp = _ingest(client, admin_h, body)
        assert resp.status_code == 422

    def test_tc6_score_out_of_range_returns_422(self, client, admin_h, with_team_members):
        body = BODY_A.replace("Avaliação Comportamental: 4", "Avaliação Comportamental: 6")
        resp = _ingest(client, admin_h, body)
        assert resp.status_code == 422

    def test_tc7_auto_link_resolves_to_pedro_santos(self, client, admin_h, with_team_members):
        resp = _ingest(client, admin_h, BODY_A)
        record_id = resp.json()["id"]
        get_resp = client.get(f"/api/admin/client-evaluations/{record_id}", headers=admin_h)
        data = get_resp.json()
        assert data["match_status"] == "auto"
        assert data["user_email"] == "pedro.santos@db1.com.br"


# ── Story 2 — Duplicate detection (TC-9 to TC-12) ────────────────────────────

class TestDuplicateDetection:
    def test_tc9_duplicate_by_email_competencia_blocked(self, client, admin_h, with_team_members):
        _ingest(client, admin_h, BODY_A)
        resp = _ingest(client, admin_h, BODY_A)
        assert resp.status_code == 409
        list_resp = client.get("/api/admin/client-evaluations", headers=admin_h)
        assert len(list_resp.json()["evaluations"]) == 1

    def test_tc10_duplicate_by_name_when_unlinked_blocked(self, client, admin_h):
        _ingest(client, admin_h, BODY_UNKNOWN)
        resp = _ingest(client, admin_h, BODY_UNKNOWN)
        assert resp.status_code == 409
        list_resp = client.get("/api/admin/client-evaluations", headers=admin_h)
        assert len(list_resp.json()["evaluations"]) == 1

    def test_tc11_reingest_aprovado_without_confirm_override_returns_409(
        self, client, admin_h, with_team_members
    ):
        resp = _ingest(client, admin_h, BODY_A)
        record_id = resp.json()["id"]
        _approve(client, admin_h, record_id)
        resp2 = _ingest(client, admin_h, BODY_A)
        assert resp2.status_code == 409
        assert resp2.json()["detail"]["requires_override"] is True

    def test_tc12_reingest_aprovado_with_confirm_override_creates_rascunho(
        self, client, admin_h, with_team_members
    ):
        resp = _ingest(client, admin_h, BODY_A)
        record_id = resp.json()["id"]
        _approve(client, admin_h, record_id)
        resp2 = _ingest(client, admin_h, BODY_A, confirm_override=True)
        assert resp2.status_code == 201
        list_resp = client.get("/api/admin/client-evaluations", headers=admin_h)
        evaluations = list_resp.json()["evaluations"]
        statuses = {e["status"] for e in evaluations}
        assert "aprovado" in statuses
        assert "rascunho" in statuses
        assert len(evaluations) == 2


# ── Story 3 — Review and edit (TC-14 to TC-16) ───────────────────────────────

class TestReviewAndEdit:
    def test_tc14_get_single_returns_raw_text_and_all_fields(
        self, client, admin_h, with_team_members
    ):
        resp = _ingest(client, admin_h, BODY_A)
        record_id = resp.json()["id"]
        get_resp = client.get(f"/api/admin/client-evaluations/{record_id}", headers=admin_h)
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert "raw_email_text" in data
        assert "competencia" in data
        assert "nome_extraido" in data
        assert "match_status" in data
        assert "comportamental_nota" in data

    def test_tc15_patch_persists_changes_and_records_audit(
        self, client, admin_h, with_team_members
    ):
        resp = _ingest(client, admin_h, BODY_A)
        record_id = resp.json()["id"]
        patch_resp = client.patch(
            f"/api/admin/client-evaluations/{record_id}",
            json={"comportamental_nota": 3, "comportamental_comentario": "Comentário revisado."},
            headers=admin_h,
        )
        assert patch_resp.status_code == 200
        get_resp = client.get(f"/api/admin/client-evaluations/{record_id}", headers=admin_h)
        data = get_resp.json()
        assert data["comportamental_nota"] == 3
        assert data["comportamental_comentario"] == "Comentário revisado."
        assert data["edited_by"] == "tiagohlatki@db1.com.br"
        assert data["edited_at"] is not None

    def test_tc16_patch_on_aprovado_returns_409(self, client, admin_h, with_team_members):
        resp = _ingest(client, admin_h, BODY_A)
        record_id = resp.json()["id"]
        _approve(client, admin_h, record_id)
        patch_resp = client.patch(
            f"/api/admin/client-evaluations/{record_id}",
            json={"tecnica_nota": 2},
            headers=admin_h,
        )
        assert patch_resp.status_code == 409


# ── Story 4 — Approve and reject (TC-18 to TC-22) ────────────────────────────

class TestApproveAndReject:
    def test_tc18_approve_sets_status_and_audit_fields(
        self, client, admin_h, with_team_members
    ):
        resp = _ingest(client, admin_h, BODY_A)
        record_id = resp.json()["id"]
        approve_resp = _approve(client, admin_h, record_id)
        assert approve_resp.status_code == 200
        data = client.get(f"/api/admin/client-evaluations/{record_id}", headers=admin_h).json()
        assert data["status"] == "aprovado"
        assert data["reviewed_by"] == "tiagohlatki@db1.com.br"
        assert data["reviewed_at"] is not None

    def test_tc19_patch_after_approve_returns_409(self, client, admin_h, with_team_members):
        resp = _ingest(client, admin_h, BODY_A)
        record_id = resp.json()["id"]
        _approve(client, admin_h, record_id)
        patch_resp = client.patch(
            f"/api/admin/client-evaluations/{record_id}",
            json={"tecnica_nota": 2},
            headers=admin_h,
        )
        assert patch_resp.status_code == 409

    def test_tc20_approve_unlinked_returns_422(self, client, admin_h):
        resp = _ingest(client, admin_h, BODY_UNKNOWN)
        record_id = resp.json()["id"]
        approve_resp = _approve(client, admin_h, record_id)
        assert approve_resp.status_code == 422
        data = client.get(f"/api/admin/client-evaluations/{record_id}", headers=admin_h).json()
        assert data["status"] == "rascunho"

    def test_tc21_reject_sets_status_rejeitado(self, client, admin_h, with_team_members):
        resp = _ingest(client, admin_h, BODY_A)
        record_id = resp.json()["id"]
        reject_resp = _reject(client, admin_h, record_id)
        assert reject_resp.status_code == 200
        data = client.get(f"/api/admin/client-evaluations/{record_id}", headers=admin_h).json()
        assert data["status"] == "rejeitado"

    def test_tc22_rejected_excluded_from_professional_view_and_dashboard(
        self, client, admin_h, prof_h
    ):
        resp = _ingest(client, admin_h, BODY_A)
        record_id = resp.json()["id"]
        _reject(client, admin_h, record_id)
        my_resp = client.get("/api/my-evaluations", headers=prof_h)
        assert my_resp.json()["evaluations"] == []
        dash_resp = client.get("/api/admin/client-evaluations/dashboard", headers=admin_h)
        assert dash_resp.json()["data"] == []


# ── Story 5 — Unlinked professional (TC-25 to TC-27) ─────────────────────────

class TestUnlinkedProfessional:
    def test_tc25_unmatched_name_sets_nao_vinculado(self, client, admin_h):
        resp = _ingest(client, admin_h, BODY_UNKNOWN)
        assert resp.status_code == 201
        record_id = resp.json()["id"]
        data = client.get(f"/api/admin/client-evaluations/{record_id}", headers=admin_h).json()
        assert data["match_status"] == "nao_vinculado"
        assert data["user_email"] is None

    def test_tc26_list_includes_nao_vinculado(self, client, admin_h):
        _ingest(client, admin_h, BODY_UNKNOWN)
        list_resp = client.get("/api/admin/client-evaluations", headers=admin_h)
        records = list_resp.json()["evaluations"]
        assert any(r["match_status"] == "nao_vinculado" for r in records)

    def test_tc27_patch_user_email_changes_match_status_to_manual(self, client, admin_h, with_team_members):
        resp = _ingest(client, admin_h, BODY_UNKNOWN)
        record_id = resp.json()["id"]
        patch_resp = client.patch(
            f"/api/admin/client-evaluations/{record_id}",
            json={"user_email": "pedro.santos@db1.com.br"},
            headers=admin_h,
        )
        assert patch_resp.status_code == 200
        data = client.get(f"/api/admin/client-evaluations/{record_id}", headers=admin_h).json()
        assert data["match_status"] == "manual"
        assert data["user_email"] == "pedro.santos@db1.com.br"


# ── Story 6 — Admin dashboard (TC-29 to TC-32) ───────────────────────────────

class TestAdminDashboard:
    def _ingest_and_approve(self, client, admin_h, body):
        resp = _ingest(client, admin_h, body)
        record_id = resp.json()["id"]
        _approve(client, admin_h, record_id)
        return record_id

    def test_tc29_dashboard_no_filters_returns_all_approved(
        self, client, admin_h, with_team_members
    ):
        self._ingest_and_approve(client, admin_h, BODY_A)
        self._ingest_and_approve(client, admin_h, BODY_D_CARLOS)
        resp = client.get("/api/admin/client-evaluations/dashboard", headers=admin_h)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) == 2

    def test_tc30_dashboard_filter_by_user_email(self, client, admin_h, with_team_members):
        self._ingest_and_approve(client, admin_h, BODY_A)
        self._ingest_and_approve(client, admin_h, BODY_D_CARLOS)
        resp = client.get(
            "/api/admin/client-evaluations/dashboard",
            params={"user_email": "pedro.santos@db1.com.br"},
            headers=admin_h,
        )
        data = resp.json()["data"]
        assert len(data) == 1
        assert data[0]["user_email"] == "pedro.santos@db1.com.br"

    def test_tc31_dashboard_filter_by_competencia_range(
        self, client, admin_h, with_team_members
    ):
        self._ingest_and_approve(client, admin_h, BODY_A)  # 2025-06
        self._ingest_and_approve(client, admin_h, BODY_B)  # 2025-07
        resp = client.get(
            "/api/admin/client-evaluations/dashboard",
            params={"competencia_from": "2025-07", "competencia_to": "2025-07"},
            headers=admin_h,
        )
        data = resp.json()["data"]
        assert len(data) == 1
        assert data[0]["competencia"] == "2025-07"

    def test_tc32_dashboard_excludes_rascunho_and_rejeitado(
        self, client, admin_h, with_team_members
    ):
        _ingest(client, admin_h, BODY_A)  # rascunho, 2025-06
        resp_b = _ingest(client, admin_h, BODY_B)
        _reject(client, admin_h, resp_b.json()["id"])  # rejeitado, 2025-07
        dash_resp = client.get("/api/admin/client-evaluations/dashboard", headers=admin_h)
        assert dash_resp.json()["data"] == []


# ── Story 7 — Professional view (TC-34 to TC-36) ─────────────────────────────

class TestProfessionalView:
    def _approve_body(self, client, admin_h, body):
        resp = _ingest(client, admin_h, body)
        record_id = resp.json()["id"]
        _approve(client, admin_h, record_id)

    def test_tc34_my_evaluations_returns_own_approved_desc(
        self, client, admin_h, prof_h
    ):
        self._approve_body(client, admin_h, BODY_A)  # 2025-06
        self._approve_body(client, admin_h, BODY_B)  # 2025-07
        resp = client.get("/api/my-evaluations", headers=prof_h)
        assert resp.status_code == 200
        evals = resp.json()["evaluations"]
        assert len(evals) == 2
        assert evals[0]["competencia"] == "2025-07"
        assert evals[1]["competencia"] == "2025-06"

    def test_tc35_my_evaluations_empty_returns_200_empty_array(
        self, client, admin_h, prof_h
    ):
        _ingest(client, admin_h, BODY_A)  # rascunho only
        resp = client.get("/api/my-evaluations", headers=prof_h)
        assert resp.status_code == 200
        assert resp.json()["evaluations"] == []

    def test_tc36_my_evaluations_excludes_rascunho_and_rejeitado(
        self, client, admin_h, prof_h
    ):
        _ingest(client, admin_h, BODY_A)  # rascunho 2025-06
        resp_b = _ingest(client, admin_h, BODY_B)
        _reject(client, admin_h, resp_b.json()["id"])  # rejeitado 2025-07

        body_08 = BODY_A.replace("Competência: 06 / 2025", "Competência: 08 / 2025")
        resp_08 = _ingest(client, admin_h, body_08)
        _approve(client, admin_h, resp_08.json()["id"])  # aprovado 2025-08

        resp = client.get("/api/my-evaluations", headers=prof_h)
        evals = resp.json()["evaluations"]
        assert len(evals) == 1
        assert evals[0]["competencia"] == "2025-08"


# ── Story 8 — Access isolation (TC-39 to TC-42) ──────────────────────────────

class TestAccessIsolation:
    def test_tc39_non_admin_on_admin_endpoint_returns_403(self, client, prof_h):
        resp = client.get("/api/admin/client-evaluations", headers=prof_h)
        assert resp.status_code == 403

    def test_tc40_unauthenticated_on_admin_endpoint_returns_401(self, client):
        resp = client.get("/api/admin/client-evaluations")
        assert resp.status_code == 401

    def test_tc41_professional_cannot_see_other_professionals_evaluations(
        self, client, admin_h, prof_h, prof2_h
    ):
        rid_a = _ingest(client, admin_h, BODY_A).json()["id"]
        _approve(client, admin_h, rid_a)

        rid_d = _ingest(client, admin_h, BODY_D_CARLOS).json()["id"]
        _approve(client, admin_h, rid_d)

        resp = client.get("/api/my-evaluations", headers=prof2_h)
        evals = resp.json()["evaluations"]
        assert len(evals) == 1
        assert evals[0]["user_email"] == "carlos.pereira@db1.com.br"

    def test_tc42_unauthenticated_my_evaluations_returns_401(self, client):
        resp = client.get("/api/my-evaluations")
        assert resp.status_code == 401


# ── RF12 — Automated ingest (TC-44 to TC-51) ─────────────────────────────────

class TestAutomatedIngest:
    BASE_BODY = {
        "content": BODY_A,
        "subject": "Notificação MAG",
        "internetMessageId": "msg-id-001",
        "receivedDateTime": "2025-07-01T09:00:00Z",
        "from": "notasti@mag.com.br",
    }

    def test_tc44_valid_key_creates_rascunho_automacao(
        self, client, admin_h, with_team_members, api_key_env
    ):
        resp = client.post(
            "/api/integrations/mag-evaluation",
            json=self.BASE_BODY,
            headers={"X-Api-Key": API_KEY},
        )
        assert resp.status_code == 201
        assert resp.json()["ok"] is True
        record_id = resp.json()["id"]
        data = client.get(f"/api/admin/client-evaluations/{record_id}", headers=admin_h).json()
        assert data["status"] == "rascunho"
        assert data["origem"] == "automacao"
        assert data["email_message_id"] == "msg-id-001"

    def test_tc45_email_message_id_persisted(
        self, client, with_team_members, api_key_env
    ):
        resp = client.post(
            "/api/integrations/mag-evaluation",
            json=self.BASE_BODY,
            headers={"X-Api-Key": API_KEY},
        )
        record_id = resp.json()["id"]
        import main
        with main._db() as conn:
            row = conn.execute(
                "SELECT email_message_id, origem FROM client_evaluations WHERE id=?",
                (record_id,),
            ).fetchone()
        assert row["email_message_id"] == "msg-id-001"
        assert row["origem"] == "automacao"

    def test_tc46_invalid_api_key_returns_401(self, client, with_team_members, api_key_env):
        resp = client.post(
            "/api/integrations/mag-evaluation",
            json=self.BASE_BODY,
            headers={"X-Api-Key": "wrong-key"},
        )
        assert resp.status_code == 401

    def test_tc47_missing_api_key_returns_401(self, client, with_team_members, api_key_env):
        resp = client.post(
            "/api/integrations/mag-evaluation",
            json=self.BASE_BODY,
        )
        assert resp.status_code == 401

    def test_tc48_same_internet_message_id_is_idempotent(
        self, client, with_team_members, api_key_env
    ):
        body = {**self.BASE_BODY, "internetMessageId": "msg-id-idem"}
        client.post(
            "/api/integrations/mag-evaluation",
            json=body,
            headers={"X-Api-Key": API_KEY},
        )
        resp2 = client.post(
            "/api/integrations/mag-evaluation",
            json=body,
            headers={"X-Api-Key": API_KEY},
        )
        assert resp2.status_code == 200
        assert resp2.json() == {"ok": True, "skipped": True}
        import main
        with main._db() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM client_evaluations WHERE email_message_id=?",
                ("msg-id-idem",),
            ).fetchone()[0]
        assert count == 1

    def test_tc49_html_body_is_stripped_and_parsed(
        self, client, admin_h, with_team_members, api_key_env
    ):
        html_body = (
            "<p>Compet&ecirc;ncia: 06 / 2025</p>"
            "<p>Colaborador: Pedro Santos</p>"
            "<p>Fornecedor: DB1 Global Software</p>"
            "<p>Avalia&ccedil;&atilde;o Comportamental: 4</p>"
            "<p>Avalia&ccedil;&atilde;o T&eacute;cnica: 5</p>"
            "<p>Avalia&ccedil;&atilde;o Prazos de entrega: 4</p>"
            "<p>Feedback: Feedback via HTML.</p>"
        )
        body = {**self.BASE_BODY, "content": html_body, "internetMessageId": "msg-html-001"}
        resp = client.post(
            "/api/integrations/mag-evaluation",
            json=body,
            headers={"X-Api-Key": API_KEY},
        )
        assert resp.status_code == 201
        record_id = resp.json()["id"]
        data = client.get(f"/api/admin/client-evaluations/{record_id}", headers=admin_h).json()
        assert data["comportamental_nota"] == 4
        assert data["tecnica_nota"] == 5
        assert data["prazo_nota"] == 4
        assert "<" not in data["raw_email_text"]

    def test_tc50_unparseable_body_returns_422(self, client, with_team_members, api_key_env):
        body = {
            **self.BASE_BODY,
            "content": "<p>Texto sem campos obrigatórios.</p>",
            "internetMessageId": "msg-bad-001",
        }
        resp = client.post(
            "/api/integrations/mag-evaluation",
            json=body,
            headers={"X-Api-Key": API_KEY},
        )
        assert resp.status_code == 422

    def test_tc51_dedup_by_message_id_before_parsing(
        self, client, with_team_members, api_key_env
    ):
        body1 = {**self.BASE_BODY, "internetMessageId": "msg-id-dup"}
        client.post(
            "/api/integrations/mag-evaluation",
            json=body1,
            headers={"X-Api-Key": API_KEY},
        )
        # Second request: same messageId but completely different (unparseable) content
        body2 = {**body1, "content": "Conteúdo completamente diferente sem campos."}
        resp2 = client.post(
            "/api/integrations/mag-evaluation",
            json=body2,
            headers={"X-Api-Key": API_KEY},
        )
        assert resp2.status_code == 200
        assert resp2.json() == {"ok": True, "skipped": True}
