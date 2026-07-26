import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import SessionLocal, get_db
from app.models.database import AgentActivity, AgentConfig, Contact, Conversation, User

router = APIRouter()
logger = logging.getLogger(__name__)

# Cache the wa_mark2 engine at module load — creating a new engine (and its
# connection pool) on every /status request leaks connections and is slow.
_wa_mark2_engine = None


def _get_wa_mark2_engine():
    global _wa_mark2_engine
    if _wa_mark2_engine is None:
        from sqlalchemy import create_engine
        from app.core.config import settings

        db_url = (
            f"postgresql+psycopg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
            f"@127.0.0.1/wa_mark2"
        )
        _wa_mark2_engine = create_engine(db_url, pool_pre_ping=True, pool_size=2, max_overflow=2)
    return _wa_mark2_engine


@router.get("/status")
def agent_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import text

    config = db.query(AgentConfig).first()
    contacts = db.query(Contact).filter(Contact.user_id == current_user.id).all()
    contact_ids = [c.id for c in contacts]
    active_convs = db.query(Conversation).filter(
        Conversation.contact_id.in_(contact_ids),
        Conversation.status == "active",
    ).count()

    # Query whatsapp session from wa_mark2 database (shared with the B2B gateway)
    engine = _get_wa_mark2_engine()
    session_data = {"status": "disconnected", "qr": None}
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT status, qr_code FROM whatsapp_sessions WHERE workspace_id = '11111111-1111-1111-1111-111111111111'")).fetchone()
            if result:
                raw_status = result[0]
                qr_code = result[1]
                if raw_status in ("CONNECTED", "READY"):
                    session_data["status"] = "connected"
                elif raw_status in ("QR_PENDING", "WAITING_FOR_SCAN"):
                    session_data["status"] = "waiting_for_scan"
                    session_data["qr"] = qr_code
                else:
                    session_data["status"] = "disconnected"
    except Exception as e:
        logger.error(f"Error fetching whatsapp session: {e}")

    auto_reply = config.auto_reply_enabled if config else False

    return {
        "ok": True,
        # The agent is "running" whenever it is set to auto-reply to inbound
        # messages. The frontend uses this single flag as the source of truth.
        "is_running": auto_reply,
        "agent_name": config.agent_name if config else "Aisha",
        "auto_reply_enabled": auto_reply,
        "auto_send_enabled": config.auto_send_enabled if config else False,
        "daily_message_limit": config.daily_message_limit if config else 20,
        "messages_sent_today": config.messages_sent_today if config else 0,
        "active_conversations": active_convs,
        "total_contacts": len(contacts),
        "whatsapp_session": session_data,
    }


@router.post("/start")
def start_agent(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = db.query(AgentConfig).first()
    if config:
        config.auto_reply_enabled = True
        config.auto_send_enabled = True
        db.commit()
    return {"ok": True, "running": True}


@router.post("/stop")
def stop_agent(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = db.query(AgentConfig).first()
    if config:
        config.auto_reply_enabled = False
        db.commit()
    return {"ok": True, "running": False}


@router.get("/logs")
def get_agent_logs(
    skip: int = 0,
    limit: int = 50,
    event_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contacts = db.query(Contact).filter(Contact.user_id == current_user.id).all()
    contact_ids = [c.id for c in contacts]
    conversation_ids = [
        c.id for c in db.query(Conversation).filter(Conversation.contact_id.in_(contact_ids)).all()
    ]

    query = db.query(AgentActivity).filter(
        AgentActivity.conversation_id.in_(conversation_ids)
    )
    if event_type:
        query = query.filter(AgentActivity.event_type == event_type)

    logs = (
        query
        .order_by(AgentActivity.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "ok": True,
        "logs": [
            {
                "id": str(log.id),
                "event_type": log.event_type,
                "title": log.title,
                "detail": log.detail,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
    }


@router.get("/logs/stream")
async def stream_agent_logs(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SSE stream of agent activity logs."""
    contacts = db.query(Contact).filter(Contact.user_id == current_user.id).all()
    contact_ids = [c.id for c in contacts]
    conversation_ids = [
        c.id for c in db.query(Conversation).filter(Conversation.contact_id.in_(contact_ids)).all()
    ]

    async def event_generator():
        last_seen_id = None
        db_init = SessionLocal()
        try:
            existing = (
                db_init.query(AgentActivity)
                .filter(AgentActivity.conversation_id.in_(conversation_ids))
                .order_by(AgentActivity.created_at.desc())
                .limit(20)
                .all()
            )
            existing.reverse()
            for entry in existing:
                last_seen_id = entry.id
                yield f"data: {json.dumps({'id': str(entry.id), 'title': entry.title, 'detail': entry.detail or '', 'event_type': entry.event_type, 'ts': entry.created_at.isoformat() if entry.created_at else ''})}\n\n"
        finally:
            db_init.close()

        while True:
            if await request.is_disconnected():
                break
            db_poll = SessionLocal()
            try:
                query = db_poll.query(AgentActivity).filter(
                    AgentActivity.conversation_id.in_(conversation_ids)
                )
                if last_seen_id:
                    last_entry = db_poll.query(AgentActivity).filter(
                        AgentActivity.id == last_seen_id
                    ).first()
                    if last_entry:
                        query = query.filter(AgentActivity.created_at > last_entry.created_at)
                new_entries = query.limit(50).all()
                for entry in new_entries:
                    last_seen_id = entry.id
                    yield f"data: {json.dumps({'id': str(entry.id), 'title': entry.title, 'detail': entry.detail or '', 'event_type': entry.event_type, 'ts': entry.created_at.isoformat() if entry.created_at else ''})}\n\n"
            finally:
                db_poll.close()
            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/system_logs/stream")
async def stream_system_logs(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SSE stream of the backend log file."""
    import os
    import asyncio
    
    # The logs are stored in <root>/logs/
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    log_file = os.path.join(root_dir, "logs", "worker.log")
    
    async def event_generator():
        if not os.path.exists(log_file):
            yield f"data: {json.dumps({'log': 'Waiting for worker.log...'})}\n\n"
            while not os.path.exists(log_file):
                if await request.is_disconnected():
                    return
                await asyncio.sleep(1)
                
        with open(log_file, "r") as f:
            lines = f.readlines()
            for line in lines[-100:]:
                yield f"data: {json.dumps({'log': line.strip()})}\n\n"
                
            while True:
                if await request.is_disconnected():
                    break
                line = f.readline()
                if not line:
                    await asyncio.sleep(1)
                    continue
                yield f"data: {json.dumps({'log': line.strip()})}\n\n"
                
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
