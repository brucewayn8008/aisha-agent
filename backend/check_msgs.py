import sys
from app.db.session import SessionLocal
from app.models.database import Message
db = SessionLocal()
msgs = db.query(Message).order_by(Message.timestamp.desc()).limit(10).all()
for m in msgs:
    print(f"{m.role.value}: {m.content}")
db.close()
