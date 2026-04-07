#!/bin/bash
# Government Archive Platform — Development Startup

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Government Identity Archive — Dev Server"
echo "═══════════════════════════════════════════════════════"
echo ""

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# ── Backend ──────────────────────────────────────────────
echo "▶ Setting up backend..."

cd "$BACKEND_DIR"

# Virtual environment
if [ ! -d "venv" ]; then
  echo "  Creating virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt -q

# Migrations — generate then apply
export DJANGO_SETTINGS_MODULE=gov_project.settings.development
echo "  Running migrations..."
python manage.py makemigrations accounts kyc archive --no-input 2>/dev/null || true
python manage.py migrate --no-input

# Seed database
echo "  Seeding database..."
python manage.py seed_db

# Create media directories
mkdir -p media/profiles media/kyc_docs

echo "  Starting Django on http://localhost:8001 ..."
python manage.py runserver 8001 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# ── Frontend ─────────────────────────────────────────────
echo ""
echo "▶ Setting up frontend..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
  echo "  Installing npm packages..."
  npm install
fi

echo "  Starting Vite on http://localhost:5174 ..."
npm run dev &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✓ Gov Archive running!"
echo ""
echo "  Frontend:  http://localhost:5174"
echo "  Backend:   http://localhost:8001"
echo "  API:       http://localhost:8001/api/"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Press Ctrl+C to stop all servers"
echo ""

# Wait and cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT INT TERM
wait
