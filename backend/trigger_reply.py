import sys
from app.db.session import SessionLocal
from app.models.database import Contact, Conversation
from app.tasks.romantic_tasks import generate_ai_reply
db = SessionLocal()
contact = db.query(Contact).filter(Contact.display_name == 'garv').first()
conversation = db.query(Conversation).filter(Conversation.contact_id == contact.id).first()
if conversation:
    print(f"Triggering reply for {contact.display_name}")
    generate_ai_reply.delay(str(contact.id), str(conversation.id))
db.close()
