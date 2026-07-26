#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"

echo "Stopping Aisha Agent services..."
for f in "$LOG_DIR"/*.pid; do
  if [ -f "$f" ]; then
    pid=$(cat "$f")
    kill $pid 2>/dev/null && echo "  Stopped PID $pid" || echo "  PID $pid already stopped"
    rm -f "$f"
  fi
done

# Also kill any stragglers on our ports
for port in 5001 5005 3001; do
  pid=$(lsof -ti tcp:$port 2>/dev/null) && kill -9 $pid 2>/dev/null || true
done

echo "All services stopped."
