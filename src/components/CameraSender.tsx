import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import useCamera, { FULL_HD_HEIGHT, FULL_HD_WIDTH } from '../hooks/useCamera'
import { CameraStream, isCameraStreamCancelled } from '../services/cameraStream'
import type { CameraStreamState } from '../services/cameraStream'

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
  onServerEvent?: (event: Record<string, unknown>) => void
  onLocalDetections?: (faces: [number, number, number, number][], frameWh: [number, number]) => void
  onStream?: (stream: MediaStream | null) => void
  onStateChange?: (state: CameraStreamState) => void
  active?: boolean
  showControls?: boolean
  disabled?: boolean
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
  onStateChange,
  active,
  showControls = true,
  disabled = false,
}, ref) {
  const {
    videoRef, devices, activeDeviceId, setActiveDeviceId, cameraMode,
    openDevice, closeStream, ensurePermissionAndList,
    error: cameraError, getCurrentStream,
  } = useCamera()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mountedRef = useRef(false)
  const [connectionState, setConnectionState] = useState<CameraStreamState>('idle')
  const [fps, setFps] = useState(initialFps)
  const [localError, setLocalError] = useState('')
  const running = connectionState === 'sending'
  const connecting = connectionState === 'connecting'

  const prepareCamera = useCallback(async () => {
    const deviceId = activeDeviceId || devices[0]?.deviceId
    if (!deviceId) throw new Error('Нет доступных камер')
    await openDevice(deviceId)
    setLocalError('')
  }, [activeDeviceId, devices, openDevice])

  const captureFrame = useCallback(async (socket: WebSocket, signal: AbortSignal) => {
    const video = videoRef.current
    if (!video || signal.aborted) return
    const stream = getCurrentStream()
    const track = stream?.getVideoTracks()[0]
    const settings = track?.getSettings() as
      (MediaTrackSettings & { resizeMode?: string }) | undefined
    if (
      !stream?.active || track?.readyState !== 'live' || video.srcObject !== stream ||
      settings?.width !== FULL_HD_WIDTH || settings.height !== FULL_HD_HEIGHT ||
      settings.resizeMode !== 'none' ||
      video.videoWidth !== FULL_HD_WIDTH || video.videoHeight !== FULL_HD_HEIGHT
    ) throw new Error('Поток камеры перестал выдавать Full HD 1920×1080 без масштабирования')
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 4_000_000) return

    const canvas = canvasRef.current ?? document.createElement('canvas')
    canvasRef.current = canvas
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Не удалось подготовить изображение камеры')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob || signal.aborted) return
    const bytes = await blob.arrayBuffer()
    // This socket belongs to this capture. Never send an old JPEG to a new lecture.
    if (!signal.aborted && socket.readyState === WebSocket.OPEN &&
        socket.bufferedAmount + bytes.byteLength <= 4_000_000) socket.send(bytes)
  }, [getCurrentStream, videoRef])

  const callbacksRef = useRef({
    prepareCamera, captureFrame, getLectureId, frameWsBase,
    onServerEvent, onLocalDetections, onStream, onStateChange,
  })
  callbacksRef.current = {
    prepareCamera, captureFrame, getLectureId, frameWsBase,
    onServerEvent, onLocalDetections, onStream, onStateChange,
  }

  const [controller] = useState(() => new CameraStream({
    prepare: () => callbacksRef.current.prepareCamera(),
    getUrl: () => {
      const lectureId = callbacksRef.current.getLectureId()
      if (!lectureId) throw new Error('Не выбрана лекция')
      const base = callbacksRef.current.frameWsBase.replace(/\/$/, '')
      return `${base}/ws/stream?lecture_id=${encodeURIComponent(String(lectureId))}`
    },
    capture: (socket, signal) => callbacksRef.current.captureFrame(socket, signal),
    onMessage: event => {
      if (typeof event.data !== 'string') return
      try {
        const parsed = JSON.parse(event.data)
        if (parsed?.type === 'faces' && Array.isArray(parsed.faces)) {
          const frameWh: [number, number] = Array.isArray(parsed.frame_wh) ? parsed.frame_wh : [0, 0]
          callbacksRef.current.onLocalDetections?.(parsed.faces, frameWh)
        } else if (parsed && typeof parsed === 'object') {
          callbacksRef.current.onServerEvent?.(parsed)
        }
      } catch { /* Ignore messages outside the camera protocol. */ }
    },
    onStateChange: state => {
      if (!mountedRef.current) return
      setConnectionState(state)
      if (state === 'sending') callbacksRef.current.onStream?.(getCurrentStream())
      callbacksRef.current.onStateChange?.(state)
    },
    onError: message => {
      if (mountedRef.current) setLocalError(message)
    },
  }))

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controller.stop()
      closeStream()
    }
  }, [controller, closeStream])

  useEffect(() => {
    callbacksRef.current.onStream?.(cameraMode ? getCurrentStream() : null)
    return () => callbacksRef.current.onStream?.(null)
  }, [cameraMode, getCurrentStream])

  useEffect(() => { controller.setFps(fps) }, [controller, fps])

  useEffect(() => {
    if (active === undefined) return
    if (active) void controller.start().catch(() => { /* Controller reports connection errors. */ })
    else controller.stop()
  }, [active, controller])

  useImperativeHandle(ref, () => ({
    prepare: prepareCamera,
    start: () => { setLocalError(''); return controller.start() },
    stop: () => controller.stop(),
    isRunning: () => controller.isRunning(),
  }), [controller, prepareCamera])

  const handleDeviceChange = (deviceId: string) => {
    if (deviceId) setActiveDeviceId(deviceId)
    else closeStream()
    setLocalError('')
  }

  const handleStartClick = async () => {
    setLocalError('')
    try { await controller.start() } catch (error) {
      if (!isCameraStreamCancelled(error)) setLocalError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleStopClick = () => { controller.stop(); setLocalError('') }

  const handleRequestPermission = async () => {
    try {
      const available = await ensurePermissionAndList()
      const deviceId = available.find(device => device.deviceId === activeDeviceId)?.deviceId || available[0]?.deviceId
      if (deviceId) await openDevice(deviceId)
      setLocalError('')
    } catch (error) {
      setLocalError(`Ошибка камеры: ${error instanceof Error ? error.message : String(error)}`)
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
            disabled={running || connecting || disabled}
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
            disabled={connecting || disabled}
          />
          <div style={{ fontSize: 12 }}>{fps} fps</div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={handleRequestPermission} disabled={running || connecting || disabled}>
            Обновить камеры
          </button>
          {showControls && (!running ? (
            <button className="btn" onClick={handleStartClick} disabled={!activeDeviceId || connecting || disabled}>
              {connecting ? 'Подключение…' : 'Начать отправку'}
            </button>
          ) : (
            <button className="btn" onClick={handleStopClick}>
              Остановить
            </button>
          ))}
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
        {running ? `Отправка ${fps} fps` : connecting ? 'Подключение…' : 'Ожидание'}
        {cameraMode ? ' • камера готова' : ''}
        {running ? ' • WS подключён' : ''}
      </div>
    </div>
  )
})

export default CameraSender
