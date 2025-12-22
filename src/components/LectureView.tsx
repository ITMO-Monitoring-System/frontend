import { useEffect, useRef, useState, useContext } from 'react'
import { WsService } from '../services/ws'
import { AuthContext } from '../contexts/AuthContext'
import type { Detection } from '../types'
import { exportAttendanceToXlsx, exportSessionsToXlsx } from '../utils/exportXlsx'
import './lecture.css'
import axios from 'axios'
import { AuthTokenStorage } from '../services/authToken'

const FRAME_WS_BASE = 'ws://89.111.170.130:8000'
const FRAME_API_BASE = 'http://89.111.170.130:8000'
const API_BASE = 'http://89.111.170.130:8080'
const EVENTS_WS_BASE = import.meta.env.VITE_WS_EVENTS ?? 'ws://89.111.170.130:8000'

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

const api = axios.create({ baseURL: API_BASE })
api.interceptors.request.use((cfg: any) => {
  const token = AuthTokenStorage.get()
  if (token) cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${token}` }
  return cfg
})

const startLectureFrame = async (lectureId?: string, body: any = { durable: true, auto_delete: false }) => {
  const lid = lectureId ?? `lec-${Date.now()}`
  return frameApi.post(`/api/lectures/${encodeURIComponent(lid)}/start`, body)
}

const endLectureFrame = async (lectureId: string, body: any = { if_unused: false, if_empty: false }) => {
  return frameApi.post(`/api/lectures/${encodeURIComponent(lectureId)}/end`, body)
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

type Lecture = {
  date: string
  id: number
  subject_id: number
  teacher_id: string
}

export default function LectureView() {
  const { token, user } = useContext(AuthContext)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameWsRef = useRef<WsService | null>(null)
  const eventsWsRef = useRef<WsService | null>(null)
  const lastObjectUrl = useRef<string | null>(null)

  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [detections, setDetections] = useState<Detection[]>([])
  const [attendance, setAttendance] = useState<Record<string, { id: string; name?: string; present: boolean; presentSince: number | null; totalMs: number }>>({})
  const [status, setStatus] = useState<'idle'|'starting'|'running'|'error'|'stopped'>('idle')
  const currentLectureId = useRef<string | null>(null)
  const sessionAttendanceRef = useRef<Record<string, Set<string>>>({})
  const usersByIdRef = useRef<Record<string, string>>({})

  const [lectures, setLectures] = useState<Lecture[]>([])
  const [selectedLectureId, setSelectedLectureId] = useState<number | ''>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isPractice, setIsPractice] = useState(false)
  const [newLectureDate, setNewLectureDate] = useState('')
  const [newSubjectId, setNewSubjectId] = useState('')
  const [newGroupIds, setNewGroupIds] = useState<string[]>([])
  const [availableSubjects, setAvailableSubjects] = useState<Array<{id: number, name: string}>>([])
  const [availableGroups, setAvailableGroups] = useState<Array<{code: string, name?: string}>>([])

  useEffect(() => {
    return () => {
      if (frameWsRef.current) { frameWsRef.current.close(); frameWsRef.current = null }
      if (eventsWsRef.current) { eventsWsRef.current.close(); eventsWsRef.current = null }
      if (lastObjectUrl.current) { try { URL.revokeObjectURL(lastObjectUrl.current) } catch {} ; lastObjectUrl.current = null }
    }
  }, [])

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

  const loadTeacherLectures = async () => {
    const teacherIsu = (user && (user.isu ?? user.id ?? (user.login as any) ?? '')) as string
    if (!teacherIsu) {
      alert('ISU преподавателя неизвестен')
      return
    }
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
    try {
      const response = await api.get(`/api/teachers/${encodeURIComponent(teacherIsu)}/lectures`, {
        params: { from, to }
      })
      setLectures(response.data || [])
    } catch (err) {
      alert('Не удалось загрузить лекции')
    }
  }

  const loadSubjectsAndGroups = async () => {
    try {
      const [subjectsRes, groupsRes] = await Promise.all([
        api.get('/api/subjects'),
        api.get('/api/groups')
      ])
      setAvailableSubjects(subjectsRes.data || [])
      setAvailableGroups(groupsRes.data || [])
    } catch (err) {}
  }

  const createLectureOrPractice = async () => {
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
      subject_id: parseInt(newSubjectId),
      group_ids: newGroupIds,
      teacher_id: teacherIsu
    }
    try {
      const endpoint = isPractice ? '/api/practices' : '/api/lectures'
      await api.post(endpoint, payload)
      setShowCreateModal(false)
      setNewLectureDate('')
      setNewSubjectId('')
      setNewGroupIds([])
      loadTeacherLectures()
    } catch (err: any) {
      alert(`Ошибка: ${err.response?.data?.error || err.message}`)
    }
  }

  const processDetections = (newDetections: Detection[]) => {
    const now = Date.now()
    const newIds = new Set<string>()
    newDetections.forEach(d => {
      const id = d.id ?? `${d.name ?? 'unknown'}_${Math.round((d.bbox?.[0] ?? 0)*1000)}_${Math.round((d.bbox?.[1] ?? 0)*1000)}`
      newIds.add(id)
      if (d.name) usersByIdRef.current[id] = d.name
    })
    setAttendance(prev => {
      const copy = { ...prev }
      Object.keys(copy).forEach(k => {
        const r = copy[k]
        if (r.present && !newIds.has(k)) {
          const since = r.presentSince ?? now
          const delta = Math.max(0, now - since)
          copy[k] = { ...r, present: false, presentSince: null, totalMs: (r.totalMs ?? 0) + delta }
        }
      })
      newDetections.forEach(d => {
        const id = d.id ?? `${d.name ?? 'unknown'}_${Math.round((d.bbox?.[0] ?? 0)*1000)}_${Math.round((d.bbox?.[1] ?? 0)*1000)}`
        const existing = copy[id]
        if (!existing) {
          copy[id] = { id, name: d.name, present: true, presentSince: now, totalMs: 0 }
        } else {
          if (!existing.present) copy[id] = { ...existing, present: true, presentSince: now, name: d.name ?? existing.name }
          else copy[id] = { ...existing, name: d.name ?? existing.name }
        }
      })
      return copy
    })
    setDetections(newDetections)
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

  const handleEventsWs = (msg: any) => {
    if (!msg) return
    if (typeof msg === 'string') {
      try {
        const parsed = JSON.parse(msg)
        if (parsed && Array.isArray(parsed.detections)) {
          processDetections(parsed.detections)
          return
        }
      } catch {}
      return
    }
    if (msg.type === 'detections' && Array.isArray(msg.detections)) {
      processDetections(msg.detections)
      return
    }
    if (msg.detections && Array.isArray(msg.detections)) {
      processDetections(msg.detections)
      return
    }
  }

  const connectFrameWsForLecture = (lectureId: string) => {
    if (frameWsRef.current) { frameWsRef.current.close(); frameWsRef.current = null }
    const wsUrl = `${FRAME_WS_BASE}/ws/stream?lecture_id=${encodeURIComponent(lectureId)}`
    const ws = new WsService(wsUrl)
    ws.addHandler(handleFrameWs)
    ws.connect(token ?? undefined)
    frameWsRef.current = ws
  }

  const connectEventsWsAndSubscribe = (lectureId: string) => {
    if (eventsWsRef.current) { eventsWsRef.current.close(); eventsWsRef.current = null }
    const wsUrl = `${EVENTS_WS_BASE}/api/ws`
    const ws = new WsService(wsUrl)
    ws.addHandler(handleEventsWs)
    ws.connect(token ?? undefined)
    eventsWsRef.current = ws
    const onOpen = (m: any) => {
      if (m && m.type === 'open') {
        ws.send({ action: 'subscribe', lecture_id: lectureId })
      }
    }
    ws.addHandler(onOpen)
  }

  const startSession = async () => {
    try {
      setStatus('starting')
      let lectureId: string
      if (selectedLectureId) {
        lectureId = selectedLectureId.toString()
      } else {
        lectureId = `lec-${Date.now()}`
      }
      const res = await startLectureFrame(lectureId, { durable: true, auto_delete: false })
      const returnedId = res?.data?.lecture_id ?? res?.data?.lectureId ?? lectureId
      currentLectureId.current = String(returnedId)
      connectFrameWsForLecture(String(returnedId))
      connectEventsWsAndSubscribe(String(returnedId))
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
      if (lid) sessionAttendanceRef.current[String(lid)] = new Set(presentIds)
      if (frameWsRef.current) { frameWsRef.current.close(); frameWsRef.current = null }
      if (eventsWsRef.current) {
        eventsWsRef.current.send({ action: 'unsubscribe', lecture_id: lid })
        eventsWsRef.current.close()
        eventsWsRef.current = null
      }
      if (lid) { await endLectureFrame(String(lid), { if_unused: false, if_empty: false }); currentLectureId.current = null }
    } catch (err) {}
    finally {
      setStatus('stopped')
      setDetections([])
      setAttendance({})
      if (lastObjectUrl.current) { try { URL.revokeObjectURL(lastObjectUrl.current) } catch {} ; lastObjectUrl.current = null }
      setImageSrc(null)
    }
  }

  const exportCurrentSession = () => {
    const now = Date.now()
    const arr = Object.values(attendance).map(a => {
      const runningDelta = a.present && a.presentSince ? Math.max(0, now - a.presentSince) : 0
      const total = (a.totalMs ?? 0) + runningDelta
      return { id: a.id, name: a.name ?? usersByIdRef.current[a.id] ?? a.id, totalMs: total, total: fmtMs(total) }
    })
    exportAttendanceToXlsx(arr, 'lecture_session.csv')
  }

  const exportByLectures = () => {
    exportSessionsToXlsx(sessionAttendanceRef.current, usersByIdRef.current, 'attendance_by_lecture.csv')
  }

  const teacherIsuDisplay = (user && (user.isu ?? user.id ?? (user.login as any) ?? '')) as string

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
                <button className="btn" onClick={loadTeacherLectures}>Загрузить мои лекции</button>
                <button className="btn" onClick={() => { setIsPractice(false); setShowCreateModal(true); loadSubjectsAndGroups() }}>Создать лекцию</button>
                <button className="btn" onClick={() => { setIsPractice(true); setShowCreateModal(true); loadSubjectsAndGroups() }}>Создать практику</button>
              </div>
            </div>

            {lectures.length > 0 && (
              <div className="lectures-list">
                <label>Выберите лекцию:</label>
                <select
                  className="lecture-select"
                  value={selectedLectureId}
                  onChange={e => setSelectedLectureId(e.target.value ? parseInt(e.target.value) : '')}
                >
                  <option value="">-- новая лекция --</option>
                  {lectures.map(lec => (
                    <option key={lec.id} value={lec.id}>
                      {new Date(lec.date).toLocaleString()} (ID: {lec.id})
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                <div className="detected-item" key={a.id}>
                  <div className="detected-main">
                    <div className="detected-name">{a.name ?? a.id}</div>
                    <div className="detected-time muted">{fmtMs(total)}</div>
                  </div>
                  <div className="detected-sub muted">id: {a.id}</div>
                </div>
              )
            })
          )}
        </div>
      </aside>

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
                  <label>Предмет</label>
                  <select
                    className="form-input"
                    value={newSubjectId}
                    onChange={e => setNewSubjectId(e.target.value)}
                  >
                    <option value="">Выберите предмет</option>
                    {availableSubjects.map(subj => (
                      <option key={subj.id} value={subj.id}>{subj.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group groups-multi">
                  <label>Группы</label>
                  <select
                    className="form-input"
                    multiple
                    value={newGroupIds}
                    onChange={e => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value)
                      setNewGroupIds(selected)
                    }}
                  >
                    {availableGroups.map(group => (
                      <option key={group.code} value={group.code}>
                        {group.name || group.code}
                      </option>
                    ))}
                  </select>
                  <div className="form-hint">Удерживайте Ctrl / Cmd для выбора нескольких</div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn" onClick={() => setShowCreateModal(false)}>Отмена</button>
                <button className="btn primary" onClick={createLectureOrPractice}>Создать</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
