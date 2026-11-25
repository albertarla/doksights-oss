"""
Tests for the AI Service.
"""

import pytest
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from typing import AsyncIterator


class TestMessageRole:
    """Tests for the MessageRole enum."""
    
    def test_system_role_value(self):
        """Test SYSTEM role value."""
        from app.services.ai_service import MessageRole
        assert MessageRole.SYSTEM.value == "system"
    
    def test_user_role_value(self):
        """Test USER role value."""
        from app.services.ai_service import MessageRole
        assert MessageRole.USER.value == "user"
    
    def test_assistant_role_value(self):
        """Test ASSISTANT role value."""
        from app.services.ai_service import MessageRole
        assert MessageRole.ASSISTANT.value == "assistant"


class TestMessage:
    """Tests for the Message model."""
    
    def test_message_creation(self):
        """Test Message model creation."""
        from app.services.ai_service import Message, MessageRole
        
        msg = Message(role=MessageRole.USER, content="Hello")
        
        assert msg.role == MessageRole.USER
        assert msg.content == "Hello"
    
    def test_message_with_system_role(self):
        """Test Message with system role."""
        from app.services.ai_service import Message, MessageRole
        
        msg = Message(role=MessageRole.SYSTEM, content="You are a helpful assistant.")
        
        assert msg.role == MessageRole.SYSTEM
    
    def test_message_with_assistant_role(self):
        """Test Message with assistant role."""
        from app.services.ai_service import Message, MessageRole
        
        msg = Message(role=MessageRole.ASSISTANT, content="I can help you with that.")
        
        assert msg.role == MessageRole.ASSISTANT


class TestOpenAIProvider:
    """Tests for the OpenAI Provider."""
    
    @pytest.fixture
    def mock_openai_client(self):
        """Create a mock AsyncOpenAI client."""
        with patch("app.services.ai_service.settings") as mock_settings:
            mock_settings.openai_api_key = "test-key"
            mock_settings.google_api_key = ""
            
            with patch("openai.AsyncOpenAI") as mock_class:
                mock_client = AsyncMock()
                mock_class.return_value = mock_client
                yield mock_client, mock_class
    
    def test_init_creates_client(self, mock_openai_client):
        """Test that OpenAI client is created with API key."""
        mock_client, mock_class = mock_openai_client
        
        from app.services.ai_service import OpenAIProvider
        provider = OpenAIProvider("test-api-key")
        
        mock_class.assert_called_once_with(api_key="test-api-key")
    
    def test_default_model_is_gpt4o(self):
        """Test that default model is gpt-4o."""
        with patch("openai.AsyncOpenAI"):
            from app.services.ai_service import OpenAIProvider
            provider = OpenAIProvider("test-key")
            
            from app.config import settings
            assert provider.default_model == settings.openai_ai_model


class TestGoogleAIProvider:
    """Tests for the Google AI Provider."""
    
    def test_default_model_is_gemini_flash(self):
        """Test that default model is gemini-2.5-flash."""
        with patch("google.genai.Client"):
            from app.services.ai_service import GoogleAIProvider
            provider = GoogleAIProvider("test-key")
            
            from app.config import settings
            assert provider.default_model == settings.google_ai_model
    
    @pytest.mark.asyncio
    async def test_chat_stream(self):
        """Test GoogleAI chat_stream method."""

        with patch("google.genai.Client") as mock_client_cls:
            from app.services.ai_service import GoogleAIProvider, Message, MessageRole

            # Mock client instance
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client

            # Mock streaming chunks
            class MockChunk:
                def __init__(self, text):
                    self.text = text

            async def mock_stream_iter():
                yield MockChunk("Hello world")

            mock_client.aio.models.generate_content_stream = AsyncMock(return_value=mock_stream_iter())

            provider = GoogleAIProvider("test-key")

            messages = [
                Message(role=MessageRole.SYSTEM, content="You are helpful"),
                Message(role=MessageRole.USER, content="Hi"),
            ]

            chunks = []
            async for chunk in provider.chat_stream(messages):
                chunks.append(chunk)

            assert chunks == ["Hello world"]
    
    @pytest.mark.asyncio
    async def test_chat_method(self):
        """Test GoogleAI chat method (non-streaming aggregation)."""

        from app.services.ai_service import GoogleAIProvider, Message, MessageRole

        provider = GoogleAIProvider("test-key")

        # Mock chat_stream to simulate streaming output
        async def mock_stream(*args, **kwargs):
            yield "Hello"
            yield " "
            yield "world"

        provider.chat_stream = mock_stream

        messages = [Message(role=MessageRole.USER, content="Hi")]
        result = await provider.chat(messages)

        assert result == "Hello world"


class TestOpenAIProviderMethods:
    """Tests for OpenAI Provider chat methods."""
    
    @pytest.mark.asyncio
    async def test_chat_stream(self):
        """Test OpenAI chat_stream method."""
        with patch("openai.AsyncOpenAI") as mock_class:
            from app.services.ai_service import OpenAIProvider, Message, MessageRole
            
            mock_client = AsyncMock()
            mock_class.return_value = mock_client
            
            # Create mock streaming response
            class MockDelta:
                content = "Hello"
            
            class MockChoice:
                delta = MockDelta()
            
            class MockChunk:
                choices = [MockChoice()]
            
            async def mock_response():
                yield MockChunk()
            
            mock_client.chat.completions.create = AsyncMock(return_value=mock_response())
            
            provider = OpenAIProvider("test-key")
            messages = [Message(role=MessageRole.USER, content="Hi")]
            
            chunks = []
            async for chunk in provider.chat_stream(messages):
                chunks.append(chunk)
            
            assert "Hello" in chunks
    
    @pytest.mark.asyncio
    async def test_chat_method(self):
        """Test OpenAI chat method (non-streaming)."""
        with patch("openai.AsyncOpenAI") as mock_class:
            from app.services.ai_service import OpenAIProvider, Message, MessageRole
            
            mock_client = AsyncMock()
            mock_class.return_value = mock_client
            
            # Create mock response
            class MockMessage:
                content = "Hello from OpenAI"
            
            class MockChoice:
                message = MockMessage()
            
            class MockResponse:
                choices = [MockChoice()]
            
            mock_client.chat.completions.create = AsyncMock(return_value=MockResponse())
            
            provider = OpenAIProvider("test-key")
            messages = [Message(role=MessageRole.USER, content="Hi")]
            
            result = await provider.chat(messages)
            
            assert result == "Hello from OpenAI"


class TestAIServiceInit:
    """Tests for AIService initialization."""
    
    def test_init_with_no_providers(self):
        """Test initialization when no API keys are configured."""
        mock_settings = Mock()
        mock_settings.openai_api_key = ""
        mock_settings.google_api_key = ""
        
        with patch("app.services.ai_service.settings", mock_settings):
            from app.services.ai_service import AIService
            service = AIService()
            
            assert len(service.providers) == 0
    
    def test_init_with_openai_key(self):
        """Test initialization with OpenAI key configured."""
        mock_settings = Mock()
        mock_settings.openai_api_key = "test-openai-key"
        mock_settings.google_api_key = ""
        
        with patch("app.services.ai_service.settings", mock_settings):
            with patch("openai.AsyncOpenAI"):
                from app.services.ai_service import AIService
                service = AIService()
                
                assert "openai" in service.providers
    
    def test_init_with_google_key(self):
        """Test initialization with Google key configured."""
        mock_settings = Mock()
        mock_settings.openai_api_key = ""
        mock_settings.google_api_key = "test-google-key"
        
        with patch("app.services.ai_service.settings", mock_settings):
            with patch("google.genai.Client"):
                from app.services.ai_service import AIService
                service = AIService()
                
                assert "google" in service.providers
    
    def test_active_provider_preference_comes_from_settings(self):
        """Test that the active provider preference is read from settings."""
        mock_settings = Mock()
        mock_settings.openai_api_key = ""
        mock_settings.google_api_key = ""
        mock_settings.ai_provider = "google"
        
        with patch("app.services.ai_service.settings", mock_settings):
            from app.services.ai_service import AIService
            service = AIService()
            
            assert service._active_provider == "google"


class TestAIServiceActiveProvider:
    """Tests for the active_provider property."""
    
    def test_active_provider_returns_correct_provider(self):
        """Test that active_provider returns the configured provider."""
        mock_settings = Mock()
        mock_settings.openai_api_key = "test-key"
        mock_settings.google_api_key = ""
        
        with patch("app.services.ai_service.settings", mock_settings):
            with patch("openai.AsyncOpenAI"):
                from app.services.ai_service import AIService, OpenAIProvider
                service = AIService()
                service._active_provider = "openai"
                
                provider = service.active_provider
                
                assert isinstance(provider, OpenAIProvider)
    
    def test_active_provider_falls_back_to_first_available(self):
        """Test fallback when active provider not in providers dict."""
        mock_settings = Mock()
        mock_settings.openai_api_key = "test-key"
        mock_settings.google_api_key = ""
        
        with patch("app.services.ai_service.settings", mock_settings):
            with patch("openai.AsyncOpenAI"):
                from app.services.ai_service import AIService
                service = AIService()
                # Set to a non-existent provider
                service._active_provider = "nonexistent"
                
                # Should fall back to first available (openai)
                provider = service.active_provider
                
                assert provider is not None
    
    def test_active_provider_raises_when_no_providers(self):
        """Test that RuntimeError is raised when no providers configured."""
        from app.services.ai_service import AIService
        
        # Create service and directly clear providers to simulate no providers
        service = AIService()
        service.providers = {}  # Clear all providers
        
        with pytest.raises(RuntimeError, match="No AI providers configured"):
            _ = service.active_provider


class TestAIServiceSetProvider:
    """Tests for the set_provider method."""
    
    def test_set_provider_valid(self):
        """Test setting a valid provider."""
        mock_settings = Mock()
        mock_settings.openai_api_key = "test-key"
        mock_settings.google_api_key = "test-key"
        
        with patch("app.services.ai_service.settings", mock_settings):
            with patch("openai.AsyncOpenAI"):
                with patch("google.genai.Client"):
                    from app.services.ai_service import AIService
                    service = AIService()
                    
                    service.set_provider("google")
                    
                    assert service._active_provider == "google"
    
    def test_set_provider_invalid_raises(self):
        """Test that setting invalid provider raises ValueError."""
        mock_settings = Mock()
        mock_settings.openai_api_key = "test-key"
        mock_settings.google_api_key = ""
        
        with patch("app.services.ai_service.settings", mock_settings):
            with patch("openai.AsyncOpenAI"):
                from app.services.ai_service import AIService
                service = AIService()
                
                with pytest.raises(ValueError, match="not configured"):
                    service.set_provider("invalid-provider")


class TestAIServiceChat:
    """Tests for the chat method."""
    
    @pytest.mark.asyncio
    async def test_chat_delegates_to_active_provider(self):
        """Test that chat delegates to active provider."""
        mock_settings = Mock()
        mock_settings.openai_api_key = "test-key"
        mock_settings.google_api_key = ""
        
        with patch("app.services.ai_service.settings", mock_settings):
            with patch("openai.AsyncOpenAI"):
                from app.services.ai_service import AIService, Message, MessageRole
                service = AIService()
                service._active_provider = "openai"
                
                # Mock the provider's chat method
                mock_chat = AsyncMock(return_value="Test response")
                service.providers["openai"].chat = mock_chat
                
                messages = [Message(role=MessageRole.USER, content="Hello")]
                result = await service.chat(messages)
                
                mock_chat.assert_called_once()
                assert result == "Test response"


class TestAIServiceChatStream:
    """Tests for the chat_stream method."""
    
    @pytest.mark.asyncio
    async def test_chat_stream_delegates_to_active_provider(self):
        """Test that chat_stream delegates to active provider."""
        mock_settings = Mock()
        mock_settings.openai_api_key = "test-key"
        mock_settings.google_api_key = ""
        
        with patch("app.services.ai_service.settings", mock_settings):
            with patch("openai.AsyncOpenAI"):
                from app.services.ai_service import AIService, Message, MessageRole
                service = AIService()
                service._active_provider = "openai"
                
                # Mock the provider's chat_stream method
                async def mock_stream(*args, **kwargs):
                    for chunk in ["Hello", " ", "world"]:
                        yield chunk
                
                service.providers["openai"].chat_stream = mock_stream
                
                messages = [Message(role=MessageRole.USER, content="Hi")]
                chunks = []
                async for chunk in service.chat_stream(messages):
                    chunks.append(chunk)
                
                assert chunks == ["Hello", " ", "world"]


class TestProviderEmbeddings:
    """Tests for embedding methods in various providers."""

    @pytest.mark.asyncio
    async def test_google_embed_texts(self):
        """Test GoogleAI embed_texts with token counting."""
        with patch("google.genai.Client") as mock_client_cls:
            from app.services.ai_service import GoogleAIProvider
            
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            
            # Mock count_tokens
            mock_client.aio.models.count_tokens = AsyncMock(return_value=Mock(total_tokens=10))
            
            # Mock embed_content
            mock_response = MagicMock()
            mock_response.embeddings = [Mock(values=[0.1, 0.2])]
            mock_client.aio.models.embed_content = AsyncMock(return_value=mock_response)
            
            provider = GoogleAIProvider("test-key")
            embeddings, tokens = await provider.embed_texts(["test text"])
            
            assert tokens == 10
            assert embeddings == [[0.1, 0.2]]
            mock_client.aio.models.count_tokens.assert_called_once()

    @pytest.mark.asyncio
    async def test_openai_embed_texts(self):
        """Test OpenAI embed_texts with estimation."""
        with patch("openai.AsyncOpenAI") as mock_class:
            from app.services.ai_service import OpenAIProvider
            
            mock_client = AsyncMock()
            mock_class.return_value = mock_client
            
            # Mock embeddings.create
            mock_item = Mock()
            mock_item.embedding = [0.3, 0.4]
            mock_response = Mock()
            mock_response.data = [mock_item]
            mock_client.embeddings.create = AsyncMock(return_value=mock_response)
            
            provider = OpenAIProvider("test-key")
            text = "test text" # 9 chars -> 2 tokens estimated (9//4 = 2)
            embeddings, tokens = await provider.embed_texts([text])
            
            assert tokens == 2
            assert embeddings == [[0.3, 0.4]]
