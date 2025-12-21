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
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [user, setUserState] = useState<User | null>(() => {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  })

  useEffect(() => {
    if (token) localStorage.setItem('token', token)
    else localStorage.removeItem('token')
  }, [token])

  useEffect(() => {
    if (user) localStorage.setItem('user', JSON.stringify(user))
    else localStorage.removeItem('user')
  }, [user])

  const login = (t: string) => setToken(t)
  const logout = () => {
    setToken(null)
    setUserState(null)
  }
  const setUser = (u: User | null) => setUserState(u)

  return (
    <AuthContext.Provider value={{ token, user, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}
