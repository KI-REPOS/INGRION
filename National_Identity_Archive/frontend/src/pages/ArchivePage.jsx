import React, { useState, useEffect } from 'react'
import { api } from '../lib/api'

function LinkCard({ link, onRevoke }) {
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(link.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRevoke = async () => {
    if (!confirm('Revoke this link? INGRION will no longer be able to use it.')) return
    setRevoking(true)
    try {
      await api.revokeLink(link.id)
      onRevoke(link.id)
    } catch (e) {
      alert('Failed to revoke: ' + e.message)
    } finally {
      setRevoking(false)
    }
  }

  const expiry = new Date(link.expires_at)
  const now = new Date()
  const msLeft = expiry - now
  const hoursLeft = Math.max(0, Math.floor(msLeft / 3600000))
  const minsLeft = Math.max(0, Math.floor((msLeft % 3600000) / 60000))

  return (
    <div className={`gov-card p-5 transition-all ${link.is_valid ? 'border-blue-500/15' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
            link.is_revoked ? 'bg-red-500' :
            link.is_expired ? 'bg-slate-600' :
            'bg-green-500 animate-pulse'
          }`} />
          <div>
            <div className="text-white font-medium text-sm">
              {link.is_revoked ? 'Revoked' : link.is_expired ? 'Expired' : 'Active'}
            </div>
            <div className="text-slate-500 text-xs">
              Created {new Date(link.created_at).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="text-right text-xs">
          {link.is_valid ? (
            <span className="text-amber-400">{hoursLeft}h {minsLeft}m remaining</span>
          ) : (
            <span className="text-slate-600">Expires {expiry.toLocaleString()}</span>
          )}
        </div>
      </div>

      {/* URL */}
      <div className="bg-black/30 rounded-lg p-3 mb-4 flex items-center gap-2">
        <code className="text-blue-300 text-xs flex-1 truncate break-all">{link.url}</code>
        <button
          onClick={copy}
          className="flex-shrink-0 text-slate-400 hover:text-white transition-colors"
          title="Copy URL"
        >
          {copied ? (
            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-xs text-slate-500">
          <span>Accessed: {link.access_count}×</span>
          {link.accessed_at && <span>Last: {new Date(link.accessed_at).toLocaleString()}</span>}
        </div>
        {link.is_valid && (
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="btn-danger px-3 py-1 text-xs"
          >
            {revoking ? 'Revoking...' : 'Revoke'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function ArchivePage() {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [expiryHours, setExpiryHours] = useState(24)
  const [kyc, setKyc] = useState(null)

  useEffect(() => {
    Promise.all([api.listLinks(), api.getMyKYC()])
      .then(([linksRes, kycRes]) => {
        setLinks(linksRes.links)
        setKyc(kycRes)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleGenerate = async () => {
    setGenError('')
    setGenerating(true)
    try {
      const res = await api.generateLink({ expiry_hours: expiryHours })
      setLinks(prev => [res.link, ...prev])
    } catch (e) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleRevoke = (id) => {
    setLinks(prev => prev.map(l => l.id === id ? { ...l, is_revoked: true, is_valid: false } : l))
  }

  const isApproved = kyc?.status === 'approved'
  const activeLinks = links.filter(l => l.is_valid)

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

      {/* Header */}
      <div className="animate-fade-up">
        <span className="text-xs font-mono text-blue-400 uppercase tracking-widest">Archive Links</span>
        <h1 className="text-white font-bold text-3xl mt-1">Government Archive Links</h1>
        <p className="text-slate-500 mt-2">
          Generate expirable archive links to share with INGRION for identity verification.
          INGRION will call this link to verify your identity and send the callback.
        </p>
      </div>

      {/* How it works */}
      <div className="gov-card p-5">
        <h3 className="text-white font-semibold text-sm mb-4">How Archive Links Work</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-400">
          {[
            { step: '1', title: 'Generate Link', desc: 'Create an expirable URL pointing to your gov archive record' },
            { step: '2', title: 'Paste in INGRION', desc: 'Use this URL as the "Government Archive Link" in INGRION KYC' },
            { step: '3', title: 'Auto-Verification', desc: 'INGRION calls the link, we verify your biometric and send the result' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold flex-shrink-0 text-xs">
                {step}
              </div>
              <div>
                <p className="text-white font-medium">{title}</p>
                <p className="mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Generate section */}
      {isApproved ? (
        <div className="gov-card-elevated p-6">
          <h3 className="text-white font-semibold mb-4">Generate New Archive Link</h3>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
                Link Validity
              </label>
              <select
                className="gov-input"
                value={expiryHours}
                onChange={e => setExpiryHours(Number(e.target.value))}
              >
                <option value={1}>1 hour</option>
                <option value={6}>6 hours</option>
                <option value={24}>24 hours (recommended)</option>
                <option value={48}>48 hours</option>
                <option value={72}>72 hours</option>
                <option value={168}>7 days</option>
              </select>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn-primary px-6 py-2.5 flex-shrink-0"
            >
              {generating ? 'Generating...' : '+ Generate Link'}
            </button>
          </div>
          {genError && (
            <div className="mt-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg">
              {genError}
            </div>
          )}
          {activeLinks.length > 0 && (
            <p className="text-xs text-slate-500 mt-3">
              You have {activeLinks.length} active link{activeLinks.length > 1 ? 's' : ''}.
            </p>
          )}
        </div>
      ) : (
        <div className="gov-card p-6 border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-start gap-4">
            <span className="text-3xl">🔒</span>
            <div>
              <h3 className="text-amber-400 font-semibold">KYC Approval Required</h3>
              <p className="text-slate-400 text-sm mt-1">
                You must complete KYC verification and receive approval before generating archive links.
              </p>
              <p className="text-slate-500 text-xs mt-2">
                Current status: <span className="text-white font-medium">{kyc?.status || 'No submission'}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Links list */}
      {loading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : links.length === 0 ? (
        <div className="gov-card p-10 text-center">
          <div className="text-4xl mb-3">🔗</div>
          <p className="text-slate-500">No archive links yet.</p>
          {isApproved && <p className="text-slate-600 text-sm mt-1">Generate your first link above.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Your Links</h3>
            <span className="text-slate-500 text-sm">{links.length} total · {activeLinks.length} active</span>
          </div>
          {links.map(link => (
            <LinkCard key={link.id} link={link} onRevoke={handleRevoke} />
          ))}
        </div>
      )}
    </div>
  )
}
