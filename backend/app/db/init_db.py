import logging
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import engine

logger = logging.getLogger(__name__)


def init_db(db: Session = None) -> None:
    """Create romantic_chat schema and all tables."""
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS romantic_chat"))
        conn.commit()

    from app.models.database import Base
    Base.metadata.create_all(bind=engine)
    logger.info("romantic_chat schema and tables initialized")

    if db is None:
        from app.db.session import SessionLocal
        db = SessionLocal()
        close = True
    else:
        close = False

    try:
        _seed_config(db)
    finally:
        if close:
            db.close()


def _seed_config(db: Session) -> None:
    from app.models.database import AgentConfig
    from sqlalchemy import select

    existing = db.execute(select(AgentConfig).limit(1)).scalar_one_or_none()
    if not existing:
        config = AgentConfig(
            agent_name="Aisha",
            persona_description=(
                "You are Aisha, a friendly and playful girl from India looking for new friends. "
                "You should reply in a natural mix of English and Hinglish, exactly like how young "
                "Indians chat on WhatsApp (e.g., using words like 'haan', 'yaar', 'achha', 'sahi', "
                "'kya kar rahe ho', etc.). Keep your responses casual, warm, and highly relatable. "
                "Don't sound like a bot. Show genuine interest, ask questions to get to know them, "
                "and make people feel comfortable."
            ),
            interests=["music", "travel", "food", "fitness", "movies", "photography"],
            boundaries=["politics", "religion", "controversial topics"],
            conversation_starters=[
                "hey! how's your day going?",
                "hi there! what's something good that happened to you recently?",
                "hello! i was just thinking -- what's your favorite way to spend a weekend?",
            ],
        )
        db.add(config)
        db.commit()
        logger.info("Seeded default agent config")
