import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import HomePage from './pages/HomePage'
import KYCPage from './pages/KYCPage'
import WhitepaperPage from './pages/WhitepaperPage'
import DownloadPage from './pages/DownloadPage'
import APIDocsPage from './pages/APIDocsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="kyc" element={<KYCPage />} />
        <Route path="whitepaper" element={<WhitepaperPage />} />
        <Route path="download" element={<DownloadPage />} />
        <Route path="api-docs" element={<APIDocsPage />} />
      </Route>
    </Routes>
  )
}
