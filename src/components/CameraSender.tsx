import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import useCamera, { FULL_HD_HEIGHT, FULL_HD_WIDTH } from '../hooks/useCamera'

export type CameraSenderHandle = {
  prepare: () => Promise<void>
  start: () => Promise<void>
  stop: () => void
  isRunning: () => boolean
}

type Props = {
  getLectureId: () => number | null
  frameWsBase?: string
  initialFps?: number
  /** Called when a JSON event is received from face-tracking (auto_publish, recognize_result, error) */
  onServerEvent?: (event: any) => void
  /** Called with normalized bbox-ы лиц от face-tracking (тип "faces"). Заменяет старый onAnnotatedFrame. */
  onLocalDetections?: (faces: [number, number, number, number][], frameWh: [number, number]) => void
  /** Called when the internal MediaStream attaches/detaches — для отображения live-видео в родителе. */
  onStream?: (stream: MediaStream | null) => void
  /** Whether the sender should be active (controlled mode) */
  active?: boolean
}

const DEFAULT_WS = (import.meta.env.VITE_WS_BASE?.trim() || (() => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/tracking`
})()).replace(/\/$/, '')

const CameraSender = forwardRef<CameraSenderHandle, Props>(function CameraSender({
  getLectureId,
  frameWsBase = DEFAULT_WS,
  initialFps = 5,
  onServerEvent,
  onLocalDetections,
  onStream,
  active,
}, ref) {
  const {
    videoRef,
    devices,
    activeDeviceId,
    setActiveDeviceId,
    cameraMode,
    openDevice,
    closeStream,
    ensurePermissionAndList,
    error: cameraError,
    getCurrentStream,
  } = useCamera()

  const wsRef = useRef<WebSocket | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const intervalRef = useRef<number | null>(null)
  const [running, setRunning] = useState(false)
  const [fps, setFps] = useState(initialFps)
  const [, setStatus] = useState<'idle' | 'connected' | 'sending' | 'error'>('idle')
  const [localError, setLocalError] = useState('')
  const bufferedThreshold = 4_000_000

  const onServerEventRef = useRef(onServerEvent)
  onServerEventRef.current = onServerEvent
  const onLocalDetectionsRef = useRef(onLocalDetections)
  onLocalDetectionsRef.current = onLocalDetections
  const onStreamRef = useRef(onStream)
  onStreamRef.current = onStream

  // Показываем родителю только поток, прошедший проверку Full HD.
  useEffect(() => {
    onStreamRef.current?.(cameraMode ? getCurrentStream() : null)
    return () => onStreamRef.current?.(null)
  }, [cameraMode, getCurrentStream])

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
        // Бинарные сообщения от сервера больше не приходят (annotated JPEG отключён).
        // Игнорируем на случай обратной совместимости со старой версией face-tracking.
        if (event.data instanceof ArrayBuffer) return

        if (typeof event.data === 'string') {
          try {
            const parsed = JSON.parse(event.data)
            if (parsed?.type === 'faces' && Array.isArray(parsed.faces)) {
              const fwh: [number, number] = Array.isArray(parsed.frame_wh) ? parsed.frame_wh : [0, 0]
              onLocalDetectionsRef.current?.(parsed.faces as [number, number, number, number][], fwh)
              return
            }
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

  const ensureCanvas = (width: number, height: number) => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    if (canvasRef.current.width !== width) canvasRef.current.width = width
    if (canvasRef.current.height !== height) canvasRef.current.height = height
    return canvasRef.current
  }

  const sendFrameOnce = async () => {
    const video = videoRef.current
    if (!video) return

    const stream = getCurrentStream()
    const track = stream?.getVideoTracks()[0]
    const settings = track?.getSettings() as (MediaTrackSettings & { resizeMode?: string }) | undefined
    if (
      !stream || video.srcObject !== stream ||
      settings?.width !== FULL_HD_WIDTH || settings.height !== FULL_HD_HEIGHT ||
      settings.resizeMode !== 'none' ||
      video.videoWidth !== FULL_HD_WIDTH || video.videoHeight !== FULL_HD_HEIGHT
    ) {
      stopSendingInternal()
      closeSocket()
      setLocalError('Поток камеры перестал выдавать Full HD 1920×1080 без масштабирования')
      return
    }
    if (video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) return

    const canvas = ensureCanvas(video.videoWidth, video.videoHeight)
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

  const prepareCamera = async () => {
    const deviceId = activeDeviceId || devices[0]?.deviceId
    if (!deviceId) {
      const message = 'Нет доступных камер'
      setLocalError(message)
      throw new Error(message)
    }
    try {
      await openDevice(deviceId)
      setLocalError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setLocalError(message)
      throw err
    }
  }

  const startSending = useCallback(async () => {
    if (running) return

    const lectureId = getLectureId()
    if (!lectureId) {
      const message = 'Не выбрана лекция'
      setLocalError(message)
      setStatus('error')
      throw new Error(message)
    }

    await prepareCamera()

    const socket = openSocketForLecture(lectureId)
    if (!socket) {
      const message = 'Не удалось подключиться к серверу'
      setLocalError(message)
      throw new Error(message)
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
    if (socket.readyState !== WebSocket.OPEN) {
      closeSocket()
      const message = 'Сервер не открыл видеопоток за 2 секунды'
      setLocalError(message)
      throw new Error(message)
    }

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
    prepare: prepareCamera,
    start: startSending,
    stop: () => { stopSendingInternal(); closeSocket() },
    isRunning: () => running,
  }), [prepareCamera, startSending, running])

  const handleDeviceChange = (deviceId: string) => {
    if (deviceId) setActiveDeviceId(deviceId)
    else closeStream()
    setLocalError('')
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
      const available = await ensurePermissionAndList()
      const deviceId = available.find(device => device.deviceId === activeDeviceId)?.deviceId || available[0]?.deviceId
      if (deviceId) await openDevice(deviceId)
      setLocalError('')
    } catch (err) {
      setLocalError(`Ошибка камеры: ${err}`)
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

      {cameraMode && (
        <div style={{ marginTop: 4, fontSize: 11, color: '#374151' }}>
          Поток камеры: {cameraMode.width}×{cameraMode.height}
          {cameraMode.frameRate ? ` • ${cameraMode.frameRate} fps` : ''}
          {' • без масштабирования браузером'}
        </div>
      )}

      <div style={{ marginTop: 4, fontSize: 11, color: '#9ca3af' }}>
        {running ? `Отправка ${fps} fps` : 'Ожидание'}
        {cameraMode ? ' • камера готова' : ''}
        {wsRef.current?.readyState === WebSocket.OPEN ? ' • WS подключён' : ''}
      </div>
    </div>
  )
})

export default CameraSender
