import { useCallback, useEffect, useRef, useState } from 'react'

export const FULL_HD_WIDTH = 1920
export const FULL_HD_HEIGHT = 1080

export type CameraMode = {
  width: number
  height: number
  frameRate?: number
  resizeMode: string
}

type NativeCameraConstraints = MediaTrackConstraints & {
  resizeMode: { exact: 'none' }
}

type NativeCameraSettings = MediaTrackSettings & {
  resizeMode?: string
}

const stopTracks = (stream: MediaStream) => stream.getTracks().forEach(track => track.stop())

function waitForVideoFrame(video: HTMLVideoElement, track: MediaStreamTrack): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('loadeddata', check)
      video.removeEventListener('resize', check)
      track.removeEventListener('ended', onEnded)
    }
    const check = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
        cleanup()
        resolve()
      }
    }
    const onEnded = () => {
      cleanup()
      reject(new Error('Камера отключилась до получения первого кадра'))
    }
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Камера не выдала видеокадр за 5 секунд'))
    }, 5000)

    video.addEventListener('loadeddata', check)
    video.addEventListener('resize', check)
    track.addEventListener('ended', onEnded)
    check()
  })
}

export default function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const verifiedStreamRef = useRef<MediaStream | null>(null)
  const getCurrentStream = useCallback(() => verifiedStreamRef.current, [])
  const openedDeviceIdRef = useRef('')
  const openRequestRef = useRef(0)
  const openingRef = useRef<{ deviceId: string; promise: Promise<MediaStream> } | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string>('')
  const [cameraMode, setCameraMode] = useState<CameraMode | null>(null)
  const [error, setError] = useState<string>('')

  const closeStream = useCallback((resetDevice = true) => {
    openRequestRef.current += 1
    openingRef.current = null
    if (streamRef.current) {
      stopTracks(streamRef.current)
      streamRef.current = null
    }
    verifiedStreamRef.current = null
    openedDeviceIdRef.current = ''
    setCameraMode(null)

    if (videoRef.current) videoRef.current.srcObject = null
    if (resetDevice) setActiveDeviceId('')
  }, [])

  const openDevice = useCallback((deviceId?: string): Promise<MediaStream> => {
    const requestedDeviceId = deviceId ?? ''
    const verifiedStream = verifiedStreamRef.current
    const verifiedTrack = verifiedStream?.getVideoTracks()[0]
    const verifiedSettings = verifiedTrack?.getSettings() as NativeCameraSettings | undefined
    const currentVideo = videoRef.current
    if (
      verifiedStream?.active && openedDeviceIdRef.current === requestedDeviceId &&
      verifiedSettings?.width === FULL_HD_WIDTH && verifiedSettings.height === FULL_HD_HEIGHT &&
      verifiedSettings.resizeMode === 'none' &&
      currentVideo?.srcObject === verifiedStream &&
      currentVideo.videoWidth === FULL_HD_WIDTH && currentVideo.videoHeight === FULL_HD_HEIGHT
    ) {
      return Promise.resolve(verifiedStream)
    }
    if (openingRef.current?.deviceId === requestedDeviceId) {
      return openingRef.current.promise
    }

    const promise = (async () => {
      let stream: MediaStream | null = null
      let requestId = 0
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Браузер не предоставляет доступ к камере')
        }
        const supported = navigator.mediaDevices.getSupportedConstraints() as MediaTrackSupportedConstraints & {
          resizeMode?: boolean
        }
        if (!supported.width || !supported.height || !supported.resizeMode) {
          throw new Error('Браузер не поддерживает проверку нативного режима Full HD')
        }

        closeStream(false)
        requestId = openRequestRef.current
        const videoConstraints: NativeCameraConstraints = {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { exact: FULL_HD_WIDTH },
          height: { exact: FULL_HD_HEIGHT },
          resizeMode: { exact: 'none' },
          facingMode: 'user',
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false })
        if (requestId !== openRequestRef.current) {
          throw new Error('Открытие камеры отменено')
        }

        const track = stream.getVideoTracks()[0]
        const video = videoRef.current
        if (!track || !video) throw new Error('Не удалось получить видеопоток камеры')

        streamRef.current = stream
        openedDeviceIdRef.current = requestedDeviceId
        video.srcObject = stream
        const firstFrame = waitForVideoFrame(video, track)
        await Promise.all([video.play(), firstFrame])
        if (requestId !== openRequestRef.current) {
          throw new Error('Открытие камеры отменено')
        }

        const settings = track.getSettings() as NativeCameraSettings
        if (
          settings.width !== FULL_HD_WIDTH || settings.height !== FULL_HD_HEIGHT ||
          settings.resizeMode !== 'none' ||
          video.videoWidth !== FULL_HD_WIDTH || video.videoHeight !== FULL_HD_HEIGHT
        ) {
          throw new Error(
            `Камера не выдала Full HD без масштабирования: поток ${settings.width ?? '?'}×${settings.height ?? '?'}, ` +
            `видео ${video.videoWidth}×${video.videoHeight}, resizeMode ${settings.resizeMode ?? '?'}`,
          )
        }

        const mode: CameraMode = {
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
          resizeMode: settings.resizeMode,
        }
        verifiedStreamRef.current = stream
        setCameraMode(mode)
        setError('')
        return stream
      } catch (err) {
        if (stream) stopTracks(stream)
        if (stream && streamRef.current === stream) {
          streamRef.current = null
          verifiedStreamRef.current = null
          openedDeviceIdRef.current = ''
          if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null
        }
        const publicError = err instanceof Error && err.name === 'OverconstrainedError'
          ? new Error('Выбранная камера не поддерживает 1920×1080 без масштабирования')
          : err
        if (requestId === 0 || requestId === openRequestRef.current) {
          const detail = publicError instanceof Error ? publicError.message : String(publicError)
          setCameraMode(null)
          setError(detail)
        }
        throw publicError
      }
    })()

    openingRef.current = { deviceId: requestedDeviceId, promise }
    const clearOpening = () => {
      if (openingRef.current?.promise === promise) openingRef.current = null
    }
    promise.then(clearOpening, clearOpening)
    return promise
  }, [closeStream])

  const ensurePermissionAndList = async () => {
    try {
      if (!navigator.mediaDevices) throw new Error('Media devices not available')
      const initialDevices = await navigator.mediaDevices.enumerateDevices()
      const hasLabels = initialDevices.some(device => device.kind === 'videoinput' && device.label)
      if (!hasLabels) {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        stopTracks(tempStream)
      }
      const updatedDevices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = updatedDevices.filter(device => device.kind === 'videoinput')
      setDevices(videoDevices)
      setActiveDeviceId(current =>
        videoDevices.some(device => device.deviceId === current) ? current : (videoDevices[0]?.deviceId ?? ''),
      )
      return videoDevices
    } catch (err) {
      setError(`Требуется разрешение на использование камеры: ${err}`)
      throw err
    }
  }

  // Получаем список устройств и разрешение, затем открываем выбранную камеру.
  useEffect(() => {
    let mounted = true
    const refreshDevices = async () => {
      try {
        if (!navigator.mediaDevices) {
          if (mounted) setDevices([])
          return
        }
        const deviceList = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = deviceList.filter(device => device.kind === 'videoinput')
        if (!mounted) return
        setDevices(videoDevices)
        if (!videoDevices.some(device => device.label)) {
          await ensurePermissionAndList()
        } else {
          setActiveDeviceId(current =>
            videoDevices.some(device => device.deviceId === current) ? current : videoDevices[0].deviceId,
          )
        }
      } catch (err) {
        console.error('Error enumerating devices:', err)
        if (mounted) setDevices([])
      }
    }
    const handleDeviceChange = () => { void refreshDevices() }
    void refreshDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange)
    return () => {
      mounted = false
      closeStream()
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange)
    }
  }, [closeStream])

  useEffect(() => {
    if (!activeDeviceId) return
    openDevice(activeDeviceId).catch(err => {
      if (err instanceof Error && err.message === 'Открытие камеры отменено') return
      console.error('Failed to open device:', err)
    })
  }, [activeDeviceId, openDevice])

  return {
    videoRef,
    devices,
    activeDeviceId,
    setActiveDeviceId,
    cameraMode,
    openDevice,
    closeStream,
    ensurePermissionAndList,
    error,
    getCurrentStream,
  }
}
