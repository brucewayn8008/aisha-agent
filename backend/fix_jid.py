import sys
from app.db.session import SessionLocal
from app.models.database import Contact
db = SessionLocal()
contact = db.query(Contact).filter(Contact.display_name == 'garv').first()
if contact:
    phone = contact.phone_number.replace("+", "").replace(" ", "").replace("-", "")
    contact.jid = f"{phone}@s.whatsapp.net"
    db.commit()
    print(f"Fixed JID to {contact.jid}")
else:
    print("Contact not found")
db.close()
