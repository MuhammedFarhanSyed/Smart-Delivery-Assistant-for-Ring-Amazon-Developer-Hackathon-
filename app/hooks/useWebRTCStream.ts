'use client'

import { useState, useRef, useCallback, RefObject } from 'react'

export type DemoSceneState = 'expected' | 'delivered' | 'approaching' | 'removed' | null

interface UseWebRTCStreamOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  deviceId?: string
  sourceMode?: 'ring' | 'simulator'
}

interface UseWebRTCStreamReturn {
  streamActive: boolean
  streamEnded: boolean
  streamError: string | null
  streamType: 'whep' | 'webcam' | 'synthetic' | 'upload' | null
  isVideoPaused: boolean
  startStream: () => Promise<void>
  stopStream: () => Promise<void>
  restartStream: () => Promise<void>
  loadVideoFile: (file: File) => void
  toggleVideoPlay: () => void
  startDemoStream: () => void
  setDemoSceneState: (scene: DemoSceneState) => void
  captureCurrentFrame: (sceneOverride?: DemoSceneState) => string
}

/**
 * Manages video stream connection.
 * - In 'ring' mode: WHEP SDP negotiation to Ring camera stream with graceful end/restart handling.
 * - In 'simulator' mode: User webcam, video file upload (loopable), with synthetic porch fallback.
 */
export function useWebRTCStream({
  videoRef,
  deviceId,
  sourceMode = 'simulator',
}: UseWebRTCStreamOptions): UseWebRTCStreamReturn {
  const [streamActive, setStreamActive] = useState(false)
  const [streamEnded, setStreamEnded] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [streamType, setStreamType] = useState<'whep' | 'webcam' | 'synthetic' | 'upload' | null>(null)
  const [isVideoPaused, setIsVideoPaused] = useState(false)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const sessionUrlRef = useRef<string | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const syntheticAnimRef = useRef<number | null>(null)
  const uploadedObjectUrlRef = useRef<string | null>(null)
  const currentDemoSceneRef = useRef<DemoSceneState>(null)

  // Render a visual porch frame matching the delivery story
  const renderPorchFrame = useCallback((ctx: CanvasRenderingContext2D, scene: DemoSceneState) => {
    // Porch wall background
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, 640, 360)

    // Floor / Porch decking
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 240, 640, 120)

    // Wood floor planks lines
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 1
    for (let y = 255; y < 360; y += 20) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(640, y)
      ctx.stroke()
    }

    // Door frame & door
    ctx.fillStyle = '#334155'
    ctx.fillRect(220, 60, 200, 250)
    ctx.fillStyle = '#1e1b4b'
    ctx.fillRect(235, 75, 170, 235)

    // Door knob
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath()
    ctx.arc(385, 200, 7, 0, Math.PI * 2)
    ctx.fill()

    // Planter Pot
    ctx.fillStyle = '#78350f'
    ctx.beginPath()
    ctx.moveTo(130, 250)
    ctx.lineTo(185, 250)
    ctx.lineTo(175, 320)
    ctx.lineTo(140, 320)
    ctx.closePath()
    ctx.fill()

    // Green Foliage / Leaves
    ctx.fillStyle = '#15803d'
    ctx.beginPath()
    ctx.arc(155, 225, 28, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#16a34a'
    ctx.beginPath()
    ctx.arc(140, 235, 18, 0, Math.PI * 2)
    ctx.arc(170, 235, 20, 0, Math.PI * 2)
    ctx.fill()

    // Drop zone boundary overlay
    ctx.strokeStyle = scene === 'delivered' ? '#10B981' : scene === 'approaching' ? '#F59E0B' : '#06B6D4'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.strokeRect(130, 220, 220, 120)
    ctx.setLineDash([])

    // Package in Drop Zone (Present during delivered and approaching)
    if (scene === 'delivered' || scene === 'approaching') {
      // Cardboard box base
      ctx.fillStyle = '#b45309'
      ctx.fillRect(200, 260, 75, 60)
      // Top flap perspective
      ctx.fillStyle = '#d97706'
      ctx.beginPath()
      ctx.moveTo(200, 260)
      ctx.lineTo(220, 245)
      ctx.lineTo(295, 245)
      ctx.lineTo(275, 260)
      ctx.closePath()
      ctx.fill()
      // Side flap perspective
      ctx.fillStyle = '#92400e'
      ctx.beginPath()
      ctx.moveTo(275, 260)
      ctx.lineTo(295, 245)
      ctx.lineTo(295, 305)
      ctx.lineTo(275, 320)
      ctx.closePath()
      ctx.fill()
      // Amazon blue tape stripe
      ctx.fillStyle = '#0284c7'
      ctx.fillRect(235, 260, 8, 60)
      // White shipping label
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(210, 275, 18, 22)
    }

    // Person Approaching in scene
    if (scene === 'approaching') {
      // Approaching person figure
      ctx.fillStyle = '#ec4899'
      ctx.beginPath()
      ctx.arc(420, 160, 18, 0, Math.PI * 2) // head
      ctx.fill()
      ctx.fillRect(405, 180, 30, 80) // torso
      // Bounding box labeled person
      ctx.strokeStyle = '#ec4899'
      ctx.lineWidth = 2
      ctx.strokeRect(390, 135, 60, 150)
      ctx.fillStyle = '#ec4899'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText('person (94%)', 390, 130)
    }

    // Watermark Header
    ctx.fillStyle = '#38bdf8'
    ctx.font = '12px monospace'
    ctx.fillText(`FRONT PORCH CAMERA • ${new Date().toLocaleTimeString()}`, 15, 25)

    ctx.fillStyle = '#94a3b8'
    ctx.font = '11px sans-serif'
    ctx.fillText('Drop Zone: Beside front door planter', 15, 45)
  }, [])

  const stopStream = useCallback(async () => {
    if (syntheticAnimRef.current) {
      cancelAnimationFrame(syntheticAnimRef.current)
      syntheticAnimRef.current = null
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    if (uploadedObjectUrlRef.current) {
      URL.revokeObjectURL(uploadedObjectUrlRef.current)
      uploadedObjectUrlRef.current = null
    }

    pcRef.current?.close()
    pcRef.current = null

    if (sessionUrlRef.current) {
      await fetch('/api/ring/stream', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionUrl: sessionUrlRef.current }),
      }).catch(() => {})
      sessionUrlRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
      videoRef.current.src = ''
    }

    setStreamActive(false)
    setStreamEnded(false)
    setStreamType(null)
    setStreamError(null)
    setIsVideoPaused(false)
  }, [videoRef])

  // Launch the animated porch stream
  const startSyntheticStream = useCallback((initialScene: DemoSceneState = 'expected') => {
    currentDemoSceneRef.current = initialScene
    const synthCanvas = document.createElement('canvas')
    synthCanvas.width = 640
    synthCanvas.height = 360
    const ctx = synthCanvas.getContext('2d')
    if (!ctx) return

    const loop = () => {
      renderPorchFrame(ctx, currentDemoSceneRef.current)
      syntheticAnimRef.current = requestAnimationFrame(loop)
    }
    loop()

    const synthStream = synthCanvas.captureStream(20)
    mediaStreamRef.current = synthStream
    if (videoRef.current) {
      videoRef.current.srcObject = synthStream
      videoRef.current.play().catch(() => {})
      setStreamType('synthetic')
      setStreamActive(true)
      setStreamEnded(false)
    }
  }, [videoRef, renderPorchFrame])

  const setDemoSceneState = useCallback((scene: DemoSceneState) => {
    currentDemoSceneRef.current = scene
  }, [])

  const startDemoStream = useCallback(() => {
    stopStream().then(() => {
      startSyntheticStream('expected')
    })
  }, [stopStream, startSyntheticStream])

  // Capture clean snapshot from video or synthetic porch
  const captureCurrentFrame = useCallback((sceneOverride?: DemoSceneState): string => {
    try {
      const snapCanvas = document.createElement('canvas')
      snapCanvas.width = 640
      snapCanvas.height = 360
      const ctx = snapCanvas.getContext('2d')
      if (!ctx) return ''

      const video = videoRef.current
      if (video && video.videoWidth > 0 && video.readyState >= 2 && !video.paused && !sceneOverride) {
        ctx.drawImage(video, 0, 0, 640, 360)
      } else {
        renderPorchFrame(ctx, sceneOverride || currentDemoSceneRef.current || 'delivered')
      }
      return snapCanvas.toDataURL('image/jpeg', 0.88)
    } catch (e) {
      console.warn('Capture frame error:', e)
      return ''
    }
  }, [videoRef, renderPorchFrame])

  const startStream = useCallback(async () => {
    await stopStream()
    setStreamError(null)
    setStreamEnded(false)

    // SIMULATOR MODE
    if (sourceMode === 'simulator') {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: false,
            })
            mediaStreamRef.current = stream
            if (videoRef.current) {
              videoRef.current.srcObject = stream
              videoRef.current.play().catch(() => {})
              setStreamType('webcam')
              setStreamActive(true)
              return
            }
          } catch {
            // fallback to synthetic
          }
        }
        startSyntheticStream('expected')
      } catch (err: any) {
        setStreamError(err.message || 'Failed to start simulator camera')
        setStreamActive(false)
      }
      return
    }

    // RING MODE (WHEP WebRTC)
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      })
      pcRef.current = pc

      pc.addTransceiver('audio', { direction: 'sendrecv' })
      pc.addTransceiver('video', { direction: 'recvonly' })

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          setStreamEnded(true)
          setStreamActive(false)
        }
      }

      pc.ontrack = (e) => {
        if (videoRef.current && e.streams[0]) {
          videoRef.current.srcObject = e.streams[0]
          setStreamType('whep')
          setStreamActive(true)
          setStreamEnded(false)

          e.streams[0].getTracks().forEach((track) => {
            track.onended = () => {
              setStreamEnded(true)
              setStreamActive(false)
            }
          })
        }
      }

      const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
      await pc.setLocalDescription(offer)

      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve()
        const timeout = setTimeout(() => resolve(), 3000)
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout)
            resolve()
          }
        }
      })

      const res = await fetch('/api/ring/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdpOffer: pc.localDescription!.sdp, deviceId }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Ring WHEP stream start failed')
      }

      const { sdpAnswer, sessionUrl } = await res.json()
      sessionUrlRef.current = sessionUrl
      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stream failed'
      setStreamError(message)
      setStreamActive(false)
    }
  }, [videoRef, deviceId, sourceMode, stopStream, startSyntheticStream])

  const restartStream = useCallback(async () => {
    await stopStream()
    await startStream()
  }, [stopStream, startStream])

  // Video File Upload Support (Simulator Mode)
  const loadVideoFile = useCallback((file: File) => {
    stopStream()
    if (!videoRef.current) return
    const url = URL.createObjectURL(file)
    uploadedObjectUrlRef.current = url
    videoRef.current.srcObject = null
    videoRef.current.src = url
    videoRef.current.loop = true
    videoRef.current.play().catch(() => {})
    setStreamType('upload')
    setStreamActive(true)
    setStreamEnded(false)
    setIsVideoPaused(false)
  }, [videoRef, stopStream])

  const toggleVideoPlay = useCallback(() => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play()
      setIsVideoPaused(false)
    } else {
      videoRef.current.pause()
      setIsVideoPaused(true)
    }
  }, [videoRef])

  return {
    streamActive,
    streamEnded,
    streamError,
    streamType,
    isVideoPaused,
    startStream,
    stopStream,
    restartStream,
    loadVideoFile,
    toggleVideoPlay,
    startDemoStream,
    setDemoSceneState,
    captureCurrentFrame,
  }
}
