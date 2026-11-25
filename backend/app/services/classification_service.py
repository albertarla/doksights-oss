"""
Classification Service

Asynchronous background pipeline that:
  1. Classifies finalized (or timed-out) chat sessions into one of 6 labels.
  2. Embeds the conclusion and matches / creates a semantic theme.
  3. Re-titles themes whose session count crosses configured milestones.

Guard against concurrent execution in a multi-worker environment via a
PostgreSQL advisory lock (pg_try_advisory_xact_lock).
"""

import json
import logging
from typing import Any, Dict, List, Optional

from app.config import settings
from app.services.ai_service import Message, MessageRole, ai_service, TokenQuotaExceededError
from app.services.supabase_service import supabase_service
from app.services.analytics_service import analytics_service

logger = logging.getLogger(__name__)

# Unique identifier for the cron lock in the DB table
_JOB_NAME = "ai_classification_pipeline"

# Valid classification labels (canonical spelling used in the DB)
VALID_LABELS = {
    "Missing Functionality",
    "Change Request",
    "Usability Issue",
    "Bug / Troubleshooting",
    "Generic Question",
    "Out of Scope",
}

# Classification prompt template
_CLASSIFICATION_PROMPT = """\
You are a product-feedback analyst. Classify the following chat conversation between a user and an AI assistant.
For the classification, focus mainly on the user's intent and the nature of the questions. The AI's responses are irrelevant for the classification, use them only to understand the context.

## Conversation
{conversation}

## Labels
1. Missing Functionality – The user requested a new feature or asked how to do something the product currently cannot do.
2. Change Request – The user wants to change how an existing feature works (not a new feature, not a bug).
3. Usability Issue – The user expressed confusion, asked for clarification, or struggled to follow instructions.
4. Bug / Troubleshooting – The user encountered an error, unexpected behaviour, or broken flow.
5. Generic Question – Standard how-the-product-works questions already covered in the documentation.
6. Out of Scope – The user asked something completely unrelated to the product or manual.

## Rules
- Choose exactly ONE label from the list above.
- Write the conclusion in English (max 20 words), regardless of the language used in the conversation.
- Return ONLY a valid JSON object with no additional text:

{{"label": "<one of the 6 labels>", "conclusion": "<≤20-word English summary>"}}
"""

# Re-titling prompt template
_RETITLE_PROMPT = """\
You are a product analyst creating a concise theme title.

Given these user-reported issues from the same product area:
{conclusions}

Write ONE concise, representative English title (≤ 10 words) that best captures the common theme.
Return ONLY the title text — no quotes, no punctuation at the end.
"""


class ClassificationService:
    """Orchestrates the full classification pipeline with an advisory lock."""

    # ------------------------------------------------------------------ #
    # Public entry point                                                   #
    # ------------------------------------------------------------------ #

    async def classify_pending_sessions(self) -> Dict[str, int]:
        """
        Main pipeline entry point. Acquires a table-based cron lock so only
        one worker runs at a time. Returns a stats dict for logging.
        """
        stats = {
            "sessions_classified": 0,
            "sessions_failed": 0,
            "themes_created": 0,
            "themes_matched": 0,
            "themes_retitled": 0,
        }

        client = await supabase_service.get_client()

        # The lock will automatically expire in 55 minutes if not released, 
        # allowing the next 60m cycle to run even if this process crashes hard.
        lock_response = await client.rpc(
            "acquire_cron_lock",
            {"p_job_name": _JOB_NAME, "p_lock_duration_minutes": 55}
        ).execute()

        if not lock_response.data:
            logger.info("[Classification] Cron lock held by another worker — skipping.")
            return stats

        logger.info("[Classification] Lock acquired. Starting pipeline.")

        try:
            # Pass 1: Classify sessions
            await self._classification_pass(stats)
            # Pass 2: Assign themes
            await self._theme_matching_pass(stats)
            # Pass 3: Re-title milestone themes
            await self._retitle_pass(stats)
        except Exception as e:
            logger.error(f"[Classification] Pipeline error: {e}")
        finally:
            # Always release the lock so manual triggers or next cycles can run
            await client.rpc("release_cron_lock", {"p_job_name": _JOB_NAME}).execute()
            logger.info(
                f"[Classification] Done & Lock Released. "
                f"classified={stats['sessions_classified']} "
                f"failed={stats['sessions_failed']} "
                f"themes_created={stats['themes_created']} "
                f"themes_matched={stats['themes_matched']} "
                f"retitled={stats['themes_retitled']}"
            )

        return stats

    # ------------------------------------------------------------------ #
    # Pass 1: Classification                                               #
    # ------------------------------------------------------------------ #

    async def _classification_pass(self, stats: Dict[str, int]) -> None:
        """Fetch unclassified sessions and classify each one."""
        sessions = await supabase_service.get_unclassified_sessions(
            limit=settings.classification_batch_size
        )
        logger.info(f"[Classification] Found {len(sessions)} sessions to classify.")

        for session in sessions:
            session_id = session["id"]
            company_id = session.get("company_id")
            try:
                # Skip sessions whose company has exceeded its token quota
                try:
                    await ai_service.check_token_quota(company_id)
                except TokenQuotaExceededError:
                    logger.warning(
                        f"[Classification] Skipping session {session_id} — company {company_id} token quota exceeded."
                    )
                    stats["sessions_failed"] += 1
                    continue

                messages = await supabase_service.get_session_messages(session_id)
                result = await self._classify_single_session(session, messages)
                if result:
                    label, conclusion = result
                    # Update label + conclusion (theme_id will be set in pass 2)
                    await supabase_service.update_session_classification(
                        session_id=session_id,
                        label=label,
                        conclusion=conclusion,
                        theme_id=None,
                        error_message=None,
                    )
                    stats["sessions_classified"] += 1
                else:
                    stats["sessions_failed"] += 1
            except Exception as e:
                logger.error(f"[Classification] Session {session_id} error: {e}")
                await supabase_service.update_session_classification(
                    session_id=session_id,
                    label=None,
                    conclusion=None,
                    theme_id=None,
                    error_message=str(e)[:500],
                )
                stats["sessions_failed"] += 1

    async def _classify_single_session(
        self,
        session: Dict[str, Any],
        messages: List[Dict[str, Any]],
    ) -> Optional[tuple[str, str]]:
        """
        Build a truncated conversation, call the LLM, and parse {label, conclusion}.
        Returns (label, conclusion) on success, None on failure.
        """
        # Truncate: keep first 2 + last 8 messages
        truncated = _truncate_messages(messages)
        if not truncated:
            logger.warning(f"[Classification] Session {session['id']} has no messages — skipping.")
            return None

        conversation = "\n".join(
            f"{m['role'].upper()}: {m['content']}" for m in truncated
        )
        prompt = _CLASSIFICATION_PROMPT.format(conversation=conversation)

        llm_messages = [Message(role=MessageRole.USER, content=prompt)]
        usage_metadata = {}

        try:
            raw = await ai_service.active_provider.chat(
                llm_messages,
                model=settings.classification_model,
                usage_metadata=usage_metadata,
            )

            # Log tokens to analytics
            await analytics_service.log_token_usage(
                company_id=session["company_id"],
                feature="ai_classification",
                model=settings.classification_model,
                related_id=session["id"],
                prompt_tokens=usage_metadata.get("prompt_token_count", 0),
                completion_tokens=usage_metadata.get("candidates_token_count", 0),
                total_tokens=usage_metadata.get("total_token_count", 0),
            )

            parsed = _parse_json_response(raw)
            label = parsed.get("label", "").strip()
            conclusion = parsed.get("conclusion", "").strip()

            logger.info(
                f"[Classification] Session {session['id']} result: label={label!r}, conclusion={conclusion!r}"
            )

            if label not in VALID_LABELS:
                raise ValueError(f"Unknown label: {label!r}")
            if not conclusion:
                raise ValueError("Empty conclusion")

            return label, conclusion

        except Exception as e:
            logger.warning(
                f"[Classification] LLM parse error for session {session['id']}: {e}"
            )
            raise

    # ------------------------------------------------------------------ #
    # Pass 2: Theme Matching                                               #
    # ------------------------------------------------------------------ #

    async def _theme_matching_pass(self, stats: Dict[str, int]) -> None:
        """
        For every session that has a label but no theme_id, embed the conclusion
        and match or create a theme.
        """
        client = await supabase_service.get_client()
        response = await (
            client.table("ai_chat_sessions")
            .select("id, company_id, label, conclusion")
            .not_.is_("label", "null")
            .is_("theme_id", "null")
            .not_.is_("conclusion", "null")
            .execute()
        )
        sessions = response.data or []
        logger.info(f"[Classification] Theme matching: {len(sessions)} sessions.")

        for session in sessions:
            try:
                theme_id = await self._assign_theme(
                    company_id=session["company_id"],
                    label=session["label"],
                    conclusion=session["conclusion"],
                    stats=stats,
                )
                await supabase_service.update_session_classification(
                    session_id=session["id"],
                    label=None,
                    conclusion=None,
                    theme_id=theme_id,
                    error_message=None,
                )
            except Exception as e:
                logger.error(
                    f"[Classification] Theme matching error for session {session['id']}: {e}"
                )

    async def _assign_theme(
        self,
        company_id: str,
        label: str,
        conclusion: str,
        stats: Dict[str, int],
    ) -> str:
        """
        Embed the conclusion (RETRIEVAL_QUERY), query match_chat_themes RPC.
        On match: increment session_count (and flag needs_retitle on milestones).
        On no match: create a new theme (embed with RETRIEVAL_DOCUMENT).
        Returns the theme_id.
        """
        query_embedding, tokens = await ai_service.embed_query(
            conclusion, task_type="RETRIEVAL_QUERY"
        )
        # Log tokens for theme matching query
        await analytics_service.log_token_usage(
            company_id=company_id,
            feature="ai_theme_matching_query",
            model=settings.embedding_model,
            related_id=None,
            prompt_tokens=tokens,
            completion_tokens=0,
            total_tokens=tokens,
        )

        match = await supabase_service.match_chat_themes(
            company_id=company_id,
            label=label,
            embedding=query_embedding,
            threshold=settings.classification_similarity_threshold,
        )

        if match:
            theme_id = match["id"]
            await supabase_service.increment_theme_session_count(
                theme_id=theme_id,
                milestone_counts=settings.retitle_milestones_list,
            )
            stats["themes_matched"] += 1
            return theme_id
        else:
            # Create new theme — embed title with RETRIEVAL_DOCUMENT for future matching
            doc_embedding, tokens = await ai_service.embed_query(
                conclusion, task_type="RETRIEVAL_DOCUMENT"
            )
            # Log tokens for new theme creation
            await analytics_service.log_token_usage(
                company_id=company_id,
                feature="ai_theme_creation_embedding",
                model=settings.embedding_model,
                related_id=None,
                prompt_tokens=tokens,
                completion_tokens=0,
                total_tokens=tokens,
            )
            theme = await supabase_service.insert_theme({
                "company_id": company_id,
                "label": label,
                "title": conclusion,
                "embedding": doc_embedding,
                "session_count": 1,
                "needs_retitle": False,
            })
            stats["themes_created"] += 1
            return theme["id"]

    # ------------------------------------------------------------------ #
    # Pass 3: Re-titling                                                   #
    # ------------------------------------------------------------------ #

    async def _retitle_pass(self, stats: Dict[str, int]) -> None:
        """Re-title every theme that has needs_retitle = true."""
        themes = await supabase_service.get_themes_needing_retitle()
        logger.info(f"[Classification] Re-titling: {len(themes)} themes.")

        for theme in themes:
            try:
                await self._retitle_pending_themes(theme)
                stats["themes_retitled"] += 1
            except Exception as e:
                logger.error(
                    f"[Classification] Re-title error for theme {theme['id']}: {e}"
                )

    async def _retitle_pending_themes(self, theme: Dict[str, Any]) -> None:
        """
        Sample recent conclusions, call LLM for a new title,
        re-embed with RETRIEVAL_DOCUMENT, update theme row.
        """
        theme_id = theme["id"]
        conclusions = await supabase_service.get_recent_conclusions_for_theme(
            theme_id=theme_id,
            limit=settings.retitle_sample_size,
        )

        if not conclusions:
            # Nothing to re-title with — just clear the flag
            await supabase_service.update_theme(theme_id, {"needs_retitle": False})
            return

        conclusions_text = "\n".join(f"- {c}" for c in conclusions)
        prompt = _RETITLE_PROMPT.format(conclusions=conclusions_text)
        llm_messages = [Message(role=MessageRole.USER, content=prompt)]
        usage_metadata = {}

        new_title = await ai_service.active_provider.chat(
            llm_messages,
            model=settings.classification_model,
            usage_metadata=usage_metadata,
        )
        new_title = new_title.strip().strip('"').strip("'")[:200]
        
        # Log tokens for title chat
        await analytics_service.log_token_usage(
            company_id=theme["company_id"],
            feature="ai_theme_retitle_chat",
            model=settings.classification_model,
            related_id=theme_id,
            prompt_tokens=usage_metadata.get("prompt_token_count", 0),
            completion_tokens=usage_metadata.get("candidates_token_count", 0),
            total_tokens=usage_metadata.get("total_token_count", 0),
        )

        # Re-embed with RETRIEVAL_DOCUMENT (the centroid type)
        new_embedding, tokens = await ai_service.embed_query(
            new_title, task_type="RETRIEVAL_DOCUMENT"
        )
        
        # Log tokens for title embedding
        await analytics_service.log_token_usage(
            company_id=theme["company_id"],
            feature="ai_theme_retitle_embedding",
            model=settings.embedding_model,
            related_id=theme_id,
            prompt_tokens=tokens,
            completion_tokens=0,
            total_tokens=tokens,
        )

        await supabase_service.update_theme(theme_id, {
            "title": new_title,
            "embedding": new_embedding,
            "needs_retitle": False,
        })
        logger.info(f"[Classification] Theme {theme_id} re-titled to: {new_title!r}")


# ------------------------------------------------------------------ #
# Utility helpers                                                       #
# ------------------------------------------------------------------ #

def _truncate_messages(
    messages: List[Dict[str, Any]],
    first_n: int = 2,
    last_n: int = 8,
) -> List[Dict[str, Any]]:
    """Keep the first N and last N messages to avoid context-window overflow."""
    if len(messages) <= first_n + last_n:
        return messages
    return messages[:first_n] + messages[-(last_n):]


def _parse_json_response(raw: str) -> Dict[str, Any]:
    """Extract the first JSON object from a raw LLM response string."""
    # Strip markdown code fences if present
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1]) if len(lines) > 2 else text

    # Find the first { ... } block
    start = text.find("{")
    end = text.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON object found in LLM response: {raw!r}")
    return json.loads(text[start:end])


# Singleton
classification_service = ClassificationService()
