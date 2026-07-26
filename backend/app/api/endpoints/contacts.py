from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.database import Contact, ContactStatus, RelationshipStage, User
from app.services.memory_service import get_active_memory_facts, get_stage_for_turn_count

router = APIRouter()

class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int

class MemoryFactResponse(BaseModel):
    id: str
    category: str
    fact: str
    confidence: float
    source: str
    context: Optional[str] = None
    created_at: str

class ContactResponse(BaseModel):
    id: str
    phone_number: str
    jid: str | None = None
    display_name: str
    nickname: Optional[str] = None
    status: str
    tags: list[str]
    relationship_stage: str
    notes: Optional[str] = None
    total_messages: int
    last_message_at: Optional[str] = None
    last_message_preview: Optional[str] = None
    do_not_contact: bool
    created_at: str
    memory_facts: Optional[list[MemoryFactResponse]] = None

class ContactListResponse(BaseModel):
    data: list[ContactResponse]
    pagination: PaginationMeta

class SingleContactResponse(BaseModel):
    data: ContactResponse


class ContactCreate(BaseModel):
    phone_number: str
    display_name: str
    nickname: Optional[str] = None
    tags: Optional[list[str]] = None
    notes: Optional[str] = None


class ContactUpdate(BaseModel):
    nickname: Optional[str] = None
    tags: Optional[list[str]] = None
    status: Optional[str] = None
    relationship_stage: Optional[str] = None
    notes: Optional[str] = None
    do_not_contact: Optional[bool] = None


def _contact_payload(contact: Contact) -> dict:
    return {
        "id": str(contact.id),
        "phone_number": contact.phone_number,
        "jid": contact.jid,
        "display_name": contact.display_name,
        "nickname": contact.nickname,
        "status": contact.status.value,
        "tags": contact.tags or [],
        "relationship_stage": contact.relationship_stage.value,
        "notes": contact.notes,
        "total_messages": contact.total_messages_sent + contact.total_messages_received,
        "last_message_at": contact.last_message_at.isoformat() if contact.last_message_at else None,
        "last_message_preview": contact.last_message_preview,
        "do_not_contact": contact.do_not_contact,
        "created_at": contact.created_at.isoformat(),
    }


@router.get("/", response_model=ContactListResponse)
def list_contacts(
    status: Optional[str] = None,
    stage: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Contact).filter(Contact.user_id == current_user.id)
    if status:
        query = query.filter(Contact.status == ContactStatus(status))
    else:
        query = query.filter(Contact.status != ContactStatus.ARCHIVED)
        
    if stage:
        query = query.filter(Contact.relationship_stage == RelationshipStage(stage))
    if search:
        query = query.filter(Contact.display_name.ilike(f"%{search}%"))

    total_items = query.count()
    skip = (page - 1) * page_size
    contacts = query.order_by(Contact.updated_at.desc()).offset(skip).limit(page_size).all()
    
    total_pages = (total_items + page_size - 1) // page_size
    
    return ContactListResponse(
        data=[_contact_payload(c) for c in contacts],
        pagination=PaginationMeta(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages
        )
    )


@router.post("/")
def create_contact(
    payload: ContactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.database import Conversation, ConversationStatus
    
    contact = Contact(
        user_id=current_user.id,
        phone_number=payload.phone_number,
        display_name=payload.display_name,
        nickname=payload.nickname,
        tags=payload.tags,
        notes=payload.notes,
    )
    db.add(contact)
    db.flush()  # To get contact.id
    
    conversation = Conversation(
        contact_id=contact.id,
        workspace_id="11111111-1111-1111-1111-111111111111",
        status=ConversationStatus.ACTIVE,
    )
    db.add(conversation)
    db.commit()
    db.refresh(contact)
    return SingleContactResponse(data=_contact_payload(contact))


@router.get("/{contact_id}")
def get_contact(
    contact_id,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contact = db.query(Contact).filter(
        Contact.id == contact_id, Contact.user_id == current_user.id
    ).first()
    if not contact:
        raise HTTPException(404, "Contact not found")

    facts = get_active_memory_facts(db, contact.id)
    result = _contact_payload(contact)
    result["memory_facts"] = [
        {
            "id": str(f.id),
            "category": f.category,
            "fact": f.fact,
            "confidence": f.confidence,
            "source": f.source,
            "context": f.context,
            "created_at": f.created_at.isoformat(),
        }
        for f in facts
    ]
    return SingleContactResponse(data=result)


@router.patch("/{contact_id}")
def update_contact(
    contact_id,
    payload: ContactUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contact = db.query(Contact).filter(
        Contact.id == contact_id, Contact.user_id == current_user.id
    ).first()
    if not contact:
        raise HTTPException(404, "Contact not found")

    if payload.nickname is not None:
        contact.nickname = payload.nickname
    if payload.tags is not None:
        contact.tags = payload.tags
    if payload.status is not None:
        contact.status = ContactStatus(payload.status)
    if payload.relationship_stage is not None:
        contact.relationship_stage = RelationshipStage(payload.relationship_stage)
    if payload.notes is not None:
        contact.notes = payload.notes
    if payload.do_not_contact is not None:
        contact.do_not_contact = payload.do_not_contact

    contact.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(contact)
    return SingleContactResponse(data=_contact_payload(contact))


@router.delete("/{contact_id}")
def archive_contact(
    contact_id,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contact = db.query(Contact).filter(
        Contact.id == contact_id, Contact.user_id == current_user.id
    ).first()
    if not contact:
        raise HTTPException(404, "Contact not found")
    contact.status = ContactStatus.ARCHIVED
    db.commit()
    return {"ok": True}


@router.post("/{contact_id}/start_chat")
def start_chat(
    contact_id,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.database import Conversation, ConversationStatus, AgentActivity
    from app.tasks.romantic_tasks import send_proactive_message
    
    contact = db.query(Contact).filter(
        Contact.id == contact_id, Contact.user_id == current_user.id
    ).first()
    if not contact:
        raise HTTPException(404, "Contact not found")
        
    conv = db.query(Conversation).filter(
        Conversation.contact_id == contact.id,
        Conversation.status == ConversationStatus.ACTIVE
    ).first()
    
    if not conv:
        conv = Conversation(
            contact_id=contact.id,
            workspace_id="11111111-1111-1111-1111-111111111111",
            status=ConversationStatus.ACTIVE,
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)
        
    activity = AgentActivity(
        contact_id=contact.id,
        conversation_id=conv.id,
        event_type="proactive_sent",
        title=f"Proactive to {contact.display_name}",
        detail="Started chat from Contacts page",
    )
    db.add(activity)
    db.commit()

    # send_proactive_message(contact_id, message) — it resolves the contact's
    # conversation itself, so we pass only the contact id and opener text.
    send_proactive_message.delay(str(contact.id), "hey! 👋")
    return {"ok": True, "conversation_id": str(conv.id)}
