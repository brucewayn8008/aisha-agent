# 🤖 Aisha — AI WhatsApp Companion Agent

Aisha is an AI-powered WhatsApp agent that engages in natural, human-like conversations. She remembers facts about contacts, adapts her personality over time, and manages relationship stages automatically.

## ✨ Features

- 🧠 **AI-powered conversations** using Google Gemini 2.5 Flash
- 💬 **Natural Hinglish chat** — talks like a real person on WhatsApp
- 🧾 **Memory system** — remembers facts about each contact
- 📊 **Relationship stages** — stranger → acquaintance → friend → close friend
- ⏱️ **Typing delays** — simulates human-like response timing
- 🔄 **Proactive check-ins** — sends warm follow-ups to idle conversations
- 📱 **Web dashboard** — manage contacts, view conversations, configure agent

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│   Gateway    │────▶ WhatsApp
│  (Vite/React)│     │  (FastAPI)   │     │ (Go/whatsmeow)│
│   :3001      │     │   :5001      │     │   :5005      │
└─────────────┘     └──────────────┘     └──────────────┘
                           │
                    ┌──────┴──────┐
                    │  PostgreSQL  │
                    │    Redis     │
                    └─────────────┘
```

## 📋 Prerequisites

Make sure these are installed on the machine:

| Tool        | Version  | Install (macOS)                     |
|-------------|----------|-------------------------------------|
| Python      | 3.11+    | `brew install python`               |
| Go          | 1.22+    | `brew install go`                   |
| Node.js     | 18+      | `brew install node`                 |
| PostgreSQL  | 14+      | `brew install postgresql@14`        |
| Redis       | 7+       | `brew install redis`                |

Start Postgres & Redis:
```bash
brew services start postgresql@14
brew services start redis
```

## 🚀 Quick Start (3 steps)

```bash
# 1. Clone and enter
git clone <repo-url>
cd aisha-agent

# 2. Setup (one-time)
./setup.sh

# 3. Add your Gemini API key
# Edit .env and replace 'your_gemini_api_key_here' with your actual key

# 4. Start everything
./start.sh
```

Open **http://localhost:3001** in your browser.

Click "Connect WhatsApp" → scan the QR code → Aisha is live! 🎉

## 🛑 Stopping

```bash
./stop.sh
```

Or press `Ctrl-C` if start.sh is in the foreground.

## 📁 Project Structure

```
aisha-agent/
├── .env.example     # Environment template
├── setup.sh         # One-time setup script
├── start.sh         # Start all services
├── stop.sh          # Stop all services
├── backend/         # FastAPI + Celery (Python)
├── gateway/         # WhatsApp bridge (Go)
└── frontend/        # Web dashboard (Vite + React)
```

## ⚙️ Configuration

The only required config is `GEMINI_API_KEY` in `.env`. Everything else has sensible defaults for local development.

## 📝 Logs

All service logs are written to the `logs/` directory:
- `backend.log` — FastAPI server
- `worker.log` — Celery task worker
- `beat.log` — Celery scheduler
- `gateway.log` — WhatsApp gateway
- `frontend.log` — Vite dev server
