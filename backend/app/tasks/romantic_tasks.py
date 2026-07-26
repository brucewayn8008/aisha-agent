import logging
import random
from datetime import datetime, timezone

from celery import shared_task
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.config import settings
from app.core.logging_setup import setup_logging
from app.db.session import SessionLocal
from app.models.database import (
    AgentActivity,
    AgentConfig,
    Conversation,
    ConversationStatus,
    Contact,
    Message,
    MessageRole,
    MessageStatus,
)
from app.services.agent_service import generate_reply_and_extract_memory, GeminiError
from app.services.typing_delay import apply_typing_delay
from app.services.memory_service import (
    add_memory_fact,
    get_active_memory_facts,
    update_relationship_stage,
)
from app.services.whatsapp_service import send_whatsapp_message

logger = logging.getLogger(__name__)


def _daily_quota_available(config: AgentConfig) -> bool:
    now = datetime.now(timezone.utc)
    if not config.last_daily_reset_at or config.last_daily_reset_at.date() != now.date():
        config.last_daily_reset_at = now
        config.messages_sent_today = 0
        return True
    return config.messages_sent_today < config.daily_message_limit


def _bump_sent_counter(config: AgentConfig) -> None:
    config.messages_sent_today = (config.messages_sent_today or 0) + 1


@shared_task(
    name="romantic.generate_reply",
    autoretry_for=(Exception, GeminiError),
    retry_backoff=True,
    retry_backoff_max=120,
    max_retries=2,
)
def generate_ai_reply(contact_id: str, conversation_id: str):
    """Generate AI reply for a contact's conversation."""
    db: Session = SessionLocal()
    try:
        contact = db.query(Contact).filter(Contact.id == contact_id).first()
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not contact or not conversation:
            logger.error("Contact or conversation not found: %s, %s", contact_id, conversation_id)
            return

        config = db.query(AgentConfig).first()
        if not config:
            logger.error("No agent config found")
            return

        if not config.auto_reply_enabled:
            logger.info("Auto-reply disabled, skipping")
            return

        if contact.do_not_contact:
            logger.info("Contact %s marked do_not_contact", contact.display_name)
            return

        if conversation.status == ConversationStatus.PAUSED:
            logger.info("Conversation paused, skipping")
            return

        # Generate reply + extract memory
        reply_text, memory_facts = generate_reply_and_extract_memory(db, contact, conversation, config)

        # Save memory facts
        for fact_data in memory_facts:
            if not isinstance(fact_data, dict):
                continue
            category = fact_data.get("category", "other")
            fact = fact_data.get("fact", "")
            context = fact_data.get("context", "")
            if fact and len(fact) > 2:
                add_memory_fact(db, contact.id, category, fact, context)

        # Determine if we should auto-send
        should_send = config.auto_send_enabled and _daily_quota_available(config)
        status = MessageStatus.SENT if should_send else MessageStatus.DRAFT

        agent_msg = Message(
            conversation_id=conversation.id,
            contact_id=contact.id,
            role=MessageRole.AGENT,
            content=reply_text,
            status=status,
        )
        db.add(agent_msg)

        # Update stats
        contact.total_messages_sent += 1
        contact.last_message_at = datetime.now(timezone.utc)
        contact.last_message_preview = reply_text[:100]
        conversation.last_agent_reply_at = datetime.now(timezone.utc)
        update_relationship_stage(contact, db)
        conversation.needs_reply = False

        # Log activity
        activity = AgentActivity(
            conversation_id=conversation.id,
            contact_id=contact.id,
            event_type="reply_sent" if should_send else "draft_created",
            title=f"Reply to {contact.display_name}",
            detail=reply_text[:500],
        )
        db.add(activity)

        if should_send:
            _bump_sent_counter(config)

        db.commit()

        # Send via WhatsApp (with human-like typing delay)
        if should_send and contact.jid:
            apply_typing_delay(reply_text)
            ok = send_whatsapp_message(conversation.workspace_id, contact.jid, reply_text)
            if not ok:
                logger.error("Failed to send WhatsApp message to %s", contact.jid)

        logger.info(
            "AI reply handled for %s: send=%s, stage=%s",
            contact.display_name, should_send, contact.relationship_stage.value,
        )

    except Exception as exc:
        logger.exception("Error generating AI reply: %s", exc)
        db.rollback()
        raise
    finally:
        db.close()


@shared_task(name="romantic.reset_daily_counters")
def reset_daily_counters():
    """Reset daily message counters (called by Celery Beat)."""
    db: Session = SessionLocal()
    try:
        config = db.query(AgentConfig).first()
        if config:
            config.messages_sent_today = 0
            config.last_daily_reset_at = datetime.now(timezone.utc)
            db.commit()
            logger.info("Daily counters reset")
    finally:
        db.close()


@shared_task(name="romantic.check_idle_conversations")
def check_idle_conversations():
    """Send low-pressure check-ins to idle conversations (called by Celery Beat)."""
    db: Session = SessionLocal()
    try:
        config = db.query(AgentConfig).first()
        if not config or not config.auto_reply_enabled or not config.auto_send_enabled:
            return

        cutoff_dt = datetime.fromtimestamp(
            datetime.now(timezone.utc).timestamp() - (24 * 3600), tz=timezone.utc
        )
        from sqlalchemy import or_
        idle_convs = (
            db.query(Conversation)
            .filter(
                Conversation.status == ConversationStatus.ACTIVE,
                or_(
                    Conversation.last_agent_reply_at.is_(None),
                    Conversation.last_agent_reply_at < cutoff_dt,
                ),
            )
            .limit(5)
            .all()
        )

        # Build a pool of conversation starters from config
        starters = config.conversation_starters or [
            "hey! how have you been?",
            "hi! what's new with you? ✨",
            "hey there! been thinking about ya, how's everything going?",
        ]

        for conv in idle_convs:
            contact = db.query(Contact).filter(Contact.id == conv.contact_id).first()
            if not contact or contact.do_not_contact:
                continue
            if not _daily_quota_available(config):
                break

            # Skip if the agent was the last to message (don't double-text)
            last_msg = (
                db.query(Message)
                .filter(Message.conversation_id == conv.id)
                .order_by(Message.timestamp.desc())
                .first()
            )
            if last_msg and last_msg.role == MessageRole.AGENT:
                continue

            # Pick a random starter and try to personalize with memory
            starter = random.choice(starters)
            memory_facts = get_active_memory_facts(db, contact.id)
            if memory_facts:
                # Pick a random fact to reference
                fact = random.choice(memory_facts)
                personalized = _build_contextual_checkin(contact.display_name, fact.fact, fact.category)
                if personalized:
                    starter = personalized

            msg = Message(
                conversation_id=conv.id,
                contact_id=contact.id,
                role=MessageRole.AGENT,
                content=starter,
                status=MessageStatus.SENT,
            )
            db.add(msg)
            contact.total_messages_sent += 1
            contact.last_message_at = datetime.now(timezone.utc)
            conv.last_agent_reply_at = datetime.now(timezone.utc)
            _bump_sent_counter(config)

            activity = AgentActivity(
                conversation_id=conv.id,
                contact_id=contact.id,
                event_type="idle_checkin",
                title=f"Idle check-in: {contact.display_name}",
                detail=starter,
            )
            db.add(activity)
            db.commit()

            if contact.jid:
                send_whatsapp_message(conv.workspace_id, contact.jid, starter)
    finally:
        db.close()


def _build_contextual_checkin(name: str, fact: str, category: str) -> str | None:
    """Build a personalized check-in message referencing a memory fact."""
    templates = {
        "hobby": [
            f"hey {name}! have you been doing any {fact} lately? 😊",
            f"hi! just curious, still into {fact}?",
        ],
        "interest": [
            f"hey! i remembered you're into {fact} -- seen anything cool recently?",
            f"hi {name}! anything new with {fact}? ✨",
        ],
        "work": [
            f"hey! how's work going? last time you mentioned {fact}",
            f"hi {name}! hope work isn't too crazy 😄",
        ],
        "plan": [
            f"hey! how did that plan go -- {fact}?",
            f"hi! did {fact} work out? been thinking about it",
        ],
        "event": [
            f"hey {name}! how was {fact}?",
            f"hi! been meaning to ask -- how did {fact} go?",
        ],
    }
    options = templates.get(category)
    if options:
        return random.choice(options)
    return None


@shared_task(name="romantic.proactive_outreach")
def send_proactive_message(contact_id: str, message: str = ""):
    """Send a proactive message to a specific contact."""
    db: Session = SessionLocal()
    try:
        contact = db.query(Contact).filter(Contact.id == contact_id).first()
        if not contact:
            return

        conversation = (
            db.query(Conversation)
            .filter(Conversation.contact_id == contact.id)
            .first()
        )
        if not conversation:
            return

        if contact.do_not_contact:
            return

        if not message:
            message = "hey! what's up?"

        msg = Message(
            conversation_id=conversation.id,
            contact_id=contact.id,
            role=MessageRole.AGENT,
            content=message,
            status=MessageStatus.SENT,
        )
        db.add(msg)
        contact.total_messages_sent += 1
        contact.last_message_at = datetime.now(timezone.utc)
        db.commit()

        if contact.jid:
            send_whatsapp_message(conversation.workspace_id, contact.jid, message)
    finally:
        db.close()
