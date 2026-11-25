import pytest
from unittest.mock import patch, AsyncMock, MagicMock, Mock
from fastapi.testclient import TestClient
from datetime import datetime

# Sample data
mock_license = {
    "id": "lic-123",
    "name": "Pro",
    "max_manuals": 10,
    "max_public_manuals": 2,
    "max_users": 5,
    "features": {"analytics": True},
    "created_at": datetime.utcnow().isoformat()
}

@pytest.mark.asyncio
async def test_get_licenses_unauthorized(test_client: TestClient):
    """Test getting licenses without superadmin."""
    with patch("app.routers.superadmin.supabase_service.is_superadmin", new_callable=AsyncMock) as mock_is_super:
        mock_is_super.return_value = False
        
        response = test_client.get(
            "/api/v1/superadmin/licenses",
            headers={"Authorization": "Bearer fake_token"}
        )
        assert response.status_code == 401
        
@pytest.mark.asyncio
async def test_get_licenses_superadmin(test_client: TestClient, valid_jwt_payload):
    """Test getting licenses as superadmin."""
    from app.auth.jwt_handler import JWTPayload, verify_supabase_token
    from app.main import app
    
    app.dependency_overrides[verify_supabase_token] = lambda: JWTPayload(valid_jwt_payload)
    
    with patch("app.routers.superadmin.supabase_service.is_superadmin", AsyncMock(return_value=True)), \
         patch("app.routers.superadmin.supabase_service.get_client", new_callable=AsyncMock) as mock_get_client:
        
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        # Mock supabase client chain
        execute_mock = Mock()
        execute_mock.data = [mock_license]
        mock_client.table().select().order().execute = AsyncMock(return_value=execute_mock)
        
        response = test_client.get(
            "/api/v1/superadmin/licenses",
            headers={"Authorization": "Bearer fake"}
        )
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["name"] == "Pro"
    
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_create_license(test_client: TestClient, valid_jwt_payload):
    from app.auth.jwt_handler import JWTPayload, verify_supabase_token
    from app.main import app
    
    app.dependency_overrides[verify_supabase_token] = lambda: JWTPayload(valid_jwt_payload)
    
    req_data = {
        "name": "Enterprise",
        "max_manuals": 100,
        "max_public_manuals": 10,
        "max_users": 50,
        "features": {"analytics": True}
    }
    
    with patch("app.routers.superadmin.supabase_service.is_superadmin", AsyncMock(return_value=True)), \
         patch("app.routers.superadmin.supabase_service.get_client", new_callable=AsyncMock) as mock_get_client:
         
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        execute_mock = Mock()
        ret_data = {**req_data, "id": "00000000-0000-0000-0000-000000000001"}
        execute_mock.data = [ret_data]
        mock_client.table().insert().execute = AsyncMock(return_value=execute_mock)
         
        response = test_client.post(
            "/api/v1/superadmin/licenses",
            json=req_data,
            headers={"Authorization": "Bearer fake"}
        )
        
        assert response.status_code == 200
        assert response.json()["name"] == "Enterprise"
        assert response.json()["id"] == "00000000-0000-0000-0000-000000000001"
        
        # Verify serialization: 'features' should be a dict, not a Pydantic object
        called_args = mock_client.table().insert.call_args[0][0]
        assert isinstance(called_args["features"], dict)
        assert called_args["features"]["analytics"] is True

    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_provision_company(test_client: TestClient, valid_jwt_payload):
    from app.auth.jwt_handler import JWTPayload, verify_supabase_token
    from app.main import app
    
    app.dependency_overrides[verify_supabase_token] = lambda: JWTPayload(valid_jwt_payload)
    
    license_id = "00000000-0000-0000-0000-000000000003"
    req_data = {
        "company_name": "Test Provision",
        "admin_email": "admin@testprov.com",
        "admin_password": "securepassword123",
        "license_id": license_id
    }

    with patch("app.routers.superadmin.supabase_service.is_superadmin", AsyncMock(return_value=True)), \
         patch("app.routers.superadmin.supabase_service.get_client", new_callable=AsyncMock) as mock_get_client:
         
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        # Mock auth create user
        class MockUserResponse:
            class User:
                id = "00000000-0000-0000-0000-000000000002"
            user = User()
        mock_client.auth.admin.create_user = AsyncMock(return_value=MockUserResponse())
        
        # Mock .rpc() for generate_company_slug
        rpc_execute_mock = Mock()
        rpc_execute_mock.data = "test-provision-slug"
        mock_client.rpc().execute = AsyncMock(return_value=rpc_execute_mock)
        
        # Multiple table inserts
        execute_mock = Mock()
        execute_mock.data = [{"id": "00000000-0000-0000-0000-000000000001", "key": "page.analytics"}]
        mock_client.table().insert().execute = AsyncMock(return_value=execute_mock)
        mock_client.table().upsert().execute = AsyncMock(return_value=execute_mock)
        mock_client.table().select().execute = AsyncMock(return_value=execute_mock)
        
        response = test_client.post(
            "/api/v1/superadmin/companies",
            json=req_data,
            headers={"Authorization": "Bearer fake"}
        )
        
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        assert response.json()["company_id"] == "00000000-0000-0000-0000-000000000001"
        
    app.dependency_overrides.clear()
