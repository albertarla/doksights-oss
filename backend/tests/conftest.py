"""
Shared pytest fixtures and configuration for backend tests.
"""

import pytest
from unittest.mock import Mock, MagicMock, AsyncMock, patch
from datetime import datetime, timedelta
from typing import Dict, Any
import sys
import os

# Add the backend directory to the path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ============================================================================
# Mock Settings
# ============================================================================

@pytest.fixture
def mock_settings():
    """Mock application settings for testing."""
    settings = Mock()
    settings.supabase_url = "https://test.supabase.co"
    settings.supabase_service_key = "test-service-key"
    settings.supabase_jwt_secret = "test-jwt-secret-key-32-chars-min"
    settings.openai_api_key = "test-openai-key"
    settings.google_api_key = "test-google-key"
    settings.embedding_model = "models/gemini-embedding-001"
    settings.embedding_dimensions = 1536
    settings.environment = "test"
    settings.cors_origins = ["http://localhost:8080"]
    settings.rag_chunk_size = 1200
    settings.rag_chunk_overlap = 200
    settings.rag_top_k = 5
    settings.rag_max_context_chars = 12000
    return settings


# ============================================================================
# JWT / Auth Fixtures
# ============================================================================

@pytest.fixture
def valid_jwt_payload() -> Dict[str, Any]:
    """Valid JWT payload for testing."""
    return {
        "sub": "test-user-id-123",
        "email": "test@example.com",
        "role": "authenticated",
        "exp": int((datetime.utcnow() + timedelta(hours=1)).timestamp()),
        "aud": "authenticated"
    }


@pytest.fixture
def expired_jwt_payload() -> Dict[str, Any]:
    """Expired JWT payload for testing."""
    return {
        "sub": "test-user-id-123",
        "email": "test@example.com",
        "role": "authenticated",
        "exp": int((datetime.utcnow() - timedelta(hours=1)).timestamp()),
        "aud": "authenticated"
    }


# ============================================================================
# Supabase Fixtures
# ============================================================================

@pytest.fixture
def mock_supabase_client():
    """Mock Supabase client for testing."""
    client = MagicMock()
    
    # Mock table method chain
    table_mock = MagicMock()
    client.table.return_value = table_mock
    
    select_mock = MagicMock()
    table_mock.select.return_value = select_mock
    
    eq_mock = MagicMock()
    select_mock.eq.return_value = eq_mock
    eq_mock.eq.return_value = eq_mock  # Chain multiple eq calls
    
    single_mock = MagicMock()
    eq_mock.single.return_value = single_mock
    
    maybe_single_mock = MagicMock()
    eq_mock.maybe_single.return_value = maybe_single_mock
    
    # Ensure execute() returns an awaitable AsyncMock
    execute_mock = AsyncMock()
    single_mock.execute = execute_mock
    maybe_single_mock.execute = execute_mock
    select_mock.execute = execute_mock
    
    # Mock storage
    storage_mock = MagicMock()
    client.storage.from_.return_value = storage_mock
    
    # Storage methods that are awaited in the async client
    storage_mock.create_signed_url = AsyncMock()
    storage_mock.download = AsyncMock()
    
    # RPC method
    rpc_mock = MagicMock()
    client.rpc.return_value = rpc_mock
    rpc_mock.execute = AsyncMock()
    
    return client


@pytest.fixture
def sample_manual() -> Dict[str, Any]:
    """Sample manual data for testing."""
    return {
        "id": "manual-uuid-123",
        "title": "Test Manual",
        "description": "A test manual for unit testing",
        "extracted_text": "This is the extracted text content from the PDF.",
        "file_path": "user-123/manuals/test-manual.pdf",
        "company_id": "company-uuid-123",
        "rag_status": "completed",
        "extraction_status": "completed",
        "is_public": True,
    }


@pytest.fixture
def sample_shareable_link() -> Dict[str, Any]:
    """Sample shareable link data for testing."""
    return {
        "id": "link-uuid-456",
        "manual_id": "manual-uuid-123",
        "is_active": True,
        "expires_at": None
    }


# ============================================================================
# AI Service Fixtures
# ============================================================================

@pytest.fixture
def mock_ai_provider():
    """Mock AI provider for testing."""
    provider = AsyncMock()
    provider.chat.return_value = "This is a test response from the AI."
    
    async def mock_stream(*args, **kwargs):
        for word in ["Hello", " ", "world", "!"]:
            yield word
    
    provider.chat_stream = mock_stream
    return provider


# ============================================================================
# FastAPI Test Client Fixtures
# ============================================================================

@pytest.fixture
def test_app():
    """Create a test FastAPI application."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    
    # Import the app
    from app.main import app
    
    return app


@pytest.fixture
def test_client(test_app):
    """Create a test client for the FastAPI app."""
    from fastapi.testclient import TestClient
    return TestClient(test_app)


# ============================================================================
# Chat Request Fixtures
# ============================================================================

@pytest.fixture
def sample_chat_request() -> Dict[str, Any]:
    """Sample chat request payload."""
    return {
        "messages": [
            {"role": "user", "content": "How do I use this product?"}
        ],
        "manual_id": "manual-uuid-123",
        "manual_title": "Test Manual",
        "manual_description": "A test manual"
    }


@pytest.fixture
def sample_chat_request_with_link() -> Dict[str, Any]:
    """Sample chat request with public link."""
    return {
        "messages": [
            {"role": "user", "content": "What are the safety instructions?"}
        ],
        "manual_id": "manual-uuid-123",
        "link_id": "link-uuid-456"
    }
