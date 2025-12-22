import  { createContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '../types'

type AuthContextType = {
  token: string | null
  user: User | null
  login: (token: string) => void
  logout: () => void
  setUser: (u: User | null) => void
}

export const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  login: () => {},
  logout: () => {},
  setUser: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try { return localStorage.getItem('token') } catch { return null }
  })
  const [user, setUserState] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem('user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    try {
      if (token) localStorage.setItem('token', token)
      else localStorage.removeItem('token')
    } catch {}
  }, [token])

  useEffect(() => {
    try {
      if (user) localStorage.setItem('user', JSON.stringify(user))
      else localStorage.removeItem('user')
    } catch {}
  }, [user])

  const login = (t: string) => setToken(t)
  const logout = () => {
    setToken(null)
    setUserState(null)
    try {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    } catch {}
  }
  const setUser = (u: User | null) => setUserState(u)

  return (
    <AuthContext.Provider value={{ token, user, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}
