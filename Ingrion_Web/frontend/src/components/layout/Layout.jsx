import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, Link } from 'react-router-dom'

const NAV_LINKS = [
  { to: '/', label: 'Platform', exact: true },
  { to: '/kyc', label: 'Verification' },
  { to: '/whitepaper', label: 'Whitepaper' },
  { to: '/download', label: 'Download' },
  { to: '/api-docs', label: 'API Docs' },
]

export default function Layout() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <div className="min-h-screen bg-base flex flex-col">
      {/* ── Navigation ── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'glass-card border-b border-white/5 shadow-xl shadow-black/40'
            : 'bg-transparent'
        }`}
      >
        {/* Gradient line */}
        <div className="futuristic-gradient h-[1px] w-full" />

        <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative w-9 h-9">
              <div className="futuristic-gradient w-full h-full rounded-lg opacity-90 group-hover:opacity-100 transition-opacity" />
              <span className="absolute inset-0 flex items-center justify-center text-white font-display font-bold text-sm">
                IN
              </span>
            </div>
            <span className="font-display font-bold text-lg tracking-tight text-white">
              INGR<span className="gradient-text">ION</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ to, label, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'text-white bg-primary/20 border border-primary/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/kyc"
              className="futuristic-gradient px-5 py-2 rounded-lg text-sm font-semibold text-white button-glow transition-all duration-300 hover:opacity-90 font-display"
            >
              Start Verification
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-slate-400 hover:text-white p-2"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </nav>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden glass-card mx-4 mb-4 p-4 animate-fade-in">
            {NAV_LINKS.map(({ to, label, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `block px-4 py-3 rounded-lg text-sm font-medium mb-1 transition-colors ${
                    isActive
                      ? 'text-white bg-primary/20'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
            <Link
              to="/kyc"
              onClick={() => setMobileOpen(false)}
              className="block mt-2 futuristic-gradient px-4 py-3 rounded-lg text-sm font-semibold text-white text-center"
            >
              Start Verification
            </Link>
          </div>
        )}
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 pt-16">
        <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 mt-24">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="futuristic-gradient w-8 h-8 rounded-lg flex items-center justify-center">
                  <span className="text-white font-display font-bold text-xs">IN</span>
                </div>
                <span className="font-display font-bold text-white">INGRION</span>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed max-w-sm">
                Institutional-grade blockchain platform with government-verified identity. 
                Zero private key storage. Zero compromise.
              </p>
            </div>
            <div>
              <h4 className="text-white text-sm font-semibold mb-4 font-display">Platform</h4>
              <div className="space-y-2">
                {NAV_LINKS.map(({ to, label }) => (
                  <Link key={to} to={to} className="block text-slate-500 hover:text-slate-300 text-sm transition-colors">
                    {label}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-white text-sm font-semibold mb-4 font-display">Security</h4>
              <div className="space-y-2 text-slate-500 text-sm">
                <p>Ed25519 Keypairs</p>
                <p>HMAC-SHA256</p>
                <p>Zero Private Key Storage</p>
                <p>Government KYC</p>
              </div>
            </div>
          </div>
          <div className="section-divider mb-6" />
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-600 text-xs">
              © {new Date().getFullYear()} INGRION. All rights reserved.
            </p>
            <p className="text-slate-600 text-xs font-mono">
              v1.0.0 · Powered by Ed25519 + Django 5 · SQLite3
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
