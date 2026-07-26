import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from app.models.database import MemoryFact, RelationshipStage

logger = logging.getLogger(__name__)

RELATIONSHIP_THRESHOLDS = [
    (50, RelationshipStage.CLOSE_FRIEND),
    (21, RelationshipStage.FRIEND),
    (6, RelationshipStage.ACQUAINTANCE),
    (0, RelationshipStage.STRANGER),
]


def get_stage_for_turn_count(turn_count: int) -> RelationshipStage:
    for threshold, stage in RELATIONSHIP_THRESHOLDS:
        if turn_count >= threshold:
            return stage
    return RelationshipStage.STRANGER


def update_relationship_stage(contact, db: Session) -> None:
    """Update contact's relationship stage based on total messages."""
    total = contact.total_messages_sent + contact.total_messages_received
    new_stage = get_stage_for_turn_count(total)
    if contact.relationship_stage != new_stage:
        contact.relationship_stage = new_stage
        logger.info("Contact %s progressed to %s", contact.display_name, new_stage.value)


def add_memory_fact(
    db: Session,
    contact_id,
    category: str,
    fact: str,
    context: str = "",
    confidence: int = 100,
) -> MemoryFact | None:
    """Add a new memory fact for a contact, with deduplication.

    Returns the MemoryFact if created, or None if a duplicate was found.
    """
    fact_lower = fact.strip().lower()

    # Check for duplicate: same contact + category + similar fact text
    existing = (
        db.query(MemoryFact)
        .filter(
            MemoryFact.contact_id == contact_id,
            MemoryFact.category == category,
            MemoryFact.is_active.is_(True),
        )
        .all()
    )
    for ex in existing:
        ex_lower = ex.fact.strip().lower()
        # Skip if the new fact is a substring of an existing one, or vice versa
        if fact_lower in ex_lower or ex_lower in fact_lower:
            logger.info("Skipping duplicate memory fact: '%s' (existing: '%s')", fact, ex.fact)
            return None

    mf = MemoryFact(
        contact_id=contact_id,
        category=category,
        fact=fact,
        confidence=confidence,
        source="inferred",
        context=context,
    )
    db.add(mf)
    db.commit()
    db.refresh(mf)
    return mf


def get_active_memory_facts(db: Session, contact_id) -> list[MemoryFact]:
    """Get all active memory facts for a contact."""
    return (
        db.query(MemoryFact)
        .filter(MemoryFact.contact_id == contact_id, MemoryFact.is_active.is_(True))
        .order_by(MemoryFact.created_at.desc())
        .all()
    )


def get_memory_facts_by_category(db: Session, contact_id, category: str) -> list[MemoryFact]:
    """Get memory facts filtered by category."""
    return (
        db.query(MemoryFact)
        .filter(
            MemoryFact.contact_id == contact_id,
            MemoryFact.is_active.is_(True),
            MemoryFact.category == category,
        )
        .all()
    )


def deactivate_fact(db: Session, fact_id) -> bool:
    """Soft-delete a memory fact."""
    fact = db.query(MemoryFact).filter(MemoryFact.id == fact_id).first()
    if fact:
        fact.is_active = False
        db.commit()
        return True
    return False


def build_memory_context(db: Session, contact_id, max_chars: int = 1500) -> str:
    """Build a text summary of memory facts for prompt injection."""
    facts = get_active_memory_facts(db, contact_id)
    if not facts:
        return ""

    lines = []
    total = 0
    for fact in facts:
        line = f"- [{fact.category}] {fact.fact}"
        if total + len(line) > max_chars:
            break
        lines.append(line)
        total += len(line)

    return "\n".join(lines) if lines else ""
