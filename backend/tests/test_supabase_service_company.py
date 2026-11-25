"""
Tests for Supabase Service with Company Permissions.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from app.services.supabase_service import SupabaseService

# Remove local mock_supabase_client to use conftest.py's AsyncMock version.

@pytest.fixture
def service(mock_supabase_client, mock_settings):
    with patch("app.services.supabase_service.settings", mock_settings):
        with patch("app.services.supabase_service.create_client", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_supabase_client
            yield SupabaseService()

@pytest.mark.asyncio
async def test_get_manual_company_access(service, mock_supabase_client):
    """Test get_manual allows access if user is company member."""
    manual_id = "00000000-0000-0000-0000-000000000001"
    user_id = "00000000-0000-0000-0000-000000000002"
    company_id = "00000000-0000-0000-0000-000000000003"
    
    # Mock manual response
    execute_mock = Mock()
    execute_mock.data = {
        "id": manual_id,
        "company_id": company_id,
    }
    mock_supabase_client.table().select().eq().single().execute = AsyncMock(return_value=execute_mock)
    
    # Mock membership check (_is_company_member)
    # We patch the private method since we are testing logic flow or we mock the chain calls
    # Let's mock the chain calls for _is_company_member
    
    # Mock chain for _is_company_member: 
    # client.table("company_users").select("id").eq()...single().execute()
    
    # We need to distinguish calls. Since they are chained, it's hard with standard Mock.
    # We can SIDE_EFFECT based on table name?
    
    # Easier: Patch the helper methods on the instance?
    # But methods are async? No, _is_company_member is async.
    
    with patch.object(service, "_is_company_member", new_callable=AsyncMock) as mock_is_member:
        mock_is_member.return_value = True
        
        result = await service.get_manual(manual_id, user_id)
        
        assert result is not None
        assert result["id"] == manual_id
        mock_is_member.assert_awaited_with(user_id, company_id)

@pytest.mark.asyncio
async def test_get_manual_no_access(service, mock_supabase_client):
    """Test get_manual denies access if user is NOT company member."""
    manual_id = "00000000-0000-0000-0000-000000000001"
    user_id = "00000000-0000-0000-0000-000000000002"
    company_id = "00000000-0000-0000-0000-000000000003"
    
    # Mock manual response
    execute_mock = Mock()
    execute_mock.data = {
        "id": manual_id,
        "company_id": company_id,
    }
    mock_supabase_client.table().select().eq().single().execute = AsyncMock(return_value=execute_mock)
    
    with patch.object(service, "_is_company_member", new_callable=AsyncMock) as mock_is_member, \
         patch.object(service, "_is_portal_user", new_callable=AsyncMock) as mock_is_portal, \
         patch.object(service, "_is_public_manual", new_callable=AsyncMock) as mock_is_public:
        
        mock_is_member.return_value = False
        mock_is_portal.return_value = False
        mock_is_public.return_value = False
        
        result = await service.get_manual(manual_id, user_id)
        
        assert result is None
        mock_is_member.assert_awaited_with(user_id, company_id)

@pytest.mark.asyncio
async def test_get_manual_owned_permission(service, mock_supabase_client):
    """Test get_manual_owned checks for page.manuals permission."""
    manual_id = "00000000-0000-0000-0000-000000000001"
    user_id = "00000000-0000-0000-0000-000000000002"
    company_id = "00000000-0000-0000-0000-000000000003"
    
    execute_mock = Mock()
    execute_mock.data = {
        "id": manual_id,
        "company_id": company_id
    }
    mock_supabase_client.table().select().eq().single().execute = AsyncMock(return_value=execute_mock)
    
    with patch.object(service, "_has_company_permission", new_callable=AsyncMock) as mock_has_perm:
        mock_has_perm.return_value = True
        
        result = await service.get_manual_owned(manual_id, user_id)
        
        assert result is not None
        mock_has_perm.assert_awaited_with(user_id, company_id, "page.manuals")

@pytest.mark.asyncio
async def test_get_public_manual_company_portal(service, mock_supabase_client):
    """Test get_public_manual_by_id checks company portal status."""
    manual_id = "00000000-0000-0000-0000-000000000001"
    company_id = "00000000-0000-0000-0000-000000000003"
    
    # Manual exists and is public
    manual_data = {
        "id": manual_id,
        "company_id": company_id,
        "is_public": True
    }
    
    # Company portal is enabled
    company_data = {"portal_enabled": True}
    
    # Mocking the chain is tricky with same client. 
    # Let's use side_effect on execute()
    
    call_count = 0
    async def side_effect():
        nonlocal call_count
        call_count += 1
        mock_res = Mock()
        if call_count == 1:
            # First call: get manual
            mock_res.data = manual_data
        elif call_count == 2:
            # Second call: get company
            mock_res.data = company_data
        return mock_res
        
    mock_supabase_client.table().select().eq().single().execute = AsyncMock(side_effect=side_effect)
    
    result = await service.get_public_manual_by_id(manual_id)
    
    assert result == manual_data
    assert call_count == 2

@pytest.mark.asyncio
async def test_get_public_manual_company_portal_disabled(service, mock_supabase_client):
    """Test get_public_manual_by_id returns None if portal disabled."""
    manual_id = "00000000-0000-0000-0000-000000000001"
    company_id = "00000000-0000-0000-0000-000000000003"
    manual_data = {"id": manual_id, "company_id": company_id, "is_public": True}
    company_data = {"portal_enabled": False} # Disabled
    
    call_count = 0
    async def side_effect():
        nonlocal call_count
        call_count += 1
        mock_res = Mock()
        if call_count == 1:
            mock_res.data = manual_data
        elif call_count == 2:
            mock_res.data = company_data
        return mock_res
        
    mock_supabase_client.table().select().eq().single().execute = AsyncMock(side_effect=side_effect)
    
    result = await service.get_public_manual_by_id(manual_id)
    assert result is None
