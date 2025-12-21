import { useEffect, useRef, useState, useContext } from 'react'
import { WsService } from '../services/ws'
import { AuthContext } from '../contexts/AuthContext'
import { startLecture, endLecture } from '../services/api'
import type { Detection } from '../types'
import { exportAttendanceToXlsx, exportSessionsToXlsx } from '../utils/exportXlsx'
import GroupSelector from './GroupSelector'
import './lecture.css'

const WS_BASE = import.meta.env.VITE_WS_BASE ?? `ws://89.111.170.130:8000`

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

export default function LectureView() {
  const { token } = useContext(AuthContext)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wsRef = useRef<WsService | null>(null)
  const lastObjectUrl = useRef<string | null>(null)

  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [detections, setDetections] = useState<Detection[]>([])
  const [attendance, setAttendance] = useState<Record<string, { id: string; name?: string; present: boolean; presentSince: number | null; totalMs: number }>>({})
  const [status, setStatus] = useState<'idle'|'starting'|'running'|'error'|'stopped'>('idle')
  const currentLectureId = useRef<string | null>(null)
  const sessionAttendanceRef = useRef<Record<string, Set<string>>>({})
  const usersByIdRef = useRef<Record<string, string>>({})

  useEffect(() => {
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
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

  const handleWs = (msg: any) => {
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
    if (msg.type === 'log' && typeof msg.text === 'string') {
      console.log('[WS LOG]', msg.text)
      return
    }
  }

  const connectWsForLecture = (lectureId: string) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    const wsUrl = `${WS_BASE}/ws/stream?lecture_id=${encodeURIComponent(lectureId)}`
    const ws = new WsService(wsUrl)
    ws.addHandler(handleWs)
    ws.connect(token ?? undefined)
    wsRef.current = ws
  }

  const startSession = async () => {
    try {
      setStatus('starting')
      const lectureId = `lec-${Date.now()}`
      const res = await startLecture(lectureId, { durable: true, auto_delete: false })
      const returnedId = res?.data?.lecture_id ?? res?.data?.lectureId ?? lectureId
      currentLectureId.current = String(returnedId)
      connectWsForLecture(String(returnedId))
      setAttendance({})
      setDetections([])
      setStatus('running')
    } catch (err: any) {
      console.error('startSession failed', err)
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
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
      if (lid) { await endLecture(String(lid), { if_unused: false, if_empty: false }); currentLectureId.current = null }
    } catch (err) {
      console.warn('stopSession error', err)
    } finally {
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

  return (
    <div className="lecture-page layout-wide">
      <div className="lecture-left">
        <div className="lecture-top-row">
          <GroupSelector onSelect={() => {}} />
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
          <img ref={imgRef} src={imageSrc ?? undefined} alt="frame" className="video-img" />
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
    </div>
  )
}
