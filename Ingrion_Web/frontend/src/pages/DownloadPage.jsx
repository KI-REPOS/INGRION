import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

export default function DownloadPage() {
  const [token, setToken] = useState('')
  const [validating, setValidating] = useState(false)
  const [tokenState, setTokenState] = useState(null) // { valid, reason, expires_at }
  const [error, setError] = useState('')

  const handleValidate = async () => {
    if (!token.trim()) return setError('Please enter your download token.')
    setValidating(true)
    setError('')
    setTokenState(null)

    try {
      const result = await api.validateToken(token.trim())
      setTokenState(result)
    } catch (err) {
      setError('Could not validate token. Please check and try again.')
    } finally {
      setValidating(false)
    }
  }

  const handleDownload = () => {
    window.location.href = api.getDownloadUrl(token.trim())
  }

  return (
    <div className="min-h-screen py-32 px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-up">
          <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase mb-4 block">
            Secure Download
          </span>
          <h1 className="font-display font-bold text-4xl text-white mb-4">
            Application Download
          </h1>
          <p className="text-slate-500">
            Enter your one-time download token from your KYC approval. 
            Tokens expire 15 minutes after issuance.
          </p>
        </div>

        <div className="glass-card-strong p-8 animate-fade-up space-y-6">
          {/* Requirements notice */}
          <div className="glass-card p-4 border border-primary/10">
            <h3 className="text-sm font-display font-semibold text-white mb-2">Requirements</h3>
            <ul className="text-xs text-slate-500 space-y-1">
              <li className="flex items-center gap-2">
                <svg className="w-3 h-3 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Completed KYC verification
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-3 h-3 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Government-approved identity status
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-3 h-3 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Valid one-time download token (15-min window)
              </li>
            </ul>
          </div>

          {/* Token input */}
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
              Download Token (UUID)
            </label>
            <input
              type="text"
              className="input-field font-mono text-xs"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={token}
              onChange={e => { setToken(e.target.value); setTokenState(null); setError('') }}
            />
          </div>

          {error && (
            <div className="glass-card border border-red-500/20 bg-red-500/5 p-3 text-red-400 text-xs rounded-xl">
              {error}
            </div>
          )}

          {tokenState && (
            <div className={`glass-card p-4 rounded-xl border animate-fade-in ${
              tokenState.valid
                ? 'border-green-500/20 bg-green-500/5'
                : 'border-red-500/20 bg-red-500/5'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {tokenState.valid ? (
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className={`text-sm font-semibold ${tokenState.valid ? 'text-green-400' : 'text-red-400'}`}>
                  {tokenState.valid ? 'Token Valid' : `Token Invalid — ${tokenState.reason}`}
                </span>
              </div>
              {tokenState.valid && tokenState.expires_at && (
                <p className="text-xs text-slate-500">
                  Expires: {new Date(tokenState.expires_at).toLocaleTimeString()}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleValidate}
              disabled={validating || !token.trim()}
              className="flex-1 glass-card py-3 rounded-xl text-slate-300 hover:text-white font-medium text-sm transition-all disabled:opacity-40"
            >
              {validating ? 'Validating...' : 'Validate Token'}
            </button>

            {tokenState?.valid && (
              <button
                onClick={handleDownload}
                className="flex-1 futuristic-gradient py-3 rounded-xl text-white font-display font-bold button-glow transition-all hover:opacity-90 animate-fade-in"
              >
                ↓ Download (32MB)
              </button>
            )}
          </div>

          <div className="section-divider" />

          <p className="text-xs text-slate-600 text-center leading-relaxed">
            Don't have a token yet?{' '}
            <Link to="/kyc" className="text-primary hover:text-cyan-400 transition-colors">
              Complete KYC verification
            </Link>{' '}
            to receive one upon approval.
          </p>
        </div>

        {/* Security info */}
        <div className="grid grid-cols-3 gap-4 mt-8">
          {[
            { icon: '🔒', label: 'One-Time Use' },
            { icon: '⏱', label: '15-Min Expiry' },
            { icon: '📡', label: 'Secure Stream' },
          ].map(({ icon, label }, i) => (
            <div key={i} className="glass-card p-4 text-center animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="text-xl mb-1">{icon}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
