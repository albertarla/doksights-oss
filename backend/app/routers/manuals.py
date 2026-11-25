"""
Manuals Router

Endpoints for manual processing (RAG indexing).
"""

import asyncio
from fastapi import APIRouter, Depends, HTTPException

from app.auth.jwt_handler import verify_supabase_token, JWTPayload
from app.services.rag_service import rag_service
from app.services.supabase_service import supabase_service

router = APIRouter(prefix="/manuals", tags=["manuals"])


@router.post("/{manual_id}/process")
async def process_manual(
    manual_id: str,
    user: JWTPayload = Depends(verify_supabase_token),
):
    """Trigger PDF extraction + RAG indexing for a manual."""
    manual = await supabase_service.get_manual_owned(manual_id, user.user_id)
    if not manual:
        raise HTTPException(status_code=404, detail="Manual not found or access denied")

    await supabase_service.update_manual(
        manual_id,
        {
            "rag_status": "processing",
            "rag_error": None,
            "extraction_status": "processing",
        },
    )

    asyncio.create_task(rag_service.index_manual(manual_id, user.user_id))

    return {"status": "processing"}
