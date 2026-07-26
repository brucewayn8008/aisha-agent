import sys
from app.db.session import SessionLocal
from app.models.database import User
db = SessionLocal()
users = db.query(User).all()
for u in users:
    print(f"User: {u.id}, Email: {u.email}")
db.close()
