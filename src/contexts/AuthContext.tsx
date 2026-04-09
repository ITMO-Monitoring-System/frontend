import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Role, User } from '../types'
import { AuthTokenStorage } from '../services/authToken'
import { getMe } from '../services/api'

type AuthUser = User & {
  isu?: string
  first_name?: string
  last_name?: string
  patronymic?: string
  name?: string
  group?: string
  has_photos?: boolean
}

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  login: (token: string) => Promise<void>
  logout: () => void
  loading: boolean
}

const VALID_ROLES: Role[] = ['student', 'teacher', 'admin']

const parseRole = (value: unknown): Role | null => {
  if (typeof value !== 'string') return null
  return VALID_ROLES.includes(value as Role) ? (value as Role) : null
}

const buildDisplayName = (firstName?: string, lastName?: string) => {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  return fullName || undefined
}

const parseJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split('.')
    if (parts.length < 2 || !parts[1]) return null
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

const mapMeToUser = (me: {
  isu: string
  role: string
  first_name: string
  last_name: string
  patronymic?: string
  group?: string
  has_photos?: boolean
}): AuthUser | null => {
  const role = parseRole(me.role)
  if (!role || !me.isu) return null
  return {
    id: String(me.isu),
    isu: String(me.isu),
    role,
    first_name: me.first_name,
    last_name: me.last_name,
    patronymic: me.patronymic,
    name: buildDisplayName(me.first_name, me.last_name),
    group: me.group,
    has_photos: me.has_photos,
  }
}

const mapJwtToUser = (token: string): AuthUser | null => {
  const payload = parseJwtPayload(token)
  if (!payload) return null
  const role = parseRole(payload.role)
  const userId = payload.user_id
  if (!role || typeof userId !== 'string' || !userId) return null
  const firstName = typeof payload.first_name === 'string' ? payload.first_name : undefined
  const lastName = typeof payload.last_name === 'string' ? payload.last_name : undefined
  const patronymic = typeof payload.patronymic === 'string' ? payload.patronymic : undefined
  return {
    id: userId,
    isu: userId,
    role,
    first_name: firstName,
    last_name: lastName,
    patronymic,
    name: buildDisplayName(firstName, lastName),
  }
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(AuthTokenStorage.get())
  const [loading, setLoading] = useState<boolean>(!!token)
  const mountedRef = useRef(true)
  const loadedTokenRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadMe = useCallback(async (tokenValue: string | null) => {
    if (!tokenValue) {
      loadedTokenRef.current = null
      if (mountedRef.current) {
        setUser(null)
        setLoading(false)
      }
      return
    }

    loadedTokenRef.current = tokenValue
    if (mountedRef.current) setLoading(true)

    try {
      const response = await getMe()
      const meUser = mapMeToUser(response.data)
      if (!meUser) {
        throw new Error('Invalid /api/auth/me payload')
      }

      if (mountedRef.current && loadedTokenRef.current === tokenValue) {
        setUser(meUser)
      }
    } catch (err: any) {
      const status = err?.response?.status

      if (status === 401) {
        AuthTokenStorage.clear()
        loadedTokenRef.current = null
        if (mountedRef.current) {
          setToken(null)
          setUser(null)
          setLoading(false)
        }
        return
      }

      const fallbackUser = mapJwtToUser(tokenValue)
      if (fallbackUser && mountedRef.current && loadedTokenRef.current === tokenValue) {
        setUser(fallbackUser)
      } else {
        AuthTokenStorage.clear()
        loadedTokenRef.current = null
        if (mountedRef.current) {
          setToken(null)
          setUser(null)
        }
      }
    } finally {
      if (mountedRef.current && loadedTokenRef.current === tokenValue) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (token === loadedTokenRef.current) return
    void loadMe(token)
  }, [token, loadMe])

  const login = useCallback(async (nextToken: string) => {
    AuthTokenStorage.set(nextToken)
    loadedTokenRef.current = nextToken
    setToken(nextToken)
    await loadMe(nextToken)
  }, [loadMe])

  const logout = useCallback(() => {
    AuthTokenStorage.clear()
    loadedTokenRef.current = null
    setToken(null)
    setUser(null)
    setLoading(false)
  }, [])

  const value = useMemo(
    () => ({ user, token, login, logout, loading }),
    [user, token, login, logout, loading]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
