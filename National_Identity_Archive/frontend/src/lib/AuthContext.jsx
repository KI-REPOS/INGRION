import React, { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('gov_token'))
  const [userType, setUserType] = useState(() => localStorage.getItem('gov_user_type'))
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem('gov_user')
    return u ? JSON.parse(u) : null
  })

  const login = (tokenVal, type, userData) => {
    localStorage.setItem('gov_token', tokenVal)
    localStorage.setItem('gov_user_type', type)
    localStorage.setItem('gov_user', JSON.stringify(userData))
    setToken(tokenVal)
    setUserType(type)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('gov_token')
    localStorage.removeItem('gov_user_type')
    localStorage.removeItem('gov_user')
    setToken(null)
    setUserType(null)
    setUser(null)
  }

  const updateUser = (userData) => {
    localStorage.setItem('gov_user', JSON.stringify(userData))
    setUser(userData)
  }

  return (
    <AuthContext.Provider value={{ token, userType, user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
