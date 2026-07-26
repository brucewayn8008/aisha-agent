#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

grn() { printf '\033[0;32m%s\033[0m\n' "$1"; }
ylw() { printf '\033[0;33m%s\033[0m\n' "$1"; }
red() { printf '\033[0;31m%s\033[0m\n' "$1"; }

echo ""
grn "═══════════════════════════════════════════"
grn "     Aisha Agent — First-Time Setup"
grn "═══════════════════════════════════════════"
echo ""

# 1) Check .env
if [ ! -f "$ROOT/.env" ]; then
  if [ -f "$ROOT/.env.example" ]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    ylw "⚠  Created .env from .env.example — please edit it and add your GEMINI_API_KEY"
  else
    red "✗ No .env or .env.example found!"
    exit 1
  fi
fi

# 2) Check prerequisites
grn "▶ Checking prerequisites..."

if ! command -v python3 &>/dev/null; then
  red "✗ python3 not found. Please install Python 3.11+"
  exit 1
fi
grn "  ✔ python3 found"

if ! command -v go &>/dev/null; then
  red "✗ go not found. Please install Go 1.22+"
  exit 1
fi
grn "  ✔ go found"

if ! command -v node &>/dev/null; then
  red "✗ node not found. Please install Node.js 18+"
  exit 1
fi
grn "  ✔ node found"

if ! command -v psql &>/dev/null; then
  red "✗ psql not found. Please install PostgreSQL"
  exit 1
fi
grn "  ✔ psql found"

if ! command -v redis-cli &>/dev/null; then
  ylw "⚠  redis-cli not found. Make sure Redis is installed and running."
else
  grn "  ✔ redis found"
fi

# 3) Create databases
grn "▶ Creating databases..."
psql -U postgres -c "CREATE DATABASE wa_romantic;" 2>/dev/null || grn "  ✔ wa_romantic already exists"
psql -U postgres -c "CREATE DATABASE wa_mark2;" 2>/dev/null || grn "  ✔ wa_mark2 already exists"

# Ensure the wa_mark2 tables that Aisha needs exist
psql -U postgres -d wa_mark2 <<'EOSQL' 2>/dev/null || true
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id VARCHAR,
    company_name VARCHAR DEFAULT '',
    business_description TEXT DEFAULT '',
    email VARCHAR DEFAULT '',
    agent_enabled BOOLEAN DEFAULT true,
    is_running BOOLEAN DEFAULT false,
    messages_sent_today INT DEFAULT 0,
    daily_message_limit INT DEFAULT 100,
    whatsapp_jid VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);
EOSQL

psql -U postgres -d wa_mark2 <<'EOSQL' 2>/dev/null || true
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id),
    status VARCHAR DEFAULT 'UNCONFIGURED',
    qr_code TEXT,
    last_updated TIMESTAMP DEFAULT NOW()
);
EOSQL

psql -U postgres -d wa_mark2 <<'EOSQL' 2>/dev/null || true
INSERT INTO workspaces (id, owner_id, company_name, business_description, email, agent_enabled, is_running, messages_sent_today, daily_message_limit, created_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'aisha-setup', 'Aisha Agent', 'AI Agent', 'aisha@local.dev', true, true, 0, 100, NOW())
ON CONFLICT (id) DO NOTHING;
EOSQL

psql -U postgres -d wa_mark2 <<'EOSQL' 2>/dev/null || true
INSERT INTO whatsapp_sessions (workspace_id, status, last_updated)
VALUES ('11111111-1111-1111-1111-111111111111', 'UNCONFIGURED', NOW())
ON CONFLICT (workspace_id) DO NOTHING;
EOSQL

grn "  ✔ Database tables ready"

# 4) Python venv + deps
grn "▶ Setting up Python backend..."
cd "$ROOT/backend"

# Find the best Python: prefer 3.11-3.13, fallback to python3
PYTHON_BIN=""
for candidate in python3.11 python3.12 python3.13 python3; do
  if command -v "$candidate" &>/dev/null; then
    PYTHON_BIN="$candidate"
    break
  fi
done
grn "  Using $PYTHON_BIN ($($PYTHON_BIN --version 2>&1))"

if [ ! -d "venv" ]; then
  $PYTHON_BIN -m venv venv
fi
source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
deactivate
grn "  ✔ Python dependencies installed"

# 5) Go deps
grn "▶ Downloading Go dependencies..."
cd "$ROOT/gateway"
go mod download
grn "  ✔ Go dependencies downloaded"

# 6) Node deps
grn "▶ Installing frontend dependencies..."
cd "$ROOT/frontend"
npm install --silent
grn "  ✔ Frontend dependencies installed"

echo ""
grn "═══════════════════════════════════════════"
grn "  ✔ Setup complete!"
grn ""
grn "  Next steps:"
grn "  1. Edit .env and add your GEMINI_API_KEY"
grn "  2. Run: ./start.sh"
grn "═══════════════════════════════════════════"
echo ""
