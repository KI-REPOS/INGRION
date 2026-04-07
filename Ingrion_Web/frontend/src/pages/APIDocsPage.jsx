import React, { useState } from 'react'

const ENDPOINTS = [
  {
    id: 'kyc-submit',
    method: 'POST',
    path: '/api/kyc/submit/',
    title: 'Submit KYC Verification',
    description: 'Submit identity verification data. Rate limited to 5 requests/hour per IP.',
    auth: 'None (CSRF token required)',
    rateLimit: '5/hour',
    request: {
      contentType: 'application/json',
      fields: [
        { name: 'archive_link', type: 'string (URL)', required: true, desc: 'Government archive document URL (max 2048 chars)' },
        { name: 'public_key_b64', type: 'string (base64)', required: true, desc: 'Ed25519 public key, base64-encoded (must decode to exactly 32 bytes)' },
        { name: 'password_hash', type: 'string (hex)', required: true, desc: 'Client-side password hash, hex-encoded, minimum 64 characters (SHA-256 or stronger)' },
        { name: 'facial_embedding_b64', type: 'string (base64)', required: true, desc: 'Float32 facial embedding vector, base64-encoded (128–8192 decoded bytes)' },
      ]
    },
    responses: [
      { status: 202, desc: 'Accepted — submission forwarded to Government Archive API', body: '{"submission_id": "uuid", "status": "submitted", "message": "..."}' },
      { status: 400, desc: 'Validation error — check field requirements', body: '{"public_key_b64": ["Ed25519 public key must be 32 bytes"]}' },
      { status: 429, desc: 'Rate limit exceeded', body: '{"detail": "Request was throttled."}' },
    ],
    example: `curl -X POST https://api.ingrion.io/api/kyc/submit/ \\
  -H "Content-Type: application/json" \\
  -H "X-CSRFToken: <csrf_token>" \\
  -d '{
    "archive_link": "https://archive.gov/records/123",
    "public_key_b64": "base64_encoded_32_byte_ed25519_public_key==",
    "password_hash": "sha256hexhash...",
    "facial_embedding_b64": "base64_float32_embedding=="
  }'`
  },
  {
    id: 'kyc-status',
    method: 'GET',
    path: '/api/kyc/status/{submission_id}/',
    title: 'Poll KYC Status',
    description: 'Retrieve the current verification status for a given submission.',
    auth: 'None',
    rateLimit: '20/minute',
    request: {
      params: [
        { name: 'submission_id', type: 'UUID', required: true, desc: 'The UUID returned from the submit endpoint' }
      ]
    },
    responses: [
      { status: 200, desc: 'Success', body: '{"id": "uuid", "status": "approved|rejected|pending|submitted|failed", "download_token": "uuid" (if approved), "token_expires_at": "ISO8601"}' },
      { status: 404, desc: 'Submission not found', body: '{"detail": "Not found."}' },
    ],
    example: `curl https://api.ingrion.io/api/kyc/status/550e8400-e29b-41d4-a716-446655440000/`
  },
  {
    id: 'kyc-callback',
    method: 'POST',
    path: '/api/kyc/callback/',
    title: 'Government Callback',
    description: 'Webhook endpoint for the Government Archive API to deliver verification results. HMAC-SHA256 signature required. This endpoint is for Government API use only.',
    auth: 'HMAC-SHA256 (X-INGRION-Signature header)',
    rateLimit: 'No limit (IP allowlist recommended)',
    security: [
      'HMAC-SHA256 signature over entire request body',
      'Pre-shared secret negotiated out-of-band',
      'Constant-time comparison (prevents timing oracle)',
      'Full audit log of every callback attempt',
      'CSRF exempt (uses HMAC instead)',
    ],
    request: {
      headers: [
        { name: 'X-INGRION-Signature', required: true, desc: 'HMAC-SHA256 hex digest of the raw request body using the shared secret' },
      ],
      fields: [
        { name: 'submission_id', type: 'UUID', required: true, desc: 'The submission ID from the original forwarded request' },
        { name: 'reference', type: 'string', required: true, desc: 'Government-issued reference number for the verification' },
        { name: 'status', type: '"approved" | "rejected"', required: true, desc: 'Verification outcome' },
        { name: 'message', type: 'string', required: false, desc: 'Optional human-readable result message' },
      ]
    },
    responses: [
      { status: 200, desc: 'Processed successfully', body: '{"detail": "Processed."}' },
      { status: 401, desc: 'Invalid HMAC signature', body: '{"detail": "Invalid signature."}' },
      { status: 400, desc: 'Malformed payload', body: '{field errors}' },
    ],
    example: `# Signing example (Python)
import hmac, hashlib, json, requests

payload = json.dumps({
    "submission_id": "uuid",
    "reference": "GOV-REF-001",
    "status": "approved",
    "message": "Identity verified against national archive."
})

signature = hmac.new(
    SHARED_SECRET.encode(),
    payload.encode(),
    hashlib.sha256
).hexdigest()

requests.post(
    "https://api.ingrion.io/api/kyc/callback/",
    data=payload,
    headers={
        "Content-Type": "application/json",
        "X-INGRION-Signature": signature
    }
)`
  },
  {
    id: 'download-application',
    method: 'GET',
    path: '/api/downloads/application/?token={token}',
    title: 'Download Application Binary',
    description: 'Stream the 32MB application binary using a one-time download token. The token is consumed before streaming begins.',
    auth: 'One-time download token (query parameter)',
    rateLimit: '3/hour',
    security: [
      'Token validated before streaming begins',
      'Token consumed atomically (one use only)',
      'Token expiry enforced (15 minutes)',
      'Downloading IP logged for audit',
      'Submission must be in approved status',
    ],
    request: {
      params: [
        { name: 'token', type: 'UUID', required: true, desc: 'One-time download token from KYC approval' }
      ]
    },
    responses: [
      { status: 200, desc: 'Binary stream — application/octet-stream', body: '<binary data>' },
      { status: 400, desc: 'Missing token', body: '{"detail": "Token parameter is required."}' },
      { status: 403, desc: 'Invalid, expired, or already-used token', body: '{"detail": "Token has already been used or has expired."}' },
      { status: 503, desc: 'Binary not yet deployed', body: '{"detail": "Application binary not available."}' },
    ],
    example: `# Direct browser download
window.location.href = '/api/downloads/application/?token=<uuid>'

# Curl
curl -O -J 'https://api.ingrion.io/api/downloads/application/?token=<uuid>'`
  },
  {
    id: 'download-validate',
    method: 'GET',
    path: '/api/downloads/validate/?token={token}',
    title: 'Validate Download Token',
    description: 'Check whether a download token is valid without consuming it. Used by the frontend to control UI state.',
    auth: 'None',
    rateLimit: '20/minute',
    request: {
      params: [
        { name: 'token', type: 'UUID', required: true, desc: 'The download token to validate' }
      ]
    },
    responses: [
      { status: 200, desc: 'Valid token', body: '{"valid": true, "expires_at": "ISO8601"}' },
      { status: 200, desc: 'Invalid token', body: '{"valid": false, "reason": "Token already used."}' },
    ],
    example: `curl 'https://api.ingrion.io/api/downloads/validate/?token=<uuid>'`
  },
  {
    id: 'whitepaper',
    method: 'GET',
    path: '/api/whitepaper/',
    title: 'Get Whitepaper Data',
    description: 'Returns the full whitepaper as structured JSON for frontend rendering.',
    auth: 'None',
    rateLimit: '20/minute',
    responses: [
      { status: 200, desc: 'Whitepaper JSON', body: '{"title": "...", "sections": [...], "version": "1.0.0"}' },
    ],
    example: `curl https://api.ingrion.io/api/whitepaper/`
  },
  {
    id: 'whitepaper-pdf',
    method: 'GET',
    path: '/api/whitepaper/pdf/',
    title: 'Download Whitepaper PDF',
    description: 'Serves the whitepaper PDF file. Place your PDF at media/whitepaper/ingrion-whitepaper.pdf.',
    auth: 'None',
    responses: [
      { status: 200, desc: 'PDF file download', body: '<PDF binary>' },
      { status: 404, desc: 'PDF not yet deployed', body: '404 Not Found' },
    ],
    example: `curl -O -J https://api.ingrion.io/api/whitepaper/pdf/`
  },
]

const METHOD_COLORS = {
  GET: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  POST: 'bg-primary/10 text-primary border-primary/20',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/20',
}

function EndpointCard({ ep }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-6 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className={`text-xs font-mono font-bold px-2 py-1 rounded border flex-shrink-0 ${METHOD_COLORS[ep.method]}`}>
          {ep.method}
        </span>
        <code className="text-sm font-mono text-slate-300 flex-1">{ep.path}</code>
        <span className="text-slate-500 text-sm hidden md:block">{ep.title}</span>
        <svg
          className={`w-4 h-4 text-slate-600 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-6 pb-6 border-t border-white/5 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4 mb-4">
            <div>
              <div className="text-xs text-slate-600 uppercase tracking-wider mb-1">Auth</div>
              <div className="text-xs text-slate-300">{ep.auth}</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 uppercase tracking-wider mb-1">Rate Limit</div>
              <div className="text-xs text-slate-300">{ep.rateLimit}</div>
            </div>
          </div>

          <p className="text-sm text-slate-400 mb-6">{ep.description}</p>

          {ep.security && (
            <div className="glass-card p-4 mb-6 border border-primary/10">
              <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Security Controls</div>
              <ul className="space-y-1">
                {ep.security.map((s, i) => (
                  <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                    <span className="text-cyan-500 flex-shrink-0">✓</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ep.request?.headers && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Headers</div>
              <div className="space-y-2">
                {ep.request.headers.map((h) => (
                  <div key={h.name} className="glass-card p-3 flex gap-3 text-xs">
                    <code className="font-mono text-cyan-300 flex-shrink-0">{h.name}</code>
                    {h.required && <span className="text-red-400">*</span>}
                    <span className="text-slate-500">{h.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ep.request?.params && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Parameters</div>
              <div className="space-y-2">
                {ep.request.params.map((p) => (
                  <div key={p.name} className="glass-card p-3 grid grid-cols-3 gap-2 text-xs">
                    <code className="font-mono text-cyan-300">{p.name}</code>
                    <span className="text-slate-600 font-mono">{p.type}</span>
                    <span className="text-slate-500">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ep.request?.fields && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Request Body Fields</div>
              <div className="space-y-2">
                {ep.request.fields.map((f) => (
                  <div key={f.name} className="glass-card p-3 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="font-mono text-cyan-300">{f.name}</code>
                      <span className="text-slate-600">{f.type}</span>
                      {f.required && <span className="text-red-400 text-[10px] uppercase tracking-wider">required</span>}
                    </div>
                    <p className="text-slate-500">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ep.responses && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Responses</div>
              <div className="space-y-2">
                {ep.responses.map((r) => (
                  <div key={r.status} className="glass-card p-3 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-mono font-bold ${r.status < 300 ? 'text-green-400' : r.status < 400 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {r.status}
                      </span>
                      <span className="text-slate-400">{r.desc}</span>
                    </div>
                    <code className="font-mono text-slate-600 break-all">{r.body}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ep.example && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Example</div>
              <pre className="glass-card p-4 text-xs font-mono text-slate-400 overflow-x-auto rounded-xl border border-white/5">
                {ep.example}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function APIDocsPage() {
  return (
    <div className="min-h-screen py-32 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-up">
          <span className="text-xs font-mono text-primary tracking-widest uppercase mb-4 block">
            API Reference
          </span>
          <h1 className="font-display font-bold text-4xl text-white mb-4">
            Government Integration Docs
          </h1>
          <p className="text-slate-500 max-w-xl mx-auto">
            Complete API reference for the INGRION platform. 
            Includes KYC submission, government callback protocol, secure download, and whitepaper endpoints.
          </p>
        </div>

        {/* Base URL */}
        <div className="glass-card p-4 mb-8 flex items-center gap-3 animate-fade-up">
          <span className="text-xs text-slate-500 uppercase tracking-wider flex-shrink-0">Base URL</span>
          <code className="font-mono text-sm text-cyan-300">https://api.ingrion.io</code>
          <span className="ml-auto text-xs text-slate-600">All endpoints return JSON</span>
        </div>

        {/* Authentication overview */}
        <div className="glass-card-strong p-6 mb-10 animate-fade-up">
          <h2 className="font-display font-bold text-white text-lg mb-4">Authentication Model</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="glass-card p-4">
              <div className="text-xs text-slate-600 uppercase tracking-wider mb-2">Public Endpoints</div>
              <p className="text-slate-400 text-xs">Status polling, whitepaper, token validation. No credentials required.</p>
            </div>
            <div className="glass-card p-4">
              <div className="text-xs text-slate-600 uppercase tracking-wider mb-2">CSRF-Protected</div>
              <p className="text-slate-400 text-xs">KYC submission. Requires X-CSRFToken header from the Django CSRF cookie.</p>
            </div>
            <div className="glass-card p-4">
              <div className="text-xs text-slate-600 uppercase tracking-wider mb-2">HMAC-Protected</div>
              <p className="text-slate-400 text-xs">Government callback. Requires X-INGRION-Signature HMAC-SHA256 header.</p>
            </div>
          </div>
        </div>

        {/* Endpoints */}
        <div className="space-y-4">
          <h2 className="font-display font-bold text-white text-xl mb-6">Endpoints</h2>
          {ENDPOINTS.map((ep) => (
            <EndpointCard key={ep.id} ep={ep} />
          ))}
        </div>

        {/* HMAC Signing Guide */}
        <div className="glass-card-strong p-8 mt-12 animate-fade-up">
          <h2 className="font-display font-bold text-white text-xl mb-6">
            Government Integration Guide
          </h2>
          <div className="space-y-4 text-sm text-slate-400 leading-relaxed">
            <p>
              To integrate with INGRION's callback system, your Government Archive API must:
            </p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Receive the forwarded verification request from INGRION</li>
              <li>Perform identity verification against your sovereign records</li>
              <li>Sign the callback payload using the pre-shared HMAC secret</li>
              <li>POST the signed result to the INGRION callback endpoint</li>
            </ol>
            <p>
              The HMAC secret is exchanged out-of-band during platform onboarding. 
              Contact <code className="font-mono text-cyan-400">integration@ingrion.io</code> to request a sandbox API key and shared secret for testing.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
