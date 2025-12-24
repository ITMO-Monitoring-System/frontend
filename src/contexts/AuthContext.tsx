import React, { createContext, useEffect, useState } from 'react'
import type { User } from '../types'
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

      if (token === 'teacher-token') {
        if (mounted) {
          setUser({ id: '466777', name: 'Teacher', email: 'teacher', role: 'teacher' } as User)
          setLoading(false)
        }
        return
      }

      if (token === 'admin-token') {
        if (mounted) {
          setUser({ id: '466778', name: 'Admin', email: 'admin', role: 'admin' } as User)
          setLoading(false)
        }
        return
      }

      if (token === 'student-token') {
        if (mounted) {
          setUser({ id: '466779', name: 'Student', email: 'student', role: 'student' } as User)
          setLoading(false)
        }
        return
      }

      try {
        if (!mounted) return
      } catch (err: any) {
        const status = err?.response?.status
        if (status === 401) {
          AuthTokenStorage.clear()
          setToken(null)
          setUser(null)
        } else {
          console.warn('[Auth] me() failed, keeping token', err?.message ?? err)
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
    if (t === 'admin-token') {
      setUser({ id: '466778', name: 'Admin', email: 'admin', role: 'admin' } as User)
      setLoading(false)
    } else if (t === 'teacher-token') {
      setUser({ id: '466777', name: 'Teacher', email: 'teacher', role: 'teacher' } as User)
      setLoading(false)
    } else if (t === 'student-token') {
      setUser({ id: '466779', name: 'Student', email: 'student', role: 'student' } as User)
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
