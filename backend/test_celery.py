import sys
from app.core.celery_app import celery_app
from app.tasks.romantic_tasks import send_proactive_message
try:
    res = send_proactive_message.delay("test", "test message")
    print("Task ID:", res.id)
except Exception as e:
    import traceback
    traceback.print_exc()
