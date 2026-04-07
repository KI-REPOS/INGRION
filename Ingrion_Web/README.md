# INGRION Blockchain Platform

> Institutional-grade blockchain identity infrastructure. Government-verified. Cryptographically assured.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React 18)                        │
│                                                                   │
│  ┌─────────────────────┐    ┌────────────────────────────────┐  │
│  │  TweetNaCl (WASM)   │    │   SHA-256 (WebCrypto API)      │  │
│  │  Ed25519 Keypair     │    │   Client-side password hash    │  │
│  │  Private key: memory │    │   Facial embedding extraction  │  │
│  └─────────────────────┘    └────────────────────────────────┘  │
│                ↓ public key only                                  │
└────────────────┼────────────────────────────────────────────────┘
                 │ HTTPS + CSRF
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Django 5 + DRF (Gunicorn)                      │
│                                                                   │
│  POST /api/kyc/submit/      → Validate + forward to Gov API     │
│  GET  /api/kyc/status/<id>/ → Poll status + return token        │
│  POST /api/kyc/callback/    → HMAC-validated gov webhook         │
│  GET  /api/downloads/app/   → One-time streaming download        │
│  GET  /api/whitepaper/      → Structured whitepaper JSON         │
│                                                                   │
│  SQLite3 (dev) / PostgreSQL (prod)                               │
└─────────────────────────────────────────────────────────────────┘
                 │ Signed request
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│             Government Archive API (External)                     │
│  Verifies: document authenticity, facial biometric, records      │
│  Calls back via HMAC-signed webhook → approved / rejected        │
└─────────────────────────────────────────────────────────────────┘
```

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Styling | TailwindCSS (dark glass design) |
| Crypto | TweetNaCl (Ed25519) + WebCrypto API |
| Backend | Django 5 + Django REST Framework |
| Database | SQLite3 (dev) / PostgreSQL (prod) |
| Web Server | Gunicorn + Nginx |

## Security Model

### What We Never Store
- ❌ Private keys
- ❌ Plaintext passwords  
- ❌ Raw biometric images
- ❌ Government document contents

### What We Store
- ✅ Ed25519 public key (base64)
- ✅ Client-side password hash (hex)
- ✅ Facial embedding vector (base64)
- ✅ Archive link URL
- ✅ Callback audit logs (HMAC validity, IP, timestamp)

## Quick Start — Development

```bash
# 1. Clone and navigate
git clone https://github.com/ingrion/platform.git
cd platform

# 2. Backend setup
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # Edit with your values
DJANGO_SETTINGS_MODULE=ingrion_project.settings.development python manage.py migrate
DJANGO_SETTINGS_MODULE=ingrion_project.settings.development python manage.py runserver

# 3. Frontend setup (separate terminal)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Or use the combined dev script:
```bash
bash dev.sh
```

## Production Deployment

```bash
# 1. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env — fill in all secrets

# 2. Run deployment script
bash deploy.sh

# 3. Configure Nginx
sudo cp nginx.conf /etc/nginx/sites-available/ingrion
sudo ln -s /etc/nginx/sites-available/ingrion /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 4. Configure systemd
sudo cp ingrion.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ingrion

# 5. Place application binary
sudo cp /path/to/ingrion-app.bin /srv/ingrion/protected/

# 6. Place whitepaper PDF (optional)
sudo mkdir -p /srv/ingrion/media/whitepaper/
sudo cp /path/to/whitepaper.pdf /srv/ingrion/media/whitepaper/ingrion-whitepaper.pdf
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DJANGO_SECRET_KEY` | ✅ | 64-char random secret |
| `ALLOWED_HOSTS` | ✅ | Comma-separated hostnames |
| `GOVERNMENT_ARCHIVE_API_URL` | ✅ | Gov API endpoint |
| `GOVERNMENT_API_KEY` | ✅ | Gov API key |
| `GOVERNMENT_CALLBACK_HMAC_SECRET` | ✅ | Shared HMAC secret for callbacks |
| `GOVERNMENT_CALLBACK_URL` | ✅ | Your callback endpoint URL |
| `APPLICATION_BINARY_PATH` | ✅ | Path to 32MB app binary |
| `DOWNLOAD_TOKEN_EXPIRY_SECONDS` | — | Default: 900 (15 min) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/kyc/submit/` | Submit KYC (rate: 5/hr) |
| GET | `/api/kyc/status/<id>/` | Poll status + get token |
| POST | `/api/kyc/callback/` | Gov callback (HMAC) |
| GET | `/api/downloads/application/?token=` | Download binary (one-time) |
| GET | `/api/downloads/validate/?token=` | Validate token (non-consuming) |
| GET | `/api/whitepaper/` | Whitepaper JSON |
| GET | `/api/whitepaper/pdf/` | Whitepaper PDF |

## Government Integration

To integrate your Government Archive API:

1. **Request onboarding**: Contact integration@ingrion.io for sandbox credentials
2. **Receive requests**: INGRION POSTs to your API with `archive_link`, `public_key`, `facial_embedding`, `callback_url`
3. **Verify identity**: Against your sovereign records  
4. **Callback**: POST to `callback_url` with HMAC-SHA256 signature:

```python
import hmac, hashlib, json, requests

payload = json.dumps({
    "submission_id": "<uuid from request>",
    "reference": "GOV-REF-001",
    "status": "approved",  # or "rejected"
    "message": "Identity verified."
})

sig = hmac.new(SHARED_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
requests.post(callback_url, data=payload, headers={"X-INGRION-Signature": sig})
```

## File Structure

```
ingrion/
├── backend/
│   ├── ingrion_project/
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── development.py
│   │   │   └── production.py
│   │   ├── apps/
│   │   │   ├── kyc/           # KYC models, views, serializers
│   │   │   ├── downloads/     # Token + streaming download
│   │   │   └── whitepaper/    # Whitepaper API + PDF serve
│   │   └── urls.py
│   ├── requirements.txt
│   └── manage.py
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── HomePage.jsx        # Hero + features + pipeline
│   │   │   ├── KYCPage.jsx         # 4-step verification wizard
│   │   │   ├── WhitepaperPage.jsx  # Full rendered whitepaper
│   │   │   ├── DownloadPage.jsx    # Token-gated download
│   │   │   └── APIDocsPage.jsx     # Complete API reference
│   │   ├── components/layout/      # Nav + footer
│   │   ├── lib/
│   │   │   ├── crypto.js           # Ed25519, SHA-256, embeddings
│   │   │   └── api.js              # Fetch wrapper + CSRF
│   │   └── index.css               # Design system
│   ├── tailwind.config.js
│   └── vite.config.js
├── nginx.conf
├── ingrion.service
├── deploy.sh
└── dev.sh
```
