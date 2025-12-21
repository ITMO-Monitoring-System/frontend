import axios from 'axios'
import { AuthTokenStorage } from './authToken'
import type { User } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://89.111.170.130:8000'
const api = axios.create({ baseURL: API_BASE })

api.interceptors.request.use((cfg: { headers: any }) => {
  const token = AuthTokenStorage.get()
  if (token) cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${token}` }
  return cfg
})

export const login = (email: string, password: string) =>
  api.post<{ token: string }>('/auth/login', { email, password })

export const register = (email: string, password: string) =>
  api.post('/auth/register', { email, password })

export const me = () => api.get<User>('/auth/me')

export const updateProfile = (userId: string, payload: Partial<User>) =>
  api.put(`/users/${userId}`, payload)

export const uploadFace = (userId: string, fileBase64: string) =>
  api.post(`/users/${userId}/faces`, { fileBase64 })

export const createUser = (payload: { name: string; email: string; role?: string; password?: string }) =>
  api.post('/admin/users', payload)


export const listLectures = () => api.get<{ active: string[] }>('/api/lectures')

export const startLecture = async (lectureId?: string, body: any = { durable: true, auto_delete: false }) => {
  const lid = lectureId ?? `lec-${Date.now()}`
  return api.post(`/api/lectures/${encodeURIComponent(lid)}/start`, body)
}

export const endLecture = async (lectureId: string, body: any = { if_unused: false, if_empty: false }) => {
  return api.post(`/api/lectures/${encodeURIComponent(lectureId)}/end`, body)
}

export const listGroups = async () => {
  const token = AuthTokenStorage.get()
  if (token === 'admin-token') {
    const mock = [
      { id: 'g1', name: 'ИСИ-01' },
      { id: 'g2', name: 'ИСИ-02' },
      { id: 'g3', name: 'КТ-2025' },
    ]
    return Promise.resolve({ data: mock })
  }
  return api.get('/groups')
}

export const getMyAttendance = () => api.get<{ attended: number; total: number }>('/attendance/me')

export default api
