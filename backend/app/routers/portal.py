from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from app.auth.jwt_handler import verify_supabase_token, JWTPayload
from app.services.notification_service import notification_service
from app.services.supabase_service import supabase_service

router = APIRouter(prefix="/portal", tags=["Portal"])

class SendInviteRequest(BaseModel):
    company_id: str
    invite_token: str
    email: EmailStr
    company_name: str
    company_slug: str

@router.post("/send-invite")
async def send_portal_invite(
    request: SendInviteRequest,
    user: JWTPayload = Depends(verify_supabase_token),
):
    """Send a portal invite email. Caller must be an active company member."""
    try:
        db = await supabase_service.get_client()

        # Verify the invite belongs to a company the caller is a member of
        invite_check = await db.table("portal_invites").select(
            "id, company_id"
        ).eq("token", request.invite_token).eq("company_id", request.company_id).limit(1).execute()

        if not invite_check.data or len(invite_check.data) == 0:
            raise HTTPException(status_code=404, detail="Invite not found")

        member_check = await db.table("company_users").select("id").eq(
            "company_id", request.company_id
        ).eq("user_id", user.user_id).eq("status", "active").limit(1).execute()

        if not member_check.data or len(member_check.data) == 0:
            raise HTTPException(status_code=403, detail="You are not a member of this company")

        success = await notification_service.send_portal_invite_email(
            email=str(request.email),
            company_name=request.company_name,
            company_slug=request.company_slug,
            invite_token=request.invite_token,
        )

        if not success:
            raise HTTPException(status_code=500, detail="Failed to send invite email")

        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Unhandled error in send_portal_invite: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
