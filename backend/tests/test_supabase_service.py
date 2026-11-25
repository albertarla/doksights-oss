"""
Tests for the Supabase Service.
"""

import pytest
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from datetime import datetime, timedelta, timezone


class TestSupabaseServiceInit:
    """Tests for SupabaseService initialization."""
    
    @pytest.mark.asyncio
    async def test_client_created_with_settings(self, mock_settings):
        """Test that Supabase client is created with correct settings."""
        with patch("app.services.supabase_service.settings", mock_settings):
            with patch("app.services.supabase_service.create_client", new_callable=AsyncMock) as mock_create:
                mock_create.return_value = MagicMock()
                
                from app.services.supabase_service import SupabaseService
                service = SupabaseService()
                await service.get_client()
                
                mock_create.assert_called_once_with(
                    mock_settings.supabase_url,
                    mock_settings.supabase_service_key
                )


class TestGetManual:
    """Tests for the get_manual method."""
    
    @pytest.fixture
    def service_with_mock_client(self, mock_supabase_client, mock_settings):
        """Create a SupabaseService with a mocked client."""
        with patch("app.services.supabase_service.settings", mock_settings):
            with patch("app.services.supabase_service.create_client", new_callable=AsyncMock) as mock_create:
                mock_create.return_value = mock_supabase_client
                from app.services.supabase_service import SupabaseService
                service = SupabaseService()
                yield service, mock_supabase_client
    
    @pytest.mark.asyncio
    async def test_get_manual_owner_access(self, service_with_mock_client, sample_manual):
        """Test that owner can access their manual."""
        service, mock_client = service_with_mock_client
        
        manual_id = "00000000-0000-0000-0000-000000000001"
        user_id = "00000000-0000-0000-0000-000000000002"
        # Configure mock to return the manual
        execute_mock = Mock()
        execute_mock.data = sample_manual
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)
        
        # FIX: Patch _is_company_member to simulate owner access
        with patch.object(service, "_is_company_member", new_callable=AsyncMock) as mock_is_member:
            mock_is_member.return_value = True
            
            result = await service.get_manual(manual_id, user_id)
        
        assert result is not None
        assert result["id"] == "manual-uuid-123"
        assert result["company_id"] == "company-uuid-123"
    
    @pytest.mark.asyncio
    async def test_get_manual_returns_none_when_not_found(self, service_with_mock_client):
        """Test that None is returned when manual not found."""
        service, mock_client = service_with_mock_client
        
        manual_id = "00000000-0000-0000-0000-000000000001"
        user_id = "00000000-0000-0000-0000-000000000002"
        # Configure mock to return no data
        execute_mock = Mock()
        execute_mock.data = None
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)
        
        result = await service.get_manual(manual_id, user_id)
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_get_manual_denied_for_non_owner_non_public(self, service_with_mock_client, sample_manual):
        """Test that non-owner cannot access non-public manual."""
        service, mock_client = service_with_mock_client
        
        manual_id = "00000000-0000-0000-0000-000000000001"
        user_id = "00000000-0000-0000-0000-000000000002"
        # Manual belongs to a different company — user is not a member
        execute_mock = Mock()
        execute_mock.data = sample_manual  # has company_id = "company-uuid-123"
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)
        
        # Mock _is_company_member to return False, then _is_public_manual to return False
        with patch.object(service, "_is_company_member", new_callable=AsyncMock) as mock_is_member, \
             patch.object(service, "_is_portal_user", new_callable=AsyncMock) as mock_is_portal, \
             patch.object(service, "_is_public_manual", new_callable=AsyncMock) as mock_is_public:
            mock_is_member.return_value = False
            mock_is_portal.return_value = False
            mock_is_public.return_value = False
            
            result = await service.get_manual(manual_id, user_id)
            
            assert result is None


class TestGetManualForPublicLink:
    """Tests for the get_manual_for_public_link method."""
    
    @pytest.fixture
    def service_with_mock_client(self, mock_supabase_client, mock_settings):
        """Create a SupabaseService with a mocked client."""
        with patch("app.services.supabase_service.settings", mock_settings):
            with patch("app.services.supabase_service.create_client", new_callable=AsyncMock) as mock_create:
                mock_create.return_value = mock_supabase_client
                from app.services.supabase_service import SupabaseService
                service = SupabaseService()
                yield service, mock_supabase_client
    
    @pytest.mark.asyncio
    async def test_valid_active_link_returns_manual(self, service_with_mock_client, sample_manual, sample_shareable_link):
        """Test that valid active link returns the manual."""
        service, mock_client = service_with_mock_client
        
        # Configure mock for link query
        link_execute = MagicMock()
        link_execute.data = sample_shareable_link
        
        # Configure mock for manual query
        manual_execute = MagicMock()
        manual_execute.data = {
            "id": sample_manual["id"],
            "title": sample_manual["title"],
            "description": sample_manual["description"],
            "extracted_text": sample_manual["extracted_text"]
        }
        
        manual_id = "00000000-0000-0000-0000-000000000001"
        link_id = "00000000-0000-0000-0000-000000000004"
        
        # Chain the mocks
        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "shareable_links":
                table_mock.select.return_value.eq.return_value.eq.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=link_execute)
            else:  # manuals
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=manual_execute)
            return table_mock
        
        mock_client.table.side_effect = mock_table
        
        result = await service.get_manual_for_public_link(manual_id, link_id)
        
        assert result is not None
        assert result["id"] == "manual-uuid-123"
    
    @pytest.mark.asyncio
    async def test_inactive_link_returns_none(self, service_with_mock_client):
        """Test that inactive link returns None."""
        service, mock_client = service_with_mock_client
        
        manual_id = "00000000-0000-0000-0000-000000000001"
        link_id = "00000000-0000-0000-0000-000000000004"
        # Configure mock to return no link (inactive)
        link_execute = Mock()
        link_execute.data = None
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=link_execute)
        
        result = await service.get_manual_for_public_link(manual_id, link_id)
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_expired_link_returns_none(self, service_with_mock_client):
        """Test that expired link returns None."""
        service, mock_client = service_with_mock_client
        
        manual_id = "00000000-0000-0000-0000-000000000001"
        link_id = "00000000-0000-0000-0000-000000000004"
        # Configure mock for expired link
        expired_link = {
            "id": link_id,
            "manual_id": manual_id,
            "is_active": True,
            "expires_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        }
        link_execute = Mock()
        link_execute.data = expired_link
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=link_execute)
        
        result = await service.get_manual_for_public_link(manual_id, link_id)
        
        assert result is None


class TestGetPublicManualById:
    """Tests for the get_public_manual_by_id method."""
    
    @pytest.fixture
    def service_with_mock_client(self, mock_supabase_client, mock_settings):
        """Create a SupabaseService with a mocked client."""
        with patch("app.services.supabase_service.settings", mock_settings):
            with patch("app.services.supabase_service.create_client", new_callable=AsyncMock) as mock_create:
                mock_create.return_value = mock_supabase_client
                from app.services.supabase_service import SupabaseService
                service = SupabaseService()
                yield service, mock_supabase_client
    
    @pytest.mark.asyncio
    async def test_public_manual_returned(self, service_with_mock_client, sample_manual):
        """Test that public manual is returned when portal is enabled."""
        service, mock_client = service_with_mock_client

        manual_execute = Mock()
        manual_execute.data = {
            "id": sample_manual["id"],
            "title": sample_manual["title"],
            "description": sample_manual["description"],
            "extracted_text": sample_manual["extracted_text"],
            "company_id": sample_manual["company_id"],
            "is_public": True,
        }

        company_execute = Mock()
        company_execute.data = {"portal_enabled": True}

        manual_id = "00000000-0000-0000-0000-000000000001"
        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "manuals":
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=manual_execute)
            else:  # companies
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=company_execute)
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service.get_public_manual_by_id(manual_id)
        
        assert result is not None
        assert result["id"] == "manual-uuid-123"
    
    @pytest.mark.asyncio
    async def test_nonexistent_manual_returns_none(self, service_with_mock_client):
        """Test that non-existent manual returns None."""
        service, mock_client = service_with_mock_client

        manual_id = "00000000-0000-0000-0000-000000000001"
        execute_mock = Mock()
        execute_mock.data = None
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.get_public_manual_by_id(manual_id)
        
        assert result is None


class TestIsPublicManual:
    """Tests for the _is_public_manual method."""
    
    @pytest.fixture
    def service_with_mock_client(self, mock_supabase_client, mock_settings):
        """Create a SupabaseService with a mocked client."""
        with patch("app.services.supabase_service.settings", mock_settings):
            with patch("app.services.supabase_service.create_client", new_callable=AsyncMock) as mock_create:
                mock_create.return_value = mock_supabase_client
                from app.services.supabase_service import SupabaseService
                service = SupabaseService()
                yield service, mock_supabase_client
    
    @pytest.mark.asyncio
    async def test_returns_true_when_public_and_portal_enabled(self, service_with_mock_client):
        """Test that True is returned when manual is public and company portal is enabled."""
        service, mock_client = service_with_mock_client

        manual_id = "00000000-0000-0000-0000-000000000001"
        company_id = "00000000-0000-0000-0000-000000000003"
        manual_execute = Mock()
        manual_execute.data = [{"id": manual_id, "is_public": True, "company_id": company_id}]

        company_execute = Mock()
        company_execute.data = {"portal_enabled": True}

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "manuals":
                table_mock.select.return_value.eq.return_value.execute = AsyncMock(return_value=manual_execute)
            else:  # companies
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=company_execute)
            return table_mock

        mock_client.table.side_effect = mock_table
        
        result = await service._is_public_manual(manual_id)
        
        assert result is True

    @pytest.mark.asyncio
    async def test_returns_true_with_dict_manual_response(self, service_with_mock_client):
        """Test that dict-shaped manual responses are still supported."""
        service, mock_client = service_with_mock_client

        manual_id = "00000000-0000-0000-0000-000000000001"
        company_id = "00000000-0000-0000-0000-000000000003"
        manual_execute = Mock()
        manual_execute.data = {"id": manual_id, "is_public": True, "company_id": company_id}

        company_execute = Mock()
        company_execute.data = {"portal_enabled": True}

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "manuals":
                table_mock.select.return_value.eq.return_value.execute = AsyncMock(return_value=manual_execute)
            else:
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=company_execute)
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service._is_public_manual(manual_id)

        assert result is True

    @pytest.mark.asyncio
    async def test_returns_true_with_list_company_response(self, service_with_mock_client):
        """Test that list-shaped company responses are normalized safely."""
        service, mock_client = service_with_mock_client

        manual_id = "00000000-0000-0000-0000-000000000001"
        company_id = "00000000-0000-0000-0000-000000000003"
        manual_execute = Mock()
        manual_execute.data = [{"id": manual_id, "is_public": True, "company_id": company_id}]

        company_execute = Mock()
        company_execute.data = [{"portal_enabled": True}]

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "manuals":
                table_mock.select.return_value.eq.return_value.execute = AsyncMock(return_value=manual_execute)
            else:
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=company_execute)
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service._is_public_manual(manual_id)

        assert result is True
    
    @pytest.mark.asyncio
    async def test_returns_false_when_not_public(self, service_with_mock_client):
        """Test that False is returned when manual is not public."""
        service, mock_client = service_with_mock_client

        manual_id = "00000000-0000-0000-0000-000000000001"
        execute_mock = Mock()
        execute_mock.data = [{"id": manual_id, "is_public": False, "company_id": "00000000-0000-0000-0000-000000000003"}]
        mock_client.table.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)
        
        result = await service._is_public_manual(manual_id)
        
        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_manual_query_returns_empty_list(self, service_with_mock_client):
        """Test that False is returned when the non-single query finds no manual."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = []
        mock_client.table.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service._is_public_manual("00000000-0000-0000-0000-000000000001")

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_company_query_returns_empty_list(self, service_with_mock_client):
        """Test public manual checks reject empty company list responses."""
        service, mock_client = service_with_mock_client

        manual_id = "00000000-0000-0000-0000-000000000001"
        company_id = "00000000-0000-0000-0000-000000000003"
        manual_execute = Mock()
        manual_execute.data = [{"id": manual_id, "is_public": True, "company_id": company_id}]

        company_execute = Mock()
        company_execute.data = []

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "manuals":
                table_mock.select.return_value.eq.return_value.execute = AsyncMock(return_value=manual_execute)
            else:
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=company_execute)
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service._is_public_manual(manual_id)

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_company_portal_disabled(self, service_with_mock_client):
        """Test public manual checks require an enabled company portal."""
        service, mock_client = service_with_mock_client

        manual_id = "00000000-0000-0000-0000-000000000001"
        company_id = "00000000-0000-0000-0000-000000000003"
        manual_execute = Mock()
        manual_execute.data = [{"id": manual_id, "is_public": True, "company_id": company_id}]

        company_execute = Mock()
        company_execute.data = {"portal_enabled": False}

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "manuals":
                table_mock.select.return_value.eq.return_value.execute = AsyncMock(return_value=manual_execute)
            else:
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=company_execute)
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service._is_public_manual(manual_id)

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_company_portal_private(self, service_with_mock_client):
        """Test public fallback access is blocked for private portals."""
        service, mock_client = service_with_mock_client

        manual_id = "00000000-0000-0000-0000-000000000001"
        company_id = "00000000-0000-0000-0000-000000000003"
        manual_execute = Mock()
        manual_execute.data = [{"id": manual_id, "is_public": True, "company_id": company_id}]

        company_execute = Mock()
        company_execute.data = {"portal_enabled": True, "portal_privacy": "private"}

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "manuals":
                table_mock.select.return_value.eq.return_value.execute = AsyncMock(return_value=manual_execute)
            else:
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=company_execute)
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service._is_public_manual(manual_id)

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_company_lookup_raises(self, service_with_mock_client):
        """Test public manual checks fail closed when company lookup raises."""
        service, mock_client = service_with_mock_client

        manual_id = "00000000-0000-0000-0000-000000000001"
        company_id = "00000000-0000-0000-0000-000000000003"
        manual_execute = Mock()
        manual_execute.data = [{"id": manual_id, "is_public": True, "company_id": company_id}]

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "manuals":
                table_mock.select.return_value.eq.return_value.execute = AsyncMock(return_value=manual_execute)
            else:
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(side_effect=Exception("missing row"))
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service._is_public_manual(manual_id)

        assert result is False


class TestAccessHelpers:
    """Tests for list-returning access helper queries."""

    @pytest.fixture
    def service_with_mock_client(self, mock_supabase_client, mock_settings):
        """Create a SupabaseService with a mocked client."""
        with patch("app.services.supabase_service.settings", mock_settings):
            with patch("app.services.supabase_service.create_client", new_callable=AsyncMock) as mock_create:
                mock_create.return_value = mock_supabase_client
                from app.services.supabase_service import SupabaseService
                service = SupabaseService()
                yield service, mock_supabase_client

    @pytest.mark.parametrize(
        "data, expected",
        [
            ([{"id": "row-1"}], {"id": "row-1"}),
            ({"id": "row-1"}, {"id": "row-1"}),
            ([], None),
            (None, None),
            ("not-a-row", None),
        ],
    )
    def test_first_row_normalizes_supported_response_shapes(self, service_with_mock_client, data, expected):
        """Test row normalization for single and non-single Supabase responses."""
        service, _ = service_with_mock_client

        assert service._first_row(data) == expected

    @pytest.mark.asyncio
    async def test_is_company_member_returns_true_when_list_row_exists(self, service_with_mock_client):
        """Test company membership checks handle non-single list responses."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = [{"id": "company-user-1"}]
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service._is_company_member("user-1", "company-1")

        assert result is True

    @pytest.mark.asyncio
    async def test_is_company_member_returns_true_when_dict_row_exists(self, service_with_mock_client):
        """Test company membership checks stay compatible with dict responses."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = {"id": "company-user-1"}
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service._is_company_member("user-1", "company-1")

        assert result is True

    @pytest.mark.asyncio
    async def test_is_company_member_returns_false_when_empty(self, service_with_mock_client):
        """Test company membership checks reject empty list responses."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = []
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service._is_company_member("user-1", "company-1")

        assert result is False

    @pytest.mark.asyncio
    async def test_is_portal_user_returns_true_when_row_exists(self, service_with_mock_client):
        """Test that portal users are recognized from list responses."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = [{"id": "portal-user-1"}]
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service._is_portal_user("user-1", "company-1")

        assert result is True

    @pytest.mark.asyncio
    async def test_is_portal_user_returns_true_when_dict_row_exists(self, service_with_mock_client):
        """Test portal user checks stay compatible with dict responses."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = {"id": "portal-user-1"}
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service._is_portal_user("user-1", "company-1")

        assert result is True

    @pytest.mark.asyncio
    async def test_is_portal_user_returns_false_when_empty(self, service_with_mock_client):
        """Test that non-portal users are rejected from empty list responses."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = []
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service._is_portal_user("user-1", "company-1")

        assert result is False

    @pytest.mark.asyncio
    async def test_get_manual_allows_portal_user_access(self, service_with_mock_client, sample_manual):
        """Test that get_manual allows users registered in the company portal."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = sample_manual
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)

        with patch.object(service, "_is_company_member", new_callable=AsyncMock) as mock_is_member, \
             patch.object(service, "_is_portal_user", new_callable=AsyncMock) as mock_is_portal, \
             patch.object(service, "_is_public_manual", new_callable=AsyncMock) as mock_is_public:
            mock_is_member.return_value = False
            mock_is_portal.return_value = True

            result = await service.get_manual("manual-uuid-123", "user-1")

            assert result == sample_manual
            mock_is_portal.assert_awaited_once_with("user-1", "company-uuid-123")
            mock_is_public.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_has_company_permission_uses_first_company_user_row(self, service_with_mock_client):
        """Test permission checks handle non-single list responses."""
        service, mock_client = service_with_mock_client

        company_user_execute = Mock()
        company_user_execute.data = [{"id": "company-user-1"}]
        permission_execute = Mock()
        permission_execute.data = [{"id": "permission-1"}]

        def mock_table(table_name):
            table_mock = MagicMock()
            query_mock = MagicMock()
            table_mock.select.return_value = query_mock
            query_mock.eq.return_value = query_mock
            if table_name == "company_users":
                query_mock.execute = AsyncMock(return_value=company_user_execute)
            else:
                query_mock.execute = AsyncMock(return_value=permission_execute)
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service._has_company_permission("user-1", "company-1", "page.manuals")

        assert result is True

    @pytest.mark.asyncio
    async def test_has_company_permission_handles_dict_company_user_row(self, service_with_mock_client):
        """Test permission checks stay compatible with dict membership responses."""
        service, mock_client = service_with_mock_client

        company_user_execute = Mock()
        company_user_execute.data = {"id": "company-user-1"}
        permission_execute = Mock()
        permission_execute.data = [{"id": "permission-1"}]

        def mock_table(table_name):
            table_mock = MagicMock()
            query_mock = MagicMock()
            table_mock.select.return_value = query_mock
            query_mock.eq.return_value = query_mock
            if table_name == "company_users":
                query_mock.execute = AsyncMock(return_value=company_user_execute)
            else:
                query_mock.execute = AsyncMock(return_value=permission_execute)
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service._has_company_permission("user-1", "company-1", "page.manuals")

        assert result is True

    @pytest.mark.asyncio
    async def test_has_company_permission_returns_false_without_permission_row(self, service_with_mock_client):
        """Test permission checks reject empty permission list responses."""
        service, mock_client = service_with_mock_client

        company_user_execute = Mock()
        company_user_execute.data = [{"id": "company-user-1"}]
        permission_execute = Mock()
        permission_execute.data = []

        def mock_table(table_name):
            table_mock = MagicMock()
            query_mock = MagicMock()
            table_mock.select.return_value = query_mock
            query_mock.eq.return_value = query_mock
            if table_name == "company_users":
                query_mock.execute = AsyncMock(return_value=company_user_execute)
            else:
                query_mock.execute = AsyncMock(return_value=permission_execute)
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service._has_company_permission("user-1", "company-1", "page.manuals")

        assert result is False

    @pytest.mark.asyncio
    async def test_has_company_permission_returns_false_without_member_row(self, service_with_mock_client):
        """Test permission checks return False when membership query is empty."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = []
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service._has_company_permission("user-1", "company-1", "page.manuals")

        assert result is False

    @pytest.mark.asyncio
    async def test_is_superadmin_handles_list_response(self, service_with_mock_client):
        """Test superadmin checks handle non-single list responses."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = [{"is_superadmin": True}]
        mock_client.table.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.is_superadmin("user-1")

        assert result is True

    @pytest.mark.asyncio
    async def test_is_superadmin_handles_dict_response(self, service_with_mock_client):
        """Test superadmin checks stay compatible with dict responses."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = {"is_superadmin": True}
        mock_client.table.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.is_superadmin("user-1")

        assert result is True

    @pytest.mark.asyncio
    async def test_is_superadmin_returns_false_when_flag_false(self, service_with_mock_client):
        """Test superadmin checks reject rows with a false flag."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = [{"is_superadmin": False}]
        mock_client.table.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.is_superadmin("user-1")

        assert result is False

    @pytest.mark.asyncio
    async def test_is_superadmin_returns_false_for_empty_list(self, service_with_mock_client):
        """Test superadmin checks reject empty list responses."""
        service, mock_client = service_with_mock_client

        execute_mock = Mock()
        execute_mock.data = []
        mock_client.table.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.is_superadmin("user-1")

        assert result is False


class TestGetSignedPdfUrl:
    """Tests for the get_signed_pdf_url method."""
    
    @pytest.fixture
    def service_with_mock_client(self, mock_supabase_client, mock_settings):
        """Create a SupabaseService with a mocked client."""
        with patch("app.services.supabase_service.settings", mock_settings):
            with patch("app.services.supabase_service.create_client", new_callable=AsyncMock) as mock_create:
                mock_create.return_value = mock_supabase_client
                from app.services.supabase_service import SupabaseService
                service = SupabaseService()
                yield service, mock_supabase_client
    
    @pytest.mark.asyncio
    async def test_returns_signed_url(self, service_with_mock_client):
        """Test that signed URL is returned successfully."""
        service, mock_client = service_with_mock_client
        
        mock_client.storage.from_.return_value.create_signed_url = AsyncMock(return_value={
            "signedURL": "https://storage.supabase.co/signed/test-file.pdf?token=abc123"
        })
        
        result = await service.get_signed_pdf_url("00000000-0000-0000-0000-000000000002/manuals/test.pdf")
        
        assert result is not None
        assert "signed" in result.lower()
    
    @pytest.mark.asyncio
    async def test_returns_none_on_error(self, service_with_mock_client):
        """Test that None is returned on error."""
        service, mock_client = service_with_mock_client
        
        mock_client.storage.from_.return_value.create_signed_url = AsyncMock(side_effect=Exception("Storage error"))
        
        result = await service.get_signed_pdf_url("invalid/path.pdf")
        
        assert result is None


class TestGetManualSections:
    """Tests for the get_manual_sections method."""
    
    @pytest.fixture
    def service_with_mock_client(self, mock_supabase_client, mock_settings):
        """Create a SupabaseService with a mocked client."""
        with patch("app.services.supabase_service.settings", mock_settings):
            with patch("app.services.supabase_service.create_client", new_callable=AsyncMock) as mock_create:
                mock_create.return_value = mock_supabase_client
                from app.services.supabase_service import SupabaseService
                service = SupabaseService()
                yield service, mock_supabase_client
    
    @pytest.mark.asyncio
    async def test_get_manual_sections_success(self, service_with_mock_client):
        """Test that manual sections are returned."""
        service, mock_client = service_with_mock_client
        
        manual_id = "00000000-0000-0000-0000-000000000001"
        mock_sections = [
            {"id": "s1", "manual_id": manual_id, "title": "Sec 1", "content": "Content 1", "display_order": 0},
            {"id": "s2", "manual_id": manual_id, "title": "Sec 2", "content": "Content 2", "display_order": 1}
        ]
        
        execute_mock = Mock()
        execute_mock.data = mock_sections
        mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute = AsyncMock(return_value=execute_mock)
        
        result = await service.get_manual_sections(manual_id)

        assert len(result) == 2
        assert result[0]["title"] == "Sec 1"
        assert result[1]["title"] == "Sec 2"


class TestSupabaseServiceAdditionalCoverage:
    """Additional coverage for SupabaseService wrappers and branches."""

    @pytest.fixture
    def service_with_mock_client(self, mock_supabase_client, mock_settings):
        """Create a SupabaseService with a mocked client."""
        with patch("app.services.supabase_service.settings", mock_settings):
            with patch("app.services.supabase_service.create_client", new_callable=AsyncMock) as mock_create:
                mock_create.return_value = mock_supabase_client
                from app.services.supabase_service import SupabaseService
                service = SupabaseService()
                yield service, mock_supabase_client

    @pytest.mark.asyncio
    async def test_get_manual_returns_none_without_company_id(self, service_with_mock_client, sample_manual):
        service, mock_client = service_with_mock_client
        manual = {**sample_manual, "company_id": None}
        execute_mock = Mock(data=manual)
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.get_manual("manual-1", "user-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_manual_returns_none_when_single_raises(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(side_effect=Exception("missing row"))

        result = await service.get_manual("manual-1", "user-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_manual_allows_public_manual_access(self, service_with_mock_client, sample_manual):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=sample_manual)
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)

        with patch.object(service, "_is_company_member", AsyncMock(return_value=False)), \
             patch.object(service, "_is_portal_user", AsyncMock(return_value=False)), \
             patch.object(service, "_is_public_manual", AsyncMock(return_value=True)) as mock_is_public:
            result = await service.get_manual("manual-uuid-123", "user-1")

        assert result == sample_manual
        mock_is_public.assert_awaited_once_with("manual-uuid-123")

    @pytest.mark.asyncio
    async def test_get_manual_owned_returns_none_without_manual(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=None)
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.get_manual_owned("manual-1", "user-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_manual_for_public_link_returns_none_when_link_lookup_raises(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.single.return_value.execute = AsyncMock(side_effect=Exception("missing row"))

        result = await service.get_manual_for_public_link("manual-1", "link-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_manual_for_public_link_returns_none_when_manual_lookup_raises(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        link_execute = Mock(data={"id": "link-1", "manual_id": "manual-1", "is_active": True, "expires_at": None})

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "shareable_links":
                table_mock.select.return_value.eq.return_value.eq.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=link_execute)
            else:
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(side_effect=Exception("missing row"))
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service.get_manual_for_public_link("manual-1", "link-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_manual_owned_returns_none_without_company_id(self, service_with_mock_client, sample_manual):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data={**sample_manual, "company_id": None})
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.get_manual_owned("manual-1", "user-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_manual_owned_returns_none_when_single_raises(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(side_effect=Exception("missing row"))

        result = await service.get_manual_owned("manual-1", "user-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_manual_owned_returns_none_without_permission(self, service_with_mock_client, sample_manual):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=sample_manual)
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)

        with patch.object(service, "_has_company_permission", AsyncMock(return_value=False)):
            result = await service.get_manual_owned("manual-1", "user-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_manual_admin_returns_manual(self, service_with_mock_client, sample_manual):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=sample_manual)
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.get_manual_admin("manual-1")

        assert result == sample_manual

    @pytest.mark.asyncio
    async def test_get_manual_admin_returns_none_when_single_raises(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(side_effect=Exception("missing row"))

        result = await service.get_manual_admin("manual-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_public_manual_by_id_returns_none_when_not_public(self, service_with_mock_client, sample_manual):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data={**sample_manual, "is_public": False})
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.get_public_manual_by_id("manual-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_public_manual_by_id_returns_none_without_company_id(self, service_with_mock_client, sample_manual):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data={**sample_manual, "is_public": True, "company_id": None})
        mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.get_public_manual_by_id("manual-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_public_manual_by_id_returns_none_when_company_portal_disabled(self, service_with_mock_client, sample_manual):
        service, mock_client = service_with_mock_client
        manual_execute = Mock(data={**sample_manual, "is_public": True})
        company_execute = Mock(data={"portal_enabled": False})

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "manuals":
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=manual_execute)
            else:
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=company_execute)
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service.get_public_manual_by_id("manual-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_public_manual_by_id_returns_none_on_exception(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        mock_client.table.side_effect = Exception("db error")

        result = await service.get_public_manual_by_id("manual-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_is_superadmin_returns_false_on_exception(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        mock_client.table.side_effect = Exception("db error")

        result = await service.is_superadmin("user-1")

        assert result is False

    @pytest.mark.asyncio
    async def test_get_company_license_features_returns_features(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        license_execute = Mock(data=[{"license_id": "license-1"}])
        features_execute = Mock(data={"features": {"ai": True}})

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "company_licenses":
                table_mock.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute = AsyncMock(return_value=license_execute)
            else:
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=features_execute)
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service.get_company_license_features("company-1")

        assert result == {"ai": True}

    @pytest.mark.asyncio
    async def test_get_company_license_features_returns_empty_without_license(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=[])
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.get_company_license_features("company-1")

        assert result == {}

    @pytest.mark.asyncio
    async def test_get_company_license_features_returns_empty_on_exception(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        mock_client.table.side_effect = Exception("db error")

        result = await service.get_company_license_features("company-1")

        assert result == {}

    @pytest.mark.asyncio
    async def test_get_company_token_quota_returns_usage_and_limit(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        usage_execute = Mock(data=42)
        license_execute = Mock(data=[{"licenses": {"max_ai_tokens": "100"}}])
        mock_client.rpc.return_value.execute = AsyncMock(return_value=usage_execute)
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute = AsyncMock(return_value=license_execute)

        result = await service.get_company_token_quota("company-1")

        assert result == (42, 100)

    @pytest.mark.asyncio
    async def test_get_company_token_quota_returns_unlimited_without_license(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        usage_execute = Mock(data=7)
        license_execute = Mock(data=[])
        mock_client.rpc.return_value.execute = AsyncMock(return_value=usage_execute)
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute = AsyncMock(return_value=license_execute)

        result = await service.get_company_token_quota("company-1")

        assert result == (7, None)

    @pytest.mark.asyncio
    async def test_get_company_token_quota_fails_open_on_exception(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        mock_client.rpc.side_effect = Exception("db error")

        result = await service.get_company_token_quota("company-1")

        assert result == (0, None)

    @pytest.mark.asyncio
    async def test_download_pdf_returns_bytes_response(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        mock_client.storage.from_.return_value.download = AsyncMock(return_value=b"pdf")

        result = await service.download_pdf("manual.pdf")

        assert result == b"pdf"

    @pytest.mark.asyncio
    async def test_download_pdf_reads_file_like_response(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        file_like = MagicMock()
        file_like.read.return_value = b"pdf"
        mock_client.storage.from_.return_value.download = AsyncMock(return_value=file_like)

        result = await service.download_pdf("manual.pdf")

        assert result == b"pdf"

    @pytest.mark.asyncio
    async def test_update_manual_executes_update(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute = AsyncMock()
        table_mock = mock_client.table.return_value
        table_mock.update.return_value.eq.return_value.execute = execute

        await service.update_manual("manual-1", {"title": "Updated"})

        table_mock.update.assert_called_once_with({"title": "Updated"})
        execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_delete_chunks_executes_delete(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute = AsyncMock()
        table_mock = mock_client.table.return_value
        table_mock.delete.return_value.eq.return_value.execute = execute

        await service.delete_chunks("manual-1")

        table_mock.delete.assert_called_once_with()
        execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_store_chunks_batches_inserts(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute = AsyncMock()
        table_mock = mock_client.table.return_value
        table_mock.insert.return_value.execute = execute
        chunks = [{"id": "1"}, {"id": "2"}, {"id": "3"}]

        await service.store_chunks(chunks, batch_size=2)

        assert table_mock.insert.call_count == 2
        table_mock.insert.assert_any_call([{"id": "1"}, {"id": "2"}])
        table_mock.insert.assert_any_call([{"id": "3"}])

    @pytest.mark.asyncio
    async def test_search_similar_chunks_returns_data_or_empty_list(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=[{"id": "chunk-1"}])
        mock_client.rpc.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.search_similar_chunks(["manual-1"], [0.1], limit=1)

        assert result == [{"id": "chunk-1"}]
        mock_client.rpc.assert_called_once_with(
            "match_manual_chunks",
            {"manual_ids": ["manual-1"], "query_embedding": [0.1], "match_count": 1},
        )

    @pytest.mark.asyncio
    async def test_track_manual_view_executes_insert(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute = AsyncMock()
        table_mock = mock_client.table.return_value
        table_mock.insert.return_value.execute = execute
        data = {"manual_id": "manual-1"}

        await service.track_manual_view(data)

        table_mock.insert.assert_called_once_with(data)
        execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_is_public_manual_returns_false_without_company_id(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=[{"id": "manual-1", "is_public": True, "company_id": None}])
        mock_client.table.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service._is_public_manual("manual-1")

        assert result is False

    @pytest.mark.asyncio
    async def test_get_company_license_features_returns_empty_without_features_row(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        license_execute = Mock(data=[{"license_id": "license-1"}])
        features_execute = Mock(data=None)

        def mock_table(table_name):
            table_mock = MagicMock()
            if table_name == "company_licenses":
                table_mock.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute = AsyncMock(return_value=license_execute)
            else:
                table_mock.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=features_execute)
            return table_mock

        mock_client.table.side_effect = mock_table

        result = await service.get_company_license_features("company-1")

        assert result == {}

    @pytest.mark.asyncio
    async def test_download_pdf_coerces_bytearray_response(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        mock_client.storage.from_.return_value.download = AsyncMock(return_value=bytearray(b"pdf"))

        result = await service.download_pdf("manual.pdf")

        assert result == b"pdf"

    @pytest.mark.asyncio
    async def test_get_unclassified_sessions_returns_data_or_empty_list(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=[{"id": "session-1"}])
        mock_client.rpc.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.get_unclassified_sessions(limit=3)

        assert result == [{"id": "session-1"}]
        mock_client.rpc.assert_called_once_with("get_unclassified_sessions", {"p_limit": 3})

    @pytest.mark.asyncio
    async def test_get_session_messages_returns_ordered_data(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=[{"role": "user", "content": "Hi"}])
        mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.get_session_messages("session-1")

        assert result == [{"role": "user", "content": "Hi"}]

    @pytest.mark.asyncio
    async def test_update_session_classification_calls_rpc(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        mock_client.rpc.return_value.execute = AsyncMock()

        await service.update_session_classification(
            "session-1",
            label="problem",
            conclusion="Needs follow up",
            theme_id="theme-1",
            error_message="warning",
        )

        mock_client.rpc.assert_called_once_with(
            "update_session_classification",
            {
                "p_session_id": "session-1",
                "p_label": "problem",
                "p_conclusion": "Needs follow up",
                "p_theme_id": "theme-1",
                "p_error_message": "warning",
            },
        )

    @pytest.mark.asyncio
    async def test_get_themes_needing_retitle_returns_data(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=[{"id": "theme-1"}])
        mock_client.table.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.get_themes_needing_retitle()

        assert result == [{"id": "theme-1"}]

    @pytest.mark.asyncio
    async def test_get_recent_conclusions_for_theme_filters_empty_values(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=[{"conclusion": "One"}, {"conclusion": ""}, {"other": "ignored"}])
        query_mock = MagicMock()
        mock_client.table.return_value.select.return_value = query_mock
        query_mock.eq.return_value = query_mock
        query_mock.not_.is_.return_value = query_mock
        query_mock.order.return_value = query_mock
        query_mock.limit.return_value = query_mock
        query_mock.execute = AsyncMock(return_value=execute_mock)

        result = await service.get_recent_conclusions_for_theme("theme-1", limit=5)

        assert result == ["One"]

    @pytest.mark.asyncio
    async def test_insert_theme_returns_inserted_row_or_empty_dict(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=[{"id": "theme-1"}])
        mock_client.table.return_value.insert.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.insert_theme({"label": "problem"})

        assert result == {"id": "theme-1"}

    @pytest.mark.asyncio
    async def test_update_theme_executes_update(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute = AsyncMock()
        table_mock = mock_client.table.return_value
        table_mock.update.return_value.eq.return_value.execute = execute

        await service.update_theme("theme-1", {"title": "New"})

        table_mock.update.assert_called_once_with({"title": "New"})
        execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_match_chat_themes_returns_first_match_or_none(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=[{"id": "theme-1"}])
        mock_client.rpc.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.match_chat_themes("company-1", "problem", [0.1], threshold=0.9)

        assert result == {"id": "theme-1"}
        mock_client.rpc.assert_called_once_with(
            "match_chat_themes",
            {
                "p_company_id": "company-1",
                "p_label": "problem",
                "p_embedding": [0.1],
                "p_threshold": 0.9,
            },
        )

    @pytest.mark.asyncio
    async def test_increment_theme_session_count_returns_int_or_zero(self, service_with_mock_client):
        service, mock_client = service_with_mock_client
        execute_mock = Mock(data=4)
        mock_client.rpc.return_value.execute = AsyncMock(return_value=execute_mock)

        result = await service.increment_theme_session_count("theme-1", [5, 10])

        assert result == 4

    @pytest.mark.asyncio
    async def test_sync_manuals_bucket_size_updates_bucket(self, service_with_mock_client, mock_settings):
        service, mock_client = service_with_mock_client
        mock_settings.max_manual_size_mb = 10
        mock_client.storage.update_bucket = AsyncMock()

        await service.sync_manuals_bucket_size()

        mock_client.storage.update_bucket.assert_awaited_once_with(
            "manuals",
            options={
                "allowed_mime_types": ["application/pdf"],
                "file_size_limit": 10 * 1024 * 1024,
            },
        )

    @pytest.mark.asyncio
    async def test_sync_manuals_bucket_size_handles_exception(self, service_with_mock_client, mock_settings):
        service, mock_client = service_with_mock_client
        mock_settings.max_manual_size_mb = 10
        mock_client.storage.update_bucket = AsyncMock(side_effect=Exception("storage error"))

        await service.sync_manuals_bucket_size()
