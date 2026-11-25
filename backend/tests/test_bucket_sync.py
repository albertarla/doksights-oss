"""
Tests for Supabase manuals storage bucket size limit synchronization.
"""

import pytest
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from app.services.supabase_service import SupabaseService


@pytest.mark.asyncio
async def test_sync_manuals_bucket_size_success(mock_settings):
    """Test that sync_manuals_bucket_size updates the bucket limit correctly."""
    # Ensure our custom setting is available on mock_settings
    mock_settings.max_manual_size_mb = 15

    # Mock the Supabase client and storage methods
    mock_client = MagicMock()
    mock_storage = MagicMock()
    mock_client.storage = mock_storage
    mock_storage.update_bucket = AsyncMock()

    with patch("app.services.supabase_service.settings", mock_settings):
        with patch("app.services.supabase_service.create_client", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_client
            
            service = SupabaseService()
            await service.sync_manuals_bucket_size()
            
            # Assert create_client was called with correct keys
            mock_create.assert_called_once_with(
                mock_settings.supabase_url,
                mock_settings.supabase_service_key
            )
            
            # Assert update_bucket was called with the correct parameters
            expected_bytes = 15 * 1024 * 1024
            mock_storage.update_bucket.assert_called_once_with(
                "manuals",
                options={
                    "allowed_mime_types": ["application/pdf"],
                    "file_size_limit": expected_bytes,
                }
            )


@pytest.mark.asyncio
async def test_sync_manuals_bucket_size_handles_exception(mock_settings):
    """Test that sync_manuals_bucket_size gracefully handles exceptions without raising."""
    mock_settings.max_manual_size_mb = 10

    mock_client = MagicMock()
    mock_storage = MagicMock()
    mock_client.storage = mock_storage
    
    # Configure update_bucket to raise an error
    mock_storage.update_bucket = AsyncMock(side_effect=Exception("Connection failed"))

    with patch("app.services.supabase_service.settings", mock_settings):
        with patch("app.services.supabase_service.create_client", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_client
            
            service = SupabaseService()
            # This should not raise an exception, but log/print the error
            await service.sync_manuals_bucket_size()
            
            mock_storage.update_bucket.assert_called_once()
