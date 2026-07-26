import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.database import User

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
):
    """Dev-mode auth: accepts x-user-email header or Bearer token."""
    email = None

    if credentials and credentials.credentials:
        try:
            payload = jwt.decode(
                credentials.credentials,
                key="dev-secret-change-in-production",
                algorithms=["HS256"],
            )
            email = payload.get("sub")
        except JWTError:
            pass

    if not email:
        email = request.headers.get("x-user-email")

    # EventSource (SSE) cannot set custom headers, so allow the identity to
    # arrive as a query parameter for streaming endpoints.
    if not email:
        email = request.query_params.get("x-user-email") or request.query_params.get("user_email")

    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
