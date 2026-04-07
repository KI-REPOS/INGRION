import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { api } from '../lib/api'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState('citizen') // 'citizen' | 'admin'
  const [aadhaar, setAadhaar] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let res
      if (mode === 'citizen') {
        if (!aadhaar.trim() || aadhaar.trim().length !== 12) {
          setError('Please enter a valid 12-digit Aadhaar number.')
          return
        }
        res = await api.citizenLogin({ aadhaar_number: aadhaar.trim(), password })
      } else {
        res = await api.adminLogin({ username: username.trim(), password })
      }
      login(res.token, res.user_type, res.user)
      navigate(res.user_type === 'admin' ? '/admin/reviews' : '/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-base flex flex-col">
      {/* Top accent */}
      <div className="h-[3px] bg-gradient-to-r from-blue-900 via-blue-500 to-blue-900" />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">

          {/* Emblem area */}
          <div className="text-center mb-8 animate-fade-up">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-800 to-blue-600 mb-4 shadow-lg shadow-blue-900/40">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-white font-bold text-2xl">National Identity Archive</h1>
            <p className="text-slate-500 text-sm mt-1">Government of India · Secure Citizen Portal</p>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-white/10 p-1 mb-6 bg-surface">
            {['citizen', 'admin'].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  mode === m
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'citizen' ? '🪪 Citizen Login' : '🛡️ Admin Login'}
              </button>
            ))}
          </div>

          {/* Form card */}
          <div className="gov-card-elevated p-8 animate-fade-up">
            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'citizen' ? (
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
                    Aadhaar Number
                  </label>
                  <input
                    type="text"
                    className="gov-input font-mono tracking-widest"
                    placeholder="xxxx xxxx xxxx"
                    maxLength={12}
                    value={aadhaar}
                    onChange={e => setAadhaar(e.target.value.replace(/\D/g, ''))}
                    autoComplete="off"
                    required
                  />
                  <p className="text-xs text-slate-600 mt-1">Enter your 12-digit Aadhaar number</p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
                    Admin Username
                  </label>
                  <input
                    type="text"
                    className="gov-input"
                    placeholder="admin username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
                  Password
                </label>
                <input
                  type="password"
                  className="gov-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm animate-fade-in">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 text-base"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Authenticating...
                  </span>
                ) : (
                  mode === 'citizen' ? 'Sign In with Aadhaar' : 'Admin Sign In'
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-slate-700 text-xs mt-6">
            This portal is restricted to authorized citizens and officials.
          </p>
        </div>
      </div>
    </div>
  )
}
