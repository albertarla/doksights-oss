import logging
import resend
from app.config import settings

logger = logging.getLogger(__name__)

class NotificationService:
    """Service for sending notifications (emails, etc.)."""

    def __init__(self):
        self.api_key = settings.resend_api_key
        # Strip potential extra quotes from env variables (common in some shell/env setups)
        self.sender_email = settings.resend_sender_email.strip('"').strip("'")
        
        if self.api_key:
            resend.api_key = self.api_key
        else:
            logger.warning("RESEND_API_KEY not set. Emails will not be sent.")

    async def send_portal_invite_email(
        self, email: str, company_name: str, company_slug: str, invite_token: str
    ) -> bool:
        if not self.api_key:
            logger.error("Cannot send email: RESEND_API_KEY is missing.")
            return False
        try:
            frontend_url = settings.frontend_url
            signup_link = f"{frontend_url}/auth?portal_invite={invite_token}"
            html_content = f"""
        <h3>You've been invited to access {company_name}'s documentation</h3>
        <p>You have been invited to view the documentation portal for <strong>{company_name}</strong>.</p>
        <p>Click the link below to create your account and gain access:</p>
        <p><a href="{signup_link}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Accept Invitation</a></p>
        <p>Or copy this link: <a href="{signup_link}">{signup_link}</a></p>
        <p>This invitation expires in 7 days.</p>
        <hr/>
        <p style="color:#666;font-size:12px;">If you did not expect this invitation, you can safely ignore this email.</p>
        """
            params = {
                "from": self.sender_email,
                "to": [email],
                "subject": f"You've been invited to {company_name}'s documentation portal",
                "html": html_content,
            }
            resend.Emails.send(params)
            logger.info(f"Portal invite email sent to {email} for company {company_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to send portal invite email: {str(e)}")
            return False

notification_service = NotificationService()
