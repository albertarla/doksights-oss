
"""
Tests for Portal Privacy enforcement in discovery and chat endpoints.
"""

import pytest
import json
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient
from jose import jwt

class TestPortalPrivacy:
    """Tests for privacy enforcement on company portals."""

    @pytest.fixture
    def mock_dependencies(self):
        """Mock common dependencies for privacy tests."""
        with patch("app.routers.discovery.supabase_service") as mock_supa_discovery, \
             patch("app.routers.chat.supabase_service") as mock_supa_chat, \
             patch("app.routers.chat.ai_service") as mock_ai, \
             patch("app.routers.chat.rag_service") as mock_rag, \
             patch("app.routers.chat.rate_limiter") as mock_rate, \
             patch("app.auth.jwt_handler.settings") as mock_settings:
            
            mock_settings.supabase_jwt_secret = "test-jwt-secret-key-32-chars-min"
            mock_rate.is_limited.return_value = False
            
            # Setup a sample manual
            sample_manual = {
                "id": "m1",
                "title": "Private Manual",
                "company_id": "c1",
                "manual_type": "pdf",
                "file_path": "path/to/pdf"
            }
            
            mock_supa_chat.get_manual = AsyncMock(return_value=sample_manual)
            mock_supa_chat.get_public_manual_by_id = AsyncMock(return_value=sample_manual)
            
            # Mock for discovery consolidated query
            # Returns (manuals, tokens, privacy)
            mock_supa_discovery.get_client = AsyncMock()
            
            yield {
                "supa_discovery": mock_supa_discovery,
                "supa_chat": mock_supa_chat,
                "ai": mock_ai,
                "rag": mock_rag,
                "settings": mock_settings
            }

    @pytest.fixture
    def portal_user_headers(self):
        """Generate headers for a portal user."""
        secret = "test-jwt-secret-key-32-chars-min"
        payload = {"sub": "u1", "email": "user@example.com"}
        token = jwt.encode(payload, secret, algorithm="HS256")
        return {"Authorization": f"Bearer {token}"}

    def test_discover_private_portal_anonymous(self, mock_dependencies):
        """Test that anonymous users cannot discover manuals in a private portal."""
        from app.main import app
        client = TestClient(app)
        
        # Mock find_relevant_manuals_by_company to return private privacy
        with patch("app.routers.discovery.find_relevant_manuals_by_company", new_callable=AsyncMock) as mock_find:
            mock_find.return_value = ([], 0, "private")
            
            response = client.post(
                "/api/v1/chat/discover",
                json={
                    "company_slug": "private-company", 
                    "messages": [{"role": "user", "content": "hello"}]
                }
            )
            
            assert response.status_code == 401
            assert "Authentication required" in response.json()["detail"]

    def test_discover_private_portal_authenticated(self, mock_dependencies, portal_user_headers):
        """Test that authenticated users can discover manuals in a private portal."""
        from app.main import app
        client = TestClient(app)
        
        with patch("app.routers.discovery.find_relevant_manuals_by_company", new_callable=AsyncMock) as mock_find, \
             patch("app.routers.discovery.ai_service") as mock_ai_discovery:
            mock_find.return_value = ([{"id": "m1", "title": "Manual"}], 50, "private")
            
            # Mock AI stream
            async def mock_stream(*args, **kwargs):
                yield "Hello world"
            mock_ai_discovery.chat_stream = mock_stream
            mock_ai_discovery.check_token_quota = AsyncMock()
            
            response = client.post(
                "/api/v1/chat/discover",
                json={
                    "company_slug": "private-company", 
                    "messages": [{"role": "user", "content": "hello"}]
                },
                headers=portal_user_headers
            )
            
            assert response.status_code == 200
            # Collect stream data
            full_content = ""
            for line in response.iter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    data = json.loads(data_str)
                    if "content" in data:
                        full_content += data["content"]
            
            assert "Hello world" in full_content

    def test_chat_stream_private_portal_anonymous(self, mock_dependencies):
        """Test that anonymous users cannot chat with a manual in a private portal."""
        from app.main import app
        client = TestClient(app)
        
        # Mock manual to have portal_privacy='private'
        mock_dependencies["supa_chat"].get_public_manual_by_id.return_value = {
            "id": "m1",
            "company_id": "c1",
            "portal_privacy": "private"
        }

        response = client.post(
            "/api/v1/chat/stream",
            json={"messages": [{"role": "user", "content": "hello"}], "manual_id": "m1"}
        )
        
        assert response.status_code == 401
        assert "Authentication required" in response.json()["detail"]

    def test_chat_stream_private_portal_authenticated(self, mock_dependencies, portal_user_headers):
        """Test that authenticated users can chat with a manual in a private portal."""
        from app.main import app
        client = TestClient(app)
        
        # Mock manual to have portal_privacy='private'
        mock_dependencies["supa_chat"].get_public_manual_by_id.return_value = {
            "id": "m1",
            "company_id": "c1",
            "portal_privacy": "private",
            "rag_status": "completed"
        }
        
        # Mock AI stream
        async def mock_stream(*args, **kwargs):
            yield "Hello"
        mock_dependencies["ai"].chat_stream = mock_stream
        
        # Mock RAG
        mock_dependencies["rag"].get_relevant_chunks = AsyncMock(return_value=([], 0))

        response = client.post(
            "/api/v1/chat/stream",
            json={"messages": [{"role": "user", "content": "hello"}], "manual_id": "m1"},
            headers=portal_user_headers
        )
        
        assert response.status_code == 200

    def test_public_portal_still_anonymous(self, mock_dependencies):
        """Ensure public portals still allow anonymous discovery."""
        from app.main import app
        client = TestClient(app)
        
        with patch("app.routers.discovery.find_relevant_manuals_by_company", new_callable=AsyncMock) as mock_find, \
             patch("app.routers.discovery.ai_service") as mock_ai_discovery:
            mock_find.return_value = ([{"id": "m1", "title": "Manual"}], 50, "public")
            
            # Mock AI stream
            async def mock_stream(*args, **kwargs):
                yield "Public manual found"
            mock_ai_discovery.chat_stream = mock_stream
            mock_ai_discovery.check_token_quota = AsyncMock()
            
            response = client.post(
                "/api/v1/chat/discover",
                json={
                    "company_slug": "public-company", 
                    "messages": [{"role": "user", "content": "hello"}]
                }
            )
            
            assert response.status_code == 200
            # Collect stream data
            full_content = ""
            for line in response.iter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    data = json.loads(data_str)
                    if "content" in data:
                        full_content += data["content"]
            
            assert "Public manual found" in full_content
