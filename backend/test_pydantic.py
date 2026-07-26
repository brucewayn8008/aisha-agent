from typing import Optional
from pydantic import BaseModel

class ContactResponse(BaseModel):
    id: str
    phone_number: str
    jid: Optional[str] = None

class ContactListResponse(BaseModel):
    data: list[ContactResponse]

try:
    c = ContactListResponse(data=[{"id": "1", "phone_number": "123", "jid": None}])
    print("Success:", c)
except Exception as e:
    print("Error:", e)
