"""
AI Service

Provides a unified interface for interacting with different AI providers.
Supports OpenAI, Anthropic, and Google AI.
"""

from abc import ABC, abstractmethod
from typing import AsyncIterator, List, Optional
from pydantic import BaseModel
from enum import Enum

from app.config import settings

# ---------------------------------------------------------------------------
# Token Quota Configuration
# ---------------------------------------------------------------------------

# Day of month on which the AI token quota period resets (1 = 1st of each month).
# Change this constant to adjust the billing cycle reset day. Valid range: 1-28.
TOKEN_QUOTA_RESET_DAY: int = 1


class TokenQuotaExceededError(Exception):
    """
    Raised when a company has exhausted its monthly AI token quota.
    Callers should convert this to HTTP 402 (Payment Required).
    """

    def __init__(self, used: int, limit: int, company_id: str = "") -> None:
        self.used = used
        self.limit = limit
        self.company_id = company_id
        super().__init__(
            f"Monthly AI token quota exceeded ({used:,}/{limit:,} tokens used). "
            "Ask your instance admin to raise the limit."
        )



class MessageRole(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class Message(BaseModel):
    role: MessageRole
    content: str


class AIProvider(ABC):
    """Abstract base class for AI providers."""
    
    @abstractmethod
    async def chat_stream(
        self, 
        messages: List[Message], 
        model: Optional[str] = None,
        usage_metadata: Optional[dict] = None
    ) -> AsyncIterator[str]:
        """Stream a chat completion response."""
        pass
    
    @abstractmethod
    async def count_tokens(
        self,
        messages: List[Message],
        model: Optional[str] = None
    ) -> int:
        """Count tokens natively using the provider API. Returns total tokens."""
        pass
    
    @abstractmethod
    async def chat(
        self, 
        messages: List[Message], 
        model: Optional[str] = None,
        usage_metadata: Optional[dict] = None
    ) -> str:
        """Get a complete chat response."""
        pass

    @abstractmethod
    async def embed_texts(
        self,
        texts: List[str],
        model: Optional[str] = None,
        task_type: Optional[str] = None
    ) -> tuple[List[List[float]], int]:
        """Generate embeddings for a batch of texts. Returns (embeddings, token_count)."""
        pass

    @abstractmethod
    async def embed_query(
        self,
        text: str,
        model: Optional[str] = None,
        task_type: Optional[str] = None
    ) -> tuple[List[float], int]:
        """Generate an embedding for a single query. Returns (embedding, token_count)."""
        pass

class GoogleAIProvider(AIProvider):
    """Google AI (Gemini) provider."""
    
    def __init__(self, api_key: str):
        from google import genai
        self.client = genai.Client(api_key=api_key)
        self.default_model = settings.google_ai_model
        self.default_embedding_model = settings.embedding_model
    
    async def chat_stream(
        self, 
        messages: List[Message], 
        model: Optional[str] = None,
        usage_metadata: Optional[dict] = None
    ) -> AsyncIterator[str]:

        contents = []
        system_prompt = None

        for msg in messages:
            if msg.role == MessageRole.SYSTEM:
                system_prompt = msg.content
            else:
                contents.append({
                    "role": "user" if msg.role == MessageRole.USER else "model",
                    "parts": [{"text": msg.content}]
                })

        # Prepend system prompt as user instruction
        if system_prompt:
            contents.insert(0, {
                "role": "user",
                "parts": [{"text": system_prompt}]
            })

        response = await self.client.aio.models.generate_content_stream(
            model=model or self.default_model,
            contents=contents,
        )

        async for chunk in response:
            if usage_metadata is not None and getattr(chunk, "usage_metadata", None):
                usage = chunk.usage_metadata
                usage_metadata["prompt_token_count"] = getattr(usage, "prompt_token_count", 0)
                usage_metadata["candidates_token_count"] = getattr(usage, "candidates_token_count", 0)
                usage_metadata["total_token_count"] = getattr(usage, "total_token_count", 0)

            if chunk.text:
                yield chunk.text
    
    async def count_tokens(
        self,
        messages: List[Message],
        model: Optional[str] = None
    ) -> int:
        contents = []
        system_prompt = None

        for msg in messages:
            if msg.role == MessageRole.SYSTEM:
                system_prompt = msg.content
            else:
                contents.append({
                    "role": "user" if msg.role == MessageRole.USER else "model",
                    "parts": [{"text": msg.content}]
                })

        if system_prompt:
            contents.insert(0, {
                "role": "user",
                "parts": [{"text": system_prompt}]
            })

        response = await self.client.aio.models.count_tokens(
            model=model or self.default_model,
            contents=contents
        )
        return getattr(response, "total_tokens", 0)
    
    async def chat(
        self, 
        messages: List[Message], 
        model: Optional[str] = None,
        usage_metadata: Optional[dict] = None
    ) -> str:
        result = []
        async for chunk in self.chat_stream(messages, model, usage_metadata):
            result.append(chunk)
        return "".join(result)

    async def embed_texts(
        self,
        texts: List[str],
        model: Optional[str] = None,
        task_type: Optional[str] = None
    ) -> tuple[List[List[float]], int]:
        if not texts:
            return [], 0

        # Count tokens for the batch
        # For embeddings, we just wrap the texts in a dummy user message for counting
        # This matches how they are processed by the embedding model
        token_count = 0
        try:
            token_count = await self.count_tokens(
                [Message(role=MessageRole.USER, content=t) for t in texts],
                model=model
            )
        except Exception:
            # Fallback estimation if count_tokens fails
            token_count = sum(len(t) // 4 for t in texts)

        embedding_model = model or self.default_embedding_model
        embed_config = {"task_type": task_type or "RETRIEVAL_DOCUMENT"}

        # Enforce output dimensionality so stored vectors always match the DB column.
        dimensions = getattr(settings, "embedding_dimensions", None)
        if dimensions and dimensions < 3072:
            embed_config["output_dimensionality"] = dimensions

        response = await self.client.aio.models.embed_content(
            model=embedding_model,
            contents=texts,
            config=embed_config,
        )

        embeddings = []
        if hasattr(response, "embeddings"):
            for item in response.embeddings:
                values = getattr(item, "values", None)
                if values is None:
                    raise RuntimeError("Embedding response missing values")
                embeddings.append(list(values))
        elif hasattr(response, "embedding"):
            values = getattr(response.embedding, "values", None)
            if values is None:
                raise RuntimeError("Embedding response missing values")
            embeddings.append(list(values))
        else:
            raise RuntimeError("Embedding response missing embeddings")

        return embeddings, token_count

    async def embed_query(
        self,
        text: str,
        model: Optional[str] = None,
        task_type: Optional[str] = None
    ) -> tuple[List[float], int]:
        embeddings, tokens = await self.embed_texts([text], model, task_type=task_type or "RETRIEVAL_QUERY")
        if not embeddings:
            raise RuntimeError("No embedding returned for query")
        return embeddings[0], tokens


class OpenAIProvider(AIProvider):
    """OpenAI API provider."""
    
    def __init__(self, api_key: str):
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=api_key)
        self.default_model = settings.openai_ai_model
        self.default_embedding_model = settings.embedding_model
    
    async def chat_stream(
        self, 
        messages: List[Message], 
        model: Optional[str] = None,
        usage_metadata: Optional[dict] = None
    ) -> AsyncIterator[str]:
        response = await self.client.chat.completions.create(
            model=model or self.default_model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            stream=True
        )
        
        async for chunk in response:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    
    async def chat(
        self, 
        messages: List[Message], 
        model: Optional[str] = None,
        usage_metadata: Optional[dict] = None
    ) -> str:
        response = await self.client.chat.completions.create(
            model=model or self.default_model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
        )
        if usage_metadata is not None and getattr(response, "usage", None):
            usage = response.usage
            usage_metadata["prompt_token_count"] = usage.prompt_tokens
            usage_metadata["candidates_token_count"] = usage.completion_tokens
            usage_metadata["total_token_count"] = usage.total_tokens
        return response.choices[0].message.content

    async def count_tokens(
        self,
        messages: List[Message],
        model: Optional[str] = None
    ) -> int:
        # Not supported natively here right now, fallback to 0
        return 0

    async def embed_texts(
        self,
        texts: List[str],
        model: Optional[str] = None
    ) -> tuple[List[List[float]], int]:
        if not texts:
            return [], 0

        response = await self.client.embeddings.create(
            model=model or self.default_embedding_model,
            input=texts,
        )

        # Estimate tokens as per user instruction (not implemented natively yet)
        token_count = sum(len(t) // 4 for t in texts)
        return [list(item.embedding) for item in response.data], token_count

    async def embed_query(
        self,
        text: str,
        model: Optional[str] = None
    ) -> tuple[List[float], int]:
        embeddings, tokens = await self.embed_texts([text], model)
        if not embeddings:
            raise RuntimeError("No embedding returned for query")
        return embeddings[0], tokens

class AIService:
    """
    Main AI service that manages provider selection and provides a unified interface.
    """
    
    def __init__(self):
        self.providers: dict[str, AIProvider] = {}
        self._active_provider: str = settings.ai_provider
        
        # Initialize available providers based on configured API keys
        if settings.openai_api_key:
            self.providers["openai"] = OpenAIProvider(settings.openai_api_key)
        
        if settings.google_api_key:
            self.providers["google"] = GoogleAIProvider(settings.google_api_key)

    
    @property
    def active_provider(self) -> AIProvider:
        if self._active_provider not in self.providers:
            # Fallback to first available provider
            if not self.providers:
                raise RuntimeError("No AI providers configured")
            self._active_provider = list(self.providers.keys())[0]
        return self.providers[self._active_provider]
    
    def set_provider(self, name: str):
        if name not in self.providers:
            raise ValueError(f"Provider {name} not configured")
        self._active_provider = name
    
    async def chat_stream(
        self, 
        messages: List[Message], 
        model: Optional[str] = None,
        usage_metadata: Optional[dict] = None
    ) -> AsyncIterator[str]:
        async for chunk in self.active_provider.chat_stream(messages, model, usage_metadata):
            yield chunk
    
    async def chat(
        self, 
        messages: List[Message], 
        model: Optional[str] = None,
        usage_metadata: Optional[dict] = None
    ) -> str:
        return await self.active_provider.chat(messages, model, usage_metadata)

    async def embed_texts(
        self,
        texts: List[str],
        model: Optional[str] = None,
        task_type: Optional[str] = None
    ) -> tuple[List[List[float]], int]:
        return await self.active_provider.embed_texts(texts, model, task_type=task_type)

    async def embed_query(
        self,
        text: str,
        model: Optional[str] = None,
        task_type: Optional[str] = None
    ) -> tuple[List[float], int]:
        return await self.active_provider.embed_query(text, model, task_type=task_type)

    async def count_tokens(
        self,
        messages: List[Message],
        model: Optional[str] = None
    ) -> int:
        return await self.active_provider.count_tokens(messages, model)

    async def check_token_quota(self, company_id: Optional[str]) -> None:
        """
        Check whether the company has remaining AI tokens for the current period.

        - If company_id is None → skip (fail-open for unresolved contexts).
        - If max_tokens is None → unlimited license, always allow.
        - If used >= max_tokens → raise TokenQuotaExceededError.
        """
        if not company_id:
            return

        from app.services.supabase_service import supabase_service  # local import to avoid circular
        used, max_tokens = await supabase_service.get_company_token_quota(
            company_id, reset_day=TOKEN_QUOTA_RESET_DAY
        )

        if max_tokens is None:
            return  # Unlimited

        if used >= max_tokens:
            raise TokenQuotaExceededError(used=used, limit=max_tokens, company_id=company_id)


# Singleton instance
ai_service = AIService()
