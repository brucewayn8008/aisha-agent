import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.database import (
    AgentActivity,
    Conversation,
    ConversationStatus,
    Contact,
    ContactStatus,
    Message,
    MessageRole,
    MessageStatus,
    User,
)
from app.services.agent_service import generate_reply_and_extract_memory
from app.services.memory_service import update_relationship_stage
from app.services.whatsapp_service import send_whatsapp_message
from app.tasks.romantic_tasks import generate_ai_reply

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/message")
async def receive_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        payload = await request.json()
    except Exception:
        logger.error("Invalid webhook body")
        return {"error": "invalid_json"}

    logger.info("Received webhook: %s", payload)

    workspace_id = payload.get("workspace_id")
    chat_jid = (payload.get("chat_jid") or "").strip()
    sender_jid = (payload.get("sender_jid") or chat_jid).strip()
    sender_name = (payload.get("sender") or "Unknown").strip() or "Unknown"
    text = (payload.get("text") or "").strip()
    from_me = bool(payload.get("fromMe"))
    is_group = bool(payload.get("is_group"))

    if from_me or not workspace_id or not text:
        return {"status": "ignored"}

    # Skip group messages — Aisha only handles 1-on-1 DMs
    if is_group:
        return {"status": "ignored", "reason": "group_message"}

    # Find or create user (single-user dev mode)
    user = db.query(User).first()
    if not user:
        user = User(email="demo@local.dev")
        db.add(user)
        db.commit()
        db.refresh(user)

    # Find or create contact by JID
    lead_jid = sender_jid if not is_group else chat_jid
    contact = (
        db.query(Contact)
        .filter(Contact.user_id == user.id, Contact.jid == lead_jid)
        .first()
    )

    if contact:
        contact.display_name = sender_name or contact.display_name
    else:
        contact = Contact(
            user_id=user.id,
            phone_number=lead_jid.split("@")[0],
            jid=lead_jid,
            display_name=sender_name,
            status=ContactStatus.ACTIVE,
        )
        db.add(contact)
        db.flush()

    # Find or create conversation
    conversation = (
        db.query(Conversation)
        .filter(Conversation.contact_id == contact.id, Conversation.workspace_id == workspace_id)
        .first()
    )
    if not conversation:
        conversation = Conversation(
            contact_id=contact.id,
            workspace_id=workspace_id,
            status=ConversationStatus.ACTIVE,
        )
        db.add(conversation)
        db.flush()

    if conversation.status == ConversationStatus.ENDED:
        conversation.status = ConversationStatus.ACTIVE

    # Store incoming message
    msg = Message(
        conversation_id=conversation.id,
        contact_id=contact.id,
        role=MessageRole.USER,
        content=text,
        status=MessageStatus.RECEIVED,
    )
    db.add(msg)

    # Update contact stats
    contact.total_messages_received += 1
    contact.last_message_at = datetime.now(timezone.utc)
    contact.last_message_preview = text[:100]
    conversation.turn_count += 1
    conversation.needs_reply = True

    # Log activity
    activity = AgentActivity(
        conversation_id=conversation.id,
        contact_id=contact.id,
        event_type="message_received",
        title=f"Message from {contact.display_name}",
        detail=text[:500],
    )
    db.add(activity)

    db.commit()

    # Enqueue AI reply task
    try:
        generate_ai_reply.delay(str(contact.id), str(conversation.id))
    except Exception as exc:
        logger.error("Failed to enqueue AI task: %s", exc)

    return {"status": "success", "contact_id": str(contact.id), "conversation_id": str(conversation.id)}
