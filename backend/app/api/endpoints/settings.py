from typing import Optional

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.database import AgentConfig, User

router = APIRouter()


class SettingsUpdate(BaseModel):
    agent_name: Optional[str] = None
    persona_description: Optional[str] = None
    tone: Optional[str] = None
    interests: Optional[list[str]] = None
    boundaries: Optional[list[str]] = None
    auto_reply_enabled: Optional[bool] = None
    auto_send_enabled: Optional[bool] = None
    daily_message_limit: Optional[int] = None
    conversation_starters: Optional[list[str]] = None
    greeting_time_based: Optional[bool] = None
    max_response_length_words: Optional[int] = None


def _config_payload(config: AgentConfig) -> dict:
    return {
        "agent_name": config.agent_name,
        "persona_description": config.persona_description,
        "tone": config.tone,
        "interests": config.interests or [],
        "boundaries": config.boundaries or [],
        "auto_reply_enabled": config.auto_reply_enabled,
        "auto_send_enabled": config.auto_send_enabled,
        "daily_message_limit": config.daily_message_limit,
        "messages_sent_today": config.messages_sent_today,
        "conversation_starters": config.conversation_starters or [],
        "greeting_time_based": config.greeting_time_based,
        "max_response_length_words": config.max_response_length_words,
    }


@router.get("/")
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = db.query(AgentConfig).first()
    if not config:
        from app.db.init_db import init_db
        init_db(db)
        config = db.query(AgentConfig).first()
    return {"ok": True, "settings": _config_payload(config)}


@router.post("/")
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = db.query(AgentConfig).first()
    if not config:
        from app.db.init_db import init_db
        init_db(db)
        config = db.query(AgentConfig).first()

    if payload.agent_name is not None:
        config.agent_name = payload.agent_name.strip()
    if payload.persona_description is not None:
        config.persona_description = payload.persona_description.strip()
    if payload.tone is not None:
        config.tone = payload.tone.strip()
    if payload.interests is not None:
        config.interests = [i.strip() for i in payload.interests if i.strip()]
    if payload.boundaries is not None:
        config.boundaries = [b.strip() for b in payload.boundaries if b.strip()]
    if payload.auto_reply_enabled is not None:
        config.auto_reply_enabled = payload.auto_reply_enabled
    if payload.auto_send_enabled is not None:
        config.auto_send_enabled = payload.auto_send_enabled
    if payload.daily_message_limit is not None:
        config.daily_message_limit = max(1, payload.daily_message_limit)
    if payload.conversation_starters is not None:
        config.conversation_starters = [s.strip() for s in payload.conversation_starters if s.strip()]
    if payload.greeting_time_based is not None:
        config.greeting_time_based = payload.greeting_time_based
    if payload.max_response_length_words is not None:
        config.max_response_length_words = max(5, min(payload.max_response_length_words, 200))

    config.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(config)
    return {"ok": True, "settings": _config_payload(config)}
