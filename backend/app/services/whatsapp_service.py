import logging
import os

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

GO_GATEWAY_URL = os.getenv("GO_GATEWAY_URL", settings.GO_GATEWAY_URL)


def send_whatsapp_message(workspace_id: str, to: str, text: str) -> bool:
    """Send a WhatsApp message via the Go gateway."""
    try:
        payload = {"workspace_id": str(workspace_id), "to": to, "text": text}
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(f"{GO_GATEWAY_URL}/api/send", json=payload)
            resp.raise_for_status()
        logger.info("Message sent to %s", to)
        return True
    except Exception as exc:
        logger.error("Failed to send WhatsApp message: %s", exc)
        return False


def start_session(workspace_id: str) -> tuple[bool, str | None]:
    """Start a WhatsApp session for the given workspace."""
    try:
        with httpx.Client(timeout=12.0) as client:
            resp = client.get(
                f"{GO_GATEWAY_URL}/api/session/start",
                params={"workspace_id": workspace_id},
            )
            resp.raise_for_status()
        return True, None
    except Exception as exc:
        return False, str(exc)
