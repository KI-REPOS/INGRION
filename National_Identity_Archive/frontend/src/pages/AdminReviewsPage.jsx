import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

function StatusBadge({ status }) {
  const labels = { draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected' }
  return <span className={`badge badge-${status}`}>{labels[status] || status}</span>
}

export default function AdminReviewsPage() {
  const [submissions, setSubmissions] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('submitted')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [decision, setDecision] = useState('')
  const [remarks, setRemarks] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [reviewMsg, setReviewMsg] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.adminListKYC(filter)
      setSubmissions(res.submissions)
      setCounts(res.counts)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  const loadDetail = async (id) => {
    setSelected(id)
    setDetail(null)
    setReviewMsg('')
    setDecision('')
    setRemarks('')
    setLoadingDetail(true)
    try {
      const res = await api.adminGetKYC(id)
      setDetail(res)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleReview = async () => {
    if (!decision) { setReviewMsg('Please select a decision.'); return }
    setReviewing(true)
    setReviewMsg('')
    try {
      const res = await api.adminReviewKYC(selected, { decision, remarks })
      setReviewMsg(`✓ Submission ${decision}.`)
      setDetail(prev => ({ ...prev, ...res.submission }))
      load() // refresh list
    } catch (e) {
      setReviewMsg('Error: ' + e.message)
    } finally {
      setReviewing(false)
    }
  }

  const DOC_LABELS = {
    aadhaar: 'Aadhaar Card', pan: 'PAN Card', passport: 'Passport',
    voter_id: 'Voter ID', driving_license: 'Driving License', birth_certificate: 'Birth Certificate',
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-white font-bold text-3xl">KYC Review Panel</h1>
          <p className="text-slate-500 mt-1">Review and approve or reject citizen identity submissions</p>
        </div>
        <div className="hidden sm:flex gap-3 text-xs">
          {[
            { key: 'submitted', label: 'Submitted', color: 'text-blue-400' },
            { key: 'under_review', label: 'Under Review', color: 'text-amber-400' },
            { key: 'approved', label: 'Approved', color: 'text-green-400' },
            { key: 'rejected', label: 'Rejected', color: 'text-red-400' },
          ].map(({ key, label, color }) => (
            <div key={key} className="gov-card px-3 py-2 text-center">
              <div className={`text-lg font-bold ${color}`}>{counts[key] || 0}</div>
              <div className="text-slate-500 text-xs">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* List panel */}
        <div className="w-full lg:w-96 flex-shrink-0">
          {/* Filter tabs */}
          <div className="flex gap-1 mb-4 bg-surface rounded-lg p-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setSelected(null); setDetail(null) }}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  filter === f.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-slate-500 text-sm">Loading...</div>
          ) : submissions.length === 0 ? (
            <div className="gov-card p-8 text-center">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-slate-500 text-sm">No submissions found.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
              {submissions.map(sub => (
                <button
                  key={sub.id}
                  onClick={() => loadDetail(sub.id)}
                  className={`w-full text-left gov-card p-4 transition-all hover:border-blue-500/30 ${
                    selected === sub.id ? 'border-blue-500/40 bg-blue-500/5' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-white font-medium text-sm">{sub.citizen?.name}</div>
                      <div className="text-slate-500 text-xs font-mono mt-0.5">{sub.citizen?.aadhaar_number}</div>
                    </div>
                    <StatusBadge status={sub.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-600">
                    <span>{Object.keys(sub.documents).length}/6 docs</span>
                    {sub.submitted_at && (
                      <span>{new Date(sub.submitted_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="gov-card p-16 text-center h-full flex flex-col items-center justify-center">
              <div className="text-5xl mb-4">👈</div>
              <p className="text-slate-500">Select a submission to review</p>
            </div>
          ) : loadingDetail ? (
            <div className="gov-card p-8 text-center">
              <div className="text-slate-500">Loading...</div>
            </div>
          ) : detail ? (
            <div className="space-y-5">
              {/* Citizen profile */}
              <div className="gov-card-elevated p-6">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-surface-2 border border-white/10 flex-shrink-0">
                    {detail.citizen_profile?.profile_photo ? (
                      <img src={detail.citizen_profile.profile_photo} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-white font-bold text-xl">{detail.citizen_profile?.name}</h2>
                      <StatusBadge status={detail.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-sm text-slate-400">
                      <span>Aadhaar: <span className="font-mono text-white">{detail.citizen_profile?.aadhaar_number}</span></span>
                      {detail.citizen_profile?.date_of_birth && <span>DOB: {detail.citizen_profile.date_of_birth}</span>}
                      {detail.citizen_profile?.phone && <span>📞 {detail.citizen_profile.phone}</span>}
                      {detail.citizen_profile?.email && <span>✉️ {detail.citizen_profile.email}</span>}
                    </div>
                    {detail.citizen_profile?.address && (
                      <p className="text-slate-500 text-xs mt-1">📍 {detail.citizen_profile.address}</p>
                    )}
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className={`${detail.citizen_profile?.has_facial_embedding ? 'text-green-400' : 'text-red-400'}`}>
                        {detail.citizen_profile?.has_facial_embedding ? '✓ Biometric registered' : '✗ No biometric'}
                      </span>
                      {detail.citizen_profile?.public_key_b64 && (
                        <span className="text-slate-500 font-mono truncate max-w-48">
                          Key: {detail.citizen_profile.public_key_b64.substring(0, 16)}…
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Documents */}
              <div className="gov-card p-5">
                <h3 className="text-white font-semibold mb-4">
                  Submitted Documents ({Object.keys(detail.documents).length}/6)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {detail.required_docs?.map(docType => {
                    const doc = detail.documents[docType]
                    return (
                      <div
                        key={docType}
                        className={`rounded-lg p-3 border ${doc ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}
                      >
                        <div className={`text-xs font-medium ${doc ? 'text-green-400' : 'text-red-400'}`}>
                          {doc ? '✓' : '✗'} {DOC_LABELS[docType] || docType}
                        </div>
                        {doc && (
                          <>
                            <div className="text-slate-500 text-xs mt-1 truncate">{doc.filename}</div>
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400 text-xs hover:underline mt-1 block"
                            >
                              View PDF →
                            </a>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Review form */}
              {['submitted', 'under_review'].includes(detail.status) && (
                <div className="gov-card-elevated p-5">
                  <h3 className="text-white font-semibold mb-4">Review Decision</h3>
                  <div className="flex gap-3 mb-4">
                    <button
                      onClick={() => setDecision('approved')}
                      className={`flex-1 py-3 rounded-lg border text-sm font-semibold transition-all ${
                        decision === 'approved'
                          ? 'bg-green-500/20 border-green-500/60 text-green-400'
                          : 'border-white/10 text-slate-400 hover:border-green-500/30 hover:text-green-400'
                      }`}
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => setDecision('rejected')}
                      className={`flex-1 py-3 rounded-lg border text-sm font-semibold transition-all ${
                        decision === 'rejected'
                          ? 'bg-red-500/20 border-red-500/60 text-red-400'
                          : 'border-white/10 text-slate-400 hover:border-red-500/30 hover:text-red-400'
                      }`}
                    >
                      ✗ Reject
                    </button>
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
                      Remarks {decision === 'rejected' ? '(required)' : '(optional)'}
                    </label>
                    <textarea
                      className="gov-input resize-none"
                      rows={3}
                      placeholder={decision === 'rejected' ? 'State the reason for rejection...' : 'Optional approval notes...'}
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                    />
                  </div>
                  {reviewMsg && (
                    <div className={`mb-4 text-sm p-3 rounded-lg ${
                      reviewMsg.startsWith('✓')
                        ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                        : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}>
                      {reviewMsg}
                    </div>
                  )}
                  <button
                    onClick={handleReview}
                    disabled={reviewing || !decision}
                    className={`w-full py-3 text-sm font-semibold rounded-lg transition-all disabled:opacity-50 ${
                      decision === 'approved'
                        ? 'btn-success'
                        : decision === 'rejected'
                        ? 'btn-danger'
                        : 'btn-secondary'
                    }`}
                  >
                    {reviewing ? 'Submitting...' : `Confirm ${decision || 'Decision'}`}
                  </button>
                </div>
              )}

              {/* Already reviewed */}
              {['approved', 'rejected'].includes(detail.status) && (
                <div className={`gov-card p-4 border ${
                  detail.status === 'approved' ? 'border-green-500/20' : 'border-red-500/20'
                }`}>
                  <p className={`font-semibold text-sm ${detail.status === 'approved' ? 'text-green-400' : 'text-red-400'}`}>
                    {detail.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                    {detail.reviewed_by && ` by ${detail.reviewed_by.name}`}
                  </p>
                  {detail.admin_remarks && (
                    <p className="text-slate-400 text-sm mt-1">Remarks: {detail.admin_remarks}</p>
                  )}
                  {detail.reviewed_at && (
                    <p className="text-slate-600 text-xs mt-1">{new Date(detail.reviewed_at).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
