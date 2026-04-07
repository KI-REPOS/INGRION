"""
Whitepaper Views — INGRION Blockchain Platform

GET /api/whitepaper/       — Returns the whitepaper as structured JSON
GET /api/whitepaper/pdf/   — Redirects to or streams the PDF file
"""
import os
from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework.response import Response
from rest_framework.views import APIView

WHITEPAPER_DATA = {
    "title": "INGRION Blockchain Platform",
    "subtitle": "Institutional-Grade Decentralised Infrastructure for Verified Identity and Secure Asset Distribution",
    "version": "1.0.0",
    "sections": [
        {
            "id": "abstract",
            "title": "Abstract",
            "content": """INGRION is a next-generation blockchain platform designed for institutional deployment, 
combining government-verified identity (KYC) with cryptographically secure, decentralised application distribution. 
By anchoring trust at the identity layer through Ed25519 keypair generation and facial biometric verification 
against national archives, INGRION eliminates the vulnerabilities inherent in password-only and centralised 
identity systems. This whitepaper describes the architecture, cryptographic foundations, verification pipeline, 
and governance model of the INGRION platform."""
        },
        {
            "id": "introduction",
            "title": "1. Introduction",
            "content": """The proliferation of blockchain platforms has exposed a critical gap: most systems 
conflate pseudonymity with security. While pseudonymous participation serves certain use cases, institutional 
actors—financial institutions, regulatory bodies, government agencies—require verifiable identity anchored 
to real-world credentials without surrendering the cryptographic guarantees of decentralised systems.

INGRION resolves this tension by separating identity verification (handled through sovereign government 
archive APIs) from operational identity (handled through client-generated Ed25519 keypairs). The platform 
never stores private keys, never receives plaintext passwords, and never retains raw biometric data—only 
the public key and a pre-hashed credential hash reach the server."""
        },
        {
            "id": "cryptographic-foundation",
            "title": "2. Cryptographic Foundation",
            "subsections": [
                {
                    "id": "keypair-generation",
                    "title": "2.1 Ed25519 Keypair Generation",
                    "content": """All identity keypairs are generated client-side using the TweetNaCl library 
(tweetnacl-js), a port of the audited TweetNaCl cryptographic library. Ed25519 is selected for its:

• 128-bit security level against classical and known quantum attacks
• Deterministic signing (no reliance on random nonce per signature)  
• Small key and signature sizes (32-byte public key, 64-byte signature)
• Resistance to side-channel timing attacks through constant-time implementation

The private key is held exclusively in browser memory for the session duration and is NEVER transmitted 
to any server. Only the 32-byte public key is submitted during KYC registration."""
                },
                {
                    "id": "password-security",
                    "title": "2.2 Client-Side Password Hashing",
                    "content": """User passwords are hashed client-side before transmission using SHA-256 
combined with a deterministic salt derived from the user's public key. This ensures that even if the 
network channel were compromised, the server receives only a cryptographic hash—never the plaintext password.

In production deployments, we recommend Argon2id on the client with memory cost ≥ 64MB and parallelism 
factor ≥ 2 to resist GPU-based brute-force attacks on the hash."""
                },
                {
                    "id": "hmac-validation",
                    "title": "2.3 Government Callback HMAC Validation",
                    "content": """All callbacks from the Government Archive API are validated using 
HMAC-SHA256 with a pre-shared secret negotiated out-of-band during platform onboarding. The signature 
covers the entire raw request body, preventing payload tampering. Constant-time comparison (hmac.compare_digest) 
prevents timing oracle attacks on the signature verification."""
                }
            ]
        },
        {
            "id": "verification-pipeline",
            "title": "3. Identity Verification Pipeline",
            "content": """The verification pipeline operates in five stages:

Stage 1 — Client Preparation
The user generates an Ed25519 keypair in the browser. The private key never leaves the client. 
The user provides their archive link (a government document URL), records a facial scan, 
and sets a password. Password hashing and facial embedding extraction occur entirely client-side.

Stage 2 — Submission
The client submits: archive link, base64 facial embedding, password hash, and public key to 
POST /api/kyc/submit/. The server validates the public key length (must be exactly 32 bytes 
when base64-decoded) and the embedding size (128–8192 bytes).

Stage 3 — Government Forwarding  
The Django backend forwards the submission to the configured Government Archive API endpoint, 
including the callback URL for the async result. The submission enters SUBMITTED status.

Stage 4 — Government Verification
The Government Archive API independently verifies: document authenticity, facial match, 
and archive record integrity. This process is sovereign and asynchronous—INGRION makes no 
claims about the internal mechanics of the government system.

Stage 5 — Callback and Token Generation
Upon verification completion, the Government Archive API calls POST /api/kyc/callback/ with 
an HMAC-signed payload. If approved, a one-time download token is generated with a configurable 
expiry (default 15 minutes). The token unlocks the 32MB application binary stream."""
        },
        {
            "id": "security-model",
            "title": "4. Security Model",
            "subsections": [
                {
                    "id": "data-minimisation",
                    "title": "4.1 Data Minimisation",
                    "content": """INGRION adheres to strict data minimisation principles:
• Private keys: never received, never stored
• Plaintext passwords: never received, never stored
• Raw biometric images: never received — only pre-processed embedding vectors
• Government documents: referenced by URL only; contents not mirrored"""
                },
                {
                    "id": "token-security",
                    "title": "4.2 Download Token Security",
                    "content": """Download tokens are UUIDs (128-bit entropy) with the following properties:
• One-time use: consumed atomically before streaming begins
• Time-limited: configurable expiry (default 15 minutes)
• Submission-bound: each token is tied to a specific approved KYC submission
• IP-logged: the consuming IP is recorded for audit purposes"""
                },
                {
                    "id": "rate-limiting",
                    "title": "4.3 Rate Limiting",
                    "content": """The platform enforces rate limits at the API layer:
• KYC submissions: 5 per hour per IP
• Status polls: 20 per minute per IP  
• Download requests: 3 per hour per IP

In production, these limits should be enforced at the infrastructure layer (nginx, Cloudflare) 
in addition to the application layer."""
                }
            ]
        },
        {
            "id": "architecture",
            "title": "5. System Architecture",
            "content": """The INGRION platform follows a strict separation of concerns across three tiers:

Presentation Layer — React 18 + Vite SPA
Handles key generation, client-side cryptography, KYC form submission, and status polling. 
Communicates exclusively over HTTPS with the API layer.

Application Layer — Django 5 + Django REST Framework  
Stateless API server responsible for: submission validation, government API forwarding, 
callback HMAC verification, token generation, and secure binary streaming. 
Deployed behind gunicorn with WhiteNoise for static asset serving.

Data Layer — SQLite3 (development) / PostgreSQL (production)
Stores KYC submission records, callback audit logs, and download token state. 
No sensitive cryptographic material is ever written to disk."""
        },
        {
            "id": "governance",
            "title": "6. Governance and Compliance",
            "content": """INGRION is designed for compliance with:

• GDPR Article 25 (Data Protection by Design): minimal data collection, client-side processing
• eIDAS Regulation: compatible with government electronic identity schemes
• ISO/IEC 27001: security controls documented and auditable
• FIPS 140-3: Ed25519 and SHA-256 are FIPS-approved algorithms

Platform operators are responsible for executing a Data Processing Agreement (DPA) with 
the relevant Government Archive API provider before production deployment."""
        },
        {
            "id": "roadmap",
            "title": "7. Roadmap",
            "content": """Phase 1 (Current): Core KYC verification pipeline, Ed25519 identity, secure download
Phase 2: Multi-jurisdiction government archive support, threshold signature schemes
Phase 3: On-chain identity anchoring, zero-knowledge proof of verification
Phase 4: Decentralised governance token, community-operated archive node network"""
        },
        {
            "id": "conclusion",
            "title": "8. Conclusion",
            "content": """INGRION demonstrates that institutional-grade identity verification and 
decentralised cryptographic infrastructure are not mutually exclusive. By placing cryptographic 
trust at the client, delegating identity trust to sovereign government systems, and minimising 
the server's attack surface, INGRION establishes a new standard for verified blockchain participation.

The platform is production-ready for pilot deployment with government archive partners and 
institutional clients requiring verifiable, privacy-preserving identity in decentralised contexts."""
        }
    ],
    "authors": ["INGRION Research Team"],
    "license": "Proprietary — All Rights Reserved",
    "contact": "research@ingrion.io"
}


class WhitepaperView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response(WHITEPAPER_DATA)


class WhitepaperPDFView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        import logging
        logger = logging.getLogger('ingrion.whitepaper')

        # Search multiple candidate paths in order
        candidates = [
            os.path.join(settings.MEDIA_ROOT, 'whitepaper', 'ingrion-whitepaper.pdf'),
            os.path.join(settings.MEDIA_ROOT, 'ingrion-whitepaper.pdf'),
            os.path.join(settings.BASE_DIR, 'media', 'whitepaper', 'ingrion-whitepaper.pdf'),
            os.path.join(settings.BASE_DIR, 'media', 'ingrion-whitepaper.pdf'),
        ]

        pdf_path = None
        for candidate in candidates:
            logger.info('Checking whitepaper path: %s — exists: %s', candidate, os.path.exists(candidate))
            if os.path.exists(candidate):
                pdf_path = candidate
                break

        if not pdf_path:
            logger.error('Whitepaper PDF not found. Searched: %s', candidates)
            return Response(
                {'detail': f'Whitepaper PDF not found. Place it at: {candidates[0]}'},
                status=404
            )

        return FileResponse(
            open(pdf_path, 'rb'),
            content_type='application/pdf',
            as_attachment=True,
            filename='INGRION-Whitepaper.pdf',
        )