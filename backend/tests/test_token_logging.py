import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from app.services.ai_service import GoogleAIProvider, Message, MessageRole, ai_service, AIService
from app.services.rag_service import RAGService, PageText, Chunk
from app.services.analytics_service import analytics_service
from app.services.supabase_service import supabase_service

@pytest.fixture
def mock_google_provider():
    provider = GoogleAIProvider("test-api-key")
    provider.client = MagicMock()
    provider.default_model = "gemini-1.5-flash"
    return provider

@pytest.mark.asyncio
async def test_google_provider_count_tokens(mock_google_provider):
    mock_response = MagicMock()
    mock_response.total_tokens = 42
    mock_google_provider.client.aio.models.count_tokens = AsyncMock(return_value=mock_response)

    messages = [
        Message(role=MessageRole.SYSTEM, content="System prompt"),
        Message(role=MessageRole.USER, content="Hello")
    ]
    
    count = await mock_google_provider.count_tokens(messages)
    
    assert count == 42

@pytest.mark.asyncio
async def test_google_provider_chat_stream_usage_metadata(mock_google_provider):
    async def mock_generator():
        chunk = MagicMock()
        chunk.text = "Response text"
        usage = MagicMock()
        usage.prompt_token_count = 10
        usage.candidates_token_count = 5
        usage.total_token_count = 15
        chunk.usage_metadata = usage
        yield chunk

    mock_google_provider.client.aio.models.generate_content_stream = AsyncMock(return_value=mock_generator())

    usage_dict = {}
    async for _ in mock_google_provider.chat_stream([Message(role=MessageRole.USER, content="Hi")], usage_metadata=usage_dict):
        pass

    assert usage_dict.get("total_token_count") == 15

@pytest.mark.asyncio
async def test_rag_service_token_logging():
    rag = RAGService()
    
    manual_data = {
        "id": "manual-1",
        "company_id": "company-1",
        "title": "Test Manual",
        "file_path": "manuals/test.pdf"
    }
    
    # Patch the singletons and their methods
    with patch.object(supabase_service, "get_manual_admin", AsyncMock(return_value=manual_data)), \
         patch.object(supabase_service, "update_manual", AsyncMock()), \
         patch.object(supabase_service, "download_pdf", AsyncMock(return_value=b"pdf")), \
         patch.object(supabase_service, "delete_chunks", AsyncMock()), \
         patch.object(supabase_service, "store_chunks", AsyncMock()), \
         patch.object(ai_service, "count_tokens", AsyncMock(side_effect=[20, 100])), \
         patch.object(AIService, "active_provider", new_callable=PropertyMock) as mock_active_prop, \
         patch.object(analytics_service, "log_token_usage", AsyncMock()) as mock_log:
        
        # Setup the active_provider mock
        mock_provider = MagicMock()
        mock_provider.default_model = "test-model"
        mock_active_prop.return_value = mock_provider
        
        # Mock instance methods of rag
        rag.extract_text_by_page = MagicMock(return_value=([PageText(page_number=1, text="text")], 1))
        rag.generate_summary = AsyncMock(return_value=("Valid summary", 15, 5))
        rag.embed_summary = AsyncMock(return_value=([0.1]*1536, 20))
        rag.chunk_pages = MagicMock(return_value=[Chunk(chunk_index=0, content="text", metadata={})])
        rag._embed_texts = AsyncMock(return_value=([[0.1] * 1536], 100))
        
        await rag.index_manual("manual-1")

        # Wait for the async task created at the end of index_manual
        await asyncio.sleep(0.1)

        assert mock_log.called
        call_kwargs = mock_log.call_args[1]
        assert call_kwargs["company_id"] == "company-1"
        assert call_kwargs["prompt_tokens"] == 135  # 15(summary prompt) + 20(summary embed) + 100(chunks embed)
        assert call_kwargs["completion_tokens"] == 5
        assert call_kwargs["total_tokens"] == 140
