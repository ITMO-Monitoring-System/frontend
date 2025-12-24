import axios, { type AxiosProgressEvent } from 'axios'
import { AuthTokenStorage } from './authToken'
import type { Department, Face, Group, Lecture, Practice, Subject, User } from '../types'

const API_BASE = 'http://89.111.170.130:8080'
const api = axios.create({ baseURL: API_BASE })

api.interceptors.request.use((cfg: any) => {
  const token = AuthTokenStorage.get()
  if (token) cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${token}` }
  return cfg
})

export const login = (isu: string, password: string, role: string) =>
  api.post<{ token?: string; access_token?: string }>('/api/auth/login', { isu, password, role })

export const updateProfile = (userId: string, payload: Partial<User>) =>
  api.put(`/users/${encodeURIComponent(userId)}`, payload)

export const uploadFace = (userId: string, fileBase64: string) =>
  api.post(`/users/${encodeURIComponent(userId)}/faces`, { fileBase64 })

export const createUser = (payload: {
  isu: string
  name: string
  last_name: string
  patronymic: string
  password: string
}) => api.post('/api/user/admin/create', payload)

export const addRole = (payload: {
  isu: string
  role: string
}) => api.post('/api/user/admin/roles', payload)

export const listUsers = () => api.get<User[]>('/users')

export const getUser = (userId: string) => api.get<User>(`/users/${encodeURIComponent(userId)}`)
export const deleteUser = (userId: string) => api.delete(`/users/${encodeURIComponent(userId)}`)

export const listDepartments = (params?: { limit?: number; offset?: number }) =>
  api.get<{ departments: Department[]; has_more: boolean }>('/api/departments', { params })

export const getDepartmentByCode = (code: string) =>
  api.get<Department>(`/api/departments/code/${encodeURIComponent(code)}`)

export const getDepartmentById = (id: number) =>
  api.get<Department>(`/api/departments/${encodeURIComponent(String(id))}`)

export const listGroupsByDepartment = (departmentId: number) =>
  api.get<Group[]>(`/api/departments/${encodeURIComponent(String(departmentId))}/groups`)

export const getGroupByCode = (code: string) =>
  api.get<Group>(`/api/groups/${encodeURIComponent(code)}`)

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

export const removeUserFromGroup = (groupId: string, isu: string) =>
  api.post(`/groups/${encodeURIComponent(groupId)}/removeUser`, { isu })

export const listGroupUsers = (groupId: string) =>
  api.get<{ users: User[] }>(`/groups/${encodeURIComponent(groupId)}/users`)

export const listLecturesByGroup = (code: string, from?: string, to?: string) =>
  api.get<Lecture[]>(`/api/groups/${encodeURIComponent(code)}/lectures`, {
    params: { from, to },
  })

export const createLecture = (payload: {
  date: string
  group_ids: string[]
  subject_id: number
  teacher_id: string
}) => api.post<Lecture>('/api/lectures', payload)

export const getLectureById = (id: number) =>
  api.get<Lecture>(`/api/lectures/${encodeURIComponent(String(id))}`)

export const listLecturesBySubject = (subjectId: number, from?: string, to?: string) =>
  api.get<Lecture[]>(`/api/subjects/${encodeURIComponent(String(subjectId))}/lectures`, {
    params: { from, to },
  })

export const listLecturesByTeacher = (isu: string, from?: string, to?: string) =>
  api.get<Lecture[]>(`/api/teachers/${encodeURIComponent(isu)}/lectures`, {
    params: { from, to },
  })

export const startLecture = async (lectureId?: string, body: any = { durable: true, auto_delete: false }) => {
  const lid = lectureId ?? `lec-${Date.now()}`
  return api.post(`/api/lectures/${encodeURIComponent(lid)}/start`, body)
}

export const endLecture = async (lectureId: string, body: any = { if_unused: false, if_empty: false }) => {
  return api.post(`/api/lectures/${encodeURIComponent(lectureId)}/end`, body)
}

export const startLectureProcessing = () => api.post('/api/lecture/start')
export const stopLectureProcessing = () => api.post('/api/lecture/stop')

export const listPracticesByGroup = (code: string, from?: string, to?: string) =>
  api.get<Practice[]>(`/api/groups/${encodeURIComponent(code)}/practices`, {
    params: { from, to },
  })

export const getPracticeById = (id: number) =>
  api.get<Practice>(`/api/practices/${encodeURIComponent(String(id))}`)

export const listPracticesBySubject = (subjectId: number, from?: string, to?: string) =>
  api.get<Practice[]>(`/api/subjects/${encodeURIComponent(String(subjectId))}/practices`, {
    params: { from, to },
  })

export const listPracticesByTeacher = (isu: string, from?: string, to?: string) =>
  api.get<Practice[]>(`/api/teachers/${encodeURIComponent(isu)}/practices`, {
    params: { from, to },
  })

export const listStudentsByGroup = (code: string) =>
  api.get<{ user_ids: string[] }>(`/api/groups/${encodeURIComponent(code)}/students`)

export const getStudentGroup = (isu: string) =>
  api.get<{ group_code: string; user_id: string }>(`/api/students/${encodeURIComponent(isu)}/group`)

export const setStudentGroup = (isu: string, body: { group_code: string; user_id: string }) =>
  api.put<string>(`/api/students/${encodeURIComponent(isu)}/group`, body)

export const removeStudentGroup = (isu: string) =>
  api.delete<string>(`/api/students/${encodeURIComponent(isu)}/group`)

export const listSubjects = (params?: { limit?: number; offset?: number }) =>
  api.get<Subject[]>('/api/subjects', { params })

export const createSubject = (payload: { name: string }) =>
  api.post<Subject>('/api/subjects', payload)

export const getSubjectByName = (name: string) =>
  api.get<Subject>(`/api/subjects/by-name/${encodeURIComponent(name)}`)

export const getSubjectById = (id: number) =>
  api.get<Subject>(`/api/subjects/${encodeURIComponent(String(id))}`)

export const uploadFaces = (
  isu: string,
  files: {
    left: File
    right: File
    center: File
  },
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
) => {
  const formData = new FormData()
  formData.append('left_face', files.left)
  formData.append('right_face', files.right)
  formData.append('center_face', files.center)
  return api.post(`/api/user/upload/faces/${encodeURIComponent(isu)}`, formData, {
    headers: {
      'Accept': 'application/json',
    },
    onUploadProgress,
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  })
}

export const listFaces = (userIdOrIsu: string) =>
  api.get<Face[]>(`/users/${encodeURIComponent(userIdOrIsu)}/faces`)

export const deleteFace = (userIdOrIsu: string, faceId: string) =>
  api.delete(`/users/${encodeURIComponent(userIdOrIsu)}/faces/${encodeURIComponent(faceId)}`)

export type AttendanceRecord = { isu: string; lectureId: string; status: 'present' | 'absent' | 'late'; ts: string }

export const getMyAttendance = () => api.get<{ attended: number; total: number }>('/attendance/me')

export const markAttendance = (lectureId: string, isu: string, status: AttendanceRecord['status']) =>
  api.post(`/attendance/${encodeURIComponent(lectureId)}/mark`, { isu, status })

export const listAttendanceForLecture = (lectureId: string) =>
  api.get<AttendanceRecord[]>(`/attendance/lectures/${encodeURIComponent(lectureId)}`)

export const healthCheck = () => api.get('/api/health')

export default api
