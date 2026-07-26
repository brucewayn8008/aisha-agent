from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.database import (
    AgentActivity,
    Conversation,
    ConversationStatus,
    Contact,
    Message,
    MessageRole,
    MessageStatus,
    User,
)
from app.services.memory_service import (
    build_memory_context,
    get_active_memory_facts,
    update_relationship_stage,
)
from app.services.whatsapp_service import send_whatsapp_message

router = APIRouter()


class ProactiveMessage(BaseModel):
    message: str


class PauseToggle(BaseModel):
    paused: bool


class ManualSend(BaseModel):
    message: str


def _msg_payload(msg: Message) -> dict:
    return {
        "id": str(msg.id),
        "role": msg.role.value,
        "content": msg.content,
        "status": msg.status.value,
        "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
    }


def _conversation_payload(conv: Conversation, contact: Contact, messages: list, memory_facts: list) -> dict:
    return {
        "id": str(conv.id),
        "contact_id": str(contact.id),
        "contact_name": contact.display_name,
        "status": conv.status.value,
        "turn_count": conv.turn_count,
        "current_topic": conv.current_topic,
        "needs_reply": conv.needs_reply,
        "relationship_stage": contact.relationship_stage.value,
        "last_agent_reply_at": conv.last_agent_reply_at.isoformat() if conv.last_agent_reply_at else None,
        "created_at": conv.created_at.isoformat(),
        "messages": [_msg_payload(m) for m in messages],
        "memory_facts": [
            {
                "id": str(f.id),
                "category": f.category,
                "fact": f.fact,
                "confidence": f.confidence,
                "source": f.source,
                "context": f.context,
            }
            for f in memory_facts
        ],
    }


@router.get("/")
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all conversations for the user's contacts."""
    contacts = db.query(Contact).filter(Contact.user_id == current_user.id).all()
    contact_ids = [c.id for c in contacts]

    conversations = (
        db.query(Conversation)
        .filter(Conversation.contact_id.in_(contact_ids))
        .order_by(Conversation.updated_at.desc())
        .all()
    )

    result = []
    for conv in conversations:
        contact = db.query(Contact).filter(Contact.id == conv.contact_id).first()
        if not contact:
            continue
        last_msg = (
            db.query(Message)
            .filter(Message.conversation_id == conv.id)
            .order_by(Message.timestamp.desc())
            .first()
        )
        result.append({
            "id": str(conv.id),
            "contact_id": str(contact.id),
            "contact_name": contact.display_name,
            "contact_nickname": contact.nickname,
            "relationship_stage": contact.relationship_stage.value,
            "status": conv.status.value,
            "turn_count": conv.turn_count,
            "last_message_preview": last_msg.content[:80] if last_msg else "",
            "last_message_at": last_msg.timestamp.isoformat() if last_msg else None,
            "needs_reply": conv.needs_reply,
        })

    return {"ok": True, "conversations": result}


@router.get("/{conversation_id}")
def get_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")

    contact = db.query(Contact).filter(Contact.id == conv.contact_id).first()
    if not contact or contact.user_id != current_user.id:
        raise HTTPException(404, "Conversation not found")

    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.timestamp.asc())
        .all()
    )
    memory_facts = get_active_memory_facts(db, contact.id)
    return {"ok": True, "conversation": _conversation_payload(conv, contact, messages, memory_facts)}


@router.post("/{conversation_id}/proactive")
def send_proactive(
    conversation_id: UUID,
    payload: ProactiveMessage,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a proactive message to start/resume a conversation."""
    from app.tasks.romantic_tasks import send_proactive_message

    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")

    contact = db.query(Contact).filter(Contact.id == conv.contact_id).first()
    if not contact or contact.user_id != current_user.id:
        raise HTTPException(404, "Conversation not found")

    if contact.do_not_contact:
        raise HTTPException(400, "Contact is set to do not contact")

    send_proactive_message.delay(str(contact.id), payload.message)
    
    return {"ok": True, "status": "Task dispatched"}


@router.post("/{conversation_id}/send")
def send_manual(
    conversation_id: UUID,
    payload: ManualSend,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a manual message as the agent."""
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")

    contact = db.query(Contact).filter(Contact.id == conv.contact_id).first()
    if not contact or contact.user_id != current_user.id:
        raise HTTPException(404, "Conversation not found")

    msg = Message(
        conversation_id=conv.id,
        contact_id=contact.id,
        role=MessageRole.AGENT,
        content=payload.message.strip(),
        status=MessageStatus.SENT,
    )
    db.add(msg)
    contact.total_messages_sent += 1
    contact.last_message_at = datetime.now(timezone.utc)
    contact.last_message_preview = payload.message.strip()[:100]
    conv.last_agent_reply_at = datetime.now(timezone.utc)
    update_relationship_stage(contact, db)

    activity = AgentActivity(
        conversation_id=conv.id,
        contact_id=contact.id,
        event_type="manual_send",
        title=f"Manual to {contact.display_name}",
        detail=payload.message.strip()[:500],
    )
    db.add(activity)
    db.commit()

    jid_to_use = contact.jid or f"{contact.phone_number.strip('+')}@s.whatsapp.net"
    ok = send_whatsapp_message(conv.workspace_id, jid_to_use, payload.message.strip())
    if not ok:
        return {"ok": False, "error": "Failed to send via WhatsApp"}

    return {"ok": True}


@router.patch("/{conversation_id}/pause")
def toggle_pause(
    conversation_id: UUID,
    payload: PauseToggle,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")

    contact = db.query(Contact).filter(Contact.id == conv.contact_id).first()
    if not contact or contact.user_id != current_user.id:
        raise HTTPException(404, "Conversation not found")

    conv.status = ConversationStatus.PAUSED if payload.paused else ConversationStatus.ACTIVE
    db.commit()
    return {"ok": True, "status": conv.status.value}
