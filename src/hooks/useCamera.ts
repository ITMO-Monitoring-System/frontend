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
        if (typeof window === 'undefined') {
          if (!mounted) return
          setDevices([])
          return
        }
        const md = (navigator && (navigator as any).mediaDevices) || null
        if (!md || typeof md.enumerateDevices !== 'function') {
          if (!mounted) return
          setDevices([])
          return
        }
        const list = await md.enumerateDevices()
        if (!mounted) return
        setDevices(list.filter((d: MediaDeviceInfo) => d.kind === 'videoinput'))
      } catch {
        if (!mounted) return
        setDevices([])
      }
    }

    refresh()

    const handle = () => refresh()
    try {
      const md = (navigator && (navigator as any).mediaDevices) || null
      if (md) {
        if (typeof md.addEventListener === 'function') {
          md.addEventListener('devicechange', handle)
        } else if ('ondevicechange' in md) {
          ;(md as any).ondevicechange = handle
        }
      }
    } catch {}

    return () => {
      mounted = false
      try {
        const md = (navigator && (navigator as any).mediaDevices) || null
        if (md) {
          if (typeof md.removeEventListener === 'function') {
            md.removeEventListener('devicechange', handle)
          } else if ('ondevicechange' in md) {
            try { ;(md as any).ondevicechange = null } catch {}
          }
        }
      } catch {}
    }
  }, [])

  const openDevice = async (deviceId?: string, constraintsExtra?: MediaTrackConstraints) => {
    if (typeof window === 'undefined') throw new Error('Not in browser')
    const md = (navigator && (navigator as any).mediaDevices) || null
    if (!md || typeof md.getUserMedia !== 'function') throw new Error('mediaDevices.getUserMedia not available')
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
    const s = await md.getUserMedia(constraints)
    streamRef.current = s
    setActiveDeviceId(deviceId ?? '')
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = s
        await videoRef.current.play()
      } catch {}
    }
    return s
  }

  const closeStream = async () => {
    const s = streamRef.current
    if (!s) return
    try {
      s.getTracks().forEach(t => {
        try { t.stop() } catch {}
      })
    } catch {}
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
