"""
Human-like typing delay for more natural response timing.

Adds a short delay before sending replies to simulate typing.
This reduces WhatsApp spam detection risk and makes the agent
feel more real.
"""

import logging
import time

logger = logging.getLogger(__name__)

# Typical typing speed: ~40-60 WPM = ~0.8-1.2 seconds per word
# But WhatsApp users type faster on mobile: ~25-40 WPM
CHARS_PER_SECOND = 100.0  # Extremely fast typing speed
MIN_DELAY = 0.1  # Minimum delay in seconds (100ms)
MAX_DELAY = 0.5  # Maximum delay in seconds (500ms)


def calculate_typing_delay(message: str) -> float:
    """Calculate a human-like typing delay based on message length.

    Args:
        message: The reply text to be "typed"

    Returns:
        Delay in seconds (between MIN_DELAY and MAX_DELAY)
    """
    char_count = len(message)
    base_delay = char_count / CHARS_PER_SECOND

    # Add a small "reading" time for the incoming message
    reading_time = 0.1

    total = reading_time + base_delay
    delay = max(MIN_DELAY, min(total, MAX_DELAY))

    return round(delay, 1)


def apply_typing_delay(message: str) -> None:
    """Sleep for a human-like duration before sending a reply.

    Args:
        message: The reply text that will be sent
    """
    delay = calculate_typing_delay(message)
    logger.info("Applying typing delay: %.1fs for %d-char message", delay, len(message))
    time.sleep(delay)
