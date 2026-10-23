'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useVideoProcessing } from '@/lib/video-processors/useVideoProcessing'
import '@/lib/video-processors'
import { packageWatchProcessor } from '@/lib/video-processors/package-watch-processor'

import { Header } from './components/Header'
import { EventPanel } from './components/EventPanel'
import { ProcessorPanel } from './components/ProcessorPanel'
import { DeliveryTimeline } from './components/delivery/DeliveryTimeline'
import { InstructionsCard } from './components/delivery/InstructionsCard'
import { CourierDialog } from './components/delivery/CourierDialog'
import { RingDataPanel } from './components/delivery/RingDataPanel'
import { DropZoneControls } from './components/delivery/DropZoneControls'
import { AlertBanner } from './components/delivery/AlertBanner'
import { SnapshotGallery } from './components/delivery/SnapshotGallery'

import { useWebRTCStream } from './hooks/useWebRTCStream'
import { useEventStream } from './hooks/useEventStream'
import { useCanvasOverlay } from './hooks/useCanvasOverlay'
import { DeliverySession, PackageStatus } from '@/lib/store'
import { SourceMode } from '@/lib/source/types'
import { playDoorbellChime } from '@/lib/sound'

export default function Dashboard() {
  const [sourceMode, setSourceMode] = useState<SourceMode>('simulator')
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [bedrockActive, setBedrockActive] = useState(false)

  // Delivery Assistant State
  const [session, setSession] = useState<DeliverySession | null>(null)
  const sessionRef = useRef<DeliverySession | null>(null)
  const [isProcessingTranscript, setIsProcessingTranscript] = useState(false)
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoStepMessage, setDemoStepMessage] = useState<string | null>(null)

  // Verification timer reference
  const pendingVerificationRef = useRef<{
    location: string
    timerId: NodeJS.Timeout
  } | null>(null)

  // Technical Diagnostics State
  const [watchDiff, setWatchDiff] = useState(0)
  const [isCalibrated, setIsCalibrated] = useState(true)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    return () => {
      if (pendingVerificationRef.current) {
        clearTimeout(pendingVerificationRef.current.timerId)
      }
    }
  }, [])

  // 1. Fetch source mode configuration on mount
  useEffect(() => {
    fetch('/api/source/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.mode) {
          setSourceMode(data.mode)
          packageWatchProcessor.setMode(data.mode)
        }
        if (data.deviceId) setDeviceId(data.deviceId)
        if (typeof data.bedrockEnabled === 'boolean') setBedrockActive(data.bedrockEnabled)
      })
      .catch((err) => console.error('Config fetch error:', err))
      .finally(() => setLoading(false))
  }, [])

  // 2. Fetch active delivery session
  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/delivery/session')
      if (res.ok) {
        const data = await res.json()
        setSession(data.session)
      }
    } catch (e) {
      console.error('Failed to load session:', e)
    }
  }, [])

  useEffect(() => {
    refreshSession()
  }, [refreshSession])

  // 3. Connect package watch processor callbacks
  useEffect(() => {
    packageWatchProcessor.setCallbacks(
      async (newStatus, snapshot) => {
        try {
          const res = await fetch('/api/delivery/session', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              packageStatus: newStatus,
              latestSnapshot: snapshot,
              snapshotLabel: `Package ${newStatus}`,
            }),
          })
          if (res.ok) {
            const data = await res.json()
            setSession(data.session)
          }

          // If delivery verification is pending and status is now Delivered:
          if (newStatus === 'Delivered' && pendingVerificationRef.current) {
            const loc = pendingVerificationRef.current.location
            clearTimeout(pendingVerificationRef.current.timerId)
            pendingVerificationRef.current = null
            await fetch('/api/delivery/session', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                alert: {
                  message: `Package confirmed in the watched area. Courier said: ${loc}.`,
                  level: 'info',
                },
              }),
            })
            await refreshSession()
          }
        } catch (e) {
          console.error('Failed to update package status:', e)
        }
      },
      async (alertMsg) => {
        try {
          const res = await fetch('/api/delivery/session', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              alert: { message: alertMsg, level: 'risk' },
            }),
          })
          if (res.ok) {
            const data = await res.json()
            setSession(data.session)
          }
        } catch (e) {
          console.error('Failed to register alert:', e)
        }
      }
    )
  }, [refreshSession])

  // 4. Custom video & event stream hooks
  const {
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
  } = useWebRTCStream({
    videoRef,
    deviceId,
    sourceMode,
  })

  const { events, connected } = useEventStream({})
  const { processors, results, toggleProcessor, enabledCount } = useVideoProcessing({
    video: videoRef.current,
    canvas: canvasRef.current,
    enabled: streamActive,
    fps: 10,
  })

  // Synchronize package watch processor readings
  useEffect(() => {
    const pwResult = results.get('package-watch')
    if (pwResult?.data) {
      if (typeof pwResult.data.currentDiff === 'number') setWatchDiff(pwResult.data.currentDiff)
      if (typeof pwResult.data.isCalibrated === 'boolean') setIsCalibrated(pwResult.data.isCalibrated)
    }
  }, [results])

  // Canvas overlay rendering
  useCanvasOverlay({ videoRef, canvasRef, events, results })

  // 1. Delivery verification flow when action === 'left'
  const triggerVerificationFlow = useCallback(
    async (location: string, currentPackageStatus?: string) => {
      // Clear any prior timer
      if (pendingVerificationRef.current) {
        clearTimeout(pendingVerificationRef.current.timerId)
        pendingVerificationRef.current = null
      }

      // If package is already present/confirmed:
      const isAlreadyDelivered =
        currentPackageStatus === 'Delivered' || sessionRef.current?.packageStatus === 'Delivered'

      if (isAlreadyDelivered) {
        await fetch('/api/delivery/session', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alert: {
              message: `Package confirmed in the watched area. Courier said: ${location}.`,
              level: 'info',
            },
          }),
        })
        await refreshSession()
        return
      }

      // Otherwise, start ~20s countdown window
      const timerId = setTimeout(async () => {
        if (sessionRef.current?.packageStatus !== 'Delivered') {
          await fetch('/api/delivery/session', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              alert: {
                message: `Couldn't confirm the package. Courier said it was left ${location}. Please check.`,
                level: 'warning',
              },
            }),
          })
          await refreshSession()
        }
        pendingVerificationRef.current = null
      }, 20000)

      pendingVerificationRef.current = { location, timerId }
    },
    [refreshSession]
  )

  // Reset session
  const handleResetSession = async () => {
    if (pendingVerificationRef.current) {
      clearTimeout(pendingVerificationRef.current.timerId)
      pendingVerificationRef.current = null
    }
    try {
      const res = await fetch('/api/delivery/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      })
      if (res.ok) {
        const data = await res.json()
        setSession(data.session)
        packageWatchProcessor.resetState(sourceMode === 'ring' ? 'Delivered' : 'Expected')
      }
    } catch (e) {
      console.error('Reset error:', e)
    }
  }

  // Resident confirms receipt via "It's me" button
  const handleConfirmResident = async (alertId: string) => {
    try {
      const res = await fetch('/api/delivery/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageStatus: 'Picked up by resident',
          dismissAlertId: alertId,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSession(data.session)
      }
    } catch (e) {
      console.error('Confirm resident error:', e)
    }
  }

  // Dismiss alert
  const handleDismissAlert = async (alertId: string) => {
    try {
      const res = await fetch('/api/delivery/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dismissAlertId: alertId,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSession(data.session)
      }
    } catch (e) {
      console.error('Dismiss alert error:', e)
    }
  }

  // Simulate doorbell event
  const handleSimulateDoorbell = async () => {
    // Play realistic two-tone doorbell chime
    playDoorbellChime()

    try {
      const res = await fetch('/api/delivery/simulate-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'ding', deviceId }),
      })
      if (res.ok) {
        const data = await res.json()
        setSession(data.session)

        // Automatically trigger greeting TTS
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel()
          const msg = new SpeechSynthesisUtterance(
            'Hi! Please leave the package or tell me where you left it.'
          )
          window.speechSynthesis.speak(msg)
        }
      }
    } catch (e) {
      console.error('Doorbell simulation failed:', e)
    }
  }

  // Submit courier transcript for extraction
  const handleTranscriptReady = async (transcript: string) => {
    setIsProcessingTranscript(true)
    try {
      const res = await fetch('/api/delivery/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      })
      if (res.ok) {
        const data = await res.json()
        setSession(data.session)

        // Trigger delivery verification if courier said package was left
        if (data.instructions?.action === 'left') {
          triggerVerificationFlow(
            data.instructions.location || 'Front door',
            data.session?.packageStatus
          )
        }
      }
    } catch (e) {
      console.error('Extraction failed:', e)
    } finally {
      setIsProcessingTranscript(false)
    }
  }

  const handleGreetingSpoken = async (greeting: string) => {
    try {
      const res = await fetch('/api/delivery/session/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'greeting',
          title: 'Greeting spoken',
          description: `"${greeting}"`,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSession(data.session)
      }
    } catch (e) {
      console.error('Timeline error:', e)
    }
  }

  const handleResidentReply = async (text: string) => {
    try {
      const res = await fetch('/api/delivery/session/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'resident_reply',
          title: 'Resident spoke via TTS',
          description: `"${text}"`,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSession(data.session)
      }
    } catch (e) {
      console.error('Resident reply error:', e)
    }
  }

  // 5. RUN SCRIPTED DEMO SCENARIO (Visual story aligned with video)
  const runDemoScenario = async () => {
    if (demoRunning) return
    setDemoRunning(true)

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    try {
      // Step 0: Switch video to simulated package porch feed
      setDemoStepMessage('1/6: Initializing porch stream...')
      startDemoStream()
      setDemoSceneState('expected')
      await handleResetSession()
      await wait(1200)

      // Step 1: Doorbell event
      setDemoStepMessage('2/6: Doorbell chime received...')
      playDoorbellChime()
      await fetch('/api/delivery/simulate-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'ding', deviceId }),
      })
      await refreshSession()
      await wait(1500)

      // Step 2: Automated greeting
      setDemoStepMessage('3/6: Automated greeting spoken...')
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
        const greeting = new SpeechSynthesisUtterance('Hi! Please leave the package or tell me where you left it.')
        window.speechSynthesis.speak(greeting)
      }
      await fetch('/api/delivery/session/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'greeting',
          title: 'Greeting spoken',
          description: '"Hi! Please leave the package or tell me where you left it."',
        }),
      })
      await refreshSession()
      await wait(2200)

      // Step 3: Courier speaks canned reply & extraction
      setDemoStepMessage('4/7: Courier reply transcribed & instructions saved...')
      const cannedTranscript =
        'Hey there! I left your Amazon package tucked behind the planter by the front door out of the rain. No signature needed.'
      const extractRes = await fetch('/api/delivery/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: cannedTranscript }),
      })
      if (extractRes.ok) {
        const data = await extractRes.json()
        setSession(data.session)
      }

      // Step 4: Package status transitions to Delivered (box appears on porch)
      setDemoStepMessage('5/7: Drop zone confirms package -> Delivered...')
      setDemoSceneState('delivered')
      await wait(1200)
      const snapDelivered = captureCurrentFrame('delivered')
      const deliveredRes = await fetch('/api/delivery/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageStatus: 'Delivered',
          latestSnapshot: snapDelivered,
          snapshotLabel: 'Package Delivered Snapshot',
        }),
      })
      if (deliveredRes.ok) {
        const data = await deliveredRes.json()
        setSession(data.session)
      }

      // Step 4b: Delivery verification info event (scripted demo)
      await fetch('/api/delivery/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert: {
            message:
              'Package confirmed in the watched area. Courier said: behind the planter by the front door. (scripted demo)',
            level: 'info',
          },
        }),
      })
      await refreshSession()
      await wait(2000)

      // Step 5: Person approaches drop zone -> Proximity Alert
      setDemoStepMessage('6/7: Person approaches package -> Activity alert...')
      setDemoSceneState('approaching')
      const alertTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const alertRes = await fetch('/api/delivery/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert: {
            message: `Possible risk: a person approached the package at ${alertTime}. (scripted demo)`,
            level: 'risk',
          },
        }),
      })
      if (alertRes.ok) {
        const data = await alertRes.json()
        setSession(data.session)
      }
      await wait(2500)

      // Step 6: Drop zone difference detected -> Status Removed
      setDemoStepMessage('7/7: Package removed -> Status: Removed...')
      setDemoSceneState('removed')
      await wait(1000)
      const snapRemoved = captureCurrentFrame('removed')
      const removedRes = await fetch('/api/delivery/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageStatus: 'Removed',
          latestSnapshot: snapRemoved,
          snapshotLabel: 'Package Removed Snapshot',
        }),
      })
      if (removedRes.ok) {
        const data = await removedRes.json()
        setSession(data.session)
      }

      setDemoStepMessage('✓ Demo complete! Story recorded.')
      await wait(3000)
    } catch (err) {
      console.error('Demo error:', err)
      setDemoStepMessage('Demo encountered an issue.')
    } finally {
      setDemoRunning(false)
      setDemoStepMessage(null)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      loadVideoFile(file)
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-dash-bg">
        <p className="text-slate-400">Loading Smart Delivery Assistant...</p>
      </div>
    )
  }

  const isRingMode = sourceMode === 'ring'
  const packageStatus = session?.packageStatus || 'Expected'

  // Large Status Chip Colors
  const statusChipColor =
    packageStatus === 'Delivered'
      ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
      : packageStatus === 'Expected'
      ? 'bg-amber-950/90 text-amber-300 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
      : packageStatus === 'Picked up by resident'
      ? 'bg-teal-950/90 text-teal-300 border-teal-500 shadow-[0_0_15px_rgba(20,184,166,0.3)]'
      : 'bg-purple-950/90 text-purple-300 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'

  const statusChipLabel =
    packageStatus === 'Delivered'
      ? 'DELIVERED (Package present)'
      : packageStatus === 'Expected'
      ? 'EXPECTED (Awaiting package)'
      : packageStatus === 'Picked up by resident'
      ? 'PICKED UP BY RESIDENT'
      : 'REMOVED (Package taken)'

  return (
    <div className="min-h-screen flex flex-col bg-dash-bg text-slate-100 font-sans">
      <Header
        connected={connected}
        enabledCount={enabledCount}
        sourceMode={sourceMode}
        simpleMode={false}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col max-w-7xl w-full mx-auto p-4 space-y-4">
        {/* Top Control & Status Strip */}
        <div className="bg-dash-panel border border-slate-700/80 px-4 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 shadow-sm">
          {/* One-line status visible at all times */}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-200 font-medium">
              {isRingMode ? 'Connected to Ring Playground device: Online' : 'Simulator: Ready'}
            </span>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSimulateDoorbell}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg shadow transition flex items-center gap-1.5"
            >
              <span>🔔</span>
              <span>Simulate Doorbell</span>
            </button>

            <button
              onClick={runDemoScenario}
              disabled={demoRunning}
              className="px-3.5 py-1.5 bg-gradient-to-r from-dash-cyan via-teal-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-bold rounded-lg shadow transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>🎬</span>
              <span>{demoRunning ? 'Running Demo...' : 'Run Demo Scenario'}</span>
            </button>

            {demoStepMessage && (
              <span className="text-cyan-300 font-mono text-[11px] bg-slate-900/90 px-2.5 py-1 rounded border border-cyan-800 animate-pulse">
                {demoStepMessage}
              </span>
            )}

            <button
              onClick={handleResetSession}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-lg transition"
            >
              🔄 Reset
            </button>
          </div>
        </div>

        {/* Main 2-Column Section (50/50) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* LEFT COLUMN: Video with Status Chip & Key Cards */}
          <div className="space-y-3.5">
            {/* Video Box with Large Status Chip */}
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-lg">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

              {/* Large Status Chip (Top Left of Video) */}
              <div className="absolute top-3 left-3 z-10">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusChipColor}`}
                >
                  <span className="w-2 h-2 rounded-full bg-current animate-ping" />
                  <span>{statusChipLabel}</span>
                </span>
              </div>

              {/* Stream Status Overlay when not streaming */}
              {!streamActive && !streamEnded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/85 p-6 text-center">
                  <span className="text-4xl">📹</span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      {isRingMode ? 'Ring Playground Live Stream' : 'Porch Camera Feed'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      {isRingMode
                        ? 'Live low-latency stream via Ring Partner API (WHEP protocol).'
                        : 'Simulated doorstep camera or custom test footage.'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={startStream}
                      className="px-5 py-2.5 bg-dash-cyan text-black font-bold rounded-lg text-xs hover:bg-cyan-300 shadow transition"
                    >
                      ▶ Start Live Stream
                    </button>
                    {!isRingMode && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-semibold transition"
                      >
                        📁 Upload Video
                      </button>
                    )}
                  </div>
                  {streamError && <p className="text-red-400 text-xs mt-1">{streamError}</p>}
                </div>
              )}

              {/* Stream Ended Session Overlay */}
              {streamEnded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/90 p-6 text-center animate-fadeIn">
                  <span className="text-3xl">⏹️</span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      Stream Session Finished
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Ring Playground simulated stream reached session limit.
                    </p>
                  </div>
                  <button
                    onClick={restartStream}
                    className="px-5 py-2.5 bg-dash-cyan text-black font-bold rounded-lg text-xs hover:bg-cyan-300 shadow transition flex items-center gap-1.5"
                  >
                    <span>🔄</span>
                    <span>Restart Live Stream</span>
                  </button>
                </div>
              )}

              {/* Active Stream Corner Buttons */}
              {streamActive && (
                <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                  <span className="bg-red-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider animate-pulse shadow">
                    ● {streamType ? streamType.toUpperCase() : 'LIVE'}
                  </span>
                  {streamType === 'upload' && (
                    <button
                      onClick={toggleVideoPlay}
                      className="px-2 py-0.5 bg-slate-900/80 hover:bg-slate-800 text-white text-[10px] rounded border border-slate-700 transition"
                    >
                      {isVideoPaused ? '▶ Play' : '⏸ Pause'}
                    </button>
                  )}
                  <button
                    onClick={stopStream}
                    className="px-2 py-0.5 bg-slate-900/80 hover:bg-red-700 text-white text-[10px] rounded border border-slate-700 transition"
                  >
                    ■ Stop
                  </button>
                </div>
              )}
            </div>

            {/* Video Controls Bar */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                {!streamActive && (
                  <button
                    onClick={startStream}
                    className="px-3 py-1 bg-dash-cyan hover:bg-cyan-300 text-black font-semibold rounded text-xs transition"
                  >
                    ▶ Start Stream
                  </button>
                )}
                {streamActive && (
                  <button
                    onClick={stopStream}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
                  >
                    ■ Stop Stream
                  </button>
                )}
                {!isRingMode && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition flex items-center gap-1"
                    >
                      📁 Upload Test Clip
                    </button>
                  </>
                )}
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Drop Zone: Step & Door Area
              </span>
            </div>

            {/* Alert Card (ONLY renders when an alert exists) */}
            <AlertBanner
              alerts={session?.alerts || []}
              onConfirmResident={handleConfirmResident}
              onDismiss={handleDismissAlert}
            />

            {/* Instructions Card (Where, Action, Signature needed in plain words) */}
            <InstructionsCard
              instructions={session?.instructions}
              bedrockActive={bedrockActive}
            />

            {/* Snapshots Strip */}
            <SnapshotGallery
              snapshots={session?.snapshots || []}
              latestSnapshot={session?.latestSnapshot}
            />
          </div>

          {/* RIGHT COLUMN: 5-Step Timeline & Courier Conversation */}
          <div className="space-y-3.5">
            {/* 5-Step Delivery Timeline */}
            <div className="bg-dash-panel border border-slate-700/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3 border-b border-slate-700/80 pb-2">
                <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
                  <span>⏱️</span> Delivery Timeline
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  {session?.timeline.length || 0} events
                </span>
              </div>
              <DeliveryTimeline timeline={session?.timeline || []} />
            </div>

            {/* Courier Conversation Box */}
            <CourierDialog
              onTranscriptReady={handleTranscriptReady}
              onGreetingSpoken={handleGreetingSpoken}
              onResidentReply={handleResidentReply}
              loading={isProcessingTranscript}
            />
          </div>
        </div>

        {/* Collapsible Advanced Technical Diagnostics */}
        <details className="group bg-dash-panel border border-slate-700/80 rounded-xl overflow-hidden text-xs transition">
          <summary className="p-3.5 cursor-pointer font-semibold text-slate-300 flex items-center justify-between hover:text-white select-none">
            <span className="flex items-center gap-2">
              <span>⚙️</span>
              <span>Advanced Diagnostics & Ring API Controls</span>
            </span>
            <span className="text-slate-500 text-[11px] group-open:rotate-180 transition-transform">
              ▼
            </span>
          </summary>
          <div className="p-4 border-t border-slate-700/80 space-y-4 bg-slate-950/40">
            {/* Ring Partner API Data Panel */}
            {isRingMode && <RingDataPanel />}

            {/* Drop Zone Sensitivity Slider & Baseline Calibration */}
            <div className="bg-dash-panel border border-slate-700/80 rounded-xl p-3.5 space-y-2">
              <h4 className="text-xs font-bold text-slate-200">
                Drop Zone Calibration & Sensitivity
              </h4>
              <DropZoneControls
                currentDiff={watchDiff}
                isCalibrated={isCalibrated}
              />
            </div>

            {/* Raw Webhook Events & Processors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-dash-panel border border-slate-700/80 rounded-xl p-3">
                <h4 className="text-xs font-bold text-slate-200 mb-2">
                  Ring Webhooks Stream ({events.length})
                </h4>
                <EventPanel events={events} webhookUrl="http://localhost:3000/api/webhook" />
              </div>

              <div className="bg-dash-panel border border-slate-700/80 rounded-xl p-3">
                <h4 className="text-xs font-bold text-slate-200 mb-2">
                  Video Processor Plugins ({enabledCount} active)
                </h4>
                <ProcessorPanel
                  processors={processors}
                  results={results}
                  onToggle={toggleProcessor}
                />
              </div>
            </div>
          </div>
        </details>

        {/* Small Discreet Attribution Footer */}
        <footer className="text-center text-[10px] text-slate-500 pt-2 border-t border-slate-800/80">
          Video stream attribution (CC BY 4.0): "Thief stealing our package" by YouTube user{' '}
          <span className="text-slate-400">frollard</span>; "Birds on Feeders" by Vimeo user{' '}
          <span className="text-slate-400">Michael Black</span>.
        </footer>
      </div>
    </div>
  )
}
