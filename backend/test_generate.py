import sys
from app.db.session import SessionLocal
from app.models.database import Contact, Conversation, AgentConfig
from app.services.agent_service import generate_reply_and_extract_memory
db = SessionLocal()
contact = db.query(Contact).filter(Contact.display_name == 'garv').first()
conversation = db.query(Conversation).filter(Conversation.contact_id == contact.id).first()
config = db.query(AgentConfig).first()
print("Generating proactive...")
msg, _ = generate_reply_and_extract_memory(
    db, contact, conversation, config, 
    override_latest_message="[System: You are initiating the conversation. Send a natural, engaging first message in Hinglish to get their attention. Be playful or casual, don't just say 'hi'.]"
)
print("PROACTIVE GENERATED: ", msg)
