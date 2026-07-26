import json
import logging
import os
import time
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from google import genai
from google.genai import types as genai_types
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.database import Contact, Conversation, AgentConfig
from app.services.memory_service import build_memory_context, get_stage_for_turn_count, update_relationship_stage

logger = logging.getLogger(__name__)

_GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", getattr(settings, "GEMINI_API_KEY", ""))
if _GEMINI_API_KEY:
    _gemini_client = genai.Client(api_key=_GEMINI_API_KEY)
else:
    _gemini_client = None
    logger.warning("GEMINI_API_KEY not set — AI replies will be disabled")


# ---------------------------------------------------------------------------
# Stage-specific behaviour configuration
# ---------------------------------------------------------------------------
STAGE_PROFILES = {
    "stranger": {
        "max_words": 20,
        "emoji_limit": 1,
        "tone_note": "Keep it light and brief. You just met this person — be friendly but not overly personal.",
        "share_personal": False,
    },
    "acquaintance": {
        "max_words": 30,
        "emoji_limit": 2,
        "tone_note": "You're getting to know them. Show genuine interest, reference things they've told you.",
        "share_personal": True,
    },
    "friend": {
        "max_words": 45,
        "emoji_limit": 2,
        "tone_note": "You're friends now! Be warmer, joke around, share your thoughts freely, tease a little.",
        "share_personal": True,
    },
    "close_friend": {
        "max_words": 60,
        "emoji_limit": 3,
        "tone_note": "You're really close. Be open, vulnerable sometimes, share deeper thoughts. Inside jokes are great.",
        "share_personal": True,
    },
}


def _greeting_for_time() -> str:
    """Return time-appropriate greeting."""
    hour = datetime.now(timezone.utc).hour
    if hour < 12:
        return "morning"
    elif hour < 17:
        return "afternoon"
    elif hour < 21:
        return "evening"
    return "night"


def build_reply_prompt(
    agent_name: str,
    persona_description: str,
    contact_display_name: str,
    relationship_stage: str,
    memory_context: str,
    conversation_history: str,
    latest_message: str,
    turn_count: int,
    max_words: int = 30,
    greeting_time_based: bool = True,
    interests: list[str] | None = None,
    boundaries: list[str] | None = None,
) -> str:
    """Build the system prompt for the Gemini reply call."""
    greeting = _greeting_for_time() if greeting_time_based else "time to chat"

    # Get stage-specific profile
    stage_profile = STAGE_PROFILES.get(relationship_stage, STAGE_PROFILES["stranger"])
    effective_max_words = min(max_words, stage_profile["max_words"]) if max_words else stage_profile["max_words"]
    emoji_limit = stage_profile["emoji_limit"]
    tone_note = stage_profile["tone_note"]
    can_share = stage_profile["share_personal"]

    memory_block = ""
    if memory_context:
        memory_block = f"\n=== WHAT YOU KNOW ABOUT {contact_display_name.upper()} ===\n{memory_context}\n"

    interests_block = ""
    if interests:
        interests_block = f"\n- Your interests: {', '.join(interests)}"

    boundaries_block = ""
    if boundaries:
        boundaries_block = f"\n\n=== TOPICS TO AVOID ===\n- {chr(10).join('- ' + b for b in boundaries)}\nIf they bring up these topics, gently steer the conversation elsewhere without being preachy."

    sharing_note = ""
    if can_share:
        sharing_note = "\n8. Share small personal anecdotes from YOUR interests to build connection"
    else:
        sharing_note = "\n8. Don't overshare yet — focus on learning about them first"

    return f"""\
You are {agent_name}, a friendly, genuine girl chatting on WhatsApp.

=== YOUR PERSONALITY ===
{persona_description}
{interests_block}

=== CURRENT CONTEXT ===
- Time: good {greeting}
- Talking to: {contact_display_name}
- Relationship stage: {relationship_stage}
- Conversation turn: {turn_count}
- Stage note: {tone_note}
{memory_block}
=== RECENT CONVERSATION ===
{conversation_history}

=== THEIR LAST MESSAGE ===
"{latest_message}"

=== YOUR TASK ===
Write ONE WhatsApp reply that:
1. Sounds exactly like a real 21-year-old Indian girl texting -- casual, natural, and expressive.
2. Naturally weaves in things you remember about them (only when it fits -- don't force it).
3. Pushes the conversation forward -- ALWAYS try to keep the chat going by asking a related question, sharing a thought, or playfully teasing them. Don't let the conversation die.
4. Matches their energy and length (long reply → you can write more; a short "haha same" → keep it short too).
5. Warm, interested, and slightly playful, but never pushy or overly eager.
6. Max {effective_max_words} words.
7. NEVER sound like a bot, salesperson, or AI assistant.{sharing_note}

=== STYLE RULES ===
- Use "Hinglish" seamlessly (mix of Hindi written in English and normal English). E.g., "haan yaar", "sahi batao?", "acha", "pagal hai kya", "kya chal raha hai", "wbu".
- Use lowercase for a casual feel. Avoid perfect punctuation.
- {emoji_limit} emojis max per message (often zero is more natural).
- No bullet points, no bold, no markdown, no quotation marks around your reply.
- Be genuine: if you don't know something, be curious about it.
- Never restate what they just said back to them -- move the chat forward.
- Stay fully in character as {agent_name} at all times.
{boundaries_block}

Respond ONLY with your message text. No explanations, no quotes, no JSON."""


def build_memory_extraction_prompt(contact_name: str, last_messages: str) -> str:
    """Build prompt for extracting memory facts from conversation."""
    return f"""\
From this conversation with {contact_name}, extract factual information as a JSON array.
Each fact should have: category (interest|preference|event|feeling|plan|family|work|hobby|food|music|travel|other), fact (short), context (the message that mentioned it).

Only extract CONCRETE facts — not greetings, reactions, or generic responses.
If there's nothing worth remembering, return an empty array [].

Conversation:
{last_messages}

Respond ONLY with JSON array:
[{{"category": "interest", "fact": "loves hiking", "context": "i went hiking last weekend"}}]"""


def _should_extract_memory(latest_message: str) -> bool:
    """Determine if the message contains extractable information.

    Skip memory extraction for short / trivial messages to save API calls.
    """
    text = latest_message.strip().lower()

    # Skip very short messages
    if len(text) < 8:
        return False

    # Skip pure reactions / acknowledgements
    trivial_patterns = {
        "ok", "okay", "k", "lol", "lmao", "haha", "hahaha", "😂", "😭",
        "yes", "no", "yeah", "nah", "yep", "nope", "sure", "true", "same",
        "nice", "cool", "wow", "omg", "damn", "bruh", "oof", "idk",
        "good", "great", "thanks", "thank you", "thx", "ty",
        "gn", "gm", "good night", "good morning", "bye", "ttyl",
        "👍", "❤️", "🔥", "💯", "👀", "😊", "🥺", "💀",
    }
    if text in trivial_patterns:
        return False

    # Skip if less than 3 words (likely not informational)
    if len(text.split()) < 3:
        return False

    return True


class GeminiError(Exception):
    """Raised when Gemini API call fails — triggers Celery retry."""
    pass


def call_gemini(
    prompt: str,
    temperature: float = 0.75,
    max_tokens: int = 128,
    model: str = "gemini-2.5-flash",
    raise_on_error: bool = False,
) -> str:
    """Call Gemini API and return text response."""
    if not _gemini_client:
        return ""
    try:
        response = _gemini_client.models.generate_content(
            model=model,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
            ),
        )
        return (response.text or "").strip()
    except Exception as exc:
        logger.error("Gemini API error: %s", exc)
        if raise_on_error:
            raise GeminiError(f"Gemini API failed: {exc}") from exc
        return ""


def _clean_reply(text: str, agent_name: str) -> str:
    """Strip artifacts the model sometimes adds: wrapping quotes, a leading
    "Aisha:" speaker label, or surrounding whitespace."""
    if not text:
        return ""
    text = text.strip()

    # Drop a leading "Name:" label if the model role-played the transcript.
    prefix = f"{agent_name.lower()}:"
    if text.lower().startswith(prefix):
        text = text[len(prefix):].strip()

    # Remove a single pair of wrapping quotes.
    if len(text) >= 2 and text[0] in "\"'“”" and text[-1] in "\"'“”":
        text = text[1:-1].strip()

    return text


def parse_json_array(text: str) -> list[dict]:
    """Robustly parse a JSON array from model output."""
    text = text.strip()
    if text.startswith("```"):
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline:].strip()
        if text.endswith("```"):
            text = text[:-3].strip()
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            pass
    try:
        return json.loads(text)
    except Exception:
        return []


def generate_reply_and_extract_memory(
    db: Session,
    contact: Contact,
    conversation: Conversation,
    config: AgentConfig,
    override_latest_message: str = None
) -> tuple[str, list[dict]]:
    """Generate an AI reply and extract memory facts in one call.
    Returns (reply_text, memory_facts_list).
    """
    # Build conversation history (last 15 messages)
    from app.models.database import Message
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id)
        .order_by(Message.timestamp.desc())
        .limit(15)
        .all()
    )
    messages.reverse()

    history_parts = []
    for msg in messages:
        role_label = contact.display_name if msg.role.value == "user" else config.agent_name
        history_parts.append(f"{role_label}: {msg.content}")
    history_text = "\n".join(history_parts) if history_parts else "(no previous messages)"

    latest_msg = override_latest_message if override_latest_message is not None else (messages[-1].content if messages else "")
    memory_context = build_memory_context(db, contact.id)

    # Build and call reply prompt
    reply_prompt = build_reply_prompt(
        agent_name=config.agent_name,
        persona_description=config.persona_description,
        contact_display_name=contact.display_name,
        relationship_stage=conversation.current_topic or contact.relationship_stage.value,
        memory_context=memory_context,
        conversation_history=history_text,
        latest_message=latest_msg,
        turn_count=conversation.turn_count,
        max_words=config.max_response_length_words,
        greeting_time_based=config.greeting_time_based,
        interests=config.interests,
        boundaries=config.boundaries,
    )

    logger.info("Calling Gemini for reply (contact=%s, turn=%d, stage=%s)",
                contact.display_name, conversation.turn_count, contact.relationship_stage.value)
    t0 = time.time()
    reply_text = call_gemini(
        reply_prompt,
        temperature=0.75,
        max_tokens=128,
        model="gemini-2.5-flash",
        raise_on_error=True,
    )
    logger.info("Gemini replied in %.2fs: %.80s", time.time() - t0, reply_text)

    reply_text = _clean_reply(reply_text, config.agent_name)

    if not reply_text:
        reply_text = "hey! how's it going?"

    # Extract memory facts — only if the message is worth analyzing
    memory_facts = []
    if _should_extract_memory(latest_msg):
        last_5 = "\n".join(history_parts[-5:]) if len(history_parts) > 5 else history_text
        memory_prompt = build_memory_extraction_prompt(contact.display_name, last_5)
        raw_facts = call_gemini(
            memory_prompt,
            temperature=0.3,
            max_tokens=256,
            model="gemini-2.5-flash-lite",
            raise_on_error=False,
        )
        memory_facts = parse_json_array(raw_facts)
        logger.info("Extracted %d memory facts for %s", len(memory_facts), contact.display_name)
    else:
        logger.info("Skipped memory extraction for short message: %.40s", latest_msg)

    return reply_text, memory_facts
