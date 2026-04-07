import React, { useState } from 'react'
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { api } from '../../lib/api'

export default function Layout() {
  const { user, userType, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    try { await api.logout() } catch {}
    logout()
    navigate('/login')
  }

  const citizenLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/kyc', label: 'KYC Verification' },
    { to: '/archive', label: 'Archive Links' },
  ]

  const adminLinks = [
    { to: '/admin/reviews', label: 'Pending Reviews' },
    { to: '/admin/requests', label: 'INGRION Requests' },
  ]

  const links = userType === 'admin' ? adminLinks : citizenLinks

  return (
    <div className="min-h-screen bg-base flex flex-col">
      {/* Top bar */}
      <header className="border-b border-white/5 bg-base-light/80 backdrop-blur-md sticky top-0 z-40">
        {/* Gov accent line */}
        <div className="h-[2px] bg-gradient-to-r from-blue-800 via-blue-500 to-blue-800" />

        <nav className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-700 to-blue-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">GOV</span>
            </div>
            <div className="hidden sm:block">
              <div className="text-white font-bold text-sm leading-tight">National Identity Archive</div>
              <div className="text-blue-400 text-xs">Government of India · NIA Portal</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>

          {/* User + logout */}
          <div className="flex items-center gap-3">
            {userType === 'admin' && (
              <span className="hidden sm:block text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded">
                Admin
              </span>
            )}
            <div className="hidden sm:block text-right">
              <div className="text-white text-sm font-medium">{user?.name}</div>
              <div className="text-slate-500 text-xs">
                {userType === 'citizen' ? `Aadhaar: ${user?.aadhaar_number}` : user?.department}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-500 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-400/5"
              title="Sign out"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden text-slate-400 p-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/5 px-4 py-3 space-y-1">
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `block px-4 py-2 rounded-lg text-sm font-medium ${
                    isActive ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-4 text-center">
        <p className="text-slate-700 text-xs">
          © {new Date().getFullYear()} National Identity Authority of India · Government of India · Secure Identity Archive
        </p>
      </footer>
    </div>
  )
}
