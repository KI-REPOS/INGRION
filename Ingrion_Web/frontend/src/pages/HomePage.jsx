import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

const FEATURES = [
  {
    icon: '🔑',
    title: 'Client-Side Ed25519',
    description:
      'Keypairs generated in your browser using TweetNaCl. Your private key never leaves your device — cryptographically impossible to steal from our servers.',
  },
  {
    icon: '🏛️',
    title: 'Government Archive Verification',
    description:
      'Identity anchored to sovereign government records via HMAC-signed asynchronous callbacks. Not self-reported — state-verified.',
  },
  {
    icon: '🔒',
    title: 'Zero Trust Architecture',
    description:
      'No plaintext passwords. No raw biometrics. No private keys. Only the minimum cryptographic material required to verify your identity reaches our infrastructure.',
  },
  {
    icon: '⚡',
    title: 'One-Time Secure Download',
    description:
      'Approved identities receive expiring one-time tokens for secure binary streaming. Tokens auto-expire and cannot be reused.',
  },
  {
    icon: '🛡️',
    title: 'HMAC Callback Validation',
    description:
      'Every government callback is validated with HMAC-SHA256 using constant-time comparison. No timing oracle. No forgery.',
  },
  {
    icon: '📜',
    title: 'Full Audit Trail',
    description:
      'Every verification attempt, callback, and download is logged with source IP and timestamp for regulatory compliance.',
  },
]

const STATS = [
  { value: '32-byte', label: 'Ed25519 Public Keys' },
  { value: 'HMAC-SHA256', label: 'Callback Validation' },
  { value: '15-min', label: 'Token Expiry Window' },
  { value: 'Zero', label: 'Private Keys Stored' },
]

export default function HomePage() {
  const heroRef = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-up')
          }
        })
      },
      { threshold: 0.1 }
    )

    document.querySelectorAll('[data-animate]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div>
      {/* ── Hero Section ── */}
      <section className="relative min-h-screen flex items-center overflow-hidden noise-overlay">
        {/* Animated gradient background */}
        <div className="absolute inset-0 futuristic-gradient opacity-10" />
        {/* Grid overlay */}
        <div className="absolute inset-0 grid-pattern" />
        {/* Radial glow center */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-32">
          <div className="max-w-4xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 glass-card px-4 py-2 mb-8 animate-fade-up">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase">
                Institutional Blockchain Infrastructure
              </span>
            </div>

            {/* Heading */}
            <h1 className="font-display font-extrabold text-5xl md:text-7xl lg:text-8xl leading-[1.0] text-white mb-6 animate-fade-up stagger-1">
              Identity That
              <br />
              <span className="gradient-text">Cannot Be Forged.</span>
            </h1>

            {/* Sub */}
            <p className="text-slate-400 text-lg md:text-xl max-w-2xl leading-relaxed mb-12 animate-fade-up stagger-2">
              INGRION anchors blockchain identity to sovereign government records. 
              Ed25519 keypairs generated client-side. Zero private key storage. 
              Built for institutions that demand cryptographic certainty.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-up stagger-3">
              <Link
                to="/kyc"
                className="futuristic-gradient inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-white font-display font-semibold text-base button-glow transition-all duration-300 hover:scale-105"
              >
                <span>Begin Verification</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link
                to="/whitepaper"
                className="glass-card inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-white font-display font-semibold text-base hover:bg-white/10 transition-all duration-300"
              >
                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Read Whitepaper</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
          <div className="w-[1px] h-12 bg-gradient-to-b from-transparent via-slate-600 to-transparent" />
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-16 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((stat, i) => (
              <div
                key={i}
                className="text-center"
                data-animate
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="font-display font-bold text-2xl md:text-3xl gradient-text mb-1">
                  {stat.value}
                </div>
                <div className="text-slate-500 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          {/* Section header */}
          <div className="text-center mb-20" data-animate>
            <span className="text-xs font-mono text-primary tracking-widest uppercase mb-4 block">
              Architecture
            </span>
            <h2 className="font-display font-bold text-4xl md:text-5xl text-white mb-4">
              Security Without Compromise
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Every design decision in INGRION prioritises minimising the attack surface 
              while maximising cryptographic assurance.
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => (
              <div
                key={i}
                className="glass-card p-8 hover:bg-white/[0.06] transition-all duration-300 group cursor-default"
                data-animate
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="font-display font-semibold text-white text-lg mb-3 group-hover:text-cyan-300 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Verification flow ── */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 futuristic-gradient opacity-5" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-20" data-animate>
            <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase mb-4 block">
              Pipeline
            </span>
            <h2 className="font-display font-bold text-4xl md:text-5xl text-white mb-4">
              Five-Stage Verification
            </h2>
          </div>

          <div className="relative">
            {/* Connector line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-gradient-to-b from-primary via-cyan-500 to-transparent hidden md:block" />

            <div className="space-y-12">
              {[
                {
                  num: '01',
                  title: 'Client Preparation',
                  desc: 'Ed25519 keypair generated in browser. Password hashed locally. Facial embedding extracted client-side.',
                  side: 'left',
                },
                {
                  num: '02',
                  title: 'Submission',
                  desc: 'Public key, archive link, embedding hash, and password hash submitted. Private key never transmitted.',
                  side: 'right',
                },
                {
                  num: '03',
                  title: 'Government Forwarding',
                  desc: 'Django securely forwards the submission to the sovereign Government Archive API with a signed callback URL.',
                  side: 'left',
                },
                {
                  num: '04',
                  title: 'Archive Verification',
                  desc: 'Government independently verifies document authenticity, facial biometric match, and archive record integrity.',
                  side: 'right',
                },
                {
                  num: '05',
                  title: 'Token & Download',
                  desc: 'HMAC-validated callback triggers one-time download token generation. Approved users receive the secure binary.',
                  side: 'left',
                },
              ].map((step, i) => (
                <div
                  key={i}
                  className={`flex ${step.side === 'right' ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-8`}
                  data-animate
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className={`flex-1 ${step.side === 'right' ? 'md:text-right' : ''}`}>
                    <div className="glass-card p-8 inline-block w-full">
                      <div className="font-mono text-primary text-sm mb-2">{step.num}</div>
                      <h3 className="font-display font-bold text-white text-xl mb-3">{step.title}</h3>
                      <p className="text-slate-500 text-sm leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                  {/* Dot on line */}
                  <div className="hidden md:flex w-8 h-8 rounded-full futuristic-gradient items-center justify-center flex-shrink-0 glow-primary">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  <div className="flex-1 hidden md:block" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="relative glass-card-strong p-16 overflow-hidden" data-animate>
            <div className="absolute inset-0 futuristic-gradient opacity-10" />
            <div className="relative z-10">
              <h2 className="font-display font-extrabold text-4xl md:text-5xl text-white mb-6">
                Ready to Verify Your Identity?
              </h2>
              <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">
                Generate your cryptographic identity in seconds. 
                Government verification typically completes within 24–48 hours.
              </p>
              <Link
                to="/kyc"
                className="futuristic-gradient inline-flex items-center gap-3 px-10 py-5 rounded-xl text-white font-display font-bold text-lg button-glow transition-all duration-300 hover:scale-105"
              >
                Start KYC Verification
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
