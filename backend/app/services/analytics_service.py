import asyncio
from typing import List, Optional, Literal
from app.services.supabase_service import supabase_service
from app.schemas.chat import ChatMessage
import logging

logger = logging.getLogger(__name__)

class AnalyticsService:
    async def log_chat_session(
        self,
        session_id: str,
        company_id: str,
        manual_id: Optional[str],
        chat_type: Literal["standard", "discovery"],
        messages: List[ChatMessage],
        ai_response: str
    ):
        """Asynchronously log the chat session and messages without blocking the event loop."""
        try:
            client = await supabase_service.get_client()
            
            # 1. Upsert the session
            session_data = {
                "id": session_id,
                "company_id": company_id,
                "chat_type": chat_type
            }
            if manual_id:
                session_data["manual_id"] = manual_id
                
            await client.table("ai_chat_sessions").upsert(session_data).execute()
            
            # 2. Insert messages. We only want to insert the latest user message and the AI response
            latest_user_message = next(
                (msg for msg in reversed(messages) if msg.role == "user"),
                None
            )
            
            new_messages = []
            if latest_user_message:
                new_messages.append({
                    "session_id": session_id,
                    "role": "user",
                    "content": latest_user_message.content
                })
            
            if ai_response:
                new_messages.append({
                    "session_id": session_id,
                    "role": "assistant",
                    "content": ai_response
                })
                
            if new_messages:
                await client.table("ai_chat_messages").insert(new_messages).execute()

            #    updated_at is also refreshed here (and by the DB trigger on ai_chat_messages INSERT).
            await client.table("ai_chat_sessions").update({
                "updated_at": "now()"
            }).eq("id", session_id).execute()
                
        except Exception as e:
            logger.error(f"Failed to log chat session {session_id}: {e}")

    async def log_token_usage(
        self,
        company_id: str,
        feature: str,
        model: str,
        related_id: Optional[str],
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int
    ):
        """Asynchronously log AI token usage to the ai_token_usage_logs table."""
        if not prompt_tokens and not completion_tokens and not total_tokens:
            return

        try:
            client = await supabase_service.get_client()
            log_data = {
                "company_id": company_id,
                "feature": feature,
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens
            }
            if related_id:
                log_data["related_id"] = related_id

            await client.table("ai_token_usage_logs").insert(log_data).execute()
        except Exception as e:
            logger.error(f"Failed to log token usage for company {company_id}: {e}")

analytics_service = AnalyticsService()
