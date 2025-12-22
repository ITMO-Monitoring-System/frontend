// src/contexts/AuthContext.tsx
import React, { createContext, useEffect, useState } from 'react'
import type { User } from '../types'
import { me } from '../services/api'
import { AuthTokenStorage } from '../services/authToken'



export const AuthContext = createContext<any>(null)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(AuthTokenStorage.get())
  const [loading, setLoading] = useState<boolean>(!!token)

  useEffect(() => {
    let mounted = true

    async function loadMe() {
      if (!token) {
        setLoading(false)
        return
      }

      // Special local token for test admin (offline)
      if (token === 'teacher-token') {
        if (mounted) {
          setUser({ id: 'teacher', name: 'Teacher', email: 'teacher', role: 'teacher' } as User)
          setLoading(false)
        }
        return
      }

      if (token === 'admin-token') {
        if (mounted) {
          setUser({ id: 'admin', name: 'Admin', email: 'admin', role: 'admin' } as User)
          setLoading(false)
        }
        return
      }

      try {
        const r = await me()
        if (!mounted) return
        setUser(r.data)
      } catch (err: any) {
        // IMPORTANT: don't clear token on network errors (connection refused).
        // Only clear token when we receive explicit 401 Unauthorized.
        const status = err?.response?.status
        if (status === 401) {
          AuthTokenStorage.clear()
          setToken(null)
          setUser(null)
        } else {
          // network error - keep token but don't consider user loaded
          console.warn('[Auth] me() failed, network error or backend down, keeping token', err?.message ?? err)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadMe()
    return () => { mounted = false }
  }, [token])

  const login = (t: string) => {
    AuthTokenStorage.set(t)
    setToken(t)
    // if admin-token, set local user immediately; otherwise me() effect will run
    if (t === 'admin-token') {
      setUser({ id: 'admin', name: 'Admin', email: 'admin', role: 'teacher' } as User)
      setLoading(false)
    } else {
      setLoading(true)
    }
  }

  const logout = () => {
    AuthTokenStorage.clear()
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, setUser, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
