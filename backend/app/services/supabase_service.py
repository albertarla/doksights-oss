"""
Supabase Service

Handles all interactions with the Supabase database.
Uses the service role key for admin access (not user's JWT).
"""

import asyncio
from supabase._async.client import AsyncClient as Client, create_client
from typing import Optional, Dict, Any, List
from app.config import settings


class SupabaseService:
    """Service for interacting with Supabase asynchronously."""
    
    def __init__(self):
        # The async client needs to be created inside an async context (like startup event)
        # or we just initialize it on first use.
        self._client: Optional[Client] = None
        
    async def get_client(self) -> Client:
        if self._client is None:
            self._client = await create_client(
                settings.supabase_url,
                settings.supabase_service_key,
            )
        return self._client

    @staticmethod
    def _first_row(data: Any) -> Optional[Dict[str, Any]]:
        if isinstance(data, list):
            return data[0] if data else None
        return data if isinstance(data, dict) else None
    
    async def get_manual(self, manual_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a manual by ID, ensuring the user has access.
        """
        try:
            client = await self.get_client()
            response = await client.table("manuals").select(
                "id, title, description, company_id, file_path, rag_status, extraction_status"
            ).eq("id", manual_id).single().execute()
        except Exception:
            return None
        
        if not response.data:
            return None
        
        manual = response.data
        company_id = manual.get("company_id")
        
        if not company_id:
            return None

        # Pass 1: Is this an internal corporate workspace staff member?
        if await self._is_company_member(user_id, company_id):
            return manual

        # Pass 2: Is this an external guest/client registered under this specific portal context?
        if await self._is_portal_user(user_id, company_id):
            return manual

        # Pass 3: Is this a completely public asset within an active portal configuration?
        if await self._is_public_manual(manual_id):
            return manual

        return None

    async def get_manual_for_public_link(self, manual_id: str, link_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a manual for a public shareable link.
        """
        try:
            client = await self.get_client()
            link_response = await client.table("shareable_links").select(
                "id, manual_id, is_active, expires_at"
            ).eq("id", link_id).eq("manual_id", manual_id).eq("is_active", True).single().execute()
        except Exception:
            return None
        
        if not link_response.data:
            return None
        
        link = link_response.data
        
        if link.get("expires_at"):
            from datetime import datetime
            expires = datetime.fromisoformat(link["expires_at"].replace("Z", "+00:00"))
            if datetime.now(expires.tzinfo) > expires:
                return None
        
        try:
            manual_response = await client.table("manuals").select(
                "id, title, description, company_id, extracted_text, rag_status, extraction_status"
            ).eq("id", manual_id).single().execute()
        except Exception:
            return None
        
        return manual_response.data

    async def get_manual_owned(self, manual_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a manual by ID, ensuring the requesting user has 'page.manuals' write access.
        """
        try:
            client = await self.get_client()
            response = await client.table("manuals").select(
                "id, title, description, company_id, extracted_text, file_path, is_public, rag_status, extraction_status, manual_type"
            ).eq("id", manual_id).single().execute()
        except Exception:
            return None

        if not response.data:
            return None

        manual = response.data
        company_id = manual.get("company_id")

        if not company_id:
            return None

        if not await self._has_company_permission(user_id, company_id, "page.manuals"):
            return None

        return manual

    async def get_manual_admin(self, manual_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a manual by ID without access checks (service role).
        """
        try:
            client = await self.get_client()
            response = await client.table("manuals").select(
                "id, title, description, company_id, extracted_text, file_path, is_public, rag_status, extraction_status, manual_type"
            ).eq("id", manual_id).single().execute()
        except Exception:
            return None

        return response.data
    
    async def get_manual_sections(self, manual_id: str) -> List[Dict[str, Any]]:
        """
        Fetch all sections for a manual, ordered by display_order.
        """
        client = await self.get_client()
        response = await client.table("manual_sections").select(
            "id, title, content, display_order"
        ).eq("manual_id", manual_id).order("display_order").execute()
        return response.data or []
    
    async def get_public_manual_by_id(self, manual_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a manual if it is public AND company portal is enabled.
        """
        try:
            client = await self.get_client()
            manual_response = await client.table("manuals").select(
                "id, title, description, extracted_text, company_id, is_public, rag_status, extraction_status"
            ).eq("id", manual_id).single().execute()

            manual = manual_response.data
            if not manual or not manual.get("is_public"):
                return None

            company_id = manual.get("company_id")
            if not company_id:
                return None

            company_response = await client.table("companies").select(
                "portal_enabled, portal_privacy"
            ).eq("id", company_id).single().execute()

            if not company_response.data or not company_response.data.get("portal_enabled"):
                return None

            manual["portal_privacy"] = company_response.data.get("portal_privacy", "public")
            return manual
        except Exception:
            return None

    async def _is_company_member(self, user_id: str, company_id: str) -> bool:
        client = await self.get_client()
        response = await client.table("company_users").select("id").eq("company_id", company_id).eq("user_id", user_id).eq("status", "active").execute()
        return bool(response.data)

    async def _has_company_permission(self, user_id: str, company_id: str, permission_key: str) -> bool:
        client = await self.get_client()
        cu_res = await client.table("company_users").select("id").eq("company_id", company_id).eq("user_id", user_id).eq("status", "active").execute()
        company_user = self._first_row(cu_res.data)
        if not company_user:
            return False
        
        company_user_id = company_user["id"]
        
        perm_res = await client.table("company_user_permissions").select("id").eq("company_user_id", company_user_id).eq("permission_key", permission_key).execute()
        return bool(perm_res.data)

    async def _is_portal_user(self, user_id: str, company_id: str) -> bool:
        """
        Checks if the authenticated user has explicit access rights to this company's portal context.
        """
        client = await self.get_client()
        response = await client.table("portal_users").select("id").eq("company_id", company_id).eq("user_id", user_id).execute()
        return bool(response.data)

    async def _is_public_manual(self, manual_id: str) -> bool:
        try:
            client = await self.get_client()
            response = await client.table("manuals").select("id, is_public, company_id").eq("id", manual_id).execute()
            manual = self._first_row(response.data)
            if not manual or not manual.get("is_public"):
                return False
            company_id = manual.get("company_id")
            if not company_id:
                return False
            comp = await client.table("companies").select("portal_enabled, portal_privacy").eq("id", company_id).single().execute()
            company = self._first_row(comp.data)
            return bool(
                company
                and company.get("portal_enabled")
                and company.get("portal_privacy", "public") == "public"
            )
        except Exception:
            return False
    
    async def is_superadmin(self, user_id: str) -> bool:
        try:
            client = await self.get_client()
            response = await client.table("profiles").select("is_superadmin").eq("id", user_id).execute()
            profile = self._first_row(response.data)
            return bool(profile and profile.get("is_superadmin"))
        except Exception:
            return False

    async def get_company_license_features(self, company_id: str) -> Dict[str, Any]:
        try:
            client = await self.get_client()
            cl_res = await client.table("company_licenses").select("license_id").eq("company_id", company_id).eq("subscription_status", "active").limit(1).execute()
            company_license = self._first_row(cl_res.data)
            if not company_license:
                return {}
            
            l_res = await client.table("licenses").select("features").eq("id", company_license["license_id"]).single().execute()
            if not l_res.data:
                return {}
            
            return l_res.data.get("features", {})
        except Exception:
            return {}

    async def get_company_token_quota(
        self, company_id: str, reset_day: int = 1
    ) -> tuple[int, Optional[int]]:
        """
        Return (used_tokens, max_tokens) for the current billing period.
        max_tokens is None when the license has no limit (unlimited).
        """
        try:
            client = await self.get_client()

            # 1. Get current period usage via RPC
            usage_res = await client.rpc(
                "get_current_period_token_usage",
                {"p_company_id": company_id, "p_reset_day": reset_day},
            ).execute()
            used = int(usage_res.data or 0)

            # 2. Get the max_ai_tokens from the active license
            cl_res = await client.table("company_licenses").select(
                "licenses(max_ai_tokens)"
            ).eq("company_id", company_id).eq("subscription_status", "active").limit(1).execute()

            max_tokens: Optional[int] = None
            if cl_res.data and len(cl_res.data) > 0 and cl_res.data[0].get("licenses"):
                raw = cl_res.data[0]["licenses"].get("max_ai_tokens")
                if raw is not None:
                    max_tokens = int(raw)

            return used, max_tokens
        except Exception:
            # Fail-open: if quota cannot be determined, allow the call
            return 0, None
    
    async def get_signed_pdf_url(self, file_path: str) -> Optional[str]:
        try:
            client = await self.get_client()
            response = await client.storage.from_("manuals").create_signed_url(
                file_path, 
                expires_in=3600
            )
            return response.get("signedURL")
        except Exception:
            return None

    async def download_pdf(self, file_path: str) -> bytes:
        client = await self.get_client()
        response = await client.storage.from_("manuals").download(file_path)
        if isinstance(response, bytes):
            return response
        if hasattr(response, "read"):
            return response.read()
            
        # Nasty workaround for supabase-py sync storage methods returning byte-like dicts sometimes
        return bytes(response)

    async def update_manual(self, manual_id: str, data: Dict[str, Any]) -> None:
        client = await self.get_client()
        await client.table("manuals").update(data).eq("id", manual_id).execute()

    async def delete_chunks(self, manual_id: str) -> None:
        client = await self.get_client()
        await client.table("manual_chunks").delete().eq("manual_id", manual_id).execute()

    async def store_chunks(self, chunks: List[Dict[str, Any]], batch_size: int = 200) -> None:
        client = await self.get_client()
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            await client.table("manual_chunks").insert(batch).execute()

    async def search_similar_chunks(
        self,
        manual_ids: List[str],
        embedding: List[float],
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        client = await self.get_client()
        response = await client.rpc(
            "match_manual_chunks",
            {
                "manual_ids": manual_ids,
                "query_embedding": embedding,
                "match_count": limit,
            },
        ).execute()

        return response.data or []

    async def track_manual_view(self, data: Dict[str, Any]) -> None:
        client = await self.get_client()
        await client.table("manual_views").insert(data).execute()

    # ------------------------------------------------------------------ #
    # Classification Pipeline Helpers                                     #
    # ------------------------------------------------------------------ #

    async def get_unclassified_sessions(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Return sessions eligible for classification:
          - label IS NULL (not yet classified)
          - updated_at < NOW() - 2 hours (inactivity timeout)
          - classification_attempts < 3 (max retries)
        Ordered oldest first for fair processing.
        """
        client = await self.get_client()
        response = await client.rpc(
            "get_unclassified_sessions",
            {"p_limit": limit}
        ).execute()
        return response.data or []

    async def get_session_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """Fetch all messages for a session, ordered chronologically."""
        client = await self.get_client()
        response = await (
            client.table("ai_chat_messages")
            .select("role, content, created_at")
            .eq("session_id", session_id)
            .order("created_at", desc=False)
            .execute()
        )
        return response.data or []

    async def update_session_classification(
        self,
        session_id: str,
        label: Optional[str],
        conclusion: Optional[str],
        theme_id: Optional[str],
        attempts_increment: int = 1,
        error_message: Optional[str] = None,
    ) -> None:
        """Update classification fields on a session row."""
        client = await self.get_client()
        data: Dict[str, Any] = {
            "classification_attempts": attempts_increment,  # handled via RPC below
        }
        if label is not None:
            data["label"] = label
        if conclusion is not None:
            data["conclusion"] = conclusion
        if theme_id is not None:
            data["theme_id"] = theme_id
        if error_message is not None:
            data["error_message"] = error_message

        # Use an RPC to atomically increment classification_attempts
        await client.rpc(
            "update_session_classification",
            {
                "p_session_id": session_id,
                "p_label": label,
                "p_conclusion": conclusion,
                "p_theme_id": theme_id,
                "p_error_message": error_message,
            }
        ).execute()

    async def get_themes_needing_retitle(self) -> List[Dict[str, Any]]:
        """Return all themes where needs_retitle = true."""
        client = await self.get_client()
        response = await (
            client.table("ai_chat_themes")
            .select("id, company_id, label, title, session_count")
            .eq("needs_retitle", True)
            .execute()
        )
        return response.data or []

    async def get_recent_conclusions_for_theme(
        self, theme_id: str, limit: int = 10
    ) -> List[str]:
        """Return the N most recent conclusions from sessions linked to a theme."""
        client = await self.get_client()
        response = await (
            client.table("ai_chat_sessions")
            .select("conclusion")
            .eq("theme_id", theme_id)
            .not_.is_("conclusion", "null")
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [row["conclusion"] for row in (response.data or []) if row.get("conclusion")]

    async def insert_theme(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Insert a new theme row and return the inserted record."""
        client = await self.get_client()
        response = await client.table("ai_chat_themes").insert(data).execute()
        return response.data[0] if response.data else {}

    async def update_theme(self, theme_id: str, data: Dict[str, Any]) -> None:
        """Update fields on an existing theme row."""
        client = await self.get_client()
        await client.table("ai_chat_themes").update(data).eq("id", theme_id).execute()

    async def match_chat_themes(
        self,
        company_id: str,
        label: str,
        embedding: List[float],
        threshold: float = 0.85,
    ) -> Optional[Dict[str, Any]]:
        """Call the match_chat_themes RPC. Returns the best-match theme or None."""
        client = await self.get_client()
        response = await client.rpc(
            "match_chat_themes",
            {
                "p_company_id": company_id,
                "p_label": label,
                "p_embedding": embedding,
                "p_threshold": threshold,
            }
        ).execute()
        data = response.data or []
        return data[0] if data else None

    async def increment_theme_session_count(
        self, theme_id: str, milestone_counts: List[int]
    ) -> int:
        """
        Atomically increment session_count on a theme.
        Sets needs_retitle=true if the new count is in milestone_counts.
        Returns the new session_count.
        """
        client = await self.get_client()
        response = await client.rpc(
            "increment_theme_session_count",
            {
                "p_theme_id": theme_id,
                "p_milestones": milestone_counts,
            }
        ).execute()
        return response.data if isinstance(response.data, int) else 0

    async def sync_manuals_bucket_size(self) -> None:
        """
        Sync the file_size_limit of the 'manuals' storage bucket with backend settings.
        """
        try:
            client = await self.get_client()
            limit_bytes = settings.max_manual_size_mb * 1024 * 1024
            await client.storage.update_bucket(
                "manuals",
                options={
                    "allowed_mime_types": ["application/pdf"],
                    "file_size_limit": limit_bytes,
                }
            )
            print(f"✅ Synced 'manuals' bucket size limit to {settings.max_manual_size_mb}MB ({limit_bytes} bytes).")
        except Exception as e:
            print(f"⚠️ Failed to sync manuals bucket size: {e}")


# Singleton instance
supabase_service = SupabaseService()
