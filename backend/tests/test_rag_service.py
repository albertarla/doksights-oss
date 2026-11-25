
import pytest
from unittest.mock import Mock, AsyncMock, patch
from app.services.rag_service import RAGService, PageText, Chunk

class TestRAGService:
    @pytest.fixture
    def rag_service(self):
        with patch("app.services.rag_service.settings") as mock_settings:
            mock_settings.embedding_model = "test-model"
            mock_settings.embedding_dimensions = 4
            mock_settings.rag_chunk_size = 10
            mock_settings.rag_chunk_overlap = 2
            mock_settings.rag_top_k = 2
            mock_settings.rag_max_context_chars = 100
            
            service = RAGService()
            return service

    def test_normalize_text(self, rag_service):
        text = "Hello   world\n\n\nHow are\r\nyou?"
        normalized = rag_service._normalize_text(text)
        assert normalized == "Hello world\n\nHow are\nyou?"

    def test_split_text_simple(self, rag_service):
        text = "1234567890"
        chunks = rag_service._split_text(text)
        assert len(chunks) == 1
        assert chunks[0] == "1234567890"

    def test_split_text_with_overlap(self, rag_service):
        # chunk_size=10, overlap=2, step=8
        text = "1234567890abcdefghij"
        # 0: "1234567890" (0-10)
        # 8: "90abcdefgh" (8-18)
        # 16: "ghij" (16-20)
        chunks = rag_service._split_text(text)
        assert len(chunks) == 3
        assert chunks[0] == "1234567890"
        assert chunks[1] == "90abcdefgh"
        assert chunks[2] == "ghij"

    def test_chunk_pages(self, rag_service):
        pages = [
            PageText(page_number=1, text="Page 1 content"),
            PageText(page_number=2, text="Page 2 content")
        ]
        
        # Mock split_text to return predictable chunks
        rag_service._split_text = Mock(side_effect=[["p1_c1", "p1_c2"], ["p2_c1"]])
        
        chunks = rag_service.chunk_pages(pages)
        
        assert len(chunks) == 3
        assert chunks[0].content == "p1_c1"
        assert chunks[0].metadata["page_start"] == 1
        assert chunks[2].content == "p2_c1"
        assert chunks[2].metadata["page_start"] == 2
        
    @pytest.mark.asyncio
    async def test_index_manual_success(self, rag_service):
        with patch("app.services.rag_service.supabase_service") as mock_supabase, \
             patch("app.services.rag_service.ai_service") as mock_ai:
             
            # Setup mocks
            # Fix: get_manual_owned is async, so it must return an awaitable or be an AsyncMock that returns a value
            mock_supabase.get_manual_owned = AsyncMock(return_value={"id": "man-1", "file_path": "path.pdf"})
            mock_supabase.update_manual = AsyncMock()
            mock_supabase.download_pdf = AsyncMock(return_value=b"%PDF-1.4...")
            mock_supabase.delete_chunks = AsyncMock()
            mock_supabase.store_chunks = AsyncMock()
            
            # Mock extraction (so we don't need real PDF)
            rag_service.extract_text_by_page = Mock(return_value=([PageText(1, "content")], 1))
            rag_service.chunk_pages = Mock(return_value=[Chunk(0, "content", {},)])
            
            # Mock embedding
            mock_ai.embed_texts = AsyncMock(return_value=([[0.1, 0.2, 0.3, 0.4]], 100))
            
            await rag_service.index_manual("man-1", "user-1")
            
            # Verify interactions
            mock_supabase.update_manual.assert_called() # Check status updates
            mock_supabase.delete_chunks.assert_called_with("man-1")
            mock_supabase.store_chunks.assert_called_once()
            
            # Check what was stored
            stored_calls = mock_supabase.store_chunks.call_args[0][0]
            assert len(stored_calls) == 1
            assert stored_calls[0]["embedding"] == [0.1, 0.2, 0.3, 0.4]
            
    @pytest.mark.asyncio
    async def test_index_web_manual_success(self, rag_service):
        with patch("app.services.rag_service.supabase_service") as mock_supabase, \
             patch("app.services.rag_service.ai_service") as mock_ai:
             
            # Setup mocks
            mock_supabase.get_manual_owned = AsyncMock(return_value={
                "id": "man-1", 
                "manual_type": "web",
                "title": "Web Manual"
            })
            mock_supabase.get_manual_sections = AsyncMock(return_value=[
                {"title": "Section 1", "content": "Content 1"},
                {"title": "Section 2", "content": "Content 2"}
            ])
            mock_supabase.update_manual = AsyncMock()
            mock_supabase.delete_chunks = AsyncMock()
            mock_supabase.store_chunks = AsyncMock()
            
            # Mock chunking - ensure 2 chunks to match our 2 sections
            # We don't need to mock chunk_pages because we are in web mode branch
            
            # Mock embedding - provide 2 embeddings for 2 chunks
            mock_ai.embed_texts = AsyncMock(return_value=([[0.1, 0.2, 0.3, 0.4], [0.5, 0.6, 0.7, 0.8]], 100))
            
            # Mock generate_summary to avoid await error
            rag_service.generate_summary = AsyncMock(return_value=("Test Summary", 50, 20))
            
            await rag_service.index_manual("man-1", "user-1")
            
            # Verify interactions
            mock_supabase.get_manual_sections.assert_called_with("man-1")
            mock_supabase.update_manual.assert_called()
            mock_supabase.store_chunks.assert_called_once()
            
            # Check what was stored
            stored_calls = mock_supabase.store_chunks.call_args[0][0]
            assert len(stored_calls) == 2
            assert stored_calls[0]["embedding"] == [0.1, 0.2, 0.3, 0.4]
            assert stored_calls[1]["embedding"] == [0.5, 0.6, 0.7, 0.8]
            
            # Check that it didn't try to download PDF
            mock_supabase.download_pdf.assert_not_called()

