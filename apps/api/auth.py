import base64

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from jose.utils import base64url_decode

from config import settings

bearer_scheme = HTTPBearer()

_jwks_cache: dict | None = None


async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json")
            _jwks_cache = r.json()
    return _jwks_cache


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    token = credentials.credentials
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg == "HS256":
            # Try base64-decoded secret first, fallback to raw
            try:
                secret = base64.b64decode(settings.supabase_jwt_secret)
            except Exception:
                secret = settings.supabase_jwt_secret.encode()
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        else:
            # RS256 — verify using Supabase JWKS
            jwks = await _get_jwks()
            kid = header.get("kid")
            key = next(
                (k for k in jwks.get("keys", []) if k.get("kid") == kid),
                None,
            )
            if key is None and jwks.get("keys"):
                key = jwks["keys"][0]
            if key is None:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No matching key")
            payload = jwt.decode(
                token,
                key,
                algorithms=[alg],
                options={"verify_aud": False},
            )

        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return {"id": user_id, "email": payload.get("email")}

    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")
