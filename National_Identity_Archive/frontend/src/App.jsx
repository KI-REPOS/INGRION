import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import KYCPage from './pages/KYCPage'
import ArchivePage from './pages/ArchivePage'
import AdminReviewsPage from './pages/AdminReviewsPage'
import AdminRequestsPage from './pages/AdminRequestsPage'

function ProtectedRoute({ children, requireAdmin = false }) {
  const { token, userType } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (requireAdmin && userType !== 'admin') return <Navigate to="/dashboard" replace />
  if (!requireAdmin && userType === 'admin') return <Navigate to="/admin/reviews" replace />
  return children
}

function AppRoutes() {
  const { token, userType } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={
        token
          ? <Navigate to={userType === 'admin' ? '/admin/reviews' : '/dashboard'} replace />
          : <LoginPage />
      } />

      {/* Citizen routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="kyc" element={<KYCPage />} />
        <Route path="archive" element={<ArchivePage />} />
      </Route>

      {/* Admin routes */}
      <Route path="/admin" element={
        <ProtectedRoute requireAdmin>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/admin/reviews" replace />} />
        <Route path="reviews" element={<AdminReviewsPage />} />
        <Route path="requests" element={<AdminRequestsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
