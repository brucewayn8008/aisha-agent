import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.auth import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.database import User

router = APIRouter()
logger = logging.getLogger(__name__)

def _get_wa_mark2_db_url():
    """Constructs the wa_mark2 database URL using the current settings."""
    # Assuming same host/user/password but different db name
    return f"postgresql+psycopg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@127.0.0.1/wa_mark2"

def _ensure_aisha_workspace_exists():
    from sqlalchemy import create_engine
    engine = create_engine(_get_wa_mark2_db_url())
    with engine.connect() as conn:
        conn.execute(
            text("""
            INSERT INTO workspaces (id, owner_id, company_name, business_description, email, agent_enabled, is_running, messages_sent_today, daily_message_limit, created_at)
            VALUES ('11111111-1111-1111-1111-111111111111', '943475b2-90fa-4569-8f82-6150cdfee5d8', 'Aisha Agent', 'AI Agent', 'aisha@local.dev', true, true, 0, 100, NOW())
            ON CONFLICT (id) DO NOTHING;
            """)
        )
        
        conn.execute(
            text("""
            INSERT INTO whatsapp_sessions (workspace_id, status, last_updated)
            VALUES ('11111111-1111-1111-1111-111111111111', 'UNCONFIGURED', NOW())
            ON CONFLICT (workspace_id) DO NOTHING;
            """)
        )
        conn.commit()

@router.post("/whatsapp/connect")
def connect_whatsapp(current_user: User = Depends(get_current_user)):
    """Trigger the Go Gateway to start a session and generate a QR code for 'aisha'."""
    try:
        _ensure_aisha_workspace_exists()
    except Exception as e:
        logger.error(f"Failed to ensure workspace: {e}")
        # non-fatal if tables don't exist yet, but they should.
    
    workspace_id = "11111111-1111-1111-1111-111111111111"
    try:
        resp = httpx.get(
            f"{settings.GO_GATEWAY_URL}/api/session/start",
            params={"workspace_id": workspace_id},
            timeout=12.0,
        )
        resp.raise_for_status()
        return {"ok": True, "message": "Session start initiated"}
    except Exception as exc:
        logger.error(f"Failed to start gateway session: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
