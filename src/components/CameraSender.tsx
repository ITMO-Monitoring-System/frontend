import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import useCamera from '../hooks/useCamera'

export type CameraSenderHandle = {
  start: () => Promise<void>
  stop: () => void
  isRunning: () => boolean
}

type Props = {
  getLectureId: () => number | null
  frameWsBase?: string
  idealWidth?: number
  idealHeight?: number
  initialFps?: number
  /** Called when an annotated JPEG frame is received back from face-tracking */
  onAnnotatedFrame?: (blob: Blob) => void
  /** Called when a JSON event is received from face-tracking (auto_publish, recognize_result, error) */
  onServerEvent?: (event: any) => void
  /** Whether the sender should be active (controlled mode) */
  active?: boolean
}

const DEFAULT_WS = (import.meta.env.VITE_WS_BASE ?? (() => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
})()).replace(/\/$/, '')

const CameraSender = forwardRef<CameraSenderHandle, Props>(function CameraSender({
  getLectureId,
  frameWsBase = DEFAULT_WS,
  idealWidth = 1920,
  idealHeight = 1080,
  initialFps = 5,
  onAnnotatedFrame,
  onServerEvent,
  active,
}, ref) {
  const {
    videoRef,
    devices,
    activeDeviceId,
    setActiveDeviceId,
    openDevice,
    closeStream,
    ensurePermissionAndList,
    error: cameraError,
  } = useCamera()

  const wsRef = useRef<WebSocket | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const intervalRef = useRef<number | null>(null)
  const [running, setRunning] = useState(false)
  const [fps, setFps] = useState(initialFps)
  const [, setStatus] = useState<'idle' | 'connected' | 'sending' | 'error'>('idle')
  const [localError, setLocalError] = useState('')
  const bufferedThreshold = 4_000_000

  const onAnnotatedFrameRef = useRef(onAnnotatedFrame)
  onAnnotatedFrameRef.current = onAnnotatedFrame
  const onServerEventRef = useRef(onServerEvent)
  onServerEventRef.current = onServerEvent

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSendingInternal()
      closeSocket()
      closeStream()
    }
  }, [])

  // Restart sending when FPS changes
  useEffect(() => {
    if (running) {
      stopSendingInternal()
      startSending()
    }
  }, [fps])

  // Controlled mode: react to `active` prop
  useEffect(() => {
    if (active === undefined) return
    if (active && !running) {
      startSending()
    } else if (!active && running) {
      stopSendingInternal()
      closeSocket()
    }
  }, [active])

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
      socket.onopen = () => {
        setStatus('connected')
      }
      socket.onclose = () => {
        setStatus('idle')
        wsRef.current = null
      }
      socket.onerror = () => {
        setStatus('error')
      }
      socket.onmessage = (event) => {
        // Binary = annotated JPEG frame from face-tracking
        if (event.data instanceof ArrayBuffer) {
          const blob = new Blob([event.data], { type: 'image/jpeg' })
          onAnnotatedFrameRef.current?.(blob)
          return
        }
        // Text = JSON event from face-tracking
        if (typeof event.data === 'string') {
          try {
            const parsed = JSON.parse(event.data)
            onServerEventRef.current?.(parsed)
          } catch {
            // ignore
          }
        }
      }

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
      const canvas = document.createElement('canvas')
      canvas.width = idealWidth
      canvas.height = idealHeight
      canvasRef.current = canvas
    }
    return canvasRef.current
  }

  const sendFrameOnce = async () => {
    const video = videoRef.current
    if (!video || video.readyState !== 4) return

    const canvas = ensureCanvas()
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85)
      })
      if (blob) await sendBlob(blob)
    } catch {}
  }

  const startSending = useCallback(async () => {
    if (running) return

    const lectureId = getLectureId()
    if (!lectureId) {
      setLocalError('Не выбрана лекция')
      setStatus('error')
      return
    }

    // Open camera if not yet
    if (!activeDeviceId && devices.length > 0) {
      try {
        await openDevice(devices[0].deviceId)
      } catch {
        setLocalError('Не удалось открыть камеру')
        return
      }
    } else if (!activeDeviceId) {
      setLocalError('Нет доступных камер')
      return
    }

    const socket = openSocketForLecture(lectureId)
    if (!socket) {
      setLocalError('Не удалось подключиться к серверу')
      return
    }

    // Wait for WebSocket to connect
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 2000)
      if (socket.readyState === WebSocket.OPEN) {
        clearTimeout(timeout)
        resolve()
      } else {
        socket.addEventListener('open', () => { clearTimeout(timeout); resolve() }, { once: true })
      }
    })

    const tick = Math.max(1, Math.round(1000 / Math.max(1, fps)))
    intervalRef.current = window.setInterval(() => {
      sendFrameOnce()
    }, tick)

    setRunning(true)
    setStatus('sending')
    setLocalError('')
  }, [running, fps, activeDeviceId, devices])

  const stopSendingInternal = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setRunning(false)
    setStatus('idle')
  }

  // Expose imperative handle for parent control
  useImperativeHandle(ref, () => ({
    start: startSending,
    stop: () => { stopSendingInternal(); closeSocket() },
    isRunning: () => running,
  }), [startSending, running])

  const handleDeviceChange = async (deviceId: string) => {
    try {
      setActiveDeviceId(deviceId)
      await openDevice(deviceId)
      setLocalError('')
    } catch (err) {
      setLocalError(`Не удалось переключить камеру: ${err}`)
    }
  }

  const handleStartClick = async () => {
    setLocalError('')
    try {
      await startSending()
    } catch (err) {
      setLocalError(`Ошибка запуска: ${err}`)
    }
  }

  const handleStopClick = () => {
    stopSendingInternal()
    closeSocket()
    setLocalError('')
  }

  const handleRequestPermission = async () => {
    try {
      await ensurePermissionAndList()
      setLocalError('')
    } catch (err) {
      setLocalError(`Ошибка разрешения: ${err}`)
    }
  }

  const displayError = localError || cameraError

  return (
    <div style={{ padding: 8, borderRadius: 8, background: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: '#374151' }}>Камера браузера</div>
          <select
            value={activeDeviceId}
            onChange={(e) => handleDeviceChange(e.target.value)}
            disabled={running}
          >
            <option value="">-- по умолчанию --</option>
            {devices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Камера ${device.deviceId.substring(0, 8)}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#374151' }}>FPS</div>
          <input
            type="range"
            min={1}
            max={15}
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            disabled={running}
          />
          <div style={{ fontSize: 12 }}>{fps} fps</div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={handleRequestPermission} disabled={running}>
            Обновить камеры
          </button>
          {!running ? (
            <button className="btn" onClick={handleStartClick} disabled={!activeDeviceId}>
              Начать отправку
            </button>
          ) : (
            <button className="btn" onClick={handleStopClick}>
              Остановить
            </button>
          )}
        </div>
      </div>

      {/* Hidden video element for camera capture */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: 0, height: 0, position: 'absolute', opacity: 0 }}
      />

      {displayError && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>
          {displayError}
        </div>
      )}

      <div style={{ marginTop: 4, fontSize: 11, color: '#9ca3af' }}>
        {running ? `Отправка ${fps} fps` : 'Ожидание'}
        {activeDeviceId ? ` • камера подключена` : ''}
        {wsRef.current?.readyState === WebSocket.OPEN ? ' • WS подключён' : ''}
      </div>
    </div>
  )
})

export default CameraSender
