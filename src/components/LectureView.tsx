import { useEffect, useRef, useState, useContext } from 'react'
import Hls from 'hls.js'
import { WsService } from '../services/ws'
import { AuthContext } from '../contexts/AuthContext'
import { startLecture, endLecture } from '../services/api'
import type { Detection } from '../types'
import { exportAttendanceToXlsx, exportSessionsToXlsx } from '../utils/exportXlsx'
import GroupSelector from './GroupSelector'
import './lecture.css'

const HLS_BASE = import.meta.env.VITE_HLS_BASE ?? 'http://89.111.170.130:8888'
const WS_BASE = import.meta.env.VITE_WS_BASE ?? 'ws://localhost:8081'

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

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)

  const wsRef = useRef<WsService | null>(null)

  const [imagePlaceholder, setImagePlaceholder] = useState<string | null>(null)
  const [, setDetections] = useState<Detection[]>([])
  const [attendance, setAttendance] = useState<Record<string, {
    id: string
    name?: string
    present: boolean
    presentSince: number | null
    totalMs: number
    score?: number
  }>>({})

  const [status, setStatus] = useState<'idle'|'starting'|'running'|'error'|'stopped'>('idle')
  const [, setSelectedGroup] = useState<string | null>(null)

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
      const copy: typeof prev = { ...prev }
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
        const name = d.name
        const score = d.score
        const existing = copy[id]
        if (!existing) {
          copy[id] = { id, name, present: true, presentSince: now, totalMs: 0, score }
        } else {
          if (!existing.present) {
            copy[id] = { ...existing, present: true, presentSince: now, name: name ?? existing.name, score }
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
    if (wsRef.current) {
      try { wsRef.current.close() } catch {}
      wsRef.current = null
    }
    const wsUrl = `${WS_BASE}/ws/stream?lecture_id=${encodeURIComponent(lectureId)}`
    const ws = new WsService(wsUrl)
    ws.addHandler(handleWsMsg)
    ws.connect(token ?? undefined)
    wsRef.current = ws
  }

  const attachHlsForLecture = (lectureId: string) => {
    const video = videoRef.current
    if (!video) return

    const candidatePerLecture = `${HLS_BASE}/lecture/${lectureId}/index.m3u8`
    const candidateGlobal = `${HLS_BASE}/lecture/index.m3u8`
    if (hlsRef.current) {
      try { hlsRef.current.destroy() } catch {}
      hlsRef.current = null
    }

    const tryAttach = (url: string) => {
      if (Hls.isSupported()) {
        const hls = new Hls({ maxBufferLength: 30 })
        hlsRef.current = hls
        hls.on(Hls.Events.ERROR, (event: any, data: { fatal: any }) => {
          console.warn('[HLS] error', event, data)
          if (data && data.fatal) {
            console.warn('[HLS] fatal error on', url)
            hls.destroy()
            hlsRef.current = null
            if (url === candidatePerLecture) {
              console.log('[HLS] trying fallback global manifest')
              tryAttach(candidateGlobal)
            } else {
              setImagePlaceholder(null)
            }
          }
        })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {})
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(() => {})
        })
      } else {
        console.warn('HLS not supported in this browser')
      }
    }

    tryAttach(candidatePerLecture)
  }

  const startSession = async () => {
    try {
      setStatus('starting')
      const lectureId = `lec-${Date.now()}`
      const res = await startLecture(lectureId, { durable: true, auto_delete: false })
      const returnedId = res?.data?.lecture_id ?? res?.data?.lectureId ?? lectureId
      currentLectureId.current = String(returnedId)

      attachHlsForLecture(String(returnedId))
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

      if (lid) {
        sessionAttendanceRef.current[String(lid)] = new Set(presentIds)
      }

      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }

      if (hlsRef.current) {
        try { hlsRef.current.destroy() } catch {}
        hlsRef.current = null
      }
      if (videoRef.current) {
        try { videoRef.current.pause(); videoRef.current.removeAttribute('src'); videoRef.current.load() } catch {}
      }

      if (lid) {
        await endLecture(String(lid), { if_unused: false, if_empty: false })
        currentLectureId.current = null
      }
    } catch (err) {
      console.warn('stopSession error', err)
    } finally {
      setStatus('stopped')
      setDetections([])
      setAttendance({})
      setImagePlaceholder(null)
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

  useEffect(() => {
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
      if (hlsRef.current) { try { hlsRef.current.destroy() } catch {} ; hlsRef.current = null }
    }
  }, [])

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
            <button className="btn" onClick={exportByLectures}>Скачать .csv (по лекциям)</button>
            <div className="lecture-status">Статус: <strong>{status}</strong></div>
          </div>
        </div>

        <div className="video-frame large">
          <video ref={videoRef} controls style={{ width: '100%', height: '100%' }} />
          { imagePlaceholder && <img src={imagePlaceholder} alt="placeholder" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> }
          {!imagePlaceholder && status !== 'running' && (
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
