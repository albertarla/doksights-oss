"""
Configuration settings for the backend.
"""

from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Supabase
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_jwt_secret: str = ""
    
    # AI Providers
    ai_provider: str = "google"
    openai_api_key: str = ""
    google_api_key: str = ""
    google_ai_model: str = "gemini-2.5-flash"
    openai_ai_model: str = "gpt-4o"
    embedding_model: str = "models/gemini-embedding-001"
    # 1536 is the maximum dimension that allows HNSW indexing in pgvector (limit: 2000).
    # gemini-embedding-001 supports output_dimensionality to truncate from 3072.
    embedding_dimensions: int = 1536
    
    # Application
    environment: str = "development"
    cors_origins: str | List[str] = ["http://localhost:5173", "http://localhost:8080"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | List[str]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            # Handle comma-separated strings and strip trailing colons/slashes
            return [i.strip().rstrip("/") for i in v.split(",") if i.strip()]
        elif isinstance(v, str):
            # Handle JSON list string (like in old setup)
            try:
                import json
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(i).strip().rstrip("/") for i in parsed]
            except Exception:
                pass
        elif isinstance(v, list):
            return [str(i).strip().rstrip("/") for i in v]
        raise ValueError(v)

    # RAG settings
    rag_chunk_size: int = 1200
    rag_chunk_overlap: int = 200
    rag_top_k: int = 5
    rag_max_context_chars: int = 12000

    # AI Classification settings
    classification_model: str = "gemini-2.5-flash"
    classification_batch_size: int = 50
    classification_similarity_threshold: float = 0.85
    # Comma-separated session counts that trigger theme re-titling (e.g. "5,15,50")
    retitle_milestones: str = "5,15,50"
    retitle_sample_size: int = 10
    # Set to false to turn off the background job that groups chat questions into themes
    # (it calls the AI provider, so it uses tokens).
    classification_enabled: bool = True
    # How often (in minutes) the APScheduler runs the classification pipeline
    classification_interval_minutes: int = 60
    
    # Notifications
    resend_api_key: str = ""
    resend_sender_email: str = ""
    frontend_url: str = "http://localhost:8080"
    
    # Maximum manual file size limit in MB
    max_manual_size_mb: int = 20
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def is_development(self) -> bool:
        """Returns True if the environment is set to development."""
        return self.environment.split('#')[0].strip().lower() == "development"

    @property
    def retitle_milestones_list(self) -> List[int]:
        """Parse RETITLE_MILESTONES from comma-separated string to list of ints."""
        try:
            return [int(x.strip()) for x in self.retitle_milestones.split(",") if x.strip()]
        except ValueError:
            return [5, 15, 50]

settings = Settings()