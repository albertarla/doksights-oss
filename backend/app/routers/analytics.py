"""
Analytics Router

Endpoints for tracking portal views anonymously and triggering the
AI classification pipeline (superadmin only).
"""

from fastapi import APIRouter, BackgroundTasks, Depends, Request, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import hashlib
from datetime import datetime
import logging

from app.services.supabase_service import supabase_service
from app.auth.jwt_handler import verify_supabase_token, JWTPayload

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])

class ViewEventRequest(BaseModel):
    manual_id: str
    reading_duration_seconds: int = Field(default=0, ge=0)
    pages_viewed: int = Field(default=1, ge=1)
    total_pages: int = Field(default=1, ge=1)
    referrer: Optional[str] = None
    source: str = "portal"

@router.post("/view")
async def track_view(event: ViewEventRequest, request: Request):
    """
    Track a manual view anonymously.
    Uses daily salted IP hashing to avoid setting cookies.
    """
    try:
        # Extract IP address safely
        x_forwarded_for = request.headers.get("x-forwarded-for")
        if x_forwarded_for:
            ip_address = x_forwarded_for.split(",")[0].strip()
        else:
            ip_address = request.client.host if request.client else "unknown"

        # Generate daily salt
        # We use today's date so the hash rotates daily
        daily_salt = datetime.utcnow().strftime("%Y-%m-%d")

        # Hash IP + Salt for Cookieless tracking
        hasher = hashlib.sha256()
        hasher.update(f"{ip_address}_{daily_salt}".encode("utf-8"))
        hashed_identifier = hasher.hexdigest()

        # Fetch manual to verify it's public and get company_id
        manual = await supabase_service.get_public_manual_by_id(event.manual_id)
        if not manual:
            raise HTTPException(status_code=403, detail="Manual not found, is not public, or portal is disabled")

        company_id = manual.get("company_id")
        if not company_id:
            raise HTTPException(status_code=500, detail="Manual is missing company association")
            
        # Verify License Analytics Feature
        features = await supabase_service.get_company_license_features(company_id)
        if not features.get("analytics", False):
            raise HTTPException(status_code=403, detail="Current license does not support analytics")

        # Sanitize referrer
        safe_referrer = None
        if event.referrer:
            safe_referrer = event.referrer[:500].replace("<", "").replace(">", "")

        # Prepare insert payload
        view_data = {
            "manual_id": event.manual_id,
            "company_id": company_id,
            "hashed_identifier": hashed_identifier,
            "reading_duration_seconds": min(event.reading_duration_seconds, 86400),
            "pages_viewed": min(event.pages_viewed, event.total_pages),
            "total_pages": event.total_pages,
            "referrer": safe_referrer,
            "source": event.source,
        }

        # Fire and forget tracking insert (or await it depending on needs)
        await supabase_service.track_manual_view(view_data)

        return {"status": "tracked"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error tracking view for manual {event.manual_id}: {e}")
        # Return 500 but don't expose internal errors to the client
        raise HTTPException(status_code=500, detail="Failed to track view")


# ---------------------------------------------------------------------------
# Superadmin: Trigger Classification Pipeline
# ---------------------------------------------------------------------------

async def _verify_superadmin(payload: JWTPayload = Depends(verify_supabase_token)) -> JWTPayload:
    """Dependency: ensure the caller is a superadmin."""
    if not await supabase_service.is_superadmin(payload.user_id):
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return payload


@router.post("/classify-sessions")
async def trigger_classification(
    background_tasks: BackgroundTasks,
    payload: JWTPayload = Depends(_verify_superadmin),
):
    """
    Manually trigger the AI classification pipeline.
    Superadmin JWT required. Runs asynchronously in the background.
    """
    from app.services.classification_service import classification_service

    background_tasks.add_task(classification_service.classify_pending_sessions)
    return {"status": "Classification pipeline triggered", "triggered_by": payload.user_id}
