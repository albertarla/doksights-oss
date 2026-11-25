"""
RAG Service

Handles PDF extraction, chunking, embeddings, and retrieval.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Dict, List, Optional, Tuple
import re

from pypdf import PdfReader

from app.config import settings
from app.services.ai_service import ai_service, Message, MessageRole, TokenQuotaExceededError
from app.services.supabase_service import supabase_service
from app.services.analytics_service import analytics_service


@dataclass
class PageText:
    page_number: int
    text: str


@dataclass
class Chunk:
    chunk_index: int
    content: str
    metadata: Dict[str, int]


class RAGService:
    """Core RAG pipeline for manuals."""

    def __init__(self) -> None:
        self.embedding_model = settings.embedding_model
        self.embedding_dimensions = settings.embedding_dimensions
        self.chunk_size = settings.rag_chunk_size
        self.chunk_overlap = settings.rag_chunk_overlap
        self.top_k = settings.rag_top_k
        self.max_context_chars = settings.rag_max_context_chars

    def _normalize_text(self, text: str) -> str:
        cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        cleaned = re.sub(r"[\t ]+", " ", cleaned)
        return cleaned.strip()

    def _split_text(self, text: str) -> List[str]:
        if not text:
            return []

        if self.chunk_size <= 0:
            return [text]

        step = max(self.chunk_size - self.chunk_overlap, 1)
        chunks: List[str] = []
        for start in range(0, len(text), step):
            end = min(start + self.chunk_size, len(text))
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            if end >= len(text):
                break
        return chunks

    def extract_text_by_page(self, pdf_bytes: bytes) -> Tuple[List[PageText], int]:
        reader = PdfReader(BytesIO(pdf_bytes))
        pages: List[PageText] = []

        for index, page in enumerate(reader.pages):
            raw_text = page.extract_text() or ""
            cleaned = self._normalize_text(raw_text)
            if cleaned:
                pages.append(PageText(page_number=index + 1, text=cleaned))

        return pages, len(reader.pages)

    def chunk_pages(self, pages: List[PageText]) -> List[Chunk]:
        chunks: List[Chunk] = []
        chunk_index = 0

        for page in pages:
            pieces = self._split_text(page.text)
            for piece in pieces:
                chunks.append(
                    Chunk(
                        chunk_index=chunk_index,
                        content=piece,
                        metadata={
                            "page_start": page.page_number,
                            "page_end": page.page_number,
                        },
                    )
                )
                chunk_index += 1

        return chunks

    async def _embed_texts(self, texts: List[str], batch_size: int = 32, task_type: str = "RETRIEVAL_DOCUMENT") -> tuple[List[List[float]], int]:
        embeddings: List[List[float]] = []
        total_tokens = 0
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            batch_embeddings, tokens = await ai_service.embed_texts(batch, model=self.embedding_model, task_type=task_type)
            embeddings.extend(batch_embeddings)
            total_tokens += tokens
        return embeddings, total_tokens

    def _validate_embedding_dimensions(self, embeddings: List[List[float]]) -> None:
        for embedding in embeddings:
            if len(embedding) != self.embedding_dimensions:
                raise RuntimeError(
                    f"Embedding dimension mismatch. Expected {self.embedding_dimensions}, got {len(embedding)}"
                )
    
    async def generate_summary(self, title: str, pages: List[PageText]) -> str:
        """
        Generate a concise summary of the manual for discovery purposes.
        
        Strategy:
        1. Extract first 3 pages + last page (usually contains intro/conclusion)
        2. Truncate to ~4000 chars to fit in AI context
        3. Prompt AI to generate 2-3 paragraph summary
        """
        # Combine first 3 pages and last page
        summary_pages = pages[:3]
        if len(pages) > 3:
            summary_pages.append(pages[-1])
        
        # Combine text from selected pages
        combined_text = "\n\n".join([p.text for p in summary_pages])
        
        # Truncate to max 4000 chars
        max_chars = 4000
        if len(combined_text) > max_chars:
            combined_text = combined_text[:max_chars] + "..."
        
        # Build prompt
        prompt = f"""Analyze this manual and provide a 2-3 paragraph summary covering:
- What product/service this manual is for
- Key topics covered (installation, troubleshooting, features, etc.)
- Target audience (end users, technicians, administrators, etc.)

Manual Title: {title}

Manual Content (excerpt):
{combined_text}

Provide a concise, informative summary:"""
        
        # Call AI service
        messages = [
            Message(role=MessageRole.SYSTEM, content="You are a helpful assistant that summarizes technical manuals."),
            Message(role=MessageRole.USER, content=prompt)
        ]
        
        usage_metadata = {}
        summary = await ai_service.chat(messages, model=None, usage_metadata=usage_metadata)  # Use default model
        
        prompt_t = usage_metadata.get("prompt_token_count", 0)
        completion_t = usage_metadata.get("candidates_token_count", 0)
        
        return summary.strip(), prompt_t, completion_t
    
    async def embed_summary(self, summary: str) -> tuple[List[float], int]:
        """
        Generate embedding for a manual summary.
        Uses the same embedding model as chunks for consistency.
        Uses RETRIEVAL_DOCUMENT task type since summaries are indexed documents.
        """
        embeddings, tokens = await self._embed_texts([summary], task_type="RETRIEVAL_DOCUMENT")
        if not embeddings:
            raise RuntimeError("Failed to generate summary embedding")
        return embeddings[0], tokens

    async def index_manual(self, manual_id: str, user_id: Optional[str] = None) -> None:
        manual = (
            await supabase_service.get_manual_owned(manual_id, user_id)
            if user_id
            else await supabase_service.get_manual_admin(manual_id)
        )

        if not manual:
            raise RuntimeError("Manual not found or access denied")

        try:
            await supabase_service.update_manual(
                manual_id,
                {
                    "rag_status": "processing",
                    "rag_error": None,
                    "extraction_status": "processing",
                },
            )

            # --- Token Quota Gate ---
            if manual.get("company_id"):
                try:
                    await ai_service.check_token_quota(manual["company_id"])
                except TokenQuotaExceededError:
                    await supabase_service.update_manual(
                        manual_id,
                        {
                            "rag_status": "failed",
                            "rag_error": "AI token limit reached. Ask your instance admin to raise it to continue indexing manuals.",
                            "extraction_status": "failed",
                        },
                    )
                    print(f"[RAG] Quota exceeded for company {manual['company_id']} — indexing blocked.")
                    return

            # --- Extraction & Chunking based on type ---
            manual_type = manual.get("manual_type", "pdf")
            chunks = []
            page_count = 0
            
            if manual_type == "web":
                # Web Manual Processing
                sections = await supabase_service.get_manual_sections(manual_id)
                page_count = len(sections)
                
                # We need PageText equivalents for generate_summary
                pages = []
                chunk_index = 0
                for i, section in enumerate(sections):
                    title = section.get("title", f"Section {i+1}")
                    content_raw = section.get("content", "")
                    # Simple markdown stripping (could be improved)
                    content_clean = self._normalize_text(content_raw)
                    if content_clean:
                        pages.append(PageText(page_number=i+1, text=f"{title}\n{content_clean}"))
                        
                        # Chunking
                        pieces = self._split_text(content_clean)
                        for piece in pieces:
                            chunks.append(
                                Chunk(
                                    chunk_index=chunk_index,
                                    content=f"{title}\n{piece}",
                                    metadata={
                                        "section_id": section.get("id"),
                                        "section_title": title,
                                        "display_order": section.get("display_order", i)
                                    },
                                )
                            )
                            chunk_index += 1
            else:
                # PDF Manual Processing
                pdf_bytes = await supabase_service.download_pdf(manual["file_path"])
                pages, page_count = self.extract_text_by_page(pdf_bytes)
                chunks = self.chunk_pages(pages)
            
            # Generate summary and embedding for discovery
            summary = None
            summary_embedding = None
            total_prompt_tokens = 0
            total_completion_tokens = 0
            
            try:
                summary, sm_prompt_tokens, sm_comp_tokens = await self.generate_summary(manual.get("title", "Untitled"), pages)
                total_prompt_tokens += sm_prompt_tokens
                total_completion_tokens += sm_comp_tokens
                
                sum_embedding, sum_tokens = await self.embed_summary(summary)
                summary_embedding = sum_embedding
                total_prompt_tokens += sum_tokens
                print(f"✅ Generated summary for manual {manual_id} ({len(summary)} chars)")
            except Exception as e:
                print(f"⚠️  Failed to generate summary for manual {manual_id}: {str(e)[:200]}")
                # Continue with chunking even if summary fails

            if not chunks:
                await supabase_service.update_manual(
                    manual_id,
                    {
                        "rag_status": "failed",
                        "rag_error": "No content to index",
                        "extraction_status": "failed",
                    },
                )
                return

            embeddings, chunk_tokens = await self._embed_texts([chunk.content for chunk in chunks])
            if len(embeddings) != len(chunks):
                raise RuntimeError("Embedding count does not match chunk count")

            total_prompt_tokens += chunk_tokens

            self._validate_embedding_dimensions(embeddings)

            await supabase_service.delete_chunks(manual_id)

            chunk_rows = []
            for chunk, embedding in zip(chunks, embeddings):
                chunk_rows.append(
                    {
                        "manual_id": manual_id,
                        "chunk_index": chunk.chunk_index,
                        "content": chunk.content,
                        "embedding": embedding,
                        "metadata": chunk.metadata,
                    }
                )

            await supabase_service.store_chunks(chunk_rows)

            # Update manual with completion status and summary
            update_data = {
                "rag_status": "completed",
                "extraction_status": "completed",
                "rag_error": None,
                "page_count": page_count,
            }
            
            # Add summary if generated successfully
            if summary:
                update_data["summary"] = summary
            if summary_embedding:
                update_data["summary_embedding"] = summary_embedding
            
            await supabase_service.update_manual(manual_id, update_data)
            
            # Log all token usage
            if manual.get("company_id"):
                import asyncio
                asyncio.create_task(
                    analytics_service.log_token_usage(
                        company_id=manual.get("company_id"),
                        feature="manual_indexing",
                        model=self.embedding_model,
                        related_id=manual_id,
                        prompt_tokens=total_prompt_tokens,
                        completion_tokens=total_completion_tokens,
                        total_tokens=total_prompt_tokens + total_completion_tokens
                    )
                )
        except Exception as exc:
            error_message = str(exc)
            
            # Check if this is a quota/rate limit error
            is_quota_error = (
                "429" in error_message or 
                "RESOURCE_EXHAUSTED" in error_message or
                "quota" in error_message.lower() or
                "rate limit" in error_message.lower()
            )
            
            if is_quota_error:
                print("=" * 80)
                print("⚠️  API QUOTA EXCEEDED")
                print("=" * 80)
                print(f"Manual ID: {manual_id}")
                print(f"Error: {error_message[:500]}")
                print("=" * 80)
                print("TODO: Create AI limits and quota page on company dashboard")
                print("=" * 80)
                error_message = "AI provider quota exceeded. Please try again later or check your provider's billing."
            else:
                print(f"❌ RAG indexing failed for manual {manual_id}: {error_message[:200]}")
            
            # Truncate error message for database storage
            if len(error_message) > 500:
                error_message = error_message[:500]
                
            await supabase_service.update_manual(
                manual_id,
                {
                    "rag_status": "failed",
                    "rag_error": error_message,
                    "extraction_status": "failed",
                },
            )
            # Don't re-raise - let the background task complete gracefully

    async def get_relevant_chunks(
        self,
        manual_ids: List[str],
        query: str,
        top_k: Optional[int] = None,
    ) -> tuple[List[Dict[str, object]], int]:
        if not manual_ids or not query:
            return [], 0

        embedding, tokens = await ai_service.embed_query(query, model=self.embedding_model, task_type="RETRIEVAL_QUERY")
        if len(embedding) != self.embedding_dimensions:
            raise RuntimeError(
                f"Embedding dimension mismatch. Expected {self.embedding_dimensions}, got {len(embedding)}"
            )

        chunks = await supabase_service.search_similar_chunks(
            manual_ids=manual_ids,
            embedding=embedding,
            limit=top_k or self.top_k,
        )
        return chunks, tokens


rag_service = RAGService()
