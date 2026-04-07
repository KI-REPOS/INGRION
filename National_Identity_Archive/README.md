# Government Identity Archive Platform

> National Identity Authority of India — Sovereign KYC verification infrastructure for the INGRION blockchain platform.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│         Citizen / Admin Browser (React 18)       │
│                                                   │
│  Camera → extractEmbeddingFromVideo()            │
│  float32[128] → base64 → stored on server        │
└──────────────────┬──────────────────────────────┘
                   │ HTTPS
                   ▼
┌─────────────────────────────────────────────────┐
│        Django 5 + DRF (port 8001)                │
│                                                   │
│  POST /api/auth/citizen/login/                   │
│  POST /api/kyc/upload/          — PDF docs       │
│  POST /api/kyc/submit/          — Submit KYC     │
│  POST /api/kyc/admin/*/review/  — Approve/Reject │
│  POST /api/archive/links/generate/               │
│  POST /api/archive/verify/<token>/  ← INGRION    │
└──────────────────┬──────────────────────────────┘
                   │ HMAC-signed callback
                   ▼
┌─────────────────────────────────────────────────┐
│           INGRION Platform (port 8000)           │
│  POST /api/kyc/callback/                        │
└─────────────────────────────────────────────────┘
```

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite (port 5174) |
| Styling | TailwindCSS (dark gov design) |
| Biometric | Camera API + pixel-based float32 embedding |
| Backend | Django 5 + DRF (port 8001) |
| Database | SQLite3 |
| Auth | Custom token auth (session tokens) |

## Quick Start

```bash
# Prerequisites: Python 3.11+, Node.js 18+
bash dev.sh
```

This will:
1. Create Python virtualenv + install deps
2. Run migrations + seed the database
3. Start Django on port 8001
4. Start Vite on port 5174

## Pre-seeded Accounts

### Citizens
| Name | Aadhaar | Password |
|------|---------|----------|
| Priya Sharma | 234567890123 | Priya@2024Secure |
| Rahul Mehta | 345678901234 | Rahul@2024Secure |
| Anjali Nair | 456789012345 | Anjali@2024Secure |
| Vikram Singh | 567890123456 | Vikram@2024Secure |
| Deepa Krishnan | 678901234567 | Deepa@2024Secure |

### Admins
| Username | Password |
|----------|----------|
| admin | Admin@Gov2024 |
| reviewer1 | Reviewer@2024 |

## Citizen Flow

1. **Login** with Aadhaar + password
2. **Facial scan** — camera opens, embedding extracted client-side
3. **Upload documents** — 6 PDFs (Aadhaar, PAN, Passport, Voter ID, Driving License, Birth Certificate)
4. **Submit KYC** for government review
5. **After approval** → generate expirable archive link
6. **Paste archive link** into INGRION KYC form

## Admin Flow

1. **Login** with admin username + password
2. **Review pending** KYC submissions
3. View citizen profile photo, documents, biometric status
4. **Approve or Reject** with optional remarks
5. Monitor **INGRION verification requests** and biometric match scores

## INGRION Integration

### Environment Variables (INGRION side)
```
GOVERNMENT_ARCHIVE_API_URL=http://localhost:8001/api/archive/verify/
GOVERNMENT_CALLBACK_HMAC_SECRET=CHANGE-THIS-SHARED-SECRET-MUST-MATCH-INGRION
GOVERNMENT_CALLBACK_URL=http://localhost:8000/api/kyc/callback/
```

### Environment Variables (Gov Archive side)
```
INGRION_HMAC_SECRET=CHANGE-THIS-SHARED-SECRET-MUST-MATCH-INGRION
FACIAL_SIMILARITY_THRESHOLD=0.75
```

### Verification Flow
1. Citizen generates archive link on Gov Archive portal
2. Citizen pastes link into INGRION KYC form
3. INGRION submits `POST /api/archive/verify/<token>/` with:
   - `submission_id`, `public_key`, `facial_embedding`, `callback_url`
4. Gov Archive compares facial embedding (cosine similarity ≥ 75%) + checks KYC status
5. Gov Archive sends HMAC-signed callback to INGRION
6. INGRION generates download token for approved citizens

## Facial Embedding

The embedding is a 128-float32 vector (512 bytes) captured from a live camera frame:
- 16×16 grid sampling over 128×128 pixel canvas
- Luma + chrominance channels extracted
- L2-normalized
- Encoded as base64

**Same algorithm on both sides**: INGRION captures from camera → Gov Archive stored from camera → cosine similarity comparison.

> Production: Replace with MediaPipe FaceMesh or face-api.js for real facial landmarks.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/citizen/login/` | Public | Aadhaar login |
| POST | `/api/auth/admin/login/` | Public | Admin login |
| GET | `/api/auth/me/` | Token | Current user |
| PATCH | `/api/auth/profile/` | Citizen | Update photo/embedding |
| GET | `/api/kyc/my/` | Citizen | Get own KYC |
| POST | `/api/kyc/upload/` | Citizen | Upload PDF doc |
| POST | `/api/kyc/submit/` | Citizen | Submit for review |
| GET | `/api/kyc/admin/list/` | Admin | List submissions |
| GET | `/api/kyc/admin/<id>/` | Admin | View submission |
| POST | `/api/kyc/admin/<id>/review/` | Admin | Approve/reject |
| POST | `/api/archive/links/generate/` | Citizen | Generate link |
| GET | `/api/archive/links/` | Citizen | List links |
| POST | `/api/archive/links/<id>/revoke/` | Citizen | Revoke link |
| POST/GET | `/api/archive/verify/<token>/` | Public | INGRION verification |
| GET | `/api/archive/admin/requests/` | Admin | INGRION audit log |
