/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';
import { AuthTokenStorage } from './authToken';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((cfg: { headers: any }) => {
  const token = AuthTokenStorage.get();
  if (token) cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${token}` };
  return cfg;
});

export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password });
export const me = () => api.get('/auth/me');
export const uploadFace = (userId: string, fileBase64: string) =>
  api.post(`/users/${userId}/faces`, { fileBase64 });
export const createUser = (payload: any) => api.post('/admin/users', payload);
export const listGroups = () => api.get('/groups');
export const joinGroup = (userId: string, groupId: string) =>
  api.post(`/groups/${groupId}/join`, { userId });
export default api;
