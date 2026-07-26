#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

grn() { printf '\033[0;32m%s\033[0m\n' "$1"; }
ylw() { printf '\033[0;33m%s\033[0m\n' "$1"; }
red() { printf '\033[0;31m%s\033[0m\n' "$1"; }

# Load env
if [ -f "$ROOT/.env" ]; then
  set -a; source "$ROOT/.env"; set +a
else
  red "✗ No .env found. Run ./setup.sh first."
  exit 1
fi

# Check GEMINI_API_KEY
if [ -z "${GEMINI_API_KEY:-}" ] || [ "$GEMINI_API_KEY" = "your_gemini_api_key_here" ]; then
  red "✗ Please set GEMINI_API_KEY in .env"
  exit 1
fi

echo ""
grn "═══════════════════════════════════════════"
grn "     Aisha Agent — Starting Services"
grn "═══════════════════════════════════════════"
echo ""

# ── Preflight: Ensure Postgres & Redis are running ──
if command -v brew &>/dev/null; then
  if ! brew services list 2>/dev/null | grep -E 'postgresql' | grep -q started; then
    ylw "▶ Starting PostgreSQL..."
    brew services start postgresql@14 2>/dev/null || brew services start postgresql 2>/dev/null || true
  else
    grn "✔ PostgreSQL running"
  fi

  if ! brew services list 2>/dev/null | grep -E 'redis' | grep -q started; then
    ylw "▶ Starting Redis..."
    brew services start redis 2>/dev/null || true
  else
    grn "✔ Redis running"
  fi
fi

# ── Kill stale ports ──
for port in 5001 5005 3001; do
  pid=$(lsof -ti tcp:$port 2>/dev/null) && kill -9 $pid 2>/dev/null || true
done
sleep 0.5

# ── Start Aisha Backend (FastAPI :5001) ──
grn "▶ Aisha Backend (uvicorn :5001)"
cd "$ROOT/backend"
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 5001 > "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$LOG_DIR/backend.pid"

# ── Start Celery Worker ──
grn "▶ Celery Worker"
celery -A app.core.celery_app worker --loglevel=info -Q romantic,celery -n aisha_worker@%h > "$LOG_DIR/worker.log" 2>&1 &
echo $! > "$LOG_DIR/worker.pid"

# ── Start Celery Beat ──
grn "▶ Celery Beat"
celery -A app.core.celery_app beat --loglevel=info --pidfile= --schedule="$ROOT/backend/celerybeat-schedule" > "$LOG_DIR/beat.log" 2>&1 &
echo $! > "$LOG_DIR/beat.pid"

sleep 2

# ── Start Go WhatsApp Gateway (:5005) ──
grn "▶ WhatsApp Gateway (:5005)"
export WEBHOOK_URL="http://127.0.0.1:5001/api/v1/webhook/message"
cd "$ROOT/gateway"
go run main.go > "$LOG_DIR/gateway.log" 2>&1 &
echo $! > "$LOG_DIR/gateway.pid"

sleep 2

# ── Start Aisha Frontend (:3001) ──
grn "▶ Aisha Frontend (:3001)"
cd "$ROOT/frontend"
npm run dev -- --port 3001 > "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$LOG_DIR/frontend.pid"

sleep 2

echo ""
grn "═══════════════════════════════════════════"
grn "  ✔ All services started!"
grn ""
grn "  Aisha Frontend  : http://localhost:3001"
grn "  Aisha Backend   : http://localhost:5001"
grn "  WhatsApp Gateway: http://localhost:5005"
grn "  Logs            : $LOG_DIR/"
grn "═══════════════════════════════════════════"
echo ""
echo "Press Ctrl-C to stop all services."

# ── Graceful shutdown ──
trap 'ylw "Stopping..."; for f in "$LOG_DIR"/*.pid; do [ -f "$f" ] && kill $(cat "$f") 2>/dev/null || true; done; exit 0' INT TERM

wait
