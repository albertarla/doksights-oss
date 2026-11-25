import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient

from app.services.analytics_service import analytics_service
from app.schemas.chat import ChatMessage

def test_track_view(test_client: TestClient):
    """Test tracking a manual view successfully."""
    
    payload = {
        "manual_id": "manual-uuid-123",
        "reading_duration_seconds": 120,
        "pages_viewed": 5,
        "total_pages": 10,
        "referrer": "https://google.com"
    }
    
    mock_manual = {
        "id": "manual-uuid-123",
        "company_id": "company-uuid-123",
        "is_public": True
    }
    
    with patch("app.routers.analytics.supabase_service.get_public_manual_by_id", new_callable=AsyncMock) as mock_get_manual, \
         patch("app.routers.analytics.supabase_service.track_manual_view", new_callable=AsyncMock) as mock_track, \
         patch("app.routers.analytics.supabase_service.get_company_license_features", new_callable=AsyncMock) as mock_features:
        
        mock_get_manual.return_value = mock_manual
        mock_features.return_value = {"analytics": True}
        
        response = test_client.post(
            "/api/v1/analytics/view",
            json=payload,
            headers={"x-forwarded-for": "192.168.1.1"}
        )
        
        assert response.status_code == 200
        assert response.json()["status"] == "tracked"
        
        mock_track.assert_called_once()
        called_data = mock_track.call_args[0][0]
        
        assert called_data["manual_id"] == "manual-uuid-123"
        assert called_data["company_id"] == "company-uuid-123"
        assert "hashed_identifier" in called_data
        assert called_data["hashed_identifier"] is not None

def test_track_view_private_manual(test_client: TestClient):
    """Test tracking view for a private manual fails."""
    
    payload = {
        "manual_id": "manual-uuid-123",
        "reading_duration_seconds": 12,
        "pages_viewed": 1,
        "total_pages": 10
    }
    
    with patch("app.routers.analytics.supabase_service.get_public_manual_by_id", new_callable=AsyncMock) as mock_get_manual:
        # Return None to simulate manual is not public or doesn't exist
        mock_get_manual.return_value = None
        
        response = test_client.post(
            "/api/v1/analytics/view",
            json=payload
        )
        
        assert response.status_code == 403
        assert "not found" in response.json()["detail"].lower()

@pytest.mark.asyncio
async def test_log_chat_session():
    """Test that logging a chat session successfully queries the Supabase client."""
    mock_client = MagicMock()
    # Mocking the chain: client.table().upsert().execute()
    mock_table = MagicMock()
    mock_client.table.return_value = mock_table
    
    mock_upsert = MagicMock()
    mock_table.upsert.return_value = mock_upsert
    mock_upsert.execute = AsyncMock()
    
    mock_insert = MagicMock()
    mock_table.insert.return_value = mock_insert
    mock_insert.execute = AsyncMock()
    
    with patch("app.services.analytics_service.supabase_service.get_client", new_callable=AsyncMock) as mock_get_client:
        mock_get_client.return_value = mock_client
        
        # Call the method
        await analytics_service.log_chat_session(
            session_id="test-session-id",
            company_id="test-company-id",
            manual_id="test-manual-id",
            chat_type="standard",
            messages=[ChatMessage(role="user", content="Hello")],
            ai_response="World"
        )
        
        # Verify the get_client was called
        mock_get_client.assert_awaited_once()
        
        # Verify table calls
        mock_client.table.assert_any_call("ai_chat_sessions")
        mock_client.table.assert_any_call("ai_chat_messages")
        
        # Verify upsert call
        mock_upsert.execute.assert_awaited_once()
        
        # Verify insert call
        mock_insert.execute.assert_awaited_once()

@pytest.mark.asyncio
async def test_log_token_usage():
    """Test that logging token usage successfully queries the Supabase client."""
    mock_client = MagicMock()
    mock_table = MagicMock()
    mock_client.table.return_value = mock_table
    mock_insert = MagicMock()
    mock_table.insert.return_value = mock_insert
    mock_insert.execute = AsyncMock()
    
    with patch("app.services.analytics_service.supabase_service.get_client", new_callable=AsyncMock) as mock_get_client:
        mock_get_client.return_value = mock_client
        
        await analytics_service.log_token_usage(
            company_id="comp-1",
            feature="chat_manual",
            model="gemini",
            related_id="rel-1",
            prompt_tokens=10,
            completion_tokens=20,
            total_tokens=30
        )
        
        mock_get_client.assert_awaited_once()
        mock_client.table.assert_called_with("ai_token_usage_logs")
        mock_insert.execute.assert_awaited_once()


# ---------------------------------------------------------------------------
# T-TEST-8: log_chat_session updates updated_at
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_log_chat_session_updates_timestamp():
    """T-TEST-8: After inserting messages, log_chat_session must update the session timestamp."""
    mock_client = MagicMock()
    mock_table = MagicMock()
    mock_client.table.return_value = mock_table

    mock_upsert = MagicMock()
    mock_table.upsert.return_value = mock_upsert
    mock_upsert.execute = AsyncMock()

    mock_insert = MagicMock()
    mock_table.insert.return_value = mock_insert
    mock_insert.execute = AsyncMock()

    mock_update = MagicMock()
    mock_table.update.return_value = mock_update
    mock_eq = MagicMock()
    mock_update.eq.return_value = mock_eq
    mock_eq.execute = AsyncMock()

    with patch("app.services.analytics_service.supabase_service.get_client", new_callable=AsyncMock) as mock_get_client:
        mock_get_client.return_value = mock_client

        await analytics_service.log_chat_session(
            session_id="finalize-test-session",
            company_id="company-1",
            manual_id="manual-1",
            chat_type="standard",
            messages=[ChatMessage(role="user", content="Hello")],
            ai_response="Hi there",
        )

        # Verify the update call with updated_at="now()" was made
        mock_table.update.assert_called_once_with({
            "updated_at": "now()"
        })
        mock_update.eq.assert_called_once_with("id", "finalize-test-session")
        mock_eq.execute.assert_awaited_once()


# ---------------------------------------------------------------------------
# T-TEST-9: classify-sessions endpoint requires superadmin
# ---------------------------------------------------------------------------

def test_classify_sessions_endpoint_requires_superadmin(test_client: TestClient):
    """T-TEST-9: POST /api/v1/analytics/classify-sessions returns 401 without auth."""
    response = test_client.post("/api/v1/analytics/classify-sessions")
    # Without Authorization header, should be 401 or 403
    assert response.status_code in (401, 403)


def test_classify_sessions_endpoint_non_superadmin(test_client: TestClient):
    """T-TEST-9b: Non-superadmin user receives 403."""
    import jwt
    import datetime

    with patch("app.services.supabase_service.supabase_service.is_superadmin", new_callable=AsyncMock) as mock_is_super, \
         patch("app.auth.jwt_handler.settings") as mock_settings:
        mock_is_super.return_value = False
        mock_settings.supabase_jwt_secret = "test-jwt-secret-key-32-chars-min"
        mock_settings.supabase_url = "https://test.supabase.co"

        payload = {
            "sub": "user-not-admin",
            "role": "authenticated",
            "aud": "authenticated",
            "exp": int((datetime.datetime.utcnow() + datetime.timedelta(hours=1)).timestamp()),
        }
        token = jwt.encode(payload, "test-jwt-secret-key-32-chars-min", algorithm="HS256")

        response = test_client.post(
            "/api/v1/analytics/classify-sessions",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403

