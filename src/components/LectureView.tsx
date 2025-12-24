import { useEffect, useRef, useState, useContext } from 'react'
import { WsService } from '../services/ws'
import { AuthContext } from '../contexts/AuthContext'
import type { Detection, Lecture, Department, Group, Subject } from '../types'
import { exportAttendanceToXlsx, exportSessionsToXlsx } from '../utils/exportXlsx'
import './lecture.css'
import axios from 'axios'
import { AuthTokenStorage } from '../services/authToken'
import useCamera from '../hooks/useCamera' // Используем хук камеры
import {
  listDepartments,
  listGroupsByDepartment,
  listSubjects,
  listLecturesByTeacher,
  createLecture,
  createPractice,
} from '../services/api'

const FRAME_WS_BASE = 'ws://89.111.170.130:8000'
const FRAME_API_BASE = 'http://89.111.170.130:8000'
const API_BASE = 'http://89.111.170.130:8080'
const EVENTS_WS_BASE = import.meta.env.VITE_WS_EVENTS ?? API_BASE.replace(/^http/, 'ws')

const frameApi = axios.create({ baseURL: FRAME_API_BASE })
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

const startLectureFrame = async (lectureId?: number, body: any = { durable: true, auto_delete: false }) => {
  const lid = lectureId ?? Date.now()
  return frameApi.post(`/api/lectures/${encodeURIComponent(String(lid))}/start`, body)
}

const endLectureFrame = async (lectureId: number, body: any = { if_unused: false, if_empty: false }) => {
  return frameApi.post(`/api/lectures/${encodeURIComponent(String(lectureId))}/end`, body)
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

type AttendanceEntry = {
  isu: string
  name?: string
  last_name?: string
  patronymic?: string
  present: boolean
  presentSince: number | null
  totalMs: number
}

export default function LectureView() {
  const { token, user } = useContext(AuthContext)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameWsRef = useRef<WsService | null>(null)
  const eventsSocketRef = useRef<WebSocket | null>(null)
  const lastObjectUrl = useRef<string | null>(null)

  // Добавляем хук камеры
  const {
    videoRef,
    devices: cameraDevices,
    activeDeviceId,
    setActiveDeviceId,
    openDevice,
    ensurePermissionAndList,
    error: cameraError
  } = useCamera()

  // Добавляем WebSocket для отправки видео
  const videoWsRef = useRef<WebSocket | null>(null)
  const canvasVideoRef = useRef<HTMLCanvasElement | null>(null)
  const videoIntervalRef = useRef<number | null>(null)
  const [videoSending, setVideoSending] = useState(false)
  const [videoFps, setVideoFps] = useState(10)

  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [detections, setDetections] = useState<Detection[]>([])
  const [attendance, setAttendance] = useState<Record<string, AttendanceEntry>>({})
  const [status, setStatus] = useState<'idle'|'starting'|'running'|'error'|'stopped'>('idle')
  const currentLectureId = useRef<number | null>(null)
  const sessionAttendanceRef = useRef<Record<number, Set<string>>>({})
  const usersByIdRef = useRef<Record<string, string>>({})

  const [lectures, setLectures] = useState<Lecture[]>([])
  const [selectedLectureId, setSelectedLectureId] = useState<number | ''>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isPractice, setIsPractice] = useState(false)
  const [newLectureDate, setNewLectureDate] = useState('')
  const [newSubjectId, setNewSubjectId] = useState('')
  const [newGroupIds, setNewGroupIds] = useState<string[]>([])
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([])
  const [availableDepartments, setAvailableDepartments] = useState<Department[]>([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | ''>('')
  const [availableGroups, setAvailableGroups] = useState<Group[]>([])

  const subscriptionsRef = useRef<Set<number>>(new Set())
  const reconnectTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (frameWsRef.current) { frameWsRef.current.close(); frameWsRef.current = null }
      if (eventsSocketRef.current) { try { eventsSocketRef.current.close() } catch {} ; eventsSocketRef.current = null }
      if (lastObjectUrl.current) { try { URL.revokeObjectURL(lastObjectUrl.current) } catch {} ; lastObjectUrl.current = null }
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
      
      // Очищаем ресурсы видео
      stopVideoSending()
      closeVideoWebSocket()
    }
  }, [])

  // Эффект для настройки канваса детекций
  useEffect(() => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!canvas || !img) return
    const rect = img.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.style.width = rect.width + 'px'
    canvas.style.height = rect.height + 'px'
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.font = '14px sans-serif'
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
      const label = d.name ? `${d.name} ${d.score ? `(${(d.score*100).toFixed(0)}%)` : ''}` : d.id ?? 'unknown'
      const padding = 6
      const metrics = ctx.measureText(label)
      const lh = 18
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(x, Math.max(0, y - lh), metrics.width + padding, lh)
      ctx.fillStyle = 'white'
      ctx.fillText(label, x + 4, y - 4)
    })
  }, [imageSrc, detections])

  useEffect(() => {
    if (!user) return
    loadTeacherLectures()
    // Запрашиваем доступ к камерам при загрузке
    ensurePermissionAndList().catch(() => {})
  }, [user])

  // Функции для работы с видео
  const buildVideoWsUrl = (lectureId: number) => {
    const q = `lecture_id=${encodeURIComponent(String(lectureId))}`
    const base = FRAME_WS_BASE.replace(/\/$/, '')
    return `${base}/ws/stream?${q}`
  }

  const openVideoWebSocket = (lectureId: number) => {
    try {
      closeVideoWebSocket()
      const url = buildVideoWsUrl(lectureId)
      const socket = new WebSocket(url)
      socket.binaryType = 'arraybuffer'
      
      socket.onopen = () => {
        console.log('Video WebSocket connected')
      }
      
      socket.onclose = () => {
        videoWsRef.current = null
        console.log('Video WebSocket closed')
      }
      
      socket.onerror = (error) => {
        console.error('Video WebSocket error:', error)
      }
      
      videoWsRef.current = socket
      return socket
    } catch (err) {
      console.error('Failed to open video WebSocket:', err)
      videoWsRef.current = null
      return null
    }
  }

  const closeVideoWebSocket = () => {
    if (videoWsRef.current) {
      try {
        videoWsRef.current.close()
      } catch (err) {
        console.error('Error closing video WebSocket:', err)
      }
      videoWsRef.current = null
    }
  }

  const sendVideoFrame = async () => {
    const video = videoRef.current
    if (!video || video.readyState !== 4) return // Если видео не готово
    
    const socket = videoWsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    
    // Проверяем буфер
    if (socket.bufferedAmount > 4000000) {
      console.warn('Video WebSocket buffer full, skipping frame')
      return
    }
    
    // Создаем canvas для видео, если его нет
    if (!canvasVideoRef.current) {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 360
      canvasVideoRef.current = canvas
    }
    
    const canvas = canvasVideoRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    try {
      // Отрисовываем кадр
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      // Конвертируем в blob и отправляем
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7)
      })
      
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer()
        socket.send(arrayBuffer)
      }
    } catch (err) {
      console.error('Error capturing video frame:', err)
    }
  }

  const startVideoSending = (lectureId: number) => {
    if (videoSending) return
    
    // Открываем WebSocket для видео
    const socket = openVideoWebSocket(lectureId)
    if (!socket) {
      console.error('Failed to open video WebSocket')
      return
    }
    
    // Запускаем отправку кадров
    const tick = Math.max(1, Math.round(1000 / Math.max(1, videoFps)))
    videoIntervalRef.current = window.setInterval(() => {
      if (videoWsRef.current?.readyState === WebSocket.OPEN) {
        sendVideoFrame()
      }
    }, tick)
    
    setVideoSending(true)
    console.log('Video sending started')
  }

  const stopVideoSending = () => {
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current)
      videoIntervalRef.current = null
    }
    
    closeVideoWebSocket()
    setVideoSending(false)
    console.log('Video sending stopped')
  }

  const loadTeacherLectures = async () => {
    const teacherIsu = (user && (user.isu ?? user.id ?? (user.login as any) ?? '')) as string
    if (!teacherIsu) return
    try {
      const res = await listLecturesByTeacher(teacherIsu, undefined, undefined)
      setLectures(res.data || [])
    } catch {
      setLectures([])
    }
  }

  const openCreateModal = async (practice: boolean) => {
    setIsPractice(practice)
    setShowCreateModal(true)
    try {
      const [depsRes, subsRes] = await Promise.all([listDepartments({ limit: 200 }), listSubjects()])
      setAvailableDepartments(depsRes.data.departments || [])
      setAvailableSubjects(subsRes.data || [])
      setAvailableGroups([])
      setSelectedDepartmentId('')
      setNewGroupIds([])
      setNewSubjectId('')
      setNewLectureDate('')
    } catch {
      setAvailableDepartments([])
      setAvailableSubjects([])
      setAvailableGroups([])
    }
  }

  const onDepartmentChange = async (v: string) => {
    const id = v ? parseInt(v, 10) : ''
    setSelectedDepartmentId(id === '' ? '' : id)
    setAvailableGroups([])
    setNewGroupIds([])
    if (id !== '') {
      try {
        const res = await listGroupsByDepartment(id)
        setAvailableGroups(res.data || [])
      } catch {
        setAvailableGroups([])
      }
    }
  }

  const createLectureOrPracticeHandler = async () => {
    const teacherIsu = (user && (user.isu ?? user.id ?? (user.login as any) ?? '')) as string
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
    const payload = {
      date: newLectureDate,
      subject_id: parseInt(newSubjectId, 10),
      group_ids: newGroupIds,
      teacher_id: teacherIsu,
    }
    try {
      if (isPractice) {
        await createPractice(payload)
      } else {
        await createLecture(payload)
      }
      setShowCreateModal(false)
      setNewLectureDate('')
      setNewSubjectId('')
      setNewGroupIds([])
      loadTeacherLectures()
    } catch (err: any) {
      alert(`Ошибка: ${err.response?.data?.error || err.message}`)
    }
  }

  const handleDetectedArray = (newDetections: Detection[]) => {
    const now = Date.now()
    const seen = new Set<string>()
    newDetections.forEach(d => {
      if (d.user && d.user.isu) {
        const isu = String(d.user.isu)
        seen.add(isu)
      } else if (d.id) {
        seen.add(String(d.id))
      }
    })
    setAttendance(prev => {
      const copy = { ...prev }
      Object.keys(copy).forEach(key => {
        if (!seen.has(key)) {
          const r = copy[key]
          if (r.present) {
            const since = r.presentSince ?? now
            const delta = Math.max(0, now - since)
            copy[key] = { ...r, present: false, presentSince: null, totalMs: (r.totalMs ?? 0) + delta }
          }
        }
      })
      newDetections.forEach(d => {
        if (d.user && d.user.isu) {
          const isu = String(d.user.isu)
          const existing = copy[isu]
          const fullName = `${d.user.last_name ?? ''} ${d.user.name ?? ''}`.trim()
          if (!existing) {
            copy[isu] = {
              isu,
              name:  d.user.name,
              last_name: d.user.last_name,
              patronymic: d.user.patronymic,
              present: true,
              presentSince: now,
              totalMs: 0,
            }
          } else {
            if (!existing.present) {
              copy[isu] = { ...existing, present: true, presentSince: now, name: fullName || existing.name, last_name: d.user.last_name, patronymic: d.user.patronymic }
            } else {
              copy[isu] = { ...existing, name: fullName || existing.name, last_name: d.user.last_name ?? existing.last_name, patronymic: d.user.patronymic ?? existing.patronymic }
            }
          }
        } else {
          const key = d.id ? String(d.id) : `${d.name ?? 'unknown'}_${Math.round((d.bbox?.[0] ?? 0)*1000)}_${Math.round((d.bbox?.[1] ?? 0)*1000)}`
          const existing = copy[key]
          if (!existing) {
            copy[key] = {
              isu: key,
              name: d.name,
              last_name: undefined,
              patronymic: undefined,
              present: true,
              presentSince: now,
              totalMs: 0,
            }
          } else {
            if (!existing.present) copy[key] = { ...existing, present: true, presentSince: now, name: d.name ?? existing.name }
            else copy[key] = { ...existing, name: d.name ?? existing.name }
          }
        }
      })
      return copy
    })
    setDetections(newDetections)
  }

  const upsertUser = (userObj: any) => {
    const now = Date.now()
    if (!userObj) return
    const isu = String(userObj.isu ?? userObj.id ?? '')
    if (!isu) return
    setAttendance(prev => {
      const copy = { ...prev }
      const existing = copy[isu]
      const fullName = `${userObj.last_name ?? ''} ${userObj.name ?? ''}`.trim()
      if (!existing) {
        copy[isu] = {
          isu,
          name: fullName || userObj.name || userObj.last_name,
          last_name: userObj.last_name,
          patronymic: userObj.patronymic,
          present: true,
          presentSince: now,
          totalMs: 0,
        }
      } else {
        if (!existing.present) {
          copy[isu] = { ...existing, present: true, presentSince: now, name: fullName || existing.name, last_name: userObj.last_name ?? existing.last_name, patronymic: userObj.patronymic ?? existing.patronymic }
        } else {
          copy[isu] = { ...existing, name: fullName || existing.name, last_name: userObj.last_name ?? existing.last_name, patronymic: userObj.patronymic ?? existing.patronymic }
        }
      }
      return copy
    })
  }

  const processDetections = (newDetections: Detection[]) => {
    handleDetectedArray(newDetections)
  }

  const handleFrameWs = (msg: any) => {
    if (!msg) return
    if (msg.type === 'binary' && msg.blob instanceof Blob) {
      if (lastObjectUrl.current) { try { URL.revokeObjectURL(lastObjectUrl.current) } catch {} ; lastObjectUrl.current = null }
      const url = URL.createObjectURL(msg.blob)
      lastObjectUrl.current = url
      setImageSrc(url)
      return
    }
    if ((msg.type === 'frame' || msg.type === 'frame_with_boxes') && typeof msg.imageBase64 === 'string') {
      setImageSrc(msg.imageBase64)
      return
    }
    if (msg.type === 'detections' && Array.isArray(msg.detections)) {
      processDetections(msg.detections)
      return
    }
  }

  const handleEventsRaw = async (raw: any) => {
    try {
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw)
        if (!parsed) return
        if (Array.isArray(parsed)) {
          handleDetectedArray(parsed as Detection[])
          return
        }
        if (parsed.detections && Array.isArray(parsed.detections)) {
          handleDetectedArray(parsed.detections as Detection[])
          return
        }
        if (parsed.user) {
          upsertUser(parsed.user)
          return
        }
        if (parsed.type === 'detection' && parsed.user) {
          upsertUser(parsed.user)
          return
        }
        if (parsed.type === 'detections' && Array.isArray(parsed.detections)) {
          handleDetectedArray(parsed.detections as Detection[])
          return
        }
        return
      } else if (raw instanceof ArrayBuffer) {
        const text = new TextDecoder().decode(raw)
        await handleEventsRaw(text)
        return
      } else if (raw instanceof Blob) {
        const text = await raw.text()
        await handleEventsRaw(text)
        return
      } else {
        return
      }
    } catch (e) {
      return
    }
  }

  const connectFrameWsForLecture = (lectureId: number) => {
    if (frameWsRef.current) { frameWsRef.current.close(); frameWsRef.current = null }
    const wsUrl = `${FRAME_WS_BASE}/ws/stream?lecture_id=${encodeURIComponent(String(lectureId))}`
    const ws = new WsService(wsUrl)
    ws.addHandler(handleFrameWs)
    ws.connect(token ?? undefined)
    frameWsRef.current = ws
  }

  const connectEventsWs = () => {
    if (eventsSocketRef.current && (eventsSocketRef.current.readyState === WebSocket.OPEN || eventsSocketRef.current.readyState === WebSocket.CONNECTING)) return eventsSocketRef.current
    try {
      const wsUrl = `${EVENTS_WS_BASE}/api/ws`
      const socket = new WebSocket(wsUrl)
      eventsSocketRef.current = socket
      socket.onopen = () => {
        subscriptionsRef.current.forEach(id => {
          socket.send(JSON.stringify({ action: 'subscribe', lecture_id: id.toString() }))
        })
      }
      socket.onmessage = (ev: MessageEvent) => {
        handleEventsRaw(ev.data)
      }
      socket.onerror = () => {}
      socket.onclose = (ev) => {
        eventsSocketRef.current = null
        if (ev.code !== 1000) {
          if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = window.setTimeout(() => {
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
    socket.send(JSON.stringify({ action: 'unsubscribe', lecture_id: lectureId.toString() }))
  }

  const startSession = async () => {
    try {
      setStatus('starting')
      let lectureId: number
      if (selectedLectureId !== '') {
        lectureId = selectedLectureId as number
      } else {
        lectureId = Date.now()
      }
      
      const res = await startLectureFrame(lectureId, { durable: true, auto_delete: false })
      const returnedRaw = res?.data?.lecture_id ?? res?.data?.lectureId ?? lectureId
      const returnedNum = Number(returnedRaw)
      const finalId = Number.isFinite(returnedNum) ? returnedNum : lectureId
      currentLectureId.current = finalId
      
      // Подключаем WebSocket для получения кадров
      connectFrameWsForLecture(finalId)
      
      // Подключаем WebSocket для событий
      connectEventsWs()
      sendSubscribe(finalId)
      
      // Запускаем отправку видео с камеры
      if (cameraDevices.length > 0) {
        // Если камера не выбрана, выбираем первую доступную
        if (!activeDeviceId) {
          const firstDevice = cameraDevices[0]
          if (firstDevice) {
            try {
              await openDevice(firstDevice.deviceId)
            } catch (err) {
              console.error('Failed to open camera:', err)
            }
          }
        }
        
        // Запускаем отправку видео
        startVideoSending(finalId)
      }
      
      setAttendance({})
      setDetections([])
      setStatus('running')
    } catch (err: any) {
      setStatus('error')
      alert('Не удалось запустить лекцию: ' + (err?.response?.data?.message ?? err?.message ?? 'unknown'))
    }
  }

  const stopSession = async () => {
    const lid = currentLectureId.current
    try {
      const now = Date.now()
      const snapshot = Object.entries(attendance).map(([id, r]) => {
        const runningDelta = r.present && r.presentSince ? Math.max(0, now - r.presentSince) : 0
        const total = (r.totalMs ?? 0) + runningDelta
        return { id, totalMs: total }
      })
      const presentIds = snapshot.filter(s => (s.totalMs ?? 0) > 0).map(s => s.id)
      if (lid !== null) sessionAttendanceRef.current[lid] = new Set(presentIds)
      if (frameWsRef.current) { frameWsRef.current.close(); frameWsRef.current = null }
      if (eventsSocketRef.current) {
        if (lid !== null) sendUnsubscribe(lid)
        try { eventsSocketRef.current.close() } catch {}
        eventsSocketRef.current = null
      }
      if (lid !== null) { await endLectureFrame(lid, { if_unused: false, if_empty: false }); currentLectureId.current = null }
    } catch {}
    finally {
      // Останавливаем отправку видео
      stopVideoSending()
      
      setStatus('stopped')
      setDetections([])
      setAttendance({})
      if (lastObjectUrl.current) { try { URL.revokeObjectURL(lastObjectUrl.current) } catch {} ; lastObjectUrl.current = null }
      setImageSrc(null)
    }
  }

  const onSelectLecture = (val: string) => {
    const id = val ? parseInt(val, 10) : ''
    const prev = currentLectureId.current
    setSelectedLectureId(id === '' ? '' : id)
    if (eventsSocketRef.current && prev !== null) {
      try { sendUnsubscribe(prev) } catch {}
    }
    if (eventsSocketRef.current && id !== '') {
      try { eventsSocketRef.current.send(JSON.stringify({ action: 'subscribe', lecture_id: id.toString() })) } catch {}
      subscriptionsRef.current.add(id as number)
    }
  }

  const exportCurrentSession = () => {
    const now = Date.now()
    const arr = Object.values(attendance).map(a => {
      const runningDelta = a.present && a.presentSince ? Math.max(0, now - a.presentSince) : 0
      const total = (a.totalMs ?? 0) + runningDelta
      return { id: a.isu, name: a.name ?? a.isu, totalMs: total, total: fmtMs(total) }
    })
    exportAttendanceToXlsx(arr, 'lecture_session.csv')
  }

  const exportByLectures = () => {
    exportSessionsToXlsx(sessionAttendanceRef.current, usersByIdRef.current, 'attendance_by_lecture.csv')
  }

  const teacherIsuDisplay = (user && (user.isu ?? user.id ?? (user.login as any) ?? '')) as string

  // Обработчик выбора камеры
  const handleCameraChange = async (deviceId: string) => {
    try {
      setActiveDeviceId(deviceId)
      await openDevice(deviceId)
    } catch (err) {
      console.error('Failed to switch camera:', err)
    }
  }

  // Обработчик запроса разрешений камеры
  const handleRequestCameraPermission = async () => {
    try {
      await ensurePermissionAndList()
    } catch (err) {
      console.error('Failed to get camera permission:', err)
    }
  }

  return (
    <div className="lecture-page layout-wide">
      <div className="lecture-left">
        <div className="lecture-top-row">
          <div className="lecture-selector">
            <div className="selector-row">
              <div className="teacher-badge">
                <div className="teacher-label">Мой ISU</div>
                <div className="teacher-value">{teacherIsuDisplay || '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => openCreateModal(false)}>Создать лекцию</button>
              </div>
            </div>

            <div className="lectures-list">
              <label>Лекции</label>
              <select
                className="lecture-select"
                value={selectedLectureId}
                onChange={e => onSelectLecture(e.target.value)}
              >
                <option value="">-- выберите лекцию --</option>
                {lectures.map(lec => (
                  <option key={lec.id} value={String(lec.id)}>
                    {new Date(lec.date).toLocaleString()} (ID: {lec.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Добавляем выбор камеры */}
            <div className="camera-selector" style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#374151' }}>
                Камера для отправки
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  value={activeDeviceId}
                  onChange={e => handleCameraChange(e.target.value)}
                  disabled={status === 'running'}
                  style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                >
                  <option value="">-- выберите камеру --</option>
                  {cameraDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Камера ${device.deviceId.substring(0, 8)}`}
                    </option>
                  ))}
                </select>
                <button 
                  className="btn" 
                  onClick={handleRequestCameraPermission}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  Обновить
                </button>
              </div>
              
              {/* Настройки FPS */}
              {status === 'running' && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#374151' }}>FPS отправки видео</div>
                  <input
                    type="range"
                    min={1}
                    max={15}
                    value={videoFps}
                    onChange={e => setVideoFps(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: '12px', textAlign: 'center' }}>{videoFps} fps</div>
                </div>
              )}
              
              {/* Статус видео */}
              {cameraError && (
                <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>
                  Ошибка камеры: {cameraError}
                </div>
              )}
              {status === 'running' && (
                <div style={{ fontSize: '11px', color: videoSending ? '#10b981' : '#6b7280', marginTop: '4px' }}>
                  Видео: {videoSending ? `Отправляется (${videoFps} fps)` : 'Остановлено'}
                </div>
              )}
            </div>
          </div>

          <div className="lecture-actions unified">
            {status !== 'running' ? (
              <button className="btn primary" onClick={startSession}>Начать лекцию</button>
            ) : (
              <button className="btn secondary" onClick={stopSession}>Остановить лекцию</button>
            )}
            <button className="btn" onClick={exportCurrentSession}>Скачать .csv (сессия)</button>
            <button className="btn" onClick={exportByLectures}>Скачать .csv (по лекциям)</button>
            <div className="lecture-status">Статус: <strong>{status}</strong></div>
          </div>
        </div>

        <div className="video-frame large">
          {imageSrc ? (
            <img ref={imgRef} src={imageSrc} alt="frame" className="video-img" />
          ) : null}
          <canvas ref={canvasRef} className="video-canvas" />
          {!imageSrc && status !== 'running' && (
            <div className="video-placeholder">Нет видео — нажмите «Начать лекцию»</div>
          )}
        </div>
      </div>

      <aside className="detected-panel">
        <div className="detected-header">
          <h3>Обнаруженные сейчас <span className="badge">{Object.keys(attendance).length}</span></h3>
          <button className="btn ghost" onClick={() => { setAttendance({}); setDetections([]) }}>Очистить</button>
        </div>

        <div className="detected-list">
          {Object.values(attendance).length === 0 ? (
            <div className="muted">Пока никого не обнаружено</div>
          ) : (
            Object.values(attendance).map(a => {
              const now = Date.now()
              const runningDelta = a.present && a.presentSince ? (now - a.presentSince) : 0
              const total = (a.totalMs ?? 0) + runningDelta
              return (
                <div className="detected-item" key={a.isu}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{a.name ?? a.isu}</div>
                      <div style={{ color: '#6b7280' }}>{a.patronymic ? `${a.patronymic}` : ''}</div>
                      <div style={{ color: '#374151', marginTop: 6 }}>ISU: {a.isu}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>{fmtMs(total)}</div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>{a.present ? 'в аудитории' : 'не в аудитории'}</div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* Скрытое видео для камеры */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ display: 'none' }}
      />

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{isPractice ? 'Создать практику' : 'Создать лекцию'}</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>

            <div className="modal-body">
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
                  <label>Направление</label>
                  <select
                    className="form-input"
                    value={selectedDepartmentId}
                    onChange={e => onDepartmentChange(e.target.value)}
                  >
                    <option value="">Выберите направление</option>
                    {availableDepartments.map(d => (
                      <option key={d.id} value={String(d.id)}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Группы</label>
                  <select
                    className="form-input"
                    multiple
                    value={newGroupIds}
                    onChange={e => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value)
                      setNewGroupIds(selected)
                    }}
                    style={{ height: 120 }}
                  >
                    {availableGroups.map(g => (
                      <option key={g.code} value={g.code}>{g.name || g.code}</option>
                    ))}
                  </select>
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
                <button className="btn" onClick={() => setShowCreateModal(false)}>Отмена</button>
                <button className="btn primary" onClick={createLectureOrPracticeHandler}>Создать</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}