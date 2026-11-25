"""
Tests for the Chat Router.
"""

import pytest
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient
from jose import jwt
from datetime import datetime, timedelta


class TestBuildSystemPrompt:
    """Tests for the build_system_prompt function."""
    
    def test_with_all_fields(self):
        """Test building prompt with all fields provided."""
        from app.routers.chat import build_system_prompt

        chunks = [
            {"content": "This is the content of the manual.", "metadata": {"page_start": 2, "page_end": 2}}
        ]
        result = build_system_prompt(
            title="Test Manual",
            description="A manual for testing",
            chunks=chunks
        )
        
        assert "Test Manual" in result
        assert "A manual for testing" in result
        assert "This is the content of the manual." in result
        assert "You are a helpful AI assistant" in result
    
    def test_with_no_fields(self):
        """Test building prompt with no optional fields."""
        from app.routers.chat import build_system_prompt
        
        result = build_system_prompt(
            title=None,
            description=None,
            chunks=None
        )
        
        assert "You are a helpful AI assistant" in result
        # Should not contain section headers for missing fields
        assert "Manual Title" not in result or result.count("Manual Title") == 0
    
    def test_with_partial_fields(self):
        """Test building prompt with some fields provided."""
        from app.routers.chat import build_system_prompt
        
        result = build_system_prompt(
            title="Test Manual",
            description=None,
            chunks=[{"content": "Some content", "metadata": {}}]
        )
        
        assert "Test Manual" in result
        assert "Some content" in result


class TestChatStreamEndpoint:
    """Tests for the POST /chat/stream endpoint."""
    
    @pytest.fixture
    def auth_headers(self, valid_jwt_payload):
        """Generate authorization headers with valid JWT."""
        secret = "test-jwt-secret-key-32-chars-min"
        token = jwt.encode(valid_jwt_payload, secret, algorithm="HS256")
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture
    def mock_dependencies(self, sample_manual):
        """Mock all dependencies for chat router tests."""
        with patch("app.routers.chat.supabase_service") as mock_supabase, \
             patch("app.routers.chat.ai_service") as mock_ai, \
             patch("app.routers.chat.rag_service") as mock_rag, \
             patch("app.routers.chat.rate_limiter") as mock_rate, \
             patch("app.auth.jwt_handler.settings") as mock_settings:
            
            mock_settings.supabase_jwt_secret = "test-jwt-secret-key-32-chars-min"
            mock_rate.is_limited.return_value = False
            
            mock_supabase.get_manual = AsyncMock(return_value=sample_manual)
            mock_supabase.get_manual_for_public_link = AsyncMock(return_value=sample_manual)
            mock_supabase.get_public_manual_by_id = AsyncMock(return_value=sample_manual)
            mock_rag.get_relevant_chunks = AsyncMock(return_value=([
                {"content": "Chunk content", "metadata": {"page_start": 1, "page_end": 1}}
            ], 50))
            
            async def mock_stream(*args, **kwargs):
                for chunk in ["Hello", " ", "world"]:
                    yield chunk
            
            mock_ai.chat_stream = mock_stream
            mock_ai.check_token_quota = AsyncMock()
            
            yield {
                "supabase": mock_supabase,
                "ai": mock_ai,
                "rag": mock_rag,
                "rate_limiter": mock_rate,
                "settings": mock_settings
            }
    
    def test_authenticated_user_access(self, mock_dependencies, auth_headers, sample_chat_request):
        """Test that authenticated users can access chat stream."""
        from app.main import app
        client = TestClient(app)
        
        response = client.post(
            "/api/v1/chat/stream",
            json=sample_chat_request,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/event-stream; charset=utf-8"
    
    def test_public_access_with_link_id(self, mock_dependencies, sample_chat_request_with_link):
        """Test that public access works with link_id."""
        from app.main import app
        client = TestClient(app)
        
        response = client.post(
            "/api/v1/chat/stream",
            json=sample_chat_request_with_link
        )
        
        assert response.status_code == 200
    
    def test_rate_limited_returns_429(self, mock_dependencies, auth_headers, sample_chat_request):
        """Test that rate limited requests return 429."""
        mock_dependencies["rate_limiter"].is_limited.return_value = True
        
        from app.main import app
        client = TestClient(app)
        
        response = client.post(
            "/api/v1/chat/stream",
            json=sample_chat_request,
            headers=auth_headers
        )
        
        assert response.status_code == 429
    
    def test_manual_not_found_returns_404(self, mock_dependencies, auth_headers, sample_chat_request):
        """Test that 404 is returned when manual not found."""
        mock_dependencies["supabase"].get_manual.return_value = None
        
        from app.main import app
        client = TestClient(app)
        
        response = client.post(
            "/api/v1/chat/stream",
            json=sample_chat_request,
            headers=auth_headers
        )
        
        assert response.status_code == 404


class TestChatEndpoint:
    """Tests for the POST /chat/ endpoint."""
    
    @pytest.fixture
    def auth_headers(self, valid_jwt_payload):
        """Generate authorization headers with valid JWT."""
        secret = "test-jwt-secret-key-32-chars-min"
        token = jwt.encode(valid_jwt_payload, secret, algorithm="HS256")
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture
    def mock_dependencies(self, sample_manual):
        """Mock all dependencies for chat router tests."""
        with patch("app.routers.chat.supabase_service") as mock_supabase, \
             patch("app.routers.chat.ai_service") as mock_ai, \
             patch("app.routers.chat.rag_service") as mock_rag, \
             patch("app.routers.chat.rate_limiter") as mock_rate, \
             patch("app.auth.jwt_handler.settings") as mock_settings:
            
            mock_settings.supabase_jwt_secret = "test-jwt-secret-key-32-chars-min"
            mock_rate.is_limited.return_value = False
            
            mock_supabase.get_manual = AsyncMock(return_value=sample_manual)
            mock_ai.chat = AsyncMock(return_value="This is a test response.")
            mock_ai.check_token_quota = AsyncMock()
            mock_rag.get_relevant_chunks = AsyncMock(return_value=([
                {"content": "Chunk content", "metadata": {"page_start": 1, "page_end": 1}}
            ], 50))
            
            yield {
                "supabase": mock_supabase,
                "ai": mock_ai,
                "rag": mock_rag,
                "rate_limiter": mock_rate,
                "settings": mock_settings
            }
    
    def test_requires_authentication(self, mock_dependencies, sample_chat_request):
        """Test that endpoint requires authentication."""
        from app.main import app
        client = TestClient(app)
        
        response = client.post(
            "/api/v1/chat/",
            json=sample_chat_request
            # No auth headers
        )
        
        assert response.status_code == 403  # Forbidden (no credentials)
    
    def test_authenticated_request_succeeds(self, mock_dependencies, auth_headers, sample_chat_request):
        """Test that authenticated request succeeds."""
        from app.main import app
        client = TestClient(app)
        
        response = client.post(
            "/api/v1/chat/",
            json=sample_chat_request,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "content" in data
    
    def test_rate_limited_returns_429(self, mock_dependencies, auth_headers, sample_chat_request):
        """Test that rate limited requests return 429."""
        mock_dependencies["rate_limiter"].is_limited.return_value = True
        
        from app.main import app
        client = TestClient(app)
        
        response = client.post(
            "/api/v1/chat/",
            json=sample_chat_request,
            headers=auth_headers
        )
        
        assert response.status_code == 429
    
    def test_manual_not_found_returns_404(self, mock_dependencies, auth_headers, sample_chat_request):
        """Test that 404 is returned when manual not found."""
        mock_dependencies["supabase"].get_manual.return_value = None
        
        from app.main import app
        client = TestClient(app)
        
        response = client.post(
            "/api/v1/chat/",
            json=sample_chat_request,
            headers=auth_headers
        )
        
        assert response.status_code == 404


class TestChatSchemas:
    """Tests for chat request/response schemas."""
    
    def test_valid_chat_message(self):
        """Test valid ChatMessage creation."""
        from app.schemas.chat import ChatMessage
        
        msg = ChatMessage(role="user", content="Hello")
        assert msg.role == "user"
        assert msg.content == "Hello"
    
    def test_chat_message_role_validation(self):
        """Test that invalid roles are rejected."""
        from app.schemas.chat import ChatMessage
        from pydantic import ValidationError
        
        with pytest.raises(ValidationError):
            ChatMessage(role="invalid", content="Hello")
    
    def test_chat_message_content_min_length(self):
        """Test that empty content is rejected."""
        from app.schemas.chat import ChatMessage
        from pydantic import ValidationError
        
        with pytest.raises(ValidationError):
            ChatMessage(role="user", content="")
    
    def test_valid_chat_request(self):
        """Test valid ChatRequest creation."""
        from app.schemas.chat import ChatRequest, ChatMessage
        
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="Hello")],
            manual_id="test-id"
        )
        
        assert len(request.messages) == 1
        assert request.manual_id == "test-id"
    
    def test_chat_request_requires_messages(self):
        """Test that ChatRequest requires at least one message."""
        from app.schemas.chat import ChatRequest
        from pydantic import ValidationError
        
        with pytest.raises(ValidationError):
            ChatRequest(messages=[], manual_id="test-id")
    
    def test_chat_response(self):
        """Test ChatResponse creation."""
        from app.schemas.chat import ChatResponse
        
        response = ChatResponse(content="This is the response.")
        assert response.content == "This is the response."


class TestHealthEndpoints:
    """Tests for health check endpoints."""
    
    def test_health_check(self):
        """Test /health endpoint."""
        from app.main import app
        client = TestClient(app)
        
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
    
    def test_root_endpoint(self):
        """Test / endpoint."""
        from app.main import app
        client = TestClient(app)
        
        response = client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
