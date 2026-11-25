"""Tests for manuals router."""

import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from jose import jwt


class TestManualsProcess:
    @pytest.fixture
    def auth_headers(self, valid_jwt_payload):
        secret = "test-jwt-secret-key-32-chars-min"
        token = jwt.encode(valid_jwt_payload, secret, algorithm="HS256")
        return {"Authorization": f"Bearer {token}"}

    @pytest.fixture
    def mock_dependencies(self, sample_manual):
        with patch("app.routers.manuals.supabase_service") as mock_supabase, \
             patch("app.routers.manuals.rag_service") as mock_rag, \
             patch("app.auth.jwt_handler.settings") as mock_settings:

            mock_settings.supabase_jwt_secret = "test-jwt-secret-key-32-chars-min"
            mock_supabase.get_manual_owned = AsyncMock(return_value=sample_manual)
            mock_supabase.update_manual = AsyncMock()
            mock_rag.index_manual = AsyncMock()

            yield {
                "supabase": mock_supabase,
                "rag": mock_rag,
                "settings": mock_settings,
            }

    def test_process_manual_success(self, mock_dependencies, auth_headers):
        from app.main import app
        client = TestClient(app)

        response = client.post(
            "/api/v1/manuals/manual-uuid-123/process",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processing"

    def test_process_manual_not_found(self, mock_dependencies, auth_headers):
        mock_dependencies["supabase"].get_manual_owned.return_value = None

        from app.main import app
        client = TestClient(app)

        response = client.post(
            "/api/v1/manuals/manual-uuid-123/process",
            headers=auth_headers,
        )

        assert response.status_code == 404
