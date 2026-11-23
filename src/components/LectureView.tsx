import { localDateTimeToISO } from '../utils/localDateTime'
import { useEffect, useRef, useState, useContext, useCallback } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { lectureStatus, type Detection, type Lecture, type Department, type Group, type Subject } from '../types'
import { exportAttendanceToXlsx, exportSessionsToXlsx } from '../utils/exportXlsx'
import './lecture.css'
import axios from 'axios'
import { AuthTokenStorage } from '../services/authToken'
import TeacherLectureList from './TeacherLectureList'
import { waitForLectureStatus } from '../utils/lectureStatusSync'
import TeacherAnalytics from './TeacherAnalytics'
import CameraSender from './CameraSender'
import type { CameraSenderHandle } from './CameraSender'
import type { CameraStreamState } from '../services/cameraStream'
import { addObservation, presenceLabel } from '../utils/lecturePresence'
import type { ObservationHistory } from '../utils/lecturePresence'
import { summarizeLectureGroups, toggleLectureGroup } from '../utils/lectureGroupSelection'
import {
  listDepartments,
  listGroupsByDepartment,
  listSubjects,
  listLecturesByTeacher,
  createLecture,
  updateLecture,
} from '../services/api'

const trimTrailingSlash = (value: string) => value.replace(/\/$/, '')
const toWsOrigin = (value: string) => {
  const origin = trimTrailingSlash(value)
  if (origin.startsWith('https://')) return origin.replace(/^https:/, 'wss:')
  if (origin.startsWith('http://')) return origin.replace(/^http:/, 'ws:')
  return origin
}

const API_BASE = trimTrailingSlash(import.meta.env.VITE_API_BASE?.trim() || window.location.origin)
const FRAME_API_BASE = trimTrailingSlash(import.meta.env.VITE_FRAME_API_BASE?.trim() || `${window.location.origin}/tracking`)
const FRAME_WS_BASE = trimTrailingSlash(import.meta.env.VITE_WS_BASE?.trim() || toWsOrigin(FRAME_API_BASE))
const EVENTS_WS_BASE = trimTrailingSlash(import.meta.env.VITE_WS_EVENTS?.trim() || toWsOrigin(API_BASE))

const frameApi = axios.create({ baseURL: FRAME_API_BASE })
const lectureErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail ?? error.response?.data?.message ?? error.message
  }
  return error instanceof Error ? error.message : String(error)
}
frameApi.interceptors.request.use((cfg: any) => {
  const token = AuthTokenStorage.get()
  if (token) cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${token}` }
  if (cfg.data instanceof FormData) {
    if (cfg.headers) {
      delete cfg.headers['Content-Type']
    }
  }
  return cfg
})

const startLectureFrame = async (lectureId: number, body: any = { durable: true, auto_delete: false }) => {
  return frameApi.post(`api/lectures/${encodeURIComponent(String(lectureId))}/start`, body)
}

const endLectureFrame = async (lectureId: number, body: any = { if_unused: false, if_empty: false }) => {
  return frameApi.post(`api/lectures/${encodeURIComponent(String(lectureId))}/end`, body)
}

function fmtMs(ms: number) {
  if (!ms || ms <= 0) return '0s'
  const s = Math.floor(ms / 1000)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (hh > 0) return `${hh}h ${String(mm).padStart(2, '0')}m`
  if (mm > 0) return `${mm}m ${String(ss).padStart(2, '0')}s`
  return `${ss}s`
}

async function loadOptions<T>(fetchPage: (offset: number) => Promise<T[]>) {
  const items: T[] = []
  for (;;) {
    const page = await fetchPage(items.length)
    items.push(...page)
    if (page.length < 200) return items
  }
}

type AttendanceEntry = {
  isu: string
  name?: string
  last_name?: string
  patronymic?: string
  group?: string
  history: ObservationHistory
}

type AttendanceObservation = Omit<AttendanceEntry, 'history'> & {
  observedAt: number
  lectureId: number
  runId: string | null
}

export default function LectureView() {
  const auth = useContext(AuthContext)
  const user = auth?.user ?? null
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const eventsSocketRef = useRef<WebSocket | null>(null)
  const cameraSenderRef = useRef<CameraSenderHandle | null>(null)
  const sessionActionRef = useRef<'starting' | 'retrying' | 'stopping' | null>(null)
  const mountedRef = useRef(false)

  const [hasFrame, setHasFrame] = useState<boolean>(false)
  const [detections, setDetections] = useState<Detection[]>([])
  // Локальные bbox-ы от face-tracking (нормализованные [x,y,w,h]) — все видимые лица, без user-инфы.
  const [localFaces, setLocalFaces] = useState<[number, number, number, number][]>([])
  const [attendance, setAttendance] = useState<Record<string, AttendanceEntry>>({})
  const [status, setStatus] = useState<'idle'|'starting'|'running'|'stopping'|'error'|'stopped'>('idle')
  const [activeLectureId, setActiveLectureId] = useState<number | null>(null)
  const currentLectureId = useRef<number | null>(null)
  const currentRunId = useRef<string | null>(null)
  const lastFrameTimestamp = useRef<number | null>(null)
  const [lastFrameReceivedAt, setLastFrameReceivedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now)
  const [eventsConnected, setEventsConnected] = useState(false)
  const sessionAttendanceRef = useRef<Record<number, Set<string>>>({})
  const usersByIdRef = useRef<Record<string, string>>({})

  const [lectures, setLectures] = useState<Lecture[]>([])
  const [selectedLectureId, setSelectedLectureId] = useState<number | ''>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState<Lecture | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(true)
  const [listError, setListError] = useState('')
  const [loading, setLoading] = useState(true)
  const listRequest = useRef(0)
  const statusSync = useRef<AbortController | null>(null)
  const statusTarget = useRef<{ id: number; status: Lecture['status'] } | null>(null)
  const [syncingLectureId, setSyncingLectureId] = useState<number | null>(null)
  const [statusSyncError, setStatusSyncError] = useState('')
  const teacherIsu = String(user?.isu ?? user?.id ?? '')
  const [newLectureDate, setNewLectureDate] = useState('')
  const [newSubjectId, setNewSubjectId] = useState('')
  const [groupOverrides, setGroupOverrides] = useState<Partial<Record<number, string[]>>>({})
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([])
  const [availableDepartments, setAvailableDepartments] = useState<Department[]>([])
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<number[]>([])
  const [groupsByDepartment, setGroupsByDepartment] = useState<Partial<Record<number, Group[]>>>({})
  const [failedDepartmentIds, setFailedDepartmentIds] = useState<number[]>([])
  const { groupIds: newGroupIds, studentCount, complete: groupsReady } = summarizeLectureGroups(
    selectedDepartmentIds, groupsByDepartment, groupOverrides,
  )
  const selectedGroupIds = new Set(newGroupIds)
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false)

  const subscriptionsRef = useRef<Set<number>>(new Set())
  const reconnectTimerRef = useRef<number | null>(null)

  // rAF-throttle WS-сообщений посещаемости: при 10-50 событий/сек React делал бы
  // столько же re-render-ов таблицы. Аккумулируем в буферы, флашим раз в кадр (~16мс).
  const pendingDetectionsRef = useRef<Detection[] | null>(null)
  const pendingUpsertsRef = useRef<AttendanceObservation[]>([])
  const rafIdRef = useRef<number | null>(null)

  const closeEventsWs = useCallback(() => {
    if (mountedRef.current) setEventsConnected(false)
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    const socket = eventsSocketRef.current
    eventsSocketRef.current = null
    if (socket) {
      socket.onopen = null
      socket.onmessage = null
      socket.onclose = null
      socket.onerror = null
      try { socket.close(1000) } catch { /* Already closing. */ }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      closeEventsWs()
      if (rafIdRef.current !== null) { window.cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null }
    }
  }, [closeEventsWs])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!canvas || !video || !hasFrame) return
    const rect = video.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.style.width = rect.width + 'px'
    canvas.style.height = rect.height + 'px'
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.font = '14px sans-serif'

    // Локальные лица от face-tracking (тонкая зелёная рамка, без подписи).
    // Координаты приходят нормализованными относительно отправляемого кадра.
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#00FF66'
    localFaces.forEach(([rx, ry, rw, rh]) => {
      ctx.strokeRect(rx * rect.width, ry * rect.height, rw * rect.width, rh * rect.height)
    })

    // Backend detections поверх — толстая рамка с user-меткой.
    detections.forEach(d => {
      if (!d.bbox) return
      const [rx, ry, rw, rh] = d.bbox
      const x = rx * rect.width
      const y = ry * rect.height
      const w = rw * rect.width
      const h = rh * rect.height
      ctx.lineWidth = 2
      ctx.strokeStyle = '#00FF66'
      ctx.strokeRect(x, y, w, h)
      const label = d.user?.isu ? `${d.user.isu}${d.user.name ? ` ${d.user.name}` : ''}` : d.name ? `${d.name}${d.score ? ` (${(d.score*100).toFixed(0)}%)` : ''}` : d.id ?? 'unknown'
      const padding = 6
      const metrics = ctx.measureText(label)
      const lh = 18
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(x, Math.max(0, y - lh), metrics.width + padding, lh)
      ctx.fillStyle = 'white'
      ctx.fillText(label, x + 4, y - 4)
    })
  }, [detections, localFaces, hasFrame])

  useEffect(() => {
    if (!showCreateModal) return
    const missing = selectedDepartmentIds.filter(
      id => groupsByDepartment[id] === undefined && !failedDepartmentIds.includes(id)
    )
    if (missing.length === 0) return

    let cancelled = false
    Promise.all(missing.map(async id => {
      try {
        const res = await listGroupsByDepartment(id)
        return { id, groups: res.data || [], failed: false }
      } catch {
        return { id, groups: [], failed: true }
      }
    })).then(results => {
      if (cancelled) return
      setGroupsByDepartment(previous => {
        const next = { ...previous }
        results.forEach(({ id, groups, failed }) => {
          if (!failed) next[id] = groups
        })
        return next
      })
      setFailedDepartmentIds(previous => [
        ...new Set([...previous, ...results.filter(result => result.failed).map(result => result.id)]),
      ])
    })

    return () => { cancelled = true }
  }, [showCreateModal, selectedDepartmentIds, groupsByDepartment, failedDepartmentIds])

  useEffect(() => {
    if (activeLectureId === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [activeLectureId])

  const loadTeacherLectures = useCallback(async (signal?: AbortSignal) => {
    if (!teacherIsu) return
    const request = ++listRequest.current
    setLoading(true)
    try {
      const res = await listLecturesByTeacher(teacherIsu, undefined, undefined, signal)
      if (signal?.aborted || request !== listRequest.current) return
      const items = res.data || []
      setLectures(items)
      setListError('')
      const target = statusTarget.current
      if (target && items.some(lecture => lecture.id === target.id && lecture.status === target.status)) {
        statusTarget.current = null
        setStatusSyncError('')
      }
      return items
    } catch {
      if (!signal?.aborted && request === listRequest.current) setListError('Не удалось загрузить лекции.')
    } finally {
      if (request === listRequest.current) setLoading(false)
    }
  }, [teacherIsu])

  useEffect(() => {
    if (!teacherIsu) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    let refreshing = false
    const refresh = async () => {
      if (refreshing) return
      refreshing = true
      clearTimeout(timer)
      if (!statusSync.current) await loadTeacherLectures(controller.signal)
      refreshing = false
      if (!controller.signal.aborted) timer = setTimeout(refresh, 5_000)
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => {
      controller.abort()
      clearTimeout(timer)
      statusSync.current?.abort()
      statusSync.current = null
      statusTarget.current = null
      listRequest.current++
      window.removeEventListener('focus', refresh)
    }
  }, [teacherIsu, loadTeacherLectures])

  const synchronizeLectureStatus = async (id: number, expected: Lecture['status']) => {
    statusSync.current?.abort()
    const controller = new AbortController()
    statusSync.current = controller
    statusTarget.current = { id, status: expected }
    setSyncingLectureId(id)
    setStatusSyncError('')
    try {
      const confirmed = await waitForLectureStatus(loadTeacherLectures, id, expected, controller.signal)
      if (!controller.signal.aborted && !confirmed) {
        setStatusSyncError('Сервер пока не подтвердил изменение статуса лекции. Список продолжит обновляться автоматически.')
      }
    } finally {
      if (statusSync.current === controller) {
        statusSync.current = null
        if (mountedRef.current) setSyncingLectureId(null)
      }
    }
  }

  const openLectureForm = async (lecture: Lecture | null = null) => {
    setFormError('')
    setEditing(lecture)
    setAvailableDepartments([])
    setAvailableSubjects([])
    setGroupsByDepartment({})
    setFailedDepartmentIds([])
    setSelectedDepartmentIds(lecture?.department_ids ?? [])
    setGroupOverrides(lecture ? Object.fromEntries(lecture.department_ids.map(id => [id, lecture.group_ids])) : {})
    setNewSubjectId(lecture ? String(lecture.subject_id) : '')
    const date = lecture && new Date(lecture.date)
    setNewLectureDate(date ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '')
    setShowCreateModal(true)
    try {
      const [departments, subjects] = await Promise.all([
        loadOptions(async offset => (await listDepartments({ limit: 200, offset })).data.departments),
        loadOptions(async offset => (await listSubjects({ limit: 200, offset })).data),
      ])
      setAvailableDepartments(departments)
      setAvailableSubjects(subjects)
    } catch {
      setFormError('Не удалось загрузить предметы и направления.')
    }
  }

  const onDepartmentToggle = (id: number) => {
    setSelectedDepartmentIds(previous => previous.includes(id)
      ? previous.filter(selectedId => selectedId !== id)
      : [...previous, id])
    setGroupOverrides(previous => ({ ...previous, [id]: undefined }))
    setFailedDepartmentIds(previous => previous.filter(failedId => failedId !== id))
  }

  const saveLecture = async () => {
    if (!groupsReady) return
    const teacherIsu = (user && (user.isu ?? user.id ?? '')) as string
    if (!teacherIsu) {
      alert('ISU преподавателя неизвестен')
      return
    }
    if (!newLectureDate) {
      alert('Введите дату')
      return
    }
    if (!newSubjectId) {
      alert('Выберите предмет')
      return
    }
    if (newGroupIds.length === 0) {
      alert('Выберите хотя бы одну группу')
      return
    }
    setSaving(true)
    try {
      const payload = {
        date: localDateTimeToISO(newLectureDate),
        subject_id: parseInt(newSubjectId, 10),
        group_ids: newGroupIds,
        teacher_id: teacherIsu,
      }
      const created = editing ? await updateLecture(editing.id, payload) : await createLecture(payload)
      setLectures(previous => [created.data, ...previous.filter(lecture => lecture.id !== created.data.id)])
      setSelectedLectureId(created.data.id)
      setShowCreateModal(false)
      setNewLectureDate('')
      setNewSubjectId('')
      loadTeacherLectures()
    } catch (err: any) {
      setFormError(err.response?.data?.error || err.message)
    } finally {
      setSaving(false)
    }
  }

  const flushPending = () => {
    rafIdRef.current = null
    const detections = pendingDetectionsRef.current
    pendingDetectionsRef.current = null
    if (detections && currentRunId.current === null && currentLectureId.current !== null) {
      setDetections(detections)
    }

    const observations = pendingUpsertsRef.current.filter(
      observation => observation.lectureId === currentLectureId.current && observation.runId === currentRunId.current,
    )
    pendingUpsertsRef.current = []
    if (observations.length === 0) return
    for (const observation of observations) {
      if (observation.name) usersByIdRef.current[observation.isu] = observation.name
    }
    setAttendance(previous => {
      const entries = { ...previous }
      for (const { isu, name, last_name, patronymic, group, observedAt } of observations) {
        const entry = entries[isu]
        entries[isu] = {
          isu,
          name: name || entry?.name,
          last_name: last_name ?? entry?.last_name,
          patronymic: patronymic ?? entry?.patronymic,
          group: group ?? entry?.group,
          history: addObservation(entry?.history ?? { times: [], totalMs: 0 }, observedAt),
        }
      }
      return entries
    })
  }

  const scheduleFlush = () => {
    if (rafIdRef.current === null) rafIdRef.current = window.requestAnimationFrame(flushPending)
  }

  const queueObservation = (lectureId: number, runId: string | null, observedAt: number, detection: Detection) => {
    const student = detection.user
    const isu = String(student?.isu ?? detection.id ?? '')
    if (!isu) return
    const fullName = [student?.last_name, student?.name].filter(Boolean).join(' ')
    pendingUpsertsRef.current.push({
      isu, name: fullName || detection.name, last_name: student?.last_name,
      patronymic: student?.patronymic, group: detection.group ?? undefined,
      lectureId, runId, observedAt,
    })
    scheduleFlush()
  }

  const handleEventsRaw = async (raw: unknown, socket: WebSocket) => {
    try {
      let text: string
      if (typeof raw === 'string') text = raw
      else if (raw instanceof ArrayBuffer) text = new TextDecoder().decode(raw)
      else if (raw instanceof Blob) text = await raw.text()
      else return
      if (eventsSocketRef.current !== socket) return
      const lectureId = currentLectureId.current
      if (lectureId === null) return
      const runId = currentRunId.current
      const parsed = JSON.parse(text)
      if (!parsed) return
      if (parsed.lecture_id != null && Number(parsed.lecture_id) !== lectureId) return
      if ((parsed.run_id ?? null) !== runId) return
      if (parsed.user) {
        const observedAt = Date.parse(parsed.observed_at)
        if (runId !== null && !Number.isFinite(observedAt)) return
        queueObservation(lectureId, runId, Number.isFinite(observedAt) ? observedAt : Date.now(), {
          user: parsed.user,
          group: parsed.group ?? parsed.user.group,
        })
        return
      }
      const batch = Array.isArray(parsed) ? parsed : parsed.detections
      if (runId === null && Array.isArray(batch)) {
        pendingDetectionsRef.current = batch
        const observedAt = Date.now()
        for (const detection of batch) queueObservation(lectureId, null, observedAt, detection)
        scheduleFlush()
      }
    } catch {
      // Ignore messages outside the events protocol.
    }
  }

  // MediaStream от CameraSender — кладём в локальный <video> для отображения.
  const handleStream = useCallback((stream: MediaStream | null) => {
    const v = videoRef.current
    if (!v) return
    if (v.srcObject !== stream) {
      v.srcObject = stream
    }
    setHasFrame(Boolean(stream))
  }, [])

  // Локальные bbox-ы лиц от face-tracking — рисуются canvas-overlay поверх <video>.
  const handleLocalDetections = useCallback((
    faces: [number, number, number, number][],
    _frameWh: [number, number],
    timestamp: number | null,
  ) => {
    if (timestamp !== null && timestamp !== lastFrameTimestamp.current) {
      lastFrameTimestamp.current = timestamp
      setLastFrameReceivedAt(Date.now())
    }
    setLocalFaces(faces)
  }, [])

  // JSON events from face-tracking via CameraSender WebSocket
  const handleServerEvent = useCallback((event: Record<string, unknown>) => {
    if (!event) return
    if (event.type === 'auto_publish' || event.type === 'recognize_result') {
      // These are acknowledgements from face-tracking, not detections
      return
    }
    if (event.type === 'error') {
      console.warn('face-tracking error:', event.error)
      return
    }
  }, [])

  const handleCameraState = useCallback((state: CameraStreamState) => {
    if (state !== 'sending') {
      lastFrameTimestamp.current = null
      if (mountedRef.current) setLastFrameReceivedAt(null)
    }
    if (sessionActionRef.current || currentLectureId.current === null) return
    if (state === 'error' || state === 'idle') {
      setStatus('error')
      setLocalFaces([])
    }
  }, [])

  const connectEventsWs = () => {
    if (!mountedRef.current || subscriptionsRef.current.size === 0) return null
    if (eventsSocketRef.current && (eventsSocketRef.current.readyState === WebSocket.OPEN || eventsSocketRef.current.readyState === WebSocket.CONNECTING)) return eventsSocketRef.current
    try {
      const wsUrl = `${EVENTS_WS_BASE}/api/ws`
      const socket = new WebSocket(wsUrl)
      eventsSocketRef.current = socket
      socket.onopen = () => {
        if (eventsSocketRef.current !== socket) return
        setEventsConnected(true)
        subscriptionsRef.current.forEach(id => {
          socket.send(JSON.stringify({ action: 'subscribe', lecture_id: id.toString() }))
        })
      }
      socket.onmessage = (ev: MessageEvent) => {
        if (eventsSocketRef.current !== socket) return
        void handleEventsRaw(ev.data, socket)
      }
      socket.onerror = () => {}
      socket.onclose = (ev) => {
        if (eventsSocketRef.current !== socket) return
        eventsSocketRef.current = null
        setEventsConnected(false)
        if (ev.code !== 1000 && subscriptionsRef.current.size > 0 && mountedRef.current) {
          if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null
            connectEventsWs()
          }, 2000)
        }
      }
      return socket
    } catch {
      return null
    }
  }

  const sendSubscribe = (lectureId: number) => {
    subscriptionsRef.current.add(lectureId)
    const socket = connectEventsWs()
    if (!socket) return
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ action: 'subscribe', lecture_id: lectureId.toString() }))
    }
  }

  const sendUnsubscribe = (lectureId: number) => {
    subscriptionsRef.current.delete(lectureId)
    const socket = eventsSocketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    try {
      socket.send(JSON.stringify({ action: 'unsubscribe', lecture_id: lectureId.toString() }))
    } catch { /* Closing a socket must not prevent the lecture stop request. */ }
  }

  const getLectureId = useCallback(() => currentLectureId.current, [])
  const getRunId = useCallback(() => currentRunId.current, [])

  const startSession = async (lectureId = selectedLectureId) => {
    if (sessionActionRef.current || currentLectureId.current !== null) return
    if (lectureId === '') {
      alert('Выберите лекцию из списка или создайте новую')
      return
    }
    sessionActionRef.current = 'starting'
    let startedLectureId: number | null = null
    try {
      setStatus('starting')
      const sender = cameraSenderRef.current
      if (!sender) throw new Error('Камера ещё не готова к запуску')
      await sender.prepare()
      if (!mountedRef.current) return
      const res = await startLectureFrame(lectureId, { durable: true, auto_delete: false })
      if (!mountedRef.current) return
      const returnedRaw = res?.data?.lecture_id ?? res?.data?.lectureId ?? lectureId
      const returnedNum = Number(returnedRaw)
      const finalId = Number.isFinite(returnedNum) ? returnedNum : lectureId
      startedLectureId = finalId
      currentLectureId.current = finalId
      currentRunId.current = res?.data?.run_id ?? null
      pendingUpsertsRef.current = []
      pendingDetectionsRef.current = null
      lastFrameTimestamp.current = null
      setLastFrameReceivedAt(null)
      setNow(Date.now())
      void synchronizeLectureStatus(finalId, 'running')
      setActiveLectureId(finalId)

      // Connect events WebSocket (backend → frontend for recognition results)
      sendSubscribe(finalId)

      setAttendance({})
      setDetections([])
      await sender.start()
      if (!mountedRef.current) return
      if (!sender.isRunning()) throw new Error('Видеопоток прервался при запуске')
      setStatus('running')
    } catch (err: unknown) {
      if (!mountedRef.current) return
      cameraSenderRef.current?.stop()
      if (startedLectureId !== null) {
        subscriptionsRef.current.delete(startedLectureId)
      }
      closeEventsWs()
      currentLectureId.current = startedLectureId
      setActiveLectureId(startedLectureId)
      setStatus('error')
      alert((startedLectureId === null ? 'Не удалось запустить лекцию: ' : 'Не удалось запустить видеопоток: ') + lectureErrorMessage(err) +
        (startedLectureId !== null ? '. Нажмите «Подключить видео повторно» или «Остановить лекцию».' : ''))
    } finally {
      sessionActionRef.current = null
    }
  }

  const retryVideo = async () => {
    const lectureId = currentLectureId.current
    if (lectureId === null || sessionActionRef.current) return
    sessionActionRef.current = 'retrying'
    setStatus('starting')
    try {
      const sender = cameraSenderRef.current
      if (!sender) throw new Error('Камера ещё не готова к запуску')
      sendSubscribe(lectureId)
      await sender.start()
      if (!sender.isRunning()) throw new Error('Видеопоток прервался при подключении')
      if (mountedRef.current) setStatus('running')
    } catch (err: unknown) {
      if (!mountedRef.current) return
      cameraSenderRef.current?.stop()
      setStatus('error')
      alert('Не удалось подключить видео: ' + lectureErrorMessage(err))
    } finally {
      sessionActionRef.current = null
    }
  }

  const stopSession = async () => {
    if (sessionActionRef.current) return
    sessionActionRef.current = 'stopping'
    statusSync.current?.abort()
    const lid = currentLectureId.current
    setStatus('stopping')
    try {
      const presentIds = new Set(Object.keys(attendance))
      for (const observation of pendingUpsertsRef.current) {
        if (observation.lectureId === lid && observation.runId === currentRunId.current) {
          presentIds.add(observation.isu)
          if (observation.name) usersByIdRef.current[observation.isu] = observation.name
        }
      }

      // Stop CameraSender (closes its WebSocket)
      cameraSenderRef.current?.stop()

      if (lid !== null) sendUnsubscribe(lid)
      closeEventsWs()
      if (lid !== null) {
        await endLectureFrame(lid, { if_unused: false, if_empty: false, run_id: currentRunId.current })
        const lectureAttendance = sessionAttendanceRef.current[lid] ?? new Set<string>()
        for (const isu of presentIds) lectureAttendance.add(isu)
        sessionAttendanceRef.current[lid] = lectureAttendance
        pendingUpsertsRef.current = []
        pendingDetectionsRef.current = null
        currentLectureId.current = null
        currentRunId.current = null
        setAttendance({})
        setActiveLectureId(null)
      }
      if (lid !== null) void synchronizeLectureStatus(lid, 'completed')
      setStatus('stopped')
    } catch (err: unknown) {
      setStatus('error')
      alert('Не удалось завершить лекцию: ' + lectureErrorMessage(err))
    }
    finally {
      sessionActionRef.current = null
      setDetections([])
      setLocalFaces([])
      lastFrameTimestamp.current = null
      setLastFrameReceivedAt(null)
      if (videoRef.current) videoRef.current.srcObject = null
      setHasFrame(false)
    }
  }

  const exportCurrentSession = () => {
    const arr = Object.values(attendance).map(({ isu, name, history }) => ({
      id: isu, name: name ?? isu,
      totalMs: history.times.length === 1 ? null : history.totalMs,
      total: history.times.length === 1 ? 'Недостаточно наблюдений' : fmtMs(history.totalMs),
    }))
    exportAttendanceToXlsx(arr, 'lecture_session.csv')
  }

  const exportByLectures = () => {
    exportSessionsToXlsx(sessionAttendanceRef.current, usersByIdRef.current, 'attendance_by_lecture.csv')
  }

  const selected = lectures.find(l => l.id === selectedLectureId)
  const busy = activeLectureId !== null || status === 'starting' || status === 'stopping'
  const openLecture = (lecture: Lecture) => {
    setSelectedLectureId(lecture.id)
    setCatalogOpen(false)
  }

  return (
    <div className="lecture-page layout-wide">
      {statusSyncError && <p role="alert">{statusSyncError}</p>}
      <TeacherLectureList
        hidden={!catalogOpen}
        lectures={lectures}
        error={listError}
        loading={loading}
        busy={busy}
        activeId={activeLectureId}
        syncingId={syncingLectureId}
        onRetry={() => { void loadTeacherLectures() }}
        onCreate={() => openLectureForm()}
        onEdit={openLectureForm}
        onOpen={openLecture}
        onStart={lecture => {
          openLecture(lecture)
          void startSession(lecture.id)
        }}
      />
      <div className="lecture-main-container" hidden={catalogOpen}>
        <div className="lecture-left">
          <div className="lecture-top-row">
            <div className="lecture-selector">
              <button
                className="btn"
                onClick={() => {
                  setCatalogOpen(true)
                  void loadTeacherLectures()
                }}
              >
                К списку лекций
              </button>
              {selected && (
                <div>
                  <h2>{selected.subject_name}</h2>
                  <p>
                    {new Date(selected.date).toLocaleString('ru-RU')} · {syncingLectureId === selected.id ? 'Обновляем статус…' : lectureStatus[selected.status]}
                  </p>
                  <p>Направления: {selected.department_codes.join(', ') || '—'}</p>
                  <p>Группы: {selected.group_ids.join(', ') || '—'}</p>
                </div>
              )}
            </div>

            <div className="lecture-controls">
              <CameraSender
                ref={cameraSenderRef}
                getLectureId={getLectureId}
                getRunId={getRunId}
                frameWsBase={FRAME_WS_BASE}
                onLocalDetections={handleLocalDetections}
                onServerEvent={handleServerEvent}
                onStream={handleStream}
                onStateChange={handleCameraState}
                showControls={false}
                disabled={status === 'starting' || status === 'stopping'}
              />

              <div className="lecture-actions unified">
                {status !== 'running' && activeLectureId === null ? (
                  <button
                    className="btn primary"
                    onClick={() => startSession()}
                    disabled={busy || !selected || syncingLectureId === selected.id}
                  >
                    {selected?.status === 'running' ? 'Подключиться' : 'Начать лекцию'}
                  </button>
                ) : (
                  <button className="btn secondary" onClick={stopSession} disabled={status === 'starting' || status === 'stopping'}>Остановить лекцию</button>
                )}
                {status === 'error' && activeLectureId !== null && (
                  <button className="btn primary" onClick={retryVideo}>Подключить видео повторно</button>
                )}
                <button className="btn" onClick={exportCurrentSession}>Скачать .csv (сессия)</button>
                <button className="btn" onClick={exportByLectures}>Скачать .csv (по лекциям)</button>
                <button className="btn" onClick={() => setShowAnalyticsModal(true)}>Аналитика</button>
                <div className="lecture-status">Статус: <strong>{status}</strong></div>
              </div>
            </div>
          </div>

          <div className="video-frame large">
            <video
              ref={videoRef}
              className="video-img"
              autoPlay
              muted
              playsInline
              style={{ display: hasFrame ? '' : 'none' }}
            />
            <canvas ref={canvasRef} className="video-canvas" />
            {!hasFrame && status !== 'running' && (
              <div className="video-placeholder">Нет видео — нажмите «Начать лекцию»</div>
            )}
          </div>
        </div>

        <aside className="detected-panel">
          <div className="detected-header">
            <h3>Распознанные за запуск <span className="badge">{Object.keys(attendance).length}</span></h3>
            <button className="btn ghost" onClick={() => { setAttendance({}); setDetections([]) }}>Очистить</button>
          </div>

          <div className="detected-list">
            {Object.values(attendance).length === 0 ? (
              <div className="muted">Пока никого не обнаружено</div>
            ) : (
              Object.values(attendance).map(a => {
                const lastSeen = a.history.times[a.history.times.length - 1]
                const label = presenceLabel(lastSeen, lastFrameReceivedAt, eventsConnected, now)
                return (
                  <div className="detected-item" key={a.isu}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{a.name ?? a.isu}</div>
                        <div style={{ color: '#6b7280' }}>{a.patronymic ? `${a.patronymic}` : ''}</div>
                        <div style={{ color: '#374151', marginTop: 6 }}>ISU: {a.isu}</div>
                        <div style={{ color: '#374151', marginTop: 6 }}>Группа: {a.group ?? '—'}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700 }}>{a.history.times.length === 1 ? 'Недостаточно наблюдений' : fmtMs(a.history.totalMs)}</div>
                        <div style={{ color: '#6b7280', fontSize: 12 }}>{label}</div>
                        <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 6 }}>Последнее появление: {new Date(lastSeen).toLocaleTimeString()}</div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </aside>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editing ? 'Редактировать лекцию' : 'Создать лекцию'}</h3>
              <button className="modal-close" disabled={saving} onClick={() => setShowCreateModal(false)}>×</button>
            </div>

            <div className="modal-body">
              {formError && <p role="alert">{formError}</p>}
              <div className="form-row">
                <div className="form-group">
                  <label>Дата и время</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={newLectureDate}
                    onChange={e => setNewLectureDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Направления</label>
                  <div className="selection-list" role="group" aria-label="Направления">
                    {availableDepartments.map(d => (
                      <label className="selection-option" key={d.id}>
                        <input
                          type="checkbox"
                          checked={selectedDepartmentIds.includes(d.id)}
                          disabled={saving}
                          onChange={() => onDepartmentToggle(d.id)}
                        />
                        <span>{d.code} – {d.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Группы · выбрано: {newGroupIds.length}</label>
                  <div className="selection-list" role="group" aria-label="Группы">
                    {selectedDepartmentIds.length === 0 && <span className="selection-empty">Выберите направления</span>}
                    {selectedDepartmentIds.map(departmentId => {
                      const groups = groupsByDepartment[departmentId]
                      return (
                        <div key={departmentId}>
                          <div className="selection-heading">
                            {availableDepartments.find(department => department.id === departmentId)?.code}
                          </div>
                          {failedDepartmentIds.includes(departmentId) ? (
                            <button className="selection-retry" type="button" onClick={() => setFailedDepartmentIds(previous => previous.filter(id => id !== departmentId))}>
                              Не удалось загрузить группы. Повторить
                            </button>
                          ) : groups === undefined ? (
                            <span className="selection-empty">Загрузка групп…</span>
                          ) : groups.length === 0 ? (
                            <span className="selection-empty">Групп нет</span>
                          ) : groups.map(group => (
                            <label className="selection-option" key={group.code}>
                              <input
                                type="checkbox"
                                checked={selectedGroupIds.has(group.code)}
                                disabled={saving}
                                onChange={() => setGroupOverrides(previous => ({
                                  ...previous,
                                  [departmentId]: toggleLectureGroup(groups, previous[departmentId], group.code),
                                }))}
                              />
                              <span>{group.name || group.code}</span>
                            </label>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                  <div role="status">
                    Студентов: {failedDepartmentIds.length > 0 || studentCount === null
                      ? 'не удалось подсчитать'
                      : groupsReady ? studentCount : 'подсчёт…'}
                  </div>
                </div>

                <div className="form-group">
                  <label>Предмет</label>
                  <select
                    className="form-input"
                    value={newSubjectId}
                    onChange={e => setNewSubjectId(e.target.value)}
                  >
                    <option value="">Выберите предмет</option>
                    {availableSubjects.map(subj => (
                      <option key={subj.id} value={String(subj.id)}>{subj.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn" disabled={saving} onClick={() => setShowCreateModal(false)}>Отмена</button>
                <button
                  className="btn primary"
                  disabled={saving || !availableSubjects.length || !availableDepartments.length || !groupsReady || !newGroupIds.length}
                  onClick={saveLecture}
                >
                  {editing ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAnalyticsModal && (
        <div className="modal-overlay">
          <div className="modal-content analytics-modal">
            <div className="modal-header">
              <h3>Аналитика посещаемости</h3>
              <button className="modal-close" onClick={() => setShowAnalyticsModal(false)}>×</button>
            </div>
            <div className="modal-body analytics-modal-body">
              <TeacherAnalytics />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
