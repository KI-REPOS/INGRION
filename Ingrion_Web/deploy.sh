#!/usr/bin/env bash
# INGRION — Production Deployment Script
# Run from project root: bash deploy.sh

set -euo pipefail

echo "═══════════════════════════════════════════"
echo "  INGRION Blockchain Platform — Deploy"
echo "═══════════════════════════════════════════"

# ── Backend Setup ──────────────────────────────
echo ""
echo "▶ Setting up Django backend..."
cd backend

python3 -m venv ../venv
source ../venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

# Copy env if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "⚠ Created .env — EDIT IT BEFORE CONTINUING"
    exit 1
fi

# Run migrations
DJANGO_SETTINGS_MODULE=ingrion_project.settings.production python manage.py migrate

# Collect static
DJANGO_SETTINGS_MODULE=ingrion_project.settings.production python manage.py collectstatic --noinput

# Create protected binary directory
mkdir -p ../protected
echo "⚠ Place your 32MB application binary at: $(pwd)/../protected/ingrion-app.bin"

cd ..

# ── Frontend Build ─────────────────────────────
echo ""
echo "▶ Building React frontend..."
cd frontend

# Copy env
if [ ! -f .env ]; then
    cp .env.example .env
fi

npm install
npm run build

echo "✓ Frontend built to frontend/dist/"
cd ..

# ── Summary ────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  Deployment complete!"
echo ""
echo "  Next steps:"
echo "  1. Edit backend/.env with your secrets"
echo "  2. Copy nginx.conf to /etc/nginx/sites-available/"
echo "  3. Copy ingrion.service to /etc/systemd/system/"
echo "  4. Place your binary at protected/ingrion-app.bin"
echo "  5. systemctl enable --now ingrion"
echo "  6. systemctl reload nginx"
echo "═══════════════════════════════════════════"
