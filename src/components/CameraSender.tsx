import { useEffect, useRef, useState } from 'react'
import useCamera from '../hooks/useCamera'

type Props = {
  getLectureId: () => number | null
  frameWsBase?: string
  idealWidth?: number
  idealHeight?: number
  initialFps?: number
}

const DEFAULT_WS = 'ws://89.111.170.130:8000'

export default function CameraSender({
  getLectureId,
  frameWsBase = DEFAULT_WS,
  idealWidth = 640,
  idealHeight = 360,
  initialFps = 5,
}: Props) {
  const { videoRef, devices, activeDeviceId, openDevice, closeStream, setActiveDeviceId } = useCamera()
  const wsRef = useRef<WebSocket | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const intervalRef = useRef<number | null>(null)
  const [running, setRunning] = useState(false)
  const [fps, setFps] = useState(initialFps)
  const [status, setStatus] = useState<'idle'|'connected'|'sending'|'error'>('idle')
  const bufferedThreshold = 4_000_000

  useEffect(() => {
    return () => {
      stopSending()
      closeSocket()
      closeStream().catch(()=>{})
    }
  }, [])

  useEffect(() => {
    if (running) {
      restartSending()
    }
  }, [fps])

  const buildWsUrl = (lectureId: number) => {
    const q = `lecture_id=${encodeURIComponent(String(lectureId))}`
    const base = frameWsBase.replace(/\/$/, '')
    return `${base}/ws/stream?${q}`
  }

  const openSocketForLecture = (lectureId: number) => {
    try {
      closeSocket()
      const url = buildWsUrl(lectureId)
      const socket = new WebSocket(url)
      socket.binaryType = 'arraybuffer'
      socket.onopen = () => setStatus('connected')
      socket.onclose = () => {
        setStatus('idle')
        wsRef.current = null
      }
      socket.onerror = () => setStatus('error')
      socket.onmessage = () => {}
      wsRef.current = socket
      return socket
    } catch {
      wsRef.current = null
      setStatus('error')
      return null
    }
  }

  const closeSocket = () => {
    if (wsRef.current) {
      try { wsRef.current.close() } catch {}
      wsRef.current = null
      setStatus('idle')
    }
  }

  const sendBlob = async (blob: Blob) => {
    const socket = wsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    if (socket.bufferedAmount > bufferedThreshold) return
    try {
      const arr = await blob.arrayBuffer()
      socket.send(arr)
    } catch {}
  }

  const ensureCanvas = () => {
    if (!canvasRef.current) {
      const c = document.createElement('canvas')
      c.width = idealWidth
      c.height = idealHeight
      canvasRef.current = c
    }
    return canvasRef.current!
  }

  const sendFrameOnce = async () => {
    const v = videoRef.current
    if (!v) return
    const c = ensureCanvas()
    const ctx = c.getContext('2d')
    if (!ctx) return
    try {
      ctx.drawImage(v, 0, 0, c.width, c.height)
      const blob = await new Promise<Blob | null>(res => c.toBlob(b => res(b), 'image/jpeg', 0.7))
      if (blob) await sendBlob(blob)
    } catch {}
  }

  const startSending = async () => {
    if (running) return
    const lectureId = getLectureId()
    if (!lectureId) {
      setStatus('error')
      return
    }
    const socket = openSocketForLecture(lectureId)
    if (!socket) return
    await new Promise<void>(resolve => {
      const to = setTimeout(resolve, 500)
      const prev = socket.onopen
      socket.onopen = () => {
        clearTimeout(to)
        if (typeof prev === 'function') try { prev.call(socket, new Event('open')) } catch {}
        setStatus('connected')
        resolve()
      }
    })
    const tick = Math.max(1, Math.round(1000 / Math.max(1, fps)))
    intervalRef.current = window.setInterval(() => {
      const sLectureId = getLectureId()
      if (!sLectureId) return
      const currentUrl = (wsRef.current as WebSocket | null)?.url
      const wanted = buildWsUrl(sLectureId)
      if (currentUrl !== wanted) {
        openSocketForLecture(sLectureId)
      }
      sendFrameOnce()
    }, tick)
    setRunning(true)
    setStatus('sending')
  }

  const stopSending = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setRunning(false)
    setStatus('idle')
  }

  const restartSending = () => {
    stopSending()
    if (running) startSending()
  }

  const handleStartClick = async () => {
    if (typeof window === 'undefined') return
    if (!activeDeviceId && devices.length > 0) {
      const first = devices[0]
      try { await openDevice(first.deviceId) } catch {}
    }
    startSending()
  }

  const handleStopClick = () => {
    stopSending()
    closeSocket()
  }

  return (
    <div style={{ padding: 8, borderRadius: 8, background: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: '#374151' }}>Камера</div>
          <select
            value={activeDeviceId}
            onChange={async e => {
              const id = e.target.value
              setActiveDeviceId(id)
              try { await openDevice(id) } catch {}
            }}
          >
            <option value="">-- по умолчанию --</option>
            {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#374151' }}>FPS</div>
          <input type="range" min={1} max={15} value={fps} onChange={e => setFps(Number(e.target.value))} />
          <div style={{ fontSize: 12 }}>{fps} fps</div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" onClick={handleStartClick} disabled={running}>Start send</button>
          <button className="btn" onClick={handleStopClick} disabled={!running}>Stop</button>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <video ref={videoRef} autoPlay muted playsInline style={{ width: 320, height: 180, background: '#000', borderRadius: 8 }} />
        <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>WS status: {status} {wsRef.current ? `(${wsRef.current.readyState})` : ''}</div>
      </div>
    </div>
  )
}
