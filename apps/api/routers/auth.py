from fastapi import APIRouter, Depends

from auth import get_db_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def me(user=Depends(get_db_user)):
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "is_onboarded": user.is_onboarded,
    }
