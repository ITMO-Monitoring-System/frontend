import { useEffect, useRef, useState } from 'react'

export default function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string>('')

  useEffect(() => {
    let mounted = true
    const refresh = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices()
        if (!mounted) return
        setDevices(list.filter(d => d.kind === 'videoinput'))
      } catch {
        if (!mounted) return
        setDevices([])
      }
    }
    refresh()
    const onChange = () => refresh()
    navigator.mediaDevices.addEventListener?.('devicechange', onChange)
    return () => {
      mounted = false
      try { navigator.mediaDevices.removeEventListener?.('devicechange', onChange) } catch {}
    }
  }, [])

  const openDevice = async (deviceId?: string, constraintsExtra?: MediaTrackConstraints) => {
    await closeStream()
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 640 },
        height: { ideal: 360 },
        ...constraintsExtra,
      },
      audio: false,
    }
    const s = await navigator.mediaDevices.getUserMedia(constraints)
    streamRef.current = s
    setActiveDeviceId(deviceId ?? '')
    if (videoRef.current) {
      videoRef.current.srcObject = s
      try { await videoRef.current.play() } catch {}
    }
    return s
  }

  const closeStream = async () => {
    const s = streamRef.current
    if (!s) return
    s.getTracks().forEach(t => {
      try { t.stop() } catch {}
    })
    streamRef.current = null
    if (videoRef.current) {
      try { videoRef.current.pause() } catch {}
      try { videoRef.current.srcObject = null } catch {}
    }
  }

  return {
    videoRef,
    devices,
    activeDeviceId,
    openDevice,
    closeStream,
    streamRef,
    setActiveDeviceId,
  }
}
