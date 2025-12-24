import { useEffect, useRef, useState } from 'react'

export default function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string>('')
  const [error, setError] = useState<string>('')

  // Получение списка устройств
  useEffect(() => {
    let mounted = true
    
    const refreshDevices = async () => {
      try {
        if (typeof window === 'undefined' || !navigator.mediaDevices) {
          setDevices([])
          return
        }
        
        const deviceList = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = deviceList.filter(device => device.kind === 'videoinput')
        
        if (mounted) {
          setDevices(videoDevices)
          
          // Если устройств нет, запрашиваем разрешение
          if (videoDevices.length === 0) {
            await ensurePermissionAndList()
          } else if (videoDevices.length > 0 && !activeDeviceId) {
            // Автоматически выбираем первую камеру если нет выбранной
            setActiveDeviceId(videoDevices[0].deviceId)
          }
        }
      } catch (err) {
        console.error('Error enumerating devices:', err)
        if (mounted) setDevices([])
      }
    }

    const handleDeviceChange = () => {
      refreshDevices()
    }

    // Начальная загрузка устройств
    refreshDevices()

    // Слушатель изменения устройств
    if (navigator.mediaDevices && 'addEventListener' in navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    }

    return () => {
      mounted = false
      closeStream()
      
      if (navigator.mediaDevices && 'removeEventListener' in navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
      }
    }
  }, [])

  // Автоматическое открытие камеры при выборе устройства
  useEffect(() => {
    if (activeDeviceId && devices.length > 0) {
      openDevice(activeDeviceId).catch(err => {
        console.error('Failed to open device:', err)
        setError(`Не удалось открыть камеру: ${err.message}`)
      })
    }
  }, [activeDeviceId])

  // Запрос разрешения и получение списка устройств
  const ensurePermissionAndList = async () => {
    try {
      if (typeof window === 'undefined' || !navigator.mediaDevices) {
        throw new Error('Media devices not available')
      }

      // Сначала получаем список устройств без меток
      const initialDevices = await navigator.mediaDevices.enumerateDevices()
      const hasLabels = initialDevices.some(device => 
        device.kind === 'videoinput' && device.label
      )

      // Если нет меток, запрашиваем разрешение
      if (!hasLabels) {
        const tempStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        })
        
        // Немедленно останавливаем временный поток
        tempStream.getTracks().forEach(track => track.stop())
      }

      // Получаем обновленный список с метками
      const updatedDevices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = updatedDevices.filter(device => device.kind === 'videoinput')
      
      setDevices(videoDevices)
      setError('')
      
      if (videoDevices.length > 0 && !activeDeviceId) {
        setActiveDeviceId(videoDevices[0].deviceId)
      }
      
      return videoDevices
    } catch (err) {
      console.error('Permission error:', err)
      setError(`Требуется разрешение на использование камеры: ${err}`)
      throw err
    }
  }

  // Открытие конкретной камеры
  const openDevice = async (deviceId?: string, width = 640, height = 360) => {
    try {
      // Закрываем предыдущий поток
      closeStream()

      if (typeof window === 'undefined' || !navigator.mediaDevices) {
        throw new Error('Media devices not available')
      }

      const constraints: MediaStreamConstraints = {
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: width },
          height: { ideal: height },
          facingMode: 'user'
        },
        audio: false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      
      streamRef.current = stream
      
      // Устанавливаем поток в видео элемент
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(err => {
          console.error('Failed to play video:', err)
          setError(`Не удалось воспроизвести видео: ${err.message}`)
        })
      }

      // Обновляем выбранное устройство
      if (deviceId) {
        setActiveDeviceId(deviceId)
      }

      setError('')
      return stream
    } catch (err) {
      console.error('Error opening camera:', err)
      setError(`Ошибка открытия камеры: ${err}`)
      throw err
    }
  }

  // Закрытие потока
  const closeStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop()
      })
      streamRef.current = null
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    
    setActiveDeviceId('')
  }

  return {
    videoRef,
    devices,
    activeDeviceId,
    setActiveDeviceId,
    openDevice,
    closeStream,
    ensurePermissionAndList,
    error,
    getCurrentStream: () => streamRef.current
  }
}