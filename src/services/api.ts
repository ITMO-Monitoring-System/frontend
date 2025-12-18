/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';
import { AuthTokenStorage } from './authToken';
import type { User } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080';

const api = axios.create({ baseURL: API_BASE, withCredentials: true, });

api.interceptors.request.use((cfg: { headers: any }) => {
  const token = AuthTokenStorage.get();
  if (token) cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${token}` };
  return cfg;
});

export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password })

export const register = (email: string, password: string) =>
  api.post('/auth/register', { email, password })

export const me = () => api.get<User>('/auth/me')

export const updateProfile = (userId: string, payload: Partial<User>) =>
  api.put(`/users/${userId}`, payload)

export const uploadFace = (userId: string, fileBase64: string) =>
  api.post(`/users/${userId}/faces`, { fileBase64 })

export const getMyAttendance = () => api.get<{ attended: number; total: number }>('/attendance/me')

export const listGroups = () => api.get('/groups')
export const joinGroup = (userId: string, groupId: string) => api.post(`/groups/${groupId}/join`, { userId })

export const startLecture = (groupId: string | null) => {
  return api.post('/lectures/start', { groupId });
};

export const stopLecture = () => {
  return api.post('/lectures/stop');
};



export default api