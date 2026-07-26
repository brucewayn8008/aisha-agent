import os
import sys

# Setup paths for imports
sys.path.append("/Users/garvsanwariya/bounty/whatsapp_agent/romantic-chat/backend")

from app.db.session import SessionLocal
from app.api.endpoints.contacts import _contact_payload, ContactListResponse, Contact
from app.models.database import User

db = SessionLocal()
contacts = db.query(Contact).all()
payloads = [_contact_payload(c) for c in contacts]

try:
    c = ContactListResponse(data=payloads, pagination={"page": 1, "page_size": 10, "total_items": len(payloads), "total_pages": 1})
    print("Success:", c)
except Exception as e:
    import traceback
    traceback.print_exc()
