#!/bin/bash
set -e

cd "$(dirname "$0")"

cleanup() {
  kill "$BACKEND_PID" 2>/dev/null
}
trap cleanup EXIT

echo "Starting backend on http://127.0.0.1:8000 ..."
(cd backend && ../.venv/bin/uvicorn main:app --reload --port 8000) &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:5173 ..."
cd frontend && npm run dev
