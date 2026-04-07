/**
 * INGRION API Client
 * Centralised fetch wrapper with CSRF handling.
 */

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

async function getCsrfToken() {
  // Django sets the CSRF token as a cookie
  const match = document.cookie.match(/csrftoken=([^;]+)/)
  return match ? match[1] : ''
}

async function request(method, path, body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-CSRFToken': await getCsrfToken(),
  }

  const options = {
    method,
    headers,
    credentials: 'include',
  }

  if (body !== null) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(`${BASE_URL}${path}`, options)

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`
    try {
      const errorData = await response.json()
      errorDetail = errorData.detail || JSON.stringify(errorData)
    } catch {
      // ignore parse error
    }
    throw new Error(errorDetail)
  }

  return response.json()
}

export const api = {
  /**
   * Submit KYC verification
   */
  submitKYC: (payload) => request('POST', '/kyc/submit/', payload),

  /**
   * Poll KYC submission status
   */
  getKYCStatus: (submissionId) => request('GET', `/kyc/status/${submissionId}/`),

  /**
   * Fetch whitepaper data
   */
  getWhitepaper: () => request('GET', '/whitepaper/'),

  /**
   * Validate a download token without consuming it
   */
  validateToken: (token) => request('GET', `/downloads/validate/?token=${token}`),

  /**
   * Get the download URL (the actual download is a direct browser navigation)
   */
  getDownloadUrl: (token) => `${BASE_URL}/downloads/application/?token=${token}`,
}
