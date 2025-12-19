import axios from 'axios'
import { AuthTokenStorage } from './authToken'
import type { User } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'
const api = axios.create({ baseURL: API_BASE })

api.interceptors.request.use((cfg: { headers: any }) => {
  const token = AuthTokenStorage.get()
  if (token) cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${token}` };
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

export const getMyAttendance = async () => {
  const token = AuthTokenStorage.get()
  if (token === 'admin-token') {
    return Promise.resolve({ data: { attended: 12, total: 15 } })
  }
  return api.get<{ attended: number; total: number }>('/attendance/me')
}

export const listGroups = async () => {
  const token = AuthTokenStorage.get()
  if (token === 'admin-token') {
    const mock = [
      { id: 'g1', name: 'ИС-13' },
      { id: 'g2', name: 'ИС-09' },
      { id: 'g3', name: 'КТ-39' },
    ]
    return Promise.resolve({ data: mock })
  }
  return api.get('/groups')
}

export const joinGroup = (userId: string, groupId: string) => api.post(`/groups/${groupId}/join`, { userId })

export const startLecture = async (payload: { groupId?: string } = {}) => {
  const token = AuthTokenStorage.get()
  if (token === 'admin-token') {
    return Promise.resolve({ data: { lectureId: 'mock-lecture-1' } })
  }
  return api.post('/lectures/start', payload)
}

export const stopLecture = async (payload: { lectureId?: string } = {}) => {
  const token = AuthTokenStorage.get()
  if (token === 'admin-token') {
    return Promise.resolve({ data: { ok: true } })
  }
  return api.post('/lectures/stop', payload)
}

export default api
