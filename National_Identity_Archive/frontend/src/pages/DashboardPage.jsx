import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { api } from '../lib/api'
import { extractEmbeddingFromVideo, captureFrameAsBlob, getCameraStream } from '../lib/embedding'

function StatusBadge({ status }) {
  const labels = {
    draft: 'Not Submitted',
    submitted: 'Submitted',
    under_review: 'Under Review',
    approved: 'Approved',
    rejected: 'Rejected',
  }
  return (
    <span className={`badge badge-${status}`}>{labels[status] || status}</span>
  )
}

export default function DashboardPage() {
  const { user, updateUser } = useAuth()
  const [kyc, setKyc] = useState(null)
  const [loadingKyc, setLoadingKyc] = useState(true)

  // Camera state
  const videoRef = useRef(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [stream, setStream] = useState(null)
  const [capturing, setCapturing] = useState(false)
  const [captureSuccess, setCaptureSuccess] = useState(false)
  const [cameraError, setCameraError] = useState('')

  useEffect(() => {
    api.getMyKYC().then(setKyc).catch(console.error).finally(() => setLoadingKyc(false))
  }, [])

  const openCamera = async () => {
    setCameraError('')
    setCaptureSuccess(false)
    try {
      const s = await getCameraStream()
      setStream(s)
      setCameraOpen(true)
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play()
        }
      }, 100)
    } catch (e) {
      setCameraError('Camera access denied. Please allow camera permission.')
    }
  }

  const closeCamera = () => {
    if (stream) stream.getTracks().forEach(t => t.stop())
    setStream(null)
    setCameraOpen(false)
  }

  const handleCapture = async () => {
    if (!videoRef.current) return
    setCapturing(true)
    setCameraError('')
    try {
      const [embedding, photoBlob] = await Promise.all([
        extractEmbeddingFromVideo(videoRef.current),
        captureFrameAsBlob(videoRef.current),
      ])

      const formData = new FormData()
      formData.append('facial_embedding_b64', embedding)
      formData.append('profile_photo', photoBlob, 'profile.jpg')

      const res = await api.updateProfile(formData)
      updateUser(res.user)
      setCaptureSuccess(true)
      closeCamera()
    } catch (e) {
      setCameraError('Capture failed: ' + e.message)
    } finally {
      setCapturing(false)
    }
  }

  const kycStatusStep = {
    draft: 0,
    submitted: 1,
    under_review: 2,
    approved: 3,
    rejected: -1,
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">

      {/* Profile card */}
      <div className="gov-card-elevated p-6 animate-fade-up">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Profile photo */}
          <div className="relative flex-shrink-0">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-surface-2 border-2 border-blue-500/30 flex items-center justify-center">
              {user?.profile_photo ? (
                <img src={user.profile_photo} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-10 h-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </div>
            {user?.has_facial_embedding && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-2 border-base flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-white font-bold text-2xl">{user?.name}</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-400">
              <span className="font-mono">Aadhaar: {user?.aadhaar_number}</span>
              {user?.date_of_birth && <span>DOB: {user?.date_of_birth}</span>}
              {user?.phone && <span>📞 {user?.phone}</span>}
              {user?.email && <span>✉️ {user?.email}</span>}
            </div>
            {user?.address && (
              <p className="text-slate-500 text-sm mt-1">📍 {user?.address}</p>
            )}
            {user?.public_key_b64 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-500">Public Key (Ed25519):</span>
                <span className="font-mono text-xs text-blue-400 truncate max-w-48">
                  {user.public_key_b64.substring(0, 24)}…
                </span>
              </div>
            )}
          </div>

          {/* Facial scan button */}
          <div className="flex-shrink-0 text-center">
            <button
              onClick={openCamera}
              className={`btn-primary px-4 py-2 text-sm flex items-center gap-2 ${captureSuccess ? 'bg-green-600 hover:bg-green-700' : ''}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.806v6.388a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {user?.has_facial_embedding ? 'Re-scan Face' : 'Scan Face'}
            </button>
            {user?.has_facial_embedding && (
              <p className="text-xs text-green-400 mt-1">✓ Biometric registered</p>
            )}
            {captureSuccess && (
              <p className="text-xs text-green-400 mt-1">✓ Updated!</p>
            )}
          </div>
        </div>
      </div>

      {/* Camera modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-fade-in">
          <div className="gov-card-elevated p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Facial Biometric Scan</h3>
              <button onClick={closeCamera} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-black mb-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-64 object-cover"
              />
              {/* Scan overlay */}
              <div className="absolute inset-0 border-2 border-blue-500/40 rounded-xl pointer-events-none">
                <div className="camera-scan-line" />
                {/* Corner markers */}
                {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
                  <div key={i} className={`absolute ${pos} w-6 h-6 border-blue-400`}
                    style={{
                      borderTopWidth: i < 2 ? 2 : 0,
                      borderBottomWidth: i >= 2 ? 2 : 0,
                      borderLeftWidth: i % 2 === 0 ? 2 : 0,
                      borderRightWidth: i % 2 === 1 ? 2 : 0,
                    }}
                  />
                ))}
              </div>
              <div className="absolute bottom-3 left-0 right-0 text-center">
                <span className="text-xs text-blue-300 bg-black/60 px-3 py-1 rounded-full">
                  Position your face in the frame
                </span>
              </div>
            </div>

            {cameraError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg">
                {cameraError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button onClick={closeCamera} className="btn-secondary py-3">Cancel</button>
              <button
                onClick={handleCapture}
                disabled={capturing}
                className="btn-primary py-3"
              >
                {capturing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Extracting...
                  </span>
                ) : 'Capture & Save'}
              </button>
            </div>

            <p className="text-xs text-slate-600 text-center mt-3">
              A float32 embedding is extracted locally and stored securely.
            </p>
          </div>
        </div>
      )}

      {/* KYC status overview */}
      <div className="gov-card p-6 animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-semibold text-lg">KYC Verification Status</h2>
          <Link to="/kyc" className="btn-primary px-4 py-2 text-sm">
            {kyc?.status === 'draft' ? 'Start KYC →' : 'View KYC →'}
          </Link>
        </div>

        {loadingKyc ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : kyc ? (
          <>
            {/* Status track */}
            {kyc.status !== 'rejected' ? (
              <div className="flex items-center gap-0 mb-6">
                {['draft', 'submitted', 'under_review', 'approved'].map((s, i) => {
                  const labels = { draft: 'Documents', submitted: 'Submitted', under_review: 'Under Review', approved: 'Approved' }
                  const current = kycStatusStep[kyc.status] ?? 0
                  const done = i < current
                  const active = i === current
                  return (
                    <React.Fragment key={s}>
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          done ? 'bg-blue-600 text-white' :
                          active ? 'border-2 border-blue-500 text-blue-400 bg-blue-500/10' :
                          'border border-white/10 text-slate-600'
                        }`}>
                          {done ? '✓' : i + 1}
                        </div>
                        <span className={`text-xs ${active ? 'text-white' : 'text-slate-600'}`}>{labels[s]}</span>
                      </div>
                      {i < 3 && (
                        <div className={`flex-1 h-[1px] mx-1 mb-4 ${i < current ? 'bg-blue-600' : 'bg-white/10'}`} />
                      )}
                    </React.Fragment>
                  )
                })}
              </div>
            ) : (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-400 font-semibold mb-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Rejected
                </div>
                {kyc.admin_remarks && (
                  <p className="text-red-300/80 text-sm">Remarks: {kyc.admin_remarks}</p>
                )}
                <Link to="/kyc" className="text-sm text-red-400 underline mt-2 block">Re-upload documents →</Link>
              </div>
            )}

            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-slate-500">Status: </span>
                <StatusBadge status={kyc.status} />
              </div>
              <div>
                <span className="text-slate-500">Documents: </span>
                <span className="text-white">{Object.keys(kyc.documents).length} / 6</span>
              </div>
              {kyc.submitted_at && (
                <div>
                  <span className="text-slate-500">Submitted: </span>
                  <span className="text-slate-300">{new Date(kyc.submitted_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {kyc.status === 'approved' && (
              <div className="mt-4 bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="text-green-400 font-semibold">✓ KYC Approved</p>
                  <p className="text-slate-400 text-sm">You can now generate archive links for INGRION.</p>
                </div>
                <Link to="/archive" className="btn-success px-4 py-2 text-sm">
                  Generate Link →
                </Link>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { to: '/kyc', icon: '📄', title: 'KYC Documents', desc: 'Upload and manage your verification documents' },
          { to: '/archive', icon: '🔗', title: 'Archive Links', desc: 'Generate expirable links for INGRION platform' },
          { to: '/dashboard', icon: '🛡️', title: 'Security', desc: 'Ed25519 public key anchored to your identity' },
        ].map(({ to, icon, title, desc }) => (
          <Link key={to} to={to} className="gov-card p-5 hover:border-blue-500/30 transition-all group">
            <div className="text-2xl mb-3">{icon}</div>
            <div className="text-white font-semibold text-sm group-hover:text-blue-400 transition-colors">{title}</div>
            <div className="text-slate-500 text-xs mt-1">{desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

const kycStatusStep = {
  draft: 0,
  submitted: 1,
  under_review: 2,
  approved: 3,
}
