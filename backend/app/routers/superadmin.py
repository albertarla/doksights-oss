"""
Superadmin Router

Endpoints for managing licenses and provisioning new companies and admins.
These endpoints are protected and require the requesting user to be a Superadmin.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from app.auth.jwt_handler import verify_supabase_token, JWTPayload
from app.services.supabase_service import supabase_service

router = APIRouter(prefix="/superadmin", tags=["superadmin"])

async def verify_superadmin(payload: JWTPayload = Depends(verify_supabase_token)):
    user_id = payload.user_id
    is_super = await supabase_service.is_superadmin(user_id)
    if not is_super:
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return payload

class LicenseFeatures(BaseModel):
    analytics: bool = False

class LicenseCreateRequest(BaseModel):
    name: str
    max_manuals: int = 1
    max_public_manuals: int = 0
    max_users: int = 1
    max_ai_tokens: Optional[int] = None  # None = unlimited
    features: LicenseFeatures = LicenseFeatures()

class LicenseUpdateRequest(BaseModel):
    name: Optional[str] = None
    max_manuals: Optional[int] = None
    max_public_manuals: Optional[int] = None
    max_users: Optional[int] = None
    max_ai_tokens: Optional[int] = None  # None = unlimited
    features: Optional[LicenseFeatures] = None

class CompanyProvisionRequest(BaseModel):
    company_name: str
    admin_email: str
    admin_password: str
    # Optional: when omitted, the database assigns the default "Self-hosted" license.
    license_id: Optional[str] = None

@router.get("/licenses")
async def get_licenses(payload=Depends(verify_superadmin)):
    """Get all licenses."""
    response = await (await supabase_service.get_client()).table("licenses").select("*").order("created_at").execute()
    return response.data

@router.post("/licenses")
async def create_license(request: LicenseCreateRequest, payload=Depends(verify_superadmin)):
    """Create a new license template."""
    data = request.dict()
    response = await (await supabase_service.get_client()).table("licenses").insert(data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create license")
    return response.data[0]

@router.put("/licenses/{license_id}")
async def update_license(license_id: str, request: LicenseUpdateRequest, payload=Depends(verify_superadmin)):
    """Update an existing license template."""
    data = {k: v for k, v in request.dict().items() if v is not None}
    response = await (await supabase_service.get_client()).table("licenses").update(data).eq("id", license_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="License not found or update failed")
    return response.data[0]

@router.delete("/licenses/{license_id}")
async def delete_license(license_id: str, payload=Depends(verify_superadmin)):
    """Delete a license template."""
    try:
        response = await (await supabase_service.get_client()).table("licenses").delete().eq("id", license_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/companies")
async def provision_company(request: CompanyProvisionRequest, payload=Depends(verify_superadmin)):
    """
    Provision a new company:
    1. Create the admin user avoiding the self-signup flow.
    2. Create the company explicitly.
    3. Link the license.
    4. Link the user to the company as 'admin'.
    """
    try:
        # Create Auth User using Admin API
        client = await supabase_service.get_client()
        userResponse = await client.auth.admin.create_user({
            "email": request.admin_email,
            "password": request.admin_password,
            "email_confirm": True
        })
        new_user_id = userResponse.user.id
        
        # Get a dynamically generated slug
        slugResponse = await (await supabase_service.get_client()).rpc("generate_company_slug", {"company_name": request.company_name}).execute()
        company_slug = slugResponse.data
        
        # Insert Company
        compResponse = await (await supabase_service.get_client()).table("companies").insert({
            "name": request.company_name,
            "slug": company_slug
        }).execute()
        company_id = compResponse.data[0]["id"]
        
        # Link License. A database trigger already assigns the default license on
        # company creation, so only override it when a specific one was chosen.
        if request.license_id:
            await (await supabase_service.get_client()).table("company_licenses").upsert({
                "company_id": company_id,
                "license_id": request.license_id,
                "subscription_status": "active"
            }, on_conflict="company_id").execute()

        # Link User as Admin
        client = await supabase_service.get_client()
        cuResponse = await client.table("company_users").insert({
            "company_id": company_id,
            "user_id": new_user_id,
            "status": "active",
            "role": "admin",
            "created_by": payload.user_id
        }).execute()
        cu_id = cuResponse.data[0]["id"]

        # Grant permissions
        permissions = await (await supabase_service.get_client()).table("permissions").select("key").execute()
        user_perms_corrected = [{"company_user_id": cu_id, "permission_key": p["key"]} for p in permissions.data]
        await (await supabase_service.get_client()).table("company_user_permissions").insert(user_perms_corrected).execute()

        return {"status": "success", "company_id": company_id, "user_id": new_user_id}
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Provisioning failed: {str(e)}")
