import sys
from app.db.session import SessionLocal
from app.models.database import Contact
db = SessionLocal()
contacts = db.query(Contact).all()
for c in contacts:
    print(f"ID: {c.id}, JID: {c.jid}, Name: {c.display_name}, UserID: {c.user_id}")
db.close()
