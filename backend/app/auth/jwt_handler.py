"""
JWT Handler for Supabase Authentication

This module validates Supabase JWT tokens to authenticate requests.
The frontend sends the user's access_token in the Authorization header,
and we verify it using Supabase's JWT secret.
"""

from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError, jwk
from datetime import datetime
from typing import Optional, Dict
import httpx
import json

from app.config import settings

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

# Cache for JWKS
_jwks_cache: Optional[Dict] = None

async def get_supabase_jwks() -> Dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
        
    jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(jwks_url)
            response.raise_for_status()
            _jwks_cache = response.json()
            return _jwks_cache
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to fetch JWKS: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to verify authentication token configuration")

class JWTPayload:
    """Decoded JWT payload from Supabase."""
    
    def __init__(self, payload: dict):
        self.sub = payload.get("sub")  # User ID
        self.email = payload.get("email")
        self.role = payload.get("role", "authenticated")
        self.exp = payload.get("exp")
        self.aud = payload.get("aud")
    
    @property
    def user_id(self) -> str:
        return self.sub


async def verify_supabase_token(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> JWTPayload:
    """
    Verify a Supabase JWT token.
    Supports both HS256 (Shared Secret) and ES256 (JWKS/Asymmetric).
    """
    token = credentials.credentials
    
    try:
        # 1. Try HS256 (Symmetric) first if configured
        # strict=False allows us to peek at headers before full verification if needed
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg")
        
        payload = None
        
        if alg == "HS256":
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated"
            )
        elif alg == "ES256" or alg == "RS256":
            # 2. Try Asymmetric (JWKS)
            jwks = await get_supabase_jwks()
            payload = jwt.decode(
                token,
                jwks,
                algorithms=[alg],
                audience="authenticated"
            )
        else:
             raise HTTPException(status_code=401, detail=f"Unsupported algorithm: {alg}")
        
        # Check expiration
        exp = payload.get("exp")
        if exp and datetime.utcnow().timestamp() > exp:
            raise HTTPException(
                status_code=401,
                detail="Token has expired"
            )
        
        return JWTPayload(payload)
        
    except JWTError as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid authentication token: {str(e)}"
        )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_optional)
) -> Optional[JWTPayload]:
    """
    Optionally verify a JWT token (for public endpoints that behave differently for authenticated users).
    """
    if credentials is None:
        return None
    
    try:
        return await verify_supabase_token(credentials)
    except HTTPException:
        return None