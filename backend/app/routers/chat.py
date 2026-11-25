"""
Chat Router

Handles AI chat endpoints for manual assistance.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional
import json
import asyncio

from app.auth.jwt_handler import verify_supabase_token, get_optional_user, JWTPayload
from app.services.ai_service import ai_service, Message, MessageRole, TokenQuotaExceededError
from app.services.supabase_service import supabase_service
from app.services.rag_service import rag_service
from app.services.analytics_service import analytics_service
from app.utils.rate_limiter import RateLimiter
from app.config import settings
from app.schemas.chat import ChatRequest, ChatResponse, ChatMessage

router = APIRouter(prefix="/chat", tags=["chat"])

# Rate limiter: 20 requests per minute per IP
rate_limiter = RateLimiter(requests_per_minute=20)

def build_system_prompt(
    title: Optional[str],
    description: Optional[str],
    chunks: Optional[List[dict]]
) -> str:
    """Build the system prompt with manual context."""
    
    prompt_parts = [
        "You are a helpful AI assistant for a product manual.",
        "Answer questions based on the manual content provided below.",
        "If the answer isn't in the manual, say so clearly.",
        "Be concise but thorough. Use bullet points for lists.",
        "If relevant, mention the specific section or page where information can be found.",
    ]
    
    if title:
        prompt_parts.append(f"\n## Manual Title\n{title}")
    
    if description:
        prompt_parts.append(f"\n## Manual Description\n{description}")
    
    if chunks:
        prompt_parts.append("\n## Relevant Manual Excerpts")
        total_chars = 0
        for chunk in chunks:
            metadata = chunk.get("metadata") or {}
            page_start = metadata.get("page_start")
            page_end = metadata.get("page_end")
            if page_start and page_end and page_start != page_end:
                page_label = f"Pages {page_start}-{page_end}"
            elif page_start:
                page_label = f"Page {page_start}"
            else:
                page_label = "Page unknown"
            content = chunk.get("content", "")
            remaining = settings.rag_max_context_chars - total_chars
            if remaining <= 0:
                break
            if len(content) > remaining:
                content = content[:remaining].rstrip()
            total_chars += len(content)
            prompt_parts.append(f"[{page_label}]\n{content}")
    else:
        prompt_parts.append("\n## Relevant Manual Excerpts\nNone found for this query.")
    
    return "\n".join(prompt_parts)


@router.post("/stream")
async def chat_stream(
    request: Request,
    chat_request: ChatRequest,
    user: Optional[JWTPayload] = Depends(get_optional_user)
):
    """
    Stream a chat response for a manual.
    
    Supports both authenticated users (via JWT) and public access (via link_id).
    """
    # Rate limiting by IP
    client_ip = request.client.host if request.client else "unknown"
    if rate_limiter.is_limited(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests")
    
    # Fetch manual content
    manual = None
    
    if user:
        # Authenticated user - fetch their manual
        manual = await supabase_service.get_manual(chat_request.manual_id, user.user_id)
    elif chat_request.link_id:
        # Public access via shareable link
        manual = await supabase_service.get_manual_for_public_link(
            chat_request.manual_id, 
            chat_request.link_id
        )
    else:
        # Try to get public manual by ID (e.g. for Company Portal)
        manual = await supabase_service.get_public_manual_by_id(chat_request.manual_id)
        if manual and manual.get("portal_privacy") == "private":
            raise HTTPException(
                status_code=401,
                detail="Authentication required for this portal"
            )

    if not manual:
        # If manual is not found or user has no access
        raise HTTPException(status_code=404, detail="Manual not found or access denied")

    rag_status = manual.get("rag_status")
    if rag_status != "completed":
        if rag_status == "failed":
            status_message = "This manual failed processing. Please reprocess it before asking questions."
        else:
            status_message = "This manual is still processing. Please try again in a few moments."

        async def processing_generate():
            yield f"data: {json.dumps({'content': status_message})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            processing_generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )

    # Retrieve relevant chunks for the latest user query
    query = next(
        (msg.content for msg in reversed(chat_request.messages) if msg.role == "user"),
        ""
    )
    chunks = []
    embedding_tokens = 0
    if manual.get("rag_status") == "completed" and query:
        try:
            chunks, embedding_tokens = await rag_service.get_relevant_chunks([manual["id"]], query)
        except Exception as e:
            error_msg = str(e).lower()
            if "429" in error_msg or "quota" in error_msg or "rate limit" in error_msg:
                raise HTTPException(status_code=429, detail="AI Provider rate limit exceeded. Please try again later.")
            import logging
            logging.getLogger(__name__).error(f"Chat embedding failed: {e}")
            raise HTTPException(status_code=500, detail="Failed to process document context. Please try again.")


    # Build messages with system prompt
    system_prompt = build_system_prompt(
        title=chat_request.manual_title or manual.get("title"),
        description=chat_request.manual_description or manual.get("description"),
        chunks=chunks
    )
    
    messages = [Message(role=MessageRole.SYSTEM, content=system_prompt)]
    
    for msg in chat_request.messages:
        messages.append(Message(
            role=MessageRole.USER if msg.role == "user" else MessageRole.ASSISTANT,
            content=msg.content
        ))

    # --- Token Quota Gate ---
    company_id = manual.get("company_id") if manual else None
    try:
        await ai_service.check_token_quota(company_id)
    except TokenQuotaExceededError as e:
        used_tokens = e.used
        max_tokens = e.limit
        async def quota_exceeded_stream():
            import json
            yield f"data: {json.dumps({'error': 'token_quota_exceeded', 'message': 'Your company has reached its monthly AI token limit. Ask your instance admin to raise it.', 'used_tokens': used_tokens, 'max_tokens': max_tokens})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(
            quota_exceeded_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )
    async def generate():
        full_response = ""
        usage_metadata = {}
        try:
            async for chunk in ai_service.chat_stream(messages, usage_metadata=usage_metadata):
                full_response += chunk
                yield f"data: {json.dumps({'content': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            if chat_request.session_id and manual and manual.get("company_id") and full_response:
                async def log_session():
                    try:
                        await analytics_service.log_chat_session(
                            session_id=chat_request.session_id,
                            company_id=manual.get("company_id"),
                            manual_id=manual.get("id"),
                            chat_type="standard",
                            messages=chat_request.messages,
                            ai_response=full_response
                        )
                        
                        # Process tokens
                        p_tokens = usage_metadata.get("prompt_token_count", 0)
                        c_tokens = usage_metadata.get("candidates_token_count", 0)
                        t_tokens = usage_metadata.get("total_token_count", 0)
                        
                        if not t_tokens:
                            p_tokens = await ai_service.count_tokens(messages)
                            c_tokens = await ai_service.count_tokens([Message(role=MessageRole.ASSISTANT, content=full_response)])
                            t_tokens = p_tokens + c_tokens
                        
                        # Add embedding tokens to prompt and total
                        p_tokens += embedding_tokens
                        t_tokens += embedding_tokens
                        
                        await analytics_service.log_token_usage(
                            company_id=manual.get("company_id"),
                            feature="chat_manual",
                            model=ai_service.active_provider.default_model,
                            related_id=chat_request.session_id,
                            prompt_tokens=p_tokens,
                            completion_tokens=c_tokens,
                            total_tokens=t_tokens
                        )
                    except Exception as logging_error:
                        import logging
                        logging.getLogger(__name__).error(f"Failed to log chat session and tokens: {logging_error}")
                
                asyncio.create_task(log_session())
    
    async def mock_generate():
        full_response = ""
        try:
            # DEBUG: Mock Echo Response (User requested)
            last_message = chat_request.messages[-1].content if chat_request.messages else "No message"
            
            # Stream words with small delay to simulate generation
            for word in last_message.split():
                full_response += word + " "
                yield f"data: {json.dumps({'content': word + ' '})}\n\n"
                await asyncio.sleep(0.05)
                
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            if chat_request.session_id and manual and manual.get("company_id") and full_response:
                async def log_session():
                    try:
                        await analytics_service.log_chat_session(
                            session_id=chat_request.session_id,
                            company_id=manual.get("company_id"),
                            manual_id=manual.get("id"),
                            chat_type="standard",
                            messages=chat_request.messages,
                            ai_response=full_response.strip()
                        )
                        
                        p_tokens = await ai_service.count_tokens(messages)
                        c_tokens = await ai_service.count_tokens([Message(role=MessageRole.ASSISTANT, content=full_response)])
                        # Add embedding tokens
                        p_tokens += embedding_tokens
                        
                        await analytics_service.log_token_usage(
                            company_id=manual.get("company_id"),
                            feature="chat_manual",
                            model="test",
                            related_id=chat_request.session_id,
                            prompt_tokens=p_tokens,
                            completion_tokens=c_tokens,
                            total_tokens=p_tokens + c_tokens
                        )
                    except Exception as logging_error:
                        import logging
                        logging.getLogger(__name__).error(f"Failed to log chat session and tokens (mock): {logging_error}")
                
                asyncio.create_task(log_session())

    # Select generator based on provider
    from app.config import settings
    
    response_generator = mock_generate() if settings.ai_provider == "test" else generate()

    return StreamingResponse(
        response_generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

@router.post("/", response_model=ChatResponse)
async def chat(
    request: Request,
    chat_request: ChatRequest,
    user: JWTPayload = Depends(verify_supabase_token)
):
    """
    Get a complete chat response (non-streaming).
    
    Requires authentication.
    """
    client_ip = request.client.host if request.client else "unknown"
    if rate_limiter.is_limited(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests")
    
    manual = await supabase_service.get_manual(chat_request.manual_id, user.user_id)
    
    if not manual:
        raise HTTPException(status_code=404, detail="Manual not found")

    rag_status = manual.get("rag_status")
    if rag_status != "completed":
        if rag_status == "failed":
            status_message = "This manual failed processing. Please reprocess it before asking questions."
        else:
            status_message = "This manual is still processing. Please try again in a few moments."
        return ChatResponse(content=status_message)
    
    query = next(
        (msg.content for msg in reversed(chat_request.messages) if msg.role == "user"),
        ""
    )
    chunks = []
    embedding_tokens = 0
    if manual.get("rag_status") == "completed" and query:
        chunks, embedding_tokens = await rag_service.get_relevant_chunks([manual["id"]], query)

    system_prompt = build_system_prompt(
        title=chat_request.manual_title or manual.get("title"),
        description=chat_request.manual_description or manual.get("description"),
        chunks=chunks
    )
    
    messages = [Message(role=MessageRole.SYSTEM, content=system_prompt)]
    
    for msg in chat_request.messages:
        messages.append(Message(
            role=MessageRole.USER if msg.role == "user" else MessageRole.ASSISTANT,
            content=msg.content
        ))

    # --- Token Quota Gate ---
    try:
        await ai_service.check_token_quota(manual.get("company_id"))
    except TokenQuotaExceededError as e:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "token_quota_exceeded",
                "message": "Your company has reached its monthly AI token limit. Ask your instance admin to raise it.",
                "used_tokens": e.used,
                "max_tokens": e.limit,
            }
        )

    usage_metadata = {}
    response = await ai_service.chat(messages, usage_metadata=usage_metadata)
    
    if chat_request.session_id and manual and manual.get("company_id"):
        async def log_session():
            try:
                await analytics_service.log_chat_session(
                    session_id=chat_request.session_id,
                    company_id=manual.get("company_id"),
                    manual_id=manual.get("id"),
                    chat_type="standard",
                    messages=chat_request.messages,
                    ai_response=response
                )
                
                p_tokens = usage_metadata.get("prompt_token_count", 0)
                c_tokens = usage_metadata.get("candidates_token_count", 0)
                
                if p_tokens == 0 and c_tokens == 0:
                    p_tokens = await ai_service.count_tokens(messages)
                    c_tokens = await ai_service.count_tokens([Message(role=MessageRole.ASSISTANT, content=response)])
                
                # Add embedding tokens
                p_tokens += embedding_tokens
                
                await analytics_service.log_token_usage(
                    company_id=manual.get("company_id"),
                    feature="chat_manual",
                    model=ai_service.active_provider.default_model,
                    related_id=chat_request.session_id,
                    prompt_tokens=p_tokens,
                    completion_tokens=c_tokens,
                    total_tokens=p_tokens + c_tokens
                )
            except Exception as logging_error:
                import logging
                logging.getLogger(__name__).error(f"Failed to log chat session and tokens: {logging_error}")
                
        asyncio.create_task(log_session())
    
    return ChatResponse(content=response)
