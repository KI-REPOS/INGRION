import React, { useState, useCallback, useRef, useEffect } from 'react'
import { generateKeypair, hashPassword, extractFacialEmbedding } from '../lib/crypto'
import { api } from '../lib/api'

const STEPS = ['Generate Keys', 'Identity Details', 'Review & Submit', 'Awaiting Result']

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-12">
      {STEPS.map((label, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center gap-2">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-mono font-bold transition-all duration-300 ${
                i < current
                  ? 'futuristic-gradient text-white'
                  : i === current
                  ? 'border-2 border-primary text-primary bg-primary/10'
                  : 'border border-white/10 text-slate-600'
              }`}
            >
              {i < current ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-xs hidden md:block ${i === current ? 'text-white' : 'text-slate-600'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`h-[1px] w-12 md:w-24 mx-1 transition-all duration-500 ${
                i < current ? 'bg-primary' : 'bg-white/10'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

function KeyDisplay({ label, value, mono = true }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
        <button
          onClick={copy}
          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <div className={`text-xs break-all leading-relaxed ${mono ? 'font-mono text-cyan-300' : 'text-slate-300'}`}>
        {value}
      </div>
    </div>
  )
}

function CameraCapture({ onCapture, capturedImage, onRetake }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')

  // KEY FIX: getUserMedia runs before the <video> element exists in the DOM.
  // We store the stream in a ref, set cameraActive=true so React renders <video>,
  // then this effect fires AFTER that render to attach the stream safely.
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [cameraActive])

  const startCamera = async () => {
    setCameraError('')
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream   // store first
      setCameraActive(true)        // then trigger render + useEffect
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera access denied. Please allow camera permissions in your browser and try again.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera found. Please connect a camera and try again.')
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Camera is in use by another app. Please close it and try again.')
      } else {
        setCameraError(`Camera error: ${err.message || err.name}`)
      }
    }
  }

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }, [])

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (blob) {
        const file = new File([blob], 'facial-scan.jpg', { type: 'image/jpeg' })
        onCapture(file, canvas.toDataURL('image/jpeg', 0.9))
        stopCamera()
      }
    }, 'image/jpeg', 0.9)
  }

  const handleRetake = () => {
    onRetake()
    startCamera()
  }

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  if (capturedImage) {
    return (
      <div className="space-y-3">
        <div className="relative rounded-xl overflow-hidden border border-green-500/30">
          <img src={capturedImage} alt="Captured facial scan" className="w-full object-cover" style={{ maxHeight: 280 }} />
          <div className="absolute top-2 right-2 bg-green-500/90 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Captured
          </div>
        </div>
        <button
          type="button"
          onClick={handleRetake}
          className="w-full glass-card py-2.5 rounded-xl text-slate-400 hover:text-white text-sm transition-colors"
        >
          ↺ Retake Photo
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {cameraError && (
        <div className="glass-card border border-red-500/20 bg-red-500/5 p-3 text-red-400 text-xs rounded-xl">
          {cameraError}
        </div>
      )}

      {!cameraActive ? (
        <button
          type="button"
          onClick={startCamera}
          className="w-full glass-card py-6 rounded-xl border border-dashed border-primary/30 hover:border-primary/60 transition-colors flex flex-col items-center gap-2 cursor-pointer"
        >
          <svg className="w-10 h-10 text-primary/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M4 8h8a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4a2 2 0 012-2z" />
          </svg>
          <span className="text-slate-400 text-sm">Click to activate live camera</span>
          <span className="text-slate-600 text-xs">Your face will be scanned locally — nothing is transmitted</span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden border border-primary/30 bg-black">
            <video
              ref={videoRef}
              className="w-full object-cover"
              style={{ maxHeight: 280, transform: 'scaleX(-1)' }}
              autoPlay
              muted
              playsInline
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="border-2 border-primary/60 rounded-full opacity-60"
                style={{ width: 160, height: 200, borderStyle: 'dashed' }}
              />
            </div>
            <div className="absolute bottom-2 left-0 right-0 text-center text-xs text-primary/80">
              Position your face in the oval
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={stopCamera}
              className="flex-1 glass-card py-2.5 rounded-xl text-slate-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={capturePhoto}
              className="flex-1 futuristic-gradient py-2.5 rounded-xl text-white font-display font-bold text-sm button-glow transition-all hover:opacity-90"
            >
              📸 Capture
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function KYCPage() {
  const [step, setStep] = useState(0)
  const [keypair, setKeypair] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [keysReady, setKeysReady] = useState(false)

  const [archiveLink, setArchiveLink] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [capturedImagePreview, setCapturedImagePreview] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [submissionResult, setSubmissionResult] = useState(null)
  const [error, setError] = useState('')

  const [kycStatus, setKycStatus] = useState(null)
  const [downloadToken, setDownloadToken] = useState(null)

  // FIX 1: Generate keys and SHOW them at step 0 — user must click "Continue" to proceed to step 1
  const handleGenerateKeys = useCallback(async () => {
    setGenerating(true)
    setError('')
    await new Promise(r => setTimeout(r, 400))
    const kp = generateKeypair()
    setKeypair(kp)
    setGenerating(false)
    setKeysReady(true)  // stay on step 0, just reveal keys
  }, [])

  const handleContinueToDetails = () => {
    setStep(1)
  }

  const handleDetailsNext = () => {
    if (!archiveLink) return setError('Archive link is required.')
    if (!password) return setError('Password is required.')
    if (password.length < 12) return setError('Password must be at least 12 characters.')
    if (password !== confirmPassword) return setError('Passwords do not match.')
    if (!imageFile) return setError('Facial scan is required. Please capture a photo using the camera.')
    setError('')
    setStep(2)
  }

  const handleSubmit = async () => {
    if (!keypair) return
    setSubmitting(true)
    setError('')
    try {
      const [passwordHash, facialEmbedding] = await Promise.all([
        hashPassword(password, keypair.publicKey),
        extractFacialEmbedding(imageFile),
      ])
      const result = await api.submitKYC({
        archive_link: archiveLink,
        public_key_b64: keypair.publicKeyB64,
        password_hash: passwordHash,
        facial_embedding_b64: facialEmbedding,
      })
      setSubmissionResult(result)
      setStep(3)
      startPolling(result.submission_id)
    } catch (err) {
      setError(err.message || 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const startPolling = (submissionId) => {
    const interval = setInterval(async () => {
      try {
        const status = await api.getKYCStatus(submissionId)
        setKycStatus(status)
        if (status.status === 'approved') {
          setDownloadToken(status.download_token)
          clearInterval(interval)
        } else if (status.status === 'rejected' || status.status === 'failed') {
          clearInterval(interval)
        }
      } catch { }
    }, 5000)
    setTimeout(() => clearInterval(interval), 600000)
  }

  const statusColor = {
    pending: 'text-yellow-400',
    submitted: 'text-blue-400',
    approved: 'text-green-400',
    rejected: 'text-red-400',
    failed: 'text-orange-400',
  }

  // Encode secretKey to base64 for display
  const privateKeyB64 = keypair
    ? btoa(String.fromCharCode(...keypair.secretKey))
    : ''

  return (
    <div className="min-h-screen py-32 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12 animate-fade-up">
          <span className="text-xs font-mono text-primary tracking-widest uppercase mb-4 block">
            KYC Verification
          </span>
          <h1 className="font-display font-bold text-4xl text-white mb-4">
            Identity Verification
          </h1>
          <p className="text-slate-500">
            Government-anchored cryptographic identity. Your private key never leaves your browser.
          </p>
        </div>

        <StepIndicator current={step} />

        {error && (
          <div className="mb-6 glass-card border border-red-500/20 bg-red-500/5 p-4 text-red-400 text-sm rounded-xl animate-fade-in">
            {error}
          </div>
        )}

        {/* ── Step 0: Generate Keys ── */}
        {step === 0 && (
          <div className="glass-card-strong p-8 animate-fade-up">
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-full futuristic-gradient mx-auto mb-6 flex items-center justify-center glow-primary">
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h2 className="font-display font-bold text-white text-2xl mb-3">
                Generate Your Cryptographic Identity
              </h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                An Ed25519 keypair will be generated in your browser using TweetNaCl.
                Your <strong className="text-white">private key never leaves this device</strong>.
                Only your public key is used for verification.
              </p>
            </div>

            <div className="glass-card p-4 mb-8 border border-yellow-500/10">
              <div className="flex gap-3">
                <span className="text-yellow-400 flex-shrink-0">⚠</span>
                <p className="text-xs text-slate-400 leading-relaxed">
                  <strong className="text-yellow-400">Save your keys.</strong> After generation,
                  copy and store both keys securely offline. If you lose your private key,
                  you cannot recover this identity — you will need to re-verify.
                </p>
              </div>
            </div>

            {/* Keys shown HERE at step 0 before continuing */}
            {keysReady && keypair && (
              <div className="space-y-4 mb-8 animate-fade-in">
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Keys generated — copy and save them securely before continuing!
                </div>
                <KeyDisplay label="Public Key (Base64)" value={keypair.publicKeyB64} />
                <KeyDisplay
                  label="Private Key (Base64) — STORE SECURELY & NEVER SHARE"
                  value={privateKeyB64}
                />
                <div className="glass-card p-3 border border-red-500/10 bg-red-500/5">
                  <p className="text-xs text-red-400/80 text-center">
                    🔐 This is the only time your private key will be shown. Copy it now.
                  </p>
                </div>
              </div>
            )}

            {!keysReady ? (
              <button
                onClick={handleGenerateKeys}
                disabled={generating}
                className="w-full futuristic-gradient py-4 rounded-xl text-white font-display font-bold text-base button-glow transition-all duration-300 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </span>
                ) : (
                  'Generate Ed25519 Keypair'
                )}
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleGenerateKeys}
                  disabled={generating}
                  className="w-full glass-card py-3 rounded-xl text-slate-400 hover:text-white text-sm transition-colors"
                >
                  ↺ Regenerate Keys
                </button>
                <button
                  onClick={handleContinueToDetails}
                  className="w-full futuristic-gradient py-4 rounded-xl text-white font-display font-bold text-base button-glow transition-all duration-300 hover:opacity-90"
                >
                  I've Saved My Keys — Continue →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 1: Identity Details ── */}
        {step === 1 && (
          <div className="glass-card-strong p-8 animate-fade-up space-y-6">
            <h2 className="font-display font-bold text-white text-2xl mb-2">
              Identity Details
            </h2>
            <p className="text-slate-500 text-sm">
              Provide your government archive link and biometric scan.
              All processing happens locally — data is hashed before transmission.
            </p>

            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
                Government Archive Link *
              </label>
              <input
                type="url"
                className="input-field"
                placeholder="https://archive.gov.example.com/records/..."
                value={archiveLink}
                onChange={e => setArchiveLink(e.target.value)}
              />
              <p className="text-xs text-slate-600 mt-1">
                The URL to your identity document in the national archive system.
              </p>
            </div>

            {/* FIX 2: Live camera instead of file upload */}
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
                Facial Scan — Live Camera *
              </label>
              <CameraCapture
                onCapture={(file, preview) => {
                  setImageFile(file)
                  setCapturedImagePreview(preview)
                }}
                capturedImage={capturedImagePreview}
                onRetake={() => {
                  setImageFile(null)
                  setCapturedImagePreview(null)
                }}
              />
              <p className="text-xs text-slate-600 mt-2">
                A float32 embedding vector is extracted locally. The image is never transmitted.
              </p>
            </div>

            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
                Identity Password *
              </label>
              <input
                type="password"
                className="input-field"
                placeholder="Minimum 12 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
                Confirm Password *
              </label>
              <input
                type="password"
                className="input-field"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setStep(0); setError('') }}
                className="flex-1 glass-card py-3 rounded-xl text-slate-400 hover:text-white transition-colors font-medium"
              >
                ← Back
              </button>
              <button
                onClick={handleDetailsNext}
                className="flex-1 futuristic-gradient py-3 rounded-xl text-white font-display font-bold button-glow transition-all hover:opacity-90"
              >
                Review →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Review ── */}
        {step === 2 && keypair && (
          <div className="glass-card-strong p-8 animate-fade-up space-y-6">
            <h2 className="font-display font-bold text-white text-2xl">
              Review Submission
            </h2>

            <div className="space-y-4">
              <KeyDisplay label="Your Public Key" value={keypair.publicKeyB64} />
              <div className="glass-card p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Archive Link</div>
                <div className="text-sm text-cyan-300 font-mono break-all">{archiveLink}</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Facial Scan</div>
                {capturedImagePreview ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={capturedImagePreview}
                      alt="preview"
                      className="w-16 h-16 object-cover rounded-lg border border-white/10"
                    />
                    <span className="text-sm text-slate-300">
                      Live camera capture — embedding will be extracted client-side
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-slate-300">{imageFile?.name}</div>
                )}
              </div>
              <div className="glass-card p-4 border border-green-500/10">
                <div className="flex items-center gap-2 text-xs text-green-400 mb-2">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Security Guarantee
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Your password will be hashed with SHA-256 + public key salt before transmission.
                  Your private key stays in browser memory only. Raw facial image is never sent.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setStep(1); setError('') }}
                className="flex-1 glass-card py-3 rounded-xl text-slate-400 hover:text-white transition-colors font-medium"
              >
                ← Edit
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 futuristic-gradient py-3 rounded-xl text-white font-display font-bold button-glow transition-all hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  'Submit Verification'
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Awaiting Result ── */}
        {step === 3 && submissionResult && (
          <div className="glass-card-strong p-8 animate-fade-up space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full border-2 border-primary mx-auto mb-4 flex items-center justify-center animate-pulse-glow">
                <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="font-display font-bold text-white text-2xl mb-2">
                Submission Received
              </h2>
              <p className="text-slate-500 text-sm">
                Your identity has been forwarded to the Government Archive.
                Verification typically completes within 24–48 hours.
              </p>
            </div>

            <div className="glass-card p-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Submission ID</div>
              <div className="text-sm font-mono text-cyan-300 break-all">{submissionResult.submission_id}</div>
            </div>

            {kycStatus && (
              <div className="glass-card p-4 animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500 uppercase tracking-wider">Current Status</span>
                  <span className={`text-sm font-mono font-bold uppercase ${statusColor[kycStatus.status] || 'text-slate-400'}`}>
                    {kycStatus.status}
                  </span>
                </div>
                {kycStatus.government_message && (
                  <p className="text-xs text-slate-500">{kycStatus.government_message}</p>
                )}
              </div>
            )}

            {downloadToken && (
              <div className="glass-card p-6 border border-green-500/20 bg-green-500/5 animate-fade-in">
                <div className="flex items-center gap-2 text-green-400 mb-4">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-display font-semibold">Identity Verified — Download Ready</span>
                </div>
                <a
                  href={api.getDownloadUrl(downloadToken)}
                  className="block w-full futuristic-gradient py-3 rounded-xl text-white font-display font-bold text-center button-glow transition-all hover:opacity-90"
                >
                  Download INGRION Application (32MB)
                </a>
                <p className="text-xs text-slate-500 text-center mt-2">
                  One-time download. Token expires in 15 minutes.
                </p>
              </div>
            )}

            {/* Rejected state */}
            {kycStatus && (kycStatus.status === 'rejected' || kycStatus.status === 'failed') && !downloadToken && (
              <div className="glass-card p-5 border border-red-500/20 bg-red-500/5 animate-fade-in">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <span className="text-red-400 font-display font-semibold">Verification Rejected</span>
                </div>
                <p className="text-slate-400 text-sm mb-4">
                  {kycStatus.government_message || 'Identity could not be verified. Biometric mismatch or record not found.'}
                </p>
                <button
                  onClick={() => { setStep(0); setKycStatus(null); setSubmissionResult(null); setDownloadToken(null); setImageFile(null); setCapturedImagePreview(null); setKeypair(null); setKeysReady(false) }}
                  className="w-full glass-card py-3 rounded-xl text-slate-300 hover:text-white text-sm transition-colors font-medium border border-white/10"
                >
                  ↺ Start Over
                </button>
              </div>
            )}

            {/* Polling spinner — only when not yet resolved */}
            {!downloadToken && (!kycStatus || (kycStatus.status !== 'rejected' && kycStatus.status !== 'failed')) && (
              <div className="flex items-center justify-center gap-2 text-slate-600 text-sm py-4">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Polling for result every 5 seconds...</span>
              </div>
            )}

            <div className="pt-2">
              <p className="text-xs text-slate-600 text-center">
                Keep this window open or note your Submission ID:
                <span className="font-mono text-primary ml-1">{submissionResult.submission_id}</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}