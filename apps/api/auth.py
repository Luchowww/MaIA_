import base64

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db

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
    """Validates JWT and returns {'id': ..., 'email': ...} from the token claims."""
    token = credentials.credentials
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg == "HS256":
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
            jwks = await _get_jwks()
            kid = header.get("kid")
            key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
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


async def get_db_user(
    token_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Validates JWT, upserts the user in our `users` table, and returns the User ORM object.
    Use this dependency whenever you need the full user (with role, is_onboarded, etc.).
    """
    from models import User  # late import to avoid circular at module load

    result = await db.execute(select(User).where(User.id == token_user["id"]))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(id=token_user["id"], email=token_user.get("email"))
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif token_user.get("email") and user.email != token_user["email"]:
        user.email = token_user["email"]
        await db.commit()
        await db.refresh(user)

    return user


async def require_admin(
    user=Depends(get_db_user),
):
    """Dependency that ensures the current user has the admin role. Returns the User object."""
    from models import UserRole
    if user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
