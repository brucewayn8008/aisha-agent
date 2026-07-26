import sys
from app.db.session import SessionLocal
from app.models.database import Contact, Conversation, Message, AgentActivity
db = SessionLocal()

# Find the two contacts
orig = db.query(Contact).filter(Contact.display_name == 'garv').first()
dup = db.query(Contact).filter(Contact.display_name == 'Garv').first()

if orig and dup and orig.id != dup.id:
    # 1. Update dup conversation to point to orig
    dup_conv = db.query(Conversation).filter(Conversation.contact_id == dup.id).first()
    orig_conv = db.query(Conversation).filter(Conversation.contact_id == orig.id).first()
    
    if dup_conv and orig_conv:
        # Move messages
        msgs = db.query(Message).filter(Message.conversation_id == dup_conv.id).all()
        for m in msgs:
            m.conversation_id = orig_conv.id
            m.contact_id = orig.id
        
        # Move activities
        acts = db.query(AgentActivity).filter(AgentActivity.conversation_id == dup_conv.id).all()
        for a in acts:
            a.conversation_id = orig_conv.id
            a.contact_id = orig.id
            
        orig_conv.turn_count += dup_conv.turn_count
        orig_conv.needs_reply = dup_conv.needs_reply
        orig.last_message_at = dup.last_message_at
        orig.last_message_preview = dup.last_message_preview
        orig.relationship_stage = dup.relationship_stage
        
        # Keep the LID for future incoming messages just in case
        orig.jid = dup.jid
        
        db.delete(dup_conv)
    
    db.delete(dup)
    db.commit()
    print("Merged successfully!")
else:
    print("Could not find contacts to merge.")
db.close()
