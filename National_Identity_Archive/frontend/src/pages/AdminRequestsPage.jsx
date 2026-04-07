import React, { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.adminListRequests()
      .then(res => setRequests(res.requests))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const stats = {
    total: requests.length,
    verified: requests.filter(r => r.status === 'verified').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    matched: requests.filter(r => r.matched).length,
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-white font-bold text-3xl">INGRION Verification Requests</h1>
        <p className="text-slate-500 mt-1">
          All identity verification requests received from the INGRION blockchain platform
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Requests', value: stats.total, color: 'text-white' },
          { label: 'Verified', value: stats.verified, color: 'text-green-400' },
          { label: 'Rejected', value: stats.rejected, color: 'text-red-400' },
          { label: 'Biometric Match', value: stats.matched, color: 'text-blue-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="gov-card p-4 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-slate-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-slate-500">Loading...</div>
      ) : requests.length === 0 ? (
        <div className="gov-card p-12 text-center">
          <div className="text-4xl mb-3">📡</div>
          <p className="text-slate-500">No INGRION verification requests yet.</p>
          <p className="text-slate-600 text-sm mt-1">
            Requests will appear here when INGRION calls a citizen's archive link.
          </p>
        </div>
      ) : (
        <div className="gov-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Citizen', 'INGRION Submission ID', 'Biometric Score', 'Match', 'Status', 'Callback Sent', 'Date'].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs text-slate-500 uppercase tracking-wider font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {requests.map(r => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4">
                      <div className="text-white font-medium">{r.citizen || '—'}</div>
                      <div className="text-slate-500 text-xs font-mono">{r.aadhaar}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-blue-300">
                      {r.ingrion_submission_id?.substring(0, 16)}…
                    </td>
                    <td className="py-3 px-4">
                      {r.facial_similarity !== null ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${r.facial_similarity >= 0.75 ? 'bg-green-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(100, r.facial_similarity * 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs ${r.facial_similarity >= 0.75 ? 'text-green-400' : 'text-red-400'}`}>
                              {(r.facial_similarity * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-semibold ${r.matched ? 'text-green-400' : 'text-red-400'}`}>
                        {r.matched ? '✓ Matched' : '✗ No match'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${
                        r.status === 'verified' ? 'badge-approved' :
                        r.status === 'rejected' ? 'badge-rejected' :
                        'badge-submitted'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {r.callback_sent_at ? new Date(r.callback_sent_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="gov-card p-4 text-xs text-slate-500">
        <p className="font-medium text-slate-400 mb-2">Verification Logic:</p>
        <p>A request is <span className="text-green-400">verified</span> when: (1) biometric cosine similarity ≥ 75% AND (2) citizen's KYC is government-approved. Otherwise it is <span className="text-red-400">rejected</span> and the INGRION callback payload carries the rejection.</p>
      </div>
    </div>
  )
}
