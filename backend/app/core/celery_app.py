import os
from celery import Celery

BROKER_URL = os.getenv("REDIS_URL", "redis://localhost:6379/1")
RESULT_BACKEND = os.getenv("REDIS_URL", "redis://localhost:6379/1")

celery_app = Celery(
    "romantic_agent",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=["app.tasks.romantic_tasks"],
)

celery_app.conf.update(
    task_default_queue="romantic",
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

celery_app.conf.beat_schedule = {
    "reset-daily-counters": {
        "task": "romantic.reset_daily_counters",
        "schedule": 86400.0,
    },
    "idle-checkin": {
        "task": "romantic.check_idle_conversations",
        "schedule": 14400.0,
    },
}
