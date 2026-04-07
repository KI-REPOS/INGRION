const BASE = '/api'

function getCsrfToken() {
  const m = document.cookie.match(/csrftoken=([^;]+)/)
  return m ? m[1] : ''
}

function getToken() {
  return localStorage.getItem('gov_token') || ''
}

async function request(method, path, body = null, isFormData = false) {
  const headers = {
    'X-CSRFToken': getCsrfToken(),
    'Authorization': `Token ${getToken()}`,
  }
  if (!isFormData) headers['Content-Type'] = 'application/json'

  const opts = { method, headers, credentials: 'include' }
  if (body !== null) opts.body = isFormData ? body : JSON.stringify(body)

  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { const d = await res.json(); detail = d.detail || JSON.stringify(d) } catch {}
    throw new Error(detail)
  }
  // 204 No Content
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // Auth
  citizenLogin: (data) => request('POST', '/auth/citizen/login/', data),
  adminLogin: (data) => request('POST', '/auth/admin/login/', data),
  logout: () => request('POST', '/auth/logout/'),
  me: () => request('GET', '/auth/me/'),
  updateProfile: (formData) => request('PATCH', '/auth/profile/', formData, true),

  // KYC - Citizen
  getMyKYC: () => request('GET', '/kyc/my/'),
  uploadDocument: (formData) => request('POST', '/kyc/upload/', formData, true),
  submitKYC: () => request('POST', '/kyc/submit/'),

  // KYC - Admin
  adminListKYC: (statusFilter) => request('GET', `/kyc/admin/list/${statusFilter ? `?status=${statusFilter}` : ''}`),
  adminGetKYC: (id) => request('GET', `/kyc/admin/${id}/`),
  adminReviewKYC: (id, data) => request('POST', `/kyc/admin/${id}/review/`, data),

  // Archive links
  generateLink: (data) => request('POST', '/archive/links/generate/', data),
  listLinks: () => request('GET', '/archive/links/'),
  revokeLink: (id) => request('POST', `/archive/links/${id}/revoke/`),
  adminListRequests: () => request('GET', '/archive/admin/requests/'),
}
