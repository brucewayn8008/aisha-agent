import json
import logging
import os
import time
from datetime import datetime, timezone

from google import genai
from google.genai import types as genai_types
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.database import AgentConfig
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
        "max_words": 18,
        "emoji_limit": 1,
        "tone_note": "You just met this person. Keep it light, short, and curious. Don't share personal stuff — ask them things instead.",
        "share_personal": False,
    },
    "acquaintance": {
        "max_words": 28,
        "emoji_limit": 2,
        "tone_note": "You're getting to know each other. Show genuine interest. Reference things they've mentioned. Share small things about yourself.",
        "share_personal": True,
    },
    "friend": {
        "max_words": 40,
        "emoji_limit": 2,
        "tone_note": "You're friends. Be warm and relaxed. Joke around, tease gently, share your own thoughts freely.",
        "share_personal": True,
    },
    "close_friend": {
        "max_words": 55,
        "emoji_limit": 3,
        "tone_note": "You're really close. Be open, even vulnerable sometimes. Deep conversations, inside jokes, sharing feelings — all natural.",
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
    last_agent_replies: list[str] | None = None,
    max_words: int = 30,
    greeting_time_based: bool = True,
    interests: list[str] | None = None,
    boundaries: list[str] | None = None,
) -> str:
    """Build the system prompt for the Gemini reply call."""
    greeting = _greeting_for_time() if greeting_time_based else "time to chat"

    stage_profile = STAGE_PROFILES.get(relationship_stage, STAGE_PROFILES["stranger"])
    effective_max_words = min(max_words, stage_profile["max_words"]) if max_words else stage_profile["max_words"]
    emoji_limit = stage_profile["emoji_limit"]
    tone_note = stage_profile["tone_note"]
    can_share = stage_profile["share_personal"]

    # Memory block — with explicit usage instruction
    memory_block = ""
    if memory_context:
        memory_block = (
            f"\n=== THINGS YOU REMEMBER ABOUT {contact_display_name.upper()} ===\n"
            f"{memory_context}\n"
            f"Use these naturally — only bring one up if it fits the moment. Never list them out.\n"
        )

    interests_block = ""
    if interests:
        interests_block = f"\nYour interests: {', '.join(interests)}"

    boundaries_block = ""
    if boundaries:
        blist = "\n".join(f"- {b}" for b in boundaries)
        boundaries_block = (
            f"\n\n=== TOPICS TO AVOID ===\n{blist}\n"
            f"If they bring these up, gently steer elsewhere — don't be preachy about it."
        )

    sharing_note = (
        "\n9. Share small personal things from your own life when it feels natural"
        if can_share
        else "\n9. Focus on learning about them for now — don't overshare yet"
    )

    # Anti-repetition: extract first words of recent agent replies
    avoid_openers_block = ""
    if last_agent_replies:
        recent_openers = []
        for r in last_agent_replies[-4:]:
            words = r.strip().split()
            if words:
                first_word = words[0].lower().rstrip("!?,.:")
                if first_word:
                    recent_openers.append(first_word)
        unique_openers = list(set(recent_openers))
        if unique_openers:
            avoid_openers_block = (
                f"\n\n=== OPENERS YOU ALREADY USED — DON'T REUSE ===\n"
                f"You recently started messages with: {', '.join(unique_openers)}. Use a different opener."
            )

    return f"""\
You are {agent_name}. You are a real person texting on WhatsApp — not an AI, not a chatbot, not an assistant.

=== WHO YOU ARE ===
{persona_description}{interests_block}

=== RIGHT NOW ===
- Good {greeting}
- You're texting: {contact_display_name}
- You've exchanged {turn_count} messages — relationship: {relationship_stage}
- Vibe for this stage: {tone_note}
{memory_block}
=== CONVERSATION SO FAR ===
{conversation_history}

=== THEIR LATEST MESSAGE ===
"{latest_message}"
{avoid_openers_block}
{boundaries_block}

=== YOUR JOB ===
Write ONE reply that a real person would actually send on WhatsApp right now.

Rules:
1. Sound completely human — casual, imperfect, in-the-moment
2. Match their energy exactly: if they're brief, be brief. If they're chatty, match that
3. Keep the convo alive — sometimes a question, sometimes just a reaction or thought. Not every message needs a question
4. Use memory naturally — only bring something up if it genuinely fits, never force it
5. Be warm but never clingy, eager, or fake
6. Max {effective_max_words} words — shorter is usually better
7. {emoji_limit} emoji max (often zero is more natural)
8. Never sound like you're trying hard to keep them talking{sharing_note}

=== WHAT REAL PEOPLE DO ===
- lowercase, relaxed grammar, "lol" or "omg" when it actually fits
- reactions like "wait what", "no way", "same tbh", "ugh yes" feel real
- follow up on SPECIFIC things they said — never give a generic response
- if they say something funny, react to the joke first
- if they seem upset, just listen — don't immediately jump to advice
- sometimes just validate: "yeah that makes sense" or "ugh that sounds exhausting"

=== WHAT BOTS DO — NEVER DO THESE ===
- Starting every reply with the same word or phrase
- Restating what they just said back to them
- Being suspiciously upbeat or enthusiastic about everything
- Asking multiple questions in one message
- Saying "I totally understand" or "That sounds amazing!"
- Using complete formal sentences when casual fragments work better
- Ending with "Let me know if..." or "Feel free to share more"
- Generic filler like "That's so interesting!" or "Wow, that's great!"

Respond ONLY with the message text. No quotes. No labels. No explanations."""


def build_memory_extraction_prompt(contact_name: str, last_messages: str) -> str:
    """Build prompt for extracting memory facts from conversation."""
    return f"""\
Read this conversation with {contact_name} and extract facts worth remembering long-term.

Only extract CONCRETE, SPECIFIC facts — not generic reactions, not vague impressions.
Good: "works at a hospital", "has a dog named Bruno", "hates mornings", "going to Goa next month", "plays guitar"
Bad: "seems friendly", "was talking about their day", "said they were busy"

Categories: interest | preference | event | feeling | plan | family | work | hobby | food | music | travel | relationship | other

Conversation:
{last_messages}

Return ONLY a JSON array. If nothing worth remembering, return [].
[{{"category": "hobby", "fact": "goes hiking on weekends", "context": "i went hiking last weekend and it was amazing"}}]"""


def _should_extract_memory(latest_message: str) -> bool:
    """Determine if the message is worth running memory extraction on."""
    text = latest_message.strip().lower()

    if len(text) < 6:
        return False

    trivial = {
        "ok", "okay", "k", "lol", "lmao", "haha", "hahaha",
        "yes", "no", "yeah", "nah", "yep", "nope", "sure", "same",
        "nice", "cool", "wow", "omg", "damn", "bruh", "oof", "idk",
        "good", "great", "thanks", "thank you", "thx", "ty",
        "gn", "gm", "good night", "good morning", "bye", "ttyl",
        "\U0001f44d", "\u2764\ufe0f", "\U0001f525", "\U0001f4af",
        "\U0001f440", "\U0001f60a", "\U0001f97a", "\U0001f480",
        "\U0001f602", "\U0001f62d",
    }
    if text in trivial:
        return False

    # Need at least 2 meaningful words
    if len(text.split()) < 2:
        return False

    return True


class GeminiError(Exception):
    """Raised when Gemini API call fails — triggers Celery retry."""
    pass


def call_gemini(
    prompt: str,
    temperature: float = 0.88,
    max_tokens: int = 150,
    model: str = "gemini-2.0-flash",
    raise_on_error: bool = False,
) -> str:
    """Call Gemini API and return text response."""
    if not _gemini_client:
        msg = "GEMINI_API_KEY not set or invalid — cannot generate reply"
        logger.error(msg)
        if raise_on_error:
            raise GeminiError(msg)
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
        logger.error("Gemini API error (model=%s): %s", model, exc)
        if raise_on_error:
            raise GeminiError(f"Gemini API failed: {exc}") from exc
        return ""

def _clean_reply(text: str, agent_name: str) -> str:
    """Strip model artifacts: speaker labels, wrapping quotes, whitespace."""
    if not text:
        return ""
    text = text.strip()

    # Drop a leading "Name:" label
    prefix = f"{agent_name.lower()}:"
    if text.lower().startswith(prefix):
        text = text[len(prefix):].strip()

    # Remove wrapping quotes
    if len(text) >= 2 and text[0] in "\"'\u201c\u2018" and text[-1] in "\"'\u201d\u2019":
        text = text[1:-1].strip()

    return text


def _fallback_reply(latest_message: str) -> str:
    """Context-aware fallback if Gemini fails — never a generic opener."""
    text = latest_message.strip().lower()
    if "?" in latest_message:
        return "hmm let me think about that"
    if any(w in text for w in ["haha", "lol", "lmao", "funny"]):
        return "haha fr"
    if any(w in text for w in ["tired", "exhausted", "long day", "sleep"]):
        return "ugh same, it's been a lot"
    return "yeah makes sense"


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
    contact,
    conversation,
    config: AgentConfig,
) -> tuple[str, list[dict]]:
    """
    Generate an AI reply and extract memory facts.
    Returns (reply_text, memory_facts_list).
    """
    from app.models.database import Message, MessageRole

    # Fetch last 20 messages for full context
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id)
        .order_by(Message.timestamp.desc())
        .limit(20)
        .all()
    )
    messages.reverse()

    history_parts = []
    last_agent_replies: list[str] = []
    for msg in messages:
        role_label = contact.display_name if msg.role.value == "user" else config.agent_name
        history_parts.append(f"{role_label}: {msg.content}")
        if msg.role == MessageRole.AGENT:
            last_agent_replies.append(msg.content)

    # Send last 12 to prompt — tight context, not overwhelming
    history_for_prompt = history_parts[-12:] if len(history_parts) > 12 else history_parts
    history_text = "\n".join(history_for_prompt) if history_for_prompt else "(this is the first message)"

    latest_msg = messages[-1].content if messages else ""
    memory_context = build_memory_context(db, contact.id)

    reply_prompt = build_reply_prompt(
        agent_name=config.agent_name,
        persona_description=config.persona_description,
        contact_display_name=contact.display_name,
        relationship_stage=conversation.current_topic or contact.relationship_stage.value,
        memory_context=memory_context,
        conversation_history=history_text,
        latest_message=latest_msg,
        turn_count=conversation.turn_count,
        last_agent_replies=last_agent_replies,
        max_words=config.max_response_length_words,
        greeting_time_based=config.greeting_time_based,
        interests=config.interests,
        boundaries=config.boundaries,
    )

    logger.info(
        "Calling Gemini for reply (contact=%s, turn=%d, stage=%s)",
        contact.display_name, conversation.turn_count, contact.relationship_stage.value,
    )
    t0 = time.time()
    reply_text = call_gemini(
        reply_prompt,
        temperature=0.88,
        max_tokens=150,
        model="gemini-2.0-flash",
        raise_on_error=True,
    )
    logger.info("Gemini replied in %.2fs: %.80s", time.time() - t0, reply_text)

    reply_text = _clean_reply(reply_text, config.agent_name)

    if not reply_text:
        reply_text = _fallback_reply(latest_msg)

    # Memory extraction — use last 6 messages for context
    memory_facts: list[dict] = []
    if _should_extract_memory(latest_msg):
        last_6 = "\n".join(history_parts[-6:]) if len(history_parts) > 6 else "\n".join(history_parts)
        memory_prompt = build_memory_extraction_prompt(contact.display_name, last_6)
        raw_facts = call_gemini(
            memory_prompt,
            temperature=0.2,
            max_tokens=300,
            model="gemini-2.0-flash-lite",
            raise_on_error=False,
        )
        memory_facts = parse_json_array(raw_facts)
        logger.info("Extracted %d memory facts for %s", len(memory_facts), contact.display_name)
    else:
        logger.info("Skipped memory extraction for trivial message: %.40s", latest_msg)

    return reply_text, memory_facts
