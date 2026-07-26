import sys
from app.db.session import SessionLocal
from app.models.database import Contact
from app.tasks.romantic_tasks import send_proactive_message
db = SessionLocal()
contact = db.query(Contact).filter(Contact.display_name == 'garv').first()
if contact:
    print(f"Triggering dynamic proactive message for {contact.display_name}")
    send_proactive_message.delay(str(contact.id))
db.close()
