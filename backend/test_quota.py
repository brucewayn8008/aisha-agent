from app.db.session import SessionLocal
from app.models.database import AgentConfig
from app.tasks.romantic_tasks import _daily_quota_available
db = SessionLocal()
config = db.query(AgentConfig).first()
print("auto_send_enabled:", config.auto_send_enabled)
print("daily_quota_available:", _daily_quota_available(config))
print("messages_sent_today:", config.messages_sent_today)
print("daily_message_limit:", config.daily_message_limit)
print("should_send:", config.auto_send_enabled and _daily_quota_available(config))
