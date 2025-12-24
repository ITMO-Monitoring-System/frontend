import { useEffect, useRef, useState } from 'react'
import useCamera from '../hooks/useCamera' // Путь к вашему хуку

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
  const {
    videoRef,
    devices,
    activeDeviceId,
    setActiveDeviceId,
    openDevice,
    closeStream,
    ensurePermissionAndList,
    error
  } = useCamera()

  const wsRef = useRef<WebSocket | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const intervalRef = useRef<number | null>(null)
  const [running, setRunning] = useState(false)
  const [fps, setFps] = useState(initialFps)
  const [status, setStatus] = useState<'idle' | 'connected' | 'sending' | 'error'>('idle')
  const bufferedThreshold = 4_000_000

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      stopSending()
      closeSocket()
      closeStream()
    }
  }, [])

  // Перезапуск отправки при изменении FPS
  useEffect(() => {
    if (running) {
      restartSending()
    }
  }, [fps])

  // Построение URL WebSocket
  const buildWsUrl = (lectureId: number) => {
    const q = `lecture_id=${encodeURIComponent(String(lectureId))}`
    const base = frameWsBase.replace(/\/$/, '')
    return `${base}/ws/stream?${q}`
  }

  // Открытие WebSocket соединения
  const openSocketForLecture = (lectureId: number) => {
    try {
      closeSocket()
      const url = buildWsUrl(lectureId)
      const socket = new WebSocket(url)
      
      socket.binaryType = 'arraybuffer'
      socket.onopen = () => {
        setStatus('connected')
        console.log('WebSocket connected')
      }
      socket.onclose = () => {
        setStatus('idle')
        wsRef.current = null
        console.log('WebSocket closed')
      }
      socket.onerror = (error) => {
        setStatus('error')
        console.error('WebSocket error:', error)
      }
      socket.onmessage = (event) => {
        console.log('WebSocket message received:', event.data)
      }
      
      wsRef.current = socket
      return socket
    } catch (err) {
      console.error('Failed to open WebSocket:', err)
      wsRef.current = null
      setStatus('error')
      return null
    }
  }

  // Закрытие WebSocket соединения
  const closeSocket = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch (err) {
        console.error('Error closing WebSocket:', err)
      }
      wsRef.current = null
      setStatus('idle')
    }
  }

  // Отправка кадра
  const sendBlob = async (blob: Blob) => {
    const socket = wsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    
    if (socket.bufferedAmount > bufferedThreshold) {
      console.warn('WebSocket buffer full, skipping frame')
      return
    }
    
    try {
      const arr = await blob.arrayBuffer()
      socket.send(arr)
    } catch (err) {
      console.error('Failed to send frame:', err)
    }
  }

  // Создание canvas для обработки видео
  const ensureCanvas = () => {
    if (!canvasRef.current) {
      const canvas = document.createElement('canvas')
      canvas.width = idealWidth
      canvas.height = idealHeight
      canvasRef.current = canvas
    }
    return canvasRef.current
  }

  // Отправка одного кадра
  const sendFrameOnce = async () => {
    const video = videoRef.current
    if (!video || video.readyState !== 4) return // Если видео не готово
    
    const canvas = ensureCanvas()
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.7)
      })
      
      if (blob) {
        await sendBlob(blob)
      }
    } catch (err) {
      console.error('Error capturing frame:', err)
    }
  }

  // Запуск отправки кадров
  const startSending = async () => {
    if (running) return
    
    const lectureId = getLectureId()
    if (!lectureId) {
      setStatus('error')
      setError('Не выбрана лекция')
      return
    }

    // Убедимся, что камера выбрана и открыта
    if (!activeDeviceId && devices.length > 0) {
      try {
        await openDevice(devices[0].deviceId)
      } catch (err) {
        setError('Не удалось открыть камеру')
        return
      }
    } else if (!activeDeviceId) {
      setError('Нет доступных камер')
      return
    }

    // Открываем WebSocket соединение
    const socket = openSocketForLecture(lectureId)
    if (!socket) {
      setError('Не удалось подключиться к серверу')
      return
    }

    // Ждем подключения WebSocket
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        resolve()
      }, 1000)
      
      const onOpen = () => {
        clearTimeout(timeout)
        resolve()
      }
      
      if (socket.readyState === WebSocket.OPEN) {
        onOpen()
      } else {
        socket.addEventListener('open', onOpen, { once: true })
      }
    })

    const tick = Math.max(1, Math.round(1000 / Math.max(1, fps)))
    intervalRef.current = window.setInterval(() => {
      const currentLectureId = getLectureId()
      if (!currentLectureId) return
      
      const currentUrl = wsRef.current?.url
      const wantedUrl = buildWsUrl(currentLectureId)
      
      if (currentUrl !== wantedUrl) {
        openSocketForLecture(currentLectureId)
      }
      
      sendFrameOnce()
    }, tick)
    
    setRunning(true)
    setStatus('sending')
  }

  // Остановка отправки
  const stopSending = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setRunning(false)
    setStatus('idle')
  }

  // Перезапуск отправки
  const restartSending = () => {
    stopSending()
    if (running) startSending()
  }

  // Обработчик выбора камеры
  const handleDeviceChange = async (deviceId: string) => {
    try {
      setActiveDeviceId(deviceId)
      await openDevice(deviceId)
    } catch (err) {
      console.error('Failed to switch camera:', err)
      setError(`Не удалось переключить камеру: ${err}`)
    }
  }

  // Обработчик кнопки начала отправки
  const handleStartClick = async () => {
    setError('')
    try {
      await startSending()
    } catch (err) {
      setError(`Ошибка запуска: ${err}`)
    }
  }

  // Обработчик кнопки остановки
  const handleStopClick = () => {
    stopSending()
    closeSocket()
    setError('')
  }

  // Кнопка для запроса разрешений
  const handleRequestPermission = async () => {
    try {
      await ensurePermissionAndList()
    } catch (err) {
      setError(`Ошибка разрешения: ${err}`)
    }
  }

  return (
    <div style={{ padding: 8, borderRadius: 8, background: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: '#374151' }}>Камера</div>
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
          <button
            className="btn"
            onClick={handleRequestPermission}
            disabled={running}
          >
            Обновить камеры
          </button>
          <button
            className="btn"
            onClick={handleStartClick}
            disabled={running || !activeDeviceId}
          >
            Начать отправку
          </button>
          <button
            className="btn"
            onClick={handleStopClick}
            disabled={!running}
          >
            Остановить
          </button>
        </div>
      </div>

      {/* Видео элемент */}
      <div style={{ marginTop: 12 }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: 320,
            height: 180,
            background: '#000',
            borderRadius: 8,
            display: activeDeviceId ? 'block' : 'none'
          }}
        />
        {!activeDeviceId && (
          <div style={{
            width: 320,
            height: 180,
            background: '#f3f4f6',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280'
          }}>
            Выберите камеру
          </div>
        )}
      </div>

      {/* Статус и ошибки */}
      <div style={{ marginTop: 8 }}>
        {error && (
          <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 4 }}>
            Ошибка: {error}
          </div>
        )}
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Статус WebSocket: {status} 
          {wsRef.current && ` (${wsRef.current.readyState === 1 ? 'OPEN' : 'CLOSED'})`}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Статус отправки: {running ? 'Активно' : 'Остановлено'}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Доступно камер: {devices.length}
        </div>
      </div>
    </div>
  )
}

function setError(_arg0: string) {
    throw new Error('Function not implemented.')
}
