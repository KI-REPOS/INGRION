import React, { useState, useEffect } from 'react'
import { api } from '../lib/api'

function Section({ section, depth = 0 }) {
  const [open, setOpen] = useState(true)

  return (
    <div className={`${depth === 0 ? 'mb-12' : 'mb-6 ml-4'}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left flex items-center gap-3 group mb-4"
      >
        <div className={`flex-shrink-0 w-0.5 h-full ${depth === 0 ? 'bg-primary' : 'bg-cyan-500/50'}`} />
        <h2
          className={`font-display font-bold transition-colors group-hover:text-cyan-300 ${
            depth === 0
              ? 'text-2xl text-white'
              : depth === 1
              ? 'text-xl text-slate-200'
              : 'text-lg text-slate-300'
          }`}
        >
          {section.title}
        </h2>
        <svg
          className={`w-4 h-4 text-slate-600 ml-auto flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="animate-fade-in">
          {section.content && (
            <div className="pl-4 border-l border-white/5">
              <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-line">
                {section.content}
              </p>
            </div>
          )}
          {section.subsections?.map((sub) => (
            <Section key={sub.id} section={sub} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

// Static whitepaper fallback (same data as backend)
const STATIC_WHITEPAPER = {
  title: "INGRION Blockchain Platform",
  subtitle: "Institutional-Grade Decentralised Infrastructure for Verified Identity and Secure Asset Distribution",
  version: "1.0.0",
  sections: [
    {
      id: "abstract",
      title: "Abstract",
      content: `INGRION is a next-generation blockchain platform designed for institutional deployment, combining government-verified identity (KYC) with cryptographically secure, decentralised application distribution. By anchoring trust at the identity layer through Ed25519 keypair generation and facial biometric verification against national archives, INGRION eliminates the vulnerabilities inherent in password-only and centralised identity systems.`
    },
    {
      id: "introduction",
      title: "1. Introduction",
      content: `The proliferation of blockchain platforms has exposed a critical gap: most systems conflate pseudonymity with security. While pseudonymous participation serves certain use cases, institutional actors—financial institutions, regulatory bodies, government agencies—require verifiable identity anchored to real-world credentials without surrendering the cryptographic guarantees of decentralised systems.

INGRION resolves this tension by separating identity verification (handled through sovereign government archive APIs) from operational identity (handled through client-generated Ed25519 keypairs). The platform never stores private keys, never receives plaintext passwords, and never retains raw biometric data—only the public key and a pre-hashed credential hash reach the server.`
    },
    {
      id: "cryptographic-foundation",
      title: "2. Cryptographic Foundation",
      subsections: [
        {
          id: "keypair-generation",
          title: "2.1 Ed25519 Keypair Generation",
          content: `All identity keypairs are generated client-side using the TweetNaCl library (tweetnacl-js), a port of the audited TweetNaCl cryptographic library. Ed25519 is selected for its:

• 128-bit security level against classical and known quantum attacks
• Deterministic signing (no reliance on random nonce per signature)
• Small key and signature sizes (32-byte public key, 64-byte signature)
• Resistance to side-channel timing attacks through constant-time implementation

The private key is held exclusively in browser memory for the session duration and is NEVER transmitted to any server. Only the 32-byte public key is submitted during KYC registration.`
        },
        {
          id: "password-security",
          title: "2.2 Client-Side Password Hashing",
          content: `User passwords are hashed client-side before transmission using SHA-256 combined with a deterministic salt derived from the user's public key. This ensures that even if the network channel were compromised, the server receives only a cryptographic hash — never the plaintext password.

In production deployments, we recommend Argon2id on the client with memory cost ≥ 64MB and parallelism factor ≥ 2 to resist GPU-based brute-force attacks on the hash.`
        },
        {
          id: "hmac-validation",
          title: "2.3 Government Callback HMAC Validation",
          content: `All callbacks from the Government Archive API are validated using HMAC-SHA256 with a pre-shared secret negotiated out-of-band during platform onboarding. The signature covers the entire raw request body, preventing payload tampering. Constant-time comparison (hmac.compare_digest) prevents timing oracle attacks on the signature verification.`
        }
      ]
    },
    {
      id: "verification-pipeline",
      title: "3. Identity Verification Pipeline",
      content: `The verification pipeline operates in five stages:

Stage 1 — Client Preparation
The user generates an Ed25519 keypair in the browser. The private key never leaves the client. The user provides their archive link, records a facial scan, and sets a password. Password hashing and facial embedding extraction occur entirely client-side.

Stage 2 — Submission
The client submits: archive link, base64 facial embedding, password hash, and public key to POST /api/kyc/submit/. The server validates the public key length and the embedding size.

Stage 3 — Government Forwarding
The Django backend forwards the submission to the configured Government Archive API endpoint, including the callback URL for the async result. The submission enters SUBMITTED status.

Stage 4 — Government Verification
The Government Archive API independently verifies: document authenticity, facial match, and archive record integrity.

Stage 5 — Callback and Token Generation
Upon verification completion, the Government Archive API calls POST /api/kyc/callback/ with an HMAC-signed payload. If approved, a one-time download token is generated with a configurable expiry (default 15 minutes).`
    },
    {
      id: "security-model",
      title: "4. Security Model",
      subsections: [
        {
          id: "data-minimisation",
          title: "4.1 Data Minimisation",
          content: `INGRION adheres to strict data minimisation principles:
• Private keys: never received, never stored
• Plaintext passwords: never received, never stored
• Raw biometric images: never received — only pre-processed embedding vectors
• Government documents: referenced by URL only; contents not mirrored`
        },
        {
          id: "token-security",
          title: "4.2 Download Token Security",
          content: `Download tokens are UUIDs (128-bit entropy) with the following properties:
• One-time use: consumed atomically before streaming begins
• Time-limited: configurable expiry (default 15 minutes)
• Submission-bound: each token is tied to a specific approved KYC submission
• IP-logged: the consuming IP is recorded for audit purposes`
        },
        {
          id: "rate-limiting",
          title: "4.3 Rate Limiting",
          content: `The platform enforces rate limits at the API layer:
• KYC submissions: 5 per hour per IP
• Status polls: 20 per minute per IP
• Download requests: 3 per hour per IP`
        }
      ]
    },
    {
      id: "architecture",
      title: "5. System Architecture",
      content: `The INGRION platform follows a strict separation of concerns across three tiers:

Presentation Layer — React 18 + Vite SPA
Handles key generation, client-side cryptography, KYC form submission, and status polling.

Application Layer — Django 5 + Django REST Framework
Stateless API server responsible for: submission validation, government API forwarding, callback HMAC verification, token generation, and secure binary streaming.

Data Layer — SQLite3 (development) / PostgreSQL (production)
Stores KYC submission records, callback audit logs, and download token state.`
    },
    {
      id: "governance",
      title: "6. Governance and Compliance",
      content: `INGRION is designed for compliance with:

• GDPR Article 25 (Data Protection by Design): minimal data collection, client-side processing
• eIDAS Regulation: compatible with government electronic identity schemes
• ISO/IEC 27001: security controls documented and auditable
• FIPS 140-3: Ed25519 and SHA-256 are FIPS-approved algorithms`
    },
    {
      id: "roadmap",
      title: "7. Roadmap",
      content: `Phase 1 (Current): Core KYC verification pipeline, Ed25519 identity, secure download
Phase 2: Multi-jurisdiction government archive support, threshold signature schemes
Phase 3: On-chain identity anchoring, zero-knowledge proof of verification
Phase 4: Decentralised governance token, community-operated archive node network`
    },
    {
      id: "conclusion",
      title: "8. Conclusion",
      content: `INGRION demonstrates that institutional-grade identity verification and decentralised cryptographic infrastructure are not mutually exclusive. By placing cryptographic trust at the client, delegating identity trust to sovereign government systems, and minimising the server's attack surface, INGRION establishes a new standard for verified blockchain participation.`
    }
  ],
  authors: ["INGRION Research Team"],
  license: "Proprietary — All Rights Reserved",
  contact: "research@ingrion.io"
}

export default function WhitepaperPage() {
  const [whitepaper, setWhitepaper] = useState(STATIC_WHITEPAPER)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getWhitepaper()
      .then(data => setWhitepaper(data))
      .catch(() => {}) // use static fallback
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen py-32 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="relative glass-card-strong p-12 mb-16 overflow-hidden">
          <div className="absolute inset-0 futuristic-gradient opacity-10" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase">
                Technical Whitepaper · v{whitepaper.version}
              </span>
            </div>
            <h1 className="font-display font-extrabold text-4xl md:text-5xl text-white mb-4 leading-tight">
              {whitepaper.title}
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed mb-8">
              {whitepaper.subtitle}
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <div className="text-sm text-slate-500">
                <span className="text-slate-400">Authors:</span> {whitepaper.authors?.join(', ')}
              </div>
              <div className="text-sm text-slate-500">
                <span className="text-slate-400">Contact:</span> {whitepaper.contact}
              </div>
              <a
                href="/api/whitepaper/pdf/"
                className="ml-auto flex items-center gap-2 glass-card px-4 py-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors rounded-lg border border-cyan-500/20"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </a>
            </div>
          </div>
        </div>

        {/* Table of Contents */}
        <div className="glass-card p-6 mb-12">
          <h3 className="font-display font-bold text-white mb-4 text-sm uppercase tracking-wider">
            Table of Contents
          </h3>
          <div className="space-y-1">
            {whitepaper.sections?.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block text-sm text-slate-400 hover:text-cyan-300 transition-colors py-1 border-b border-white/5 last:border-0"
              >
                {section.title}
              </a>
            ))}
          </div>
        </div>

        {/* Section divider */}
        <div className="section-divider mb-12" />

        {/* Content */}
        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading whitepaper...</div>
        ) : (
          <div className="space-y-2">
            {whitepaper.sections?.map((section) => (
              <div key={section.id} id={section.id} className="scroll-mt-24">
                <Section section={section} />
                <div className="section-divider my-10" />
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="glass-card p-6 mt-12 text-center">
          <p className="text-slate-600 text-xs font-mono">
            {whitepaper.license} · {whitepaper.contact}
          </p>
        </div>
      </div>
    </div>
  )
}
