from fastapi import APIRouter
from app.api.endpoints import webhook, contacts, conversations, settings, agent, auth

api_router = APIRouter()
api_router.include_router(webhook.router, prefix="/webhook", tags=["webhook"])
api_router.include_router(contacts.router, prefix="/contacts", tags=["contacts"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(agent.router, prefix="/agent", tags=["agent"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
