import  { useEffect, useRef, useState, useContext } from 'react'
import { WsService } from '../services/ws'
import { AuthContext } from '../contexts/AuthContext'
import { startLecture, stopLecture } from '../services/api'
import type { Detection } from '../types'
import { exportAttendanceToXlsx, exportSessionsToXlsx } from '../utils/exportXlsx'
import GroupSelector from './GroupSelector'
import './lecture.css'

const WS_BASE = import.meta.env.VITE_WS_BASE ?? 'ws://localhost:8081'

function formatDurationMs(ms: number) {
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

  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [detections, setDetections] = useState<Detection[]>([])
  const [attendance, setAttendance] = useState<Record<string, {
    id: string
    name?: string
    present: boolean
    presentSince: number | null
    totalMs: number
    score?: number
  }>>({})

  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error' | 'stopped'>('idle')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const wsRef = useRef<WsService | null>(null)
  const lastObjectUrl = useRef<string | null>(null)
  const currentLectureId = useRef<string | null>(null)

  const sessionAttendanceRef = useRef<Record<string, Set<string>>>({})
  const usersByIdRef = useRef<Record<string, string>>({})

  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

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
        const rec = copy[k]
        if (rec.present && !newIds.has(k)) {
          const since = rec.presentSince ?? now
          const delta = Math.max(0, now - since)
          copy[k] = { ...rec, present: false, presentSince: null, totalMs: rec.totalMs + delta }
        }
      })

      newDetections.forEach(d => {
        const id = d.id ?? `${d.name ?? 'unknown'}_${Math.round((d.bbox?.[0] ?? 0)*1000)}_${Math.round((d.bbox?.[1] ?? 0)*1000)}`
        const name = d.name
        const score = d.score
        const existing = copy[id]
        if (!existing) {
          copy[id] = { id, name, present: true, presentSince: now, totalMs: 0, score }
        } else {
          if (!existing.present) {
            copy[id] = { ...existing, name: name ?? existing.name, score, present: true, presentSince: now }
          } else {
            copy[id] = { ...existing, name: name ?? existing.name, score }
          }
        }
      })

      return copy
    })

    setDetections(newDetections)
  }

  const handleWsMsg = (msg: any) => {
    if (!msg) return
    if (msg.type === 'binary' && msg.blob instanceof Blob) {
      if (lastObjectUrl.current) {
        try { URL.revokeObjectURL(lastObjectUrl.current) } catch {}
        lastObjectUrl.current = null
      }
      const url = URL.createObjectURL(msg.blob)
      lastObjectUrl.current = url
      setImageSrc(url)
      return
    }

    if ((msg.type === 'frame' || msg.type === 'frame_with_boxes') && typeof msg.imageBase64 === 'string') {
      if (lastObjectUrl.current) { try { URL.revokeObjectURL(lastObjectUrl.current) } catch {} ; lastObjectUrl.current = null }
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

    console.log('[WS] unknown message', msg)
  }

  const connectWsForLecture = (lectureId: string) => {
    if (wsRef.current) {
      try { wsRef.current.close() } catch {}
      wsRef.current = null
    }
    const wsUrl = `${WS_BASE}/ws/stream?lecture_id=${encodeURIComponent(lectureId)}`
    const ws = new WsService(wsUrl)
    ws.addHandler(handleWsMsg)
    ws.connect(token ?? undefined)
    wsRef.current = ws
    setStatus('running')
  }

  const startSession = async () => {
    try {
      setStatus('starting')
      const res = await startLecture({ groupId: selectedGroup ?? undefined })
      const lectureId = res?.data?.lectureId ?? res?.data?.id ?? res?.data
      if (!lectureId) throw new Error('No lectureId returned from server')
      currentLectureId.current = String(lectureId)
      // reset attendance for new session
      setAttendance({})
      connectWsForLecture(String(lectureId))
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
      // finalize all present users by adding their current open intervals
      const now = Date.now()
      setAttendance(prev => {
        const copy = { ...prev }
        Object.keys(copy).forEach(k => {
          const r = copy[k]
          if (r.present && r.presentSince) {
            const delta = Math.max(0, now - r.presentSince)
            copy[k] = { ...r, present: false, presentSince: null, totalMs: r.totalMs + delta }
          }
        })
        return copy
      })

      await new Promise(res => setTimeout(res, 50))

      const snapshot = Object.values(attendance).map(a => ({ ...a })) 
      const presentIds = Object.entries(attendance).filter(([, v]) => (v.totalMs > 0) || v.present).map(([k]) => k)

      if (lid) {
        sessionAttendanceRef.current[String(lid)] = new Set(presentIds)
      }

      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (lid) { await stopLecture({ lectureId: lid }); currentLectureId.current = null }
    } catch (err) {
      console.warn('stopSession error', err)
    } finally {
      setStatus('stopped')
      // clear visual state
      setImageSrc(null)
      setDetections([])
      setAttendance({})
    }
  }

  // export current session: list of attendees with total time
  const exportCurrentSession = () => {
    const arr = Object.values(attendance).map(a => {
      const now = Date.now()
      const total = a.totalMs + (a.present && a.presentSince ? (now - a.presentSince) : 0)
      return { id: a.id, name: a.name ?? usersByIdRef.current[a.id] ?? a.id, totalMs: total, total: formatDurationMs(total) }
    })
    exportAttendanceToXlsx(arr, 'lecture_session.csv')
  }

  // export overall sessions table (0/1 per lecture + total)
  const exportAllSessionsTable = () => {
    const sessions = sessionAttendanceRef.current
    exportSessionsToXlsx(sessions, usersByIdRef.current, 'attendance_by_lecture.csv')
  }

  useEffect(() => {
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
      if (lastObjectUrl.current) { try { URL.revokeObjectURL(lastObjectUrl.current) } catch {} }
    }
  }, [])

  // canvas drawing (unchanged)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

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
      ctx.strokeStyle = '#22c55e'
      ctx.strokeRect(x, y, w, h)
      const label = d.name ? `${d.name} ${d.score ? `(${(d.score*100).toFixed(0)}%)` : ''}` : `${d.id ?? 'unknown'}`
      const padding = 6
      const metrics = ctx.measureText(label)
      const lh = 18
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(x, Math.max(0, y - lh), metrics.width + padding, lh)
      ctx.fillStyle = 'white'
      ctx.fillText(label, x + 4, y - 4)
    })
  }, [imageSrc, detections])

  // UI render
  return (
    <div className="lecture-page layout-wide">
      <div className="lecture-left">
        <div className="lecture-top-row">
          <GroupSelector onSelect={g => setSelectedGroup(g || null)} />
          <div className="lecture-actions unified">
            {status !== 'running' ? (
              <button className="btn primary" onClick={startSession}>Начать лекцию</button>
            ) : (
              <button className="btn secondary" onClick={stopSession}>Остановить лекцию</button>
            )}
            <button className="btn" onClick={exportCurrentSession}>Скачать .csv (сессия)</button>
            <button className="btn" onClick={exportAllSessionsTable}>Скачать .csv (по лекциям)</button>
            <div className="lecture-status">Статус: <strong>{status}</strong></div>
          </div>
        </div>

        <div className="video-frame large">
          {imageSrc ? (
            <>
              <img ref={imgRef} src={imageSrc} alt="video" />
              <canvas ref={canvasRef} />
            </>
          ) : (
            <div className="video-placeholder">Ожидание видеопотока...</div>
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
              const total = a.totalMs + runningDelta
              return (
                <div className="detected-item" key={a.id}>
                  <div className="detected-main">
                    <div className="detected-name">{a.name ?? a.id}</div>
                    <div className="detected-time muted">{formatDurationMs(total)}</div>
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
