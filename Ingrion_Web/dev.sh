#!/usr/bin/env bash
# INGRION — Development Start Script
# Usage: bash dev.sh

set -euo pipefail

echo "Starting INGRION in development mode..."

# ── Backend ────────────────────────────────────
cd backend

if [ ! -d "../venv" ]; then
    python3 -m venv ../venv
    source ../venv/bin/activate
    pip install -r requirements.txt
else
    source ../venv/bin/activate
fi

export DJANGO_SETTINGS_MODULE=ingrion_project.settings.development

# Run migrations if needed
python manage.py migrate

# Start Django in background
python manage.py runserver 8000 &
DJANGO_PID=$!
echo "Django running on http://localhost:8000 (PID $DJANGO_PID)"

cd ../frontend

# Install deps if needed
if [ ! -d "node_modules" ]; then
    npm install
fi

# Start Vite dev server
npm run dev &
VITE_PID=$!
echo "Vite running on http://localhost:5173 (PID $VITE_PID)"

echo ""
echo "Development servers started!"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop all servers."

# Wait for signal
trap "kill $DJANGO_PID $VITE_PID 2>/dev/null" EXIT SIGINT SIGTERM
wait
