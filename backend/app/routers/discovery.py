"""
Discovery Chat Router

Handles AI chat for manual discovery using semantic search on summaries.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import json
import asyncio

from app.auth.jwt_handler import verify_supabase_token, get_optional_user, JWTPayload
from app.services.ai_service import ai_service, Message, MessageRole, TokenQuotaExceededError
from app.services.supabase_service import supabase_service
from app.services.analytics_service import analytics_service
from app.schemas.chat import ChatMessage

router = APIRouter(prefix="/chat", tags=["chat"])


class DiscoverRequest(BaseModel):
    messages: List[ChatMessage]
    max_recommendations: int = 5
    company_slug: Optional[str] = None  # For public portal access
    session_id: Optional[str] = None  # To track conversation history


async def find_relevant_manuals_by_user(
    user_id: str,
    query: str,
    max_results: int = 5
) -> List[dict]:
    """
    Find manuals relevant to the query for a specific user (authenticated).
    Uses semantic search on summary embeddings.
    """
    from app.services.rag_service import rag_service
    query_embedding, tokens = await rag_service.embed_summary(query)
    
    # Get user's company_id first
    db = await supabase_service.get_client()
    company_user = await db.table("company_users").select(
        "company_id"
    ).eq("user_id", user_id).eq("status", "active").maybe_single().execute()
    
    if not company_user.data:
        return []
    
    company_id = company_user.data["company_id"]
    
    result = await db.rpc(
        "match_manual_summaries_by_company",
        {
            "company_id_param": company_id,
            "query_embedding": query_embedding,
            "match_count": max_results
        }
    ).execute()
    
    return result.data or [], tokens


async def find_relevant_manuals_by_company(
    company_slug: str,
    query: str,
    max_results: int = 5
) -> tuple:
    """
    Find public manuals relevant to the query for a company portal (public access).
    Uses semantic search on summary embeddings.
    Returns (manuals, embedding_tokens, portal_privacy).
    """
    from app.services.rag_service import rag_service
    
    # Get the company_id and portal_privacy for this company slug
    db = await supabase_service.get_client()
    company_result = await db.table("companies").select(
        "id, portal_privacy"
    ).eq("slug", company_slug).eq("portal_enabled", True).maybe_single().execute()
    
    if not company_result.data:
        return [], 0, "public"
    
    company_id = company_result.data["id"]
    portal_privacy = company_result.data.get("portal_privacy", "public")
    
    # Embed the query
    query_embedding, tokens = await rag_service.embed_summary(query)
    
    # Search only public manuals for this company
    result = await db.rpc(
        "match_public_manual_summaries_by_company",
        {
            "company_id_param": company_id,
            "query_embedding": query_embedding,
            "match_count": max_results
        }
    ).execute()
    
    return result.data or [], tokens, portal_privacy


async def find_relevant_manuals(
    user_id: str,
    query: str,
    max_results: int = 5
) -> List[dict]:
    """
    DEPRECATED: Use find_relevant_manuals_by_user instead.
    Kept for backwards compatibility.
    """
    return await find_relevant_manuals_by_user(user_id, query, max_results)


def build_discovery_system_prompt(manuals: List[dict]) -> str:
    """Build system prompt with available manuals."""
    
    prompt_parts = [
        "You are a helpful assistant that helps users find the right manual for their problem.",
        "Based on the user's question, recommend the most relevant manuals.",
        "",
        "Available Manuals:",
    ]
    
    if not manuals:
        prompt_parts.append("(No manuals available yet)")
    else:
        for i, manual in enumerate(manuals, 1):
            title = manual.get("title", "Untitled")
            summary = manual.get("summary", manual.get("description", "No summary available"))
            manual_id = manual.get("id")
            
            prompt_parts.append(f"\n{i}. **{title}**")
            prompt_parts.append(f"   ID: {manual_id}")
            if summary:
                # Truncate summary if too long
                if len(summary) > 300:
                    summary = summary[:300] + "..."
                prompt_parts.append(f"   Summary: {summary}")
            prompt_parts.append("")
    
    prompt_parts.extend([
        "",
        "Instructions:",
        "- Analyze the user's question and recommend the most relevant manuals",
        "- Explain WHY each manual is relevant to their problem",
        "- Rank manuals from most to least relevant",
        "- If multiple manuals could help, mention all of them",
        "- If no manual seems relevant, suggest what kind of manual they might need",
        "- Be conversational and helpful",
    ])
    
    return "\n".join(prompt_parts)


@router.post("/discover")
async def discover_manuals(
    request: DiscoverRequest,
    user: Optional[JWTPayload] = Depends(get_optional_user)
):
    """
    AI chat to help users discover the best manual for their problem.
    
    Supports two modes:
    1. Authenticated: Searches user's own manuals (requires token)
    2. Public: Searches company's public manuals (requires company_slug)
    """
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages cannot be empty")
    
    # Determine mode: authenticated or public
    if request.company_slug:
        # Public mode: search company's public manuals
        mode = "public"
        company_slug = request.company_slug
    elif user:
        # Authenticated mode: search user's own manuals
        mode = "authenticated"
        user_id = user.user_id
    else:
        raise HTTPException(
            status_code=400,
            detail="Either authentication token or company_slug is required"
        )
    
    # Get the latest user message for semantic search
    latest_user_message = None
    for msg in reversed(request.messages):
        if msg.role == "user":
            latest_user_message = msg.content
            break
    
    if not latest_user_message:
        raise HTTPException(status_code=400, detail="No user message found")
    
    # Find relevant manuals based on mode
    embedding_tokens = 0
    try:
        if mode == "public":
            relevant_manuals, embedding_tokens, portal_privacy = await find_relevant_manuals_by_company(
                company_slug,
                latest_user_message,
                max_results=request.max_recommendations
            )
            # Reject anonymous callers on private portals
            if portal_privacy == "private" and not user:
                raise HTTPException(
                    status_code=401,
                    detail="Authentication required for this portal"
                )
        else:
            relevant_manuals, embedding_tokens = await find_relevant_manuals_by_user(
                user_id,
                latest_user_message,
                max_results=request.max_recommendations
            )
    except HTTPException:
        raise
    except Exception as e:
        # Catch embedding rate limits (429) before streaming starts
        error_msg = str(e).lower()
        if "429" in error_msg or "quota" in error_msg or "rate limit" in error_msg:
            raise HTTPException(status_code=429, detail="AI Provider rate limit exceeded during discovery. Please try again later.")
        import logging
        logging.getLogger(__name__).error(f"Discovery embedding failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze your request. Please try again.")

    company_id = None
    if request.session_id:
        db = await supabase_service.get_client()
        if mode == "public":
            comp_res = await db.table("companies").select("id").eq("slug", company_slug).maybe_single().execute()
            if comp_res.data:
                company_id = comp_res.data["id"]
        else:
            cu_res = await db.table("company_users").select("company_id").eq("user_id", user_id).eq("status", "active").maybe_single().execute()
            if cu_res.data:
                company_id = cu_res.data["company_id"]
    
    # Build system prompt with manual context
    system_prompt = build_discovery_system_prompt(relevant_manuals)
    
    # Build messages for AI
    ai_messages = [
        Message(role=MessageRole.SYSTEM, content=system_prompt)
    ]
    
    # Add conversation history
    for msg in request.messages:
        role = MessageRole.USER if msg.role == "user" else MessageRole.ASSISTANT
        ai_messages.append(Message(role=role, content=msg.content))

    # --- Token Quota Gate ---
    try:
        await ai_service.check_token_quota(company_id)
    except TokenQuotaExceededError as e:
        used_tokens = e.used
        max_tokens = e.limit
        async def quota_exceeded_stream():
            yield f"data: {json.dumps({'error': 'token_quota_exceeded', 'message': 'Your company has reached its monthly AI token limit. Ask your instance admin to raise it.', 'used_tokens': used_tokens, 'max_tokens': max_tokens})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(
            quota_exceeded_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )

    # Stream response
    async def generate():
        full_response = ""
        usage_metadata = {}
        try:
            async for chunk in ai_service.chat_stream(ai_messages, usage_metadata=usage_metadata):
                full_response += chunk
                # Send as SSE format
                yield f"data: {json.dumps({'content': chunk})}\n\n"
        except Exception as e:
            error_msg = str(e).lower()
            if "quota" in error_msg or "429" in error_msg or "rate limit" in error_msg:
                yield f"data: {json.dumps({'error': 'API quota exceeded. Please try again later.'})}\n\n"
            else:
                yield f"data: {json.dumps({'error': 'An error occurred. Please try again.'})}\n\n"
        finally:
            yield "data: [DONE]\n\n"
            if request.session_id and company_id and full_response:
                # Fire and forget analytics logging
                async def log_session():
                    try:
                        await analytics_service.log_chat_session(
                            session_id=request.session_id,
                            company_id=company_id,
                            manual_id=None,
                            chat_type="discovery",
                            messages=request.messages,
                            ai_response=full_response,
                        )
    
                        # Process tokens
                        p_tokens = usage_metadata.get("prompt_token_count", 0)
                        c_tokens = usage_metadata.get("candidates_token_count", 0)
                        t_tokens = usage_metadata.get("total_token_count", 0)
                        
                        if not t_tokens:
                            p_tokens = await ai_service.count_tokens(ai_messages)
                            c_tokens = await ai_service.count_tokens([Message(role=MessageRole.ASSISTANT, content=full_response)])
                            t_tokens = p_tokens + c_tokens
                        
                        # Add embedding tokens
                        p_tokens += embedding_tokens
                        t_tokens += embedding_tokens
                        
                        await analytics_service.log_token_usage(
                            company_id=company_id,
                            feature="chat_discovery",
                            model=ai_service.active_provider.default_model,
                            related_id=request.session_id,
                            prompt_tokens=p_tokens,
                            completion_tokens=c_tokens,
                            total_tokens=t_tokens
                        )
                    except Exception as logging_error:
                        import logging
                        logging.getLogger(__name__).error(f"Failed to log discovery session and tokens: {logging_error}")
                
                asyncio.create_task(log_session())
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
