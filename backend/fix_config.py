import sys
from app.db.session import SessionLocal
from app.models.database import AgentConfig
db = SessionLocal()
config = db.query(AgentConfig).first()
if config:
    config.auto_reply_enabled = True
    config.is_running = True
    db.commit()
    print("Enabled auto-reply")
else:
    print("No config found")
db.close()
