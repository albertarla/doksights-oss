"""
Tests for ClassificationService

Covers:
  T-TEST-1: _truncate_messages keeps first N + last N
  T-TEST-2: _parse_json_response extracts JSON from clean response
  T-TEST-3: _parse_json_response handles markdown code fence wrapping
  T-TEST-4: _classify_single_session returns label + conclusion on success
  T-TEST-5: _classify_single_session raises on invalid label
  T-TEST-6: classify_pending_sessions skips when advisory lock is held
  T-TEST-7: _assign_theme creates theme when no match found
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from app.services.classification_service import (
    ClassificationService,
    _truncate_messages,
    _parse_json_response,
    VALID_LABELS,
)


# ---------------------------------------------------------------------------
# T-TEST-1: _truncate_messages
# ---------------------------------------------------------------------------

def test_truncate_messages_short_list():
    """Lists shorter than first_n + last_n are returned unchanged."""
    msgs = [{"role": "user", "content": str(i)} for i in range(5)]
    result = _truncate_messages(msgs, first_n=2, last_n=8)
    assert result == msgs


def test_truncate_messages_long_list():
    """Lists longer than first_n + last_n return first_n + last_n items."""
    msgs = [{"role": "user", "content": str(i)} for i in range(20)]
    result = _truncate_messages(msgs, first_n=2, last_n=8)
    assert len(result) == 10
    assert result[0]["content"] == "0"
    assert result[1]["content"] == "1"
    assert result[-1]["content"] == "19"


# ---------------------------------------------------------------------------
# T-TEST-2 & T-TEST-3: _parse_json_response
# ---------------------------------------------------------------------------

def test_parse_json_response_clean():
    """Parses a plain JSON string correctly."""
    raw = '{"label": "Generic Question", "conclusion": "User asked how to reset password"}'
    result = _parse_json_response(raw)
    assert result["label"] == "Generic Question"
    assert "conclusion" in result


def test_parse_json_response_with_markdown_fence():
    """Strips markdown code fences before parsing."""
    raw = '```json\n{"label": "Bug / Troubleshooting", "conclusion": "App crashes on startup"}\n```'
    result = _parse_json_response(raw)
    assert result["label"] == "Bug / Troubleshooting"


def test_parse_json_response_invalid_raises():
    """Raises ValueError if no JSON object is found."""
    with pytest.raises(ValueError, match="No JSON object"):
        _parse_json_response("This is not JSON at all")


# ---------------------------------------------------------------------------
# T-TEST-4: _classify_single_session — success path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_classify_single_session_success():
    """Returns (label, conclusion) tuple when LLM returns valid JSON."""
    service = ClassificationService()
    session = {"id": "session-1", "company_id": "company-1"}
    messages = [
        {"role": "user", "content": "How do I reset my password?"},
        {"role": "assistant", "content": "You can reset it via settings."},
    ]
    llm_response = '{"label": "Generic Question", "conclusion": "User asked about password reset"}'

    with patch(
        "app.services.classification_service.ai_service"
    ) as mock_ai:
        mock_ai.active_provider.chat = AsyncMock(return_value=llm_response)
        with patch("app.services.classification_service.settings") as mock_settings:
            mock_settings.classification_model = "gemini-2.0-flash-lite"
            result = await service._classify_single_session(session, messages)

    assert result is not None
    label, conclusion = result
    assert label == "Generic Question"
    assert "password" in conclusion.lower()


# ---------------------------------------------------------------------------
# T-TEST-5: _classify_single_session — invalid label raises
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_classify_single_session_invalid_label():
    """Raises ValueError when LLM returns an unrecognised label."""
    service = ClassificationService()
    session = {"id": "session-2", "company_id": "company-1"}
    messages = [{"role": "user", "content": "Hello"}]
    llm_response = '{"label": "InvalidLabel", "conclusion": "Something"}'

    with patch("app.services.classification_service.ai_service") as mock_ai:
        mock_ai.active_provider.chat = AsyncMock(return_value=llm_response)
        with patch("app.services.classification_service.settings") as mock_settings:
            mock_settings.classification_model = "gemini-2.0-flash-lite"
            with pytest.raises(ValueError, match="Unknown label"):
                await service._classify_single_session(session, messages)


# ---------------------------------------------------------------------------
# T-TEST-6: classify_pending_sessions — advisory lock held skips gracefully
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_classify_pending_sessions_lock_held():
    """When advisory lock is held (returns False), pipeline is skipped."""
    service = ClassificationService()

    mock_client = MagicMock()
    mock_rpc_result = MagicMock()
    mock_rpc_result.execute = AsyncMock(return_value=MagicMock(data=False))
    mock_client.rpc.return_value = mock_rpc_result

    with patch(
        "app.services.classification_service.supabase_service.get_client",
        new_callable=AsyncMock,
        return_value=mock_client,
    ):
        stats = await service.classify_pending_sessions()

    assert stats["sessions_classified"] == 0
    assert stats["sessions_failed"] == 0


# ---------------------------------------------------------------------------
# T-TEST-7: _assign_theme — creates a theme when no match is found
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_assign_theme_creates_new_theme():
    """Creates a new theme row when no similar theme exists."""
    service = ClassificationService()
    stats = {"themes_matched": 0, "themes_created": 0}

    mock_embedding = [0.1] * 1536

    with patch(
        "app.services.classification_service.ai_service"
    ) as mock_ai, patch(
        "app.services.classification_service.supabase_service"
    ) as mock_svc, patch(
        "app.services.classification_service.settings"
    ) as mock_settings:
        mock_ai.embed_query = AsyncMock(return_value=(mock_embedding, 10))
        mock_svc.match_chat_themes = AsyncMock(return_value=None)  # No match
        mock_svc.insert_theme = AsyncMock(return_value={"id": "new-theme-id"})
        mock_settings.classification_similarity_threshold = 0.85
        mock_settings.retitle_milestones_list = [5, 15, 50]

        result = await service._assign_theme(
            company_id="company-1",
            label="Generic Question",
            conclusion="User asked about resetting password",
            stats=stats,
        )

    assert result == "new-theme-id"
    assert stats["themes_created"] == 1
    assert stats["themes_matched"] == 0
    mock_svc.insert_theme.assert_called_once()
