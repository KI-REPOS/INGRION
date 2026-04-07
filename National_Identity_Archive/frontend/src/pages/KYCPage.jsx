import React, { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { api } from '../lib/api'

const DOC_TYPES = [
  { key: 'aadhaar', label: 'Aadhaar Card', icon: '🪪', desc: 'Government-issued Aadhaar identity card' },
  { key: 'pan', label: 'PAN Card', icon: '💳', desc: 'Permanent Account Number card (Income Tax)' },
  { key: 'passport', label: 'Passport', icon: '📕', desc: 'Valid Indian Passport (identity pages)' },
  { key: 'voter_id', label: 'Voter ID', icon: '🗳️', desc: 'Voter Identity Card (EPIC)' },
  { key: 'driving_license', label: "Driving License", icon: '🚗', desc: 'Valid Driving License' },
  { key: 'birth_certificate', label: 'Birth Certificate', icon: '📜', desc: 'Government-issued Birth Certificate' },
]

function DocCard({ doc, submission, onUploaded }) {
  const uploaded = submission?.documents?.[doc.key]
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const canUpload = !['submitted', 'under_review', 'approved'].includes(submission?.status)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files accepted.')
      return
    }
    setError('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('doc_type', doc.key)
      fd.append('file', file)
      const res = await api.uploadDocument(fd)
      onUploaded(doc.key, res.document)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className={`gov-card p-5 transition-all ${uploaded ? 'border-green-500/20' : 'border-white/5'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{doc.icon}</span>
          <div>
            <div className="text-white font-medium text-sm">{doc.label}</div>
            <div className="text-slate-500 text-xs">{doc.desc}</div>
          </div>
        </div>
        {uploaded ? (
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <div className="flex-shrink-0 w-7 h-7 rounded-full border border-white/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
        )}
      </div>

      {uploaded ? (
        <div className="bg-green-500/5 border border-green-500/10 rounded-lg p-3">
          <div className="flex items-center gap-2 text-green-400 text-xs">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {uploaded.filename}
          </div>
          <div className="text-slate-600 text-xs mt-1">
            Uploaded {new Date(uploaded.uploaded_at).toLocaleDateString()}
          </div>
          {canUpload && (
            <label className="mt-2 block">
              <input type="file" accept=".pdf" className="hidden" onChange={handleFile} />
              <span className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">Replace file →</span>
            </label>
          )}
        </div>
      ) : canUpload ? (
        <label className="block cursor-pointer">
          <input type="file" accept=".pdf" className="hidden" onChange={handleFile} disabled={uploading} />
          <div className={`border border-dashed border-white/15 rounded-lg p-4 text-center hover:border-blue-500/40 hover:bg-blue-500/5 transition-all ${uploading ? 'opacity-50' : ''}`}>
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-slate-400 text-xs">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Uploading...
              </div>
            ) : (
              <>
                <svg className="w-6 h-6 text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-slate-500 text-xs">Click to upload PDF</p>
                <p className="text-slate-700 text-xs">Max 10MB</p>
              </>
            )}
          </div>
        </label>
      ) : (
        <div className="text-slate-600 text-xs italic">
          {submission?.status === 'approved' ? 'Approved — cannot modify' : 'Pending review'}
        </div>
      )}

      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}

export default function KYCPage() {
  const { user } = useAuth()
  const [submission, setSubmission] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState(false)

  useEffect(() => {
    api.getMyKYC().then(setSubmission).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleDocUploaded = (docType, docData) => {
    setSubmission(prev => ({
      ...prev,
      documents: { ...prev.documents, [docType]: docData }
    }))
  }

  const handleSubmit = async () => {
    if (!user?.has_facial_embedding) {
      setSubmitError('Please complete your facial biometric scan from the Dashboard first.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await api.submitKYC()
      setSubmission(res.submission)
      setSubmitSuccess(true)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const uploadedCount = Object.keys(submission?.documents || {}).length
  const allUploaded = uploadedCount === 6
  const canSubmit = submission?.can_submit && !['submitted', 'under_review', 'approved'].includes(submission?.status)

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="text-slate-500">Loading...</div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

      {/* Header */}
      <div className="animate-fade-up">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs font-mono text-blue-400 uppercase tracking-widest">KYC Verification</span>
        </div>
        <h1 className="text-white font-bold text-3xl">Identity Documents</h1>
        <p className="text-slate-500 mt-2">
          Upload all six required documents as PDFs for government verification.
        </p>
      </div>

      {/* Status banner */}
      {submission?.status === 'approved' && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 flex items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-green-400 font-semibold">KYC Approved!</p>
            <p className="text-slate-400 text-sm">Your identity has been verified. You can now generate archive links.</p>
            {submission.admin_remarks && (
              <p className="text-green-300/70 text-sm mt-1">Remarks: {submission.admin_remarks}</p>
            )}
          </div>
        </div>
      )}

      {submission?.status === 'rejected' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 animate-fade-in">
          <p className="text-red-400 font-semibold">Submission Rejected</p>
          {submission.admin_remarks && (
            <p className="text-red-300/70 text-sm mt-1">Reason: {submission.admin_remarks}</p>
          )}
          <p className="text-slate-500 text-sm mt-2">Please re-upload your documents and resubmit.</p>
        </div>
      )}

      {(submission?.status === 'submitted' || submission?.status === 'under_review') && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 flex items-center gap-3 animate-fade-in">
          <svg className="animate-spin w-5 h-5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <div>
            <p className="text-blue-400 font-semibold">Under Review</p>
            <p className="text-slate-400 text-sm">Your submission is being reviewed by a government official. This typically takes 1–3 business days.</p>
          </div>
        </div>
      )}

      {/* Facial biometric warning */}
      {!user?.has_facial_embedding && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center gap-3">
          <span className="text-amber-400 text-xl">⚠️</span>
          <div>
            <p className="text-amber-400 font-medium text-sm">Facial biometric required</p>
            <p className="text-slate-500 text-xs">Go to Dashboard and complete your facial scan before submitting.</p>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="gov-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400 text-sm">Document Progress</span>
          <span className="text-white font-mono text-sm">{uploadedCount}/6</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500"
            style={{ width: `${(uploadedCount / 6) * 100}%` }}
          />
        </div>
        {allUploaded && <p className="text-green-400 text-xs mt-2">✓ All documents uploaded</p>}
      </div>

      {/* Document grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {DOC_TYPES.map(doc => (
          <DocCard
            key={doc.key}
            doc={doc}
            submission={submission}
            onUploaded={handleDocUploaded}
          />
        ))}
      </div>

      {/* Submit section */}
      {canSubmit && (
        <div className="gov-card-elevated p-6">
          <h3 className="text-white font-semibold mb-2">Ready to Submit?</h3>
          <p className="text-slate-500 text-sm mb-4">
            Once submitted, your documents will be reviewed by a government official.
            You will not be able to modify documents during review.
          </p>

          {submitError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg mb-4">
              {submitError}
            </div>
          )}

          {submitSuccess ? (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm p-3 rounded-lg">
              ✓ Submitted successfully! An official will review your application.
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting || !allUploaded}
              className="btn-primary px-8 py-3"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Submitting...
                </span>
              ) : 'Submit for Government Review'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
