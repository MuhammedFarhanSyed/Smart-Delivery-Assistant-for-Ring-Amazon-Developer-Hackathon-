'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Header } from '../components/Header'

interface ChatMessage {
  id: string
  sender: 'assistant' | 'visitor'
  text: string
  timestamp: string
}

interface OwnerMessage {
  id: string
  text: string
  timestamp: string
}

interface OwnerEmergencyAlert {
  id: string
  text: string
  summary: string
  timestamp: string
}

export default function VisitorPage() {
  // Owner settings state (stored in localStorage)
  const [busyModeEnabled, setBusyModeEnabled] = useState(true)
  const [instructions, setInstructions] = useState(
    "I'm busy today, tell everyone I'm available after evening."
  )
  const [savedFeedback, setSavedFeedback] = useState(false)

  // Phone Mock State (stored in localStorage / component state)
  const [messages, setMessages] = useState<OwnerMessage[]>([])
  const [alerts, setAlerts] = useState<OwnerEmergencyAlert[]>([])

  // Visitor Doorbell & Conversation State
  const [ringCount, setRingCount] = useState(0)
  const [conversationActive, setConversationActive] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [liveCaption, setLiveCaption] = useState('')
  const [micError, setMicError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [aiEngine, setAiEngine] = useState<'bedrock' | 'fallback'>('fallback')
  const [notificationPermission, setNotificationPermission] = useState<string>('default')
  const [ownerAvailableNotice, setOwnerAvailableNotice] = useState<string | null>(null)

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // Load saved preferences from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedBusy = localStorage.getItem('ring_busy_mode_enabled')
      if (storedBusy !== null) {
        setBusyModeEnabled(storedBusy === 'true')
      }

      const storedInstructions = localStorage.getItem('ring_busy_mode_instructions')
      if (storedInstructions) {
        setInstructions(storedInstructions)
      }

      const storedMessages = localStorage.getItem('ring_owner_messages')
      if (storedMessages) {
        try {
          setMessages(JSON.parse(storedMessages))
        } catch {}
      }

      const storedAlerts = localStorage.getItem('ring_owner_alerts')
      if (storedAlerts) {
        try {
          setAlerts(JSON.parse(storedAlerts))
        } catch {}
      }

      if ('Notification' in window) {
        setNotificationPermission(Notification.permission)
      }
    }
  }, [])

  // Auto-scroll chat history to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatHistory])

  // Save instructions to localStorage
  const handleSaveInstructions = () => {
    localStorage.setItem('ring_busy_mode_instructions', instructions)
    localStorage.setItem('ring_busy_mode_enabled', String(busyModeEnabled))
    setSavedFeedback(true)
    setTimeout(() => setSavedFeedback(false), 2000)
  }

  // Toggle busy mode
  const handleToggleBusyMode = () => {
    const next = !busyModeEnabled
    setBusyModeEnabled(next)
    localStorage.setItem('ring_busy_mode_enabled', String(next))
    if (!next) {
      setConversationActive(false)
    }
  }

  // Speak assistant message aloud
  const speakText = useCallback(
    (text: string) => {
      if (isMuted || typeof window === 'undefined' || !window.speechSynthesis) return
      try {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 1.0
        utterance.pitch = 1.0
        window.speechSynthesis.speak(utterance)
      } catch (err) {
        console.warn('Speech synthesis error:', err)
      }
    },
    [isMuted]
  )

  // Request browser notification permission
  const handleRequestNotification = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission()
      setNotificationPermission(perm)
    }
  }

  // Start assistant greeting when 3 rings occur
  const triggerAssistantGreeting = useCallback(() => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const trimmedInstructions = instructions.trim()

    let greeting = `Hello! I am an automated doorbell assistant. The homeowner cannot come to the door right now.`
    if (trimmedInstructions) {
      greeting += ` They left this note: "${trimmedInstructions}".`
    }
    greeting += ` Would you like to leave a message? If this is an emergency, please say 'emergency'.`

    const initialMsg: ChatMessage = {
      id: `ast_${Date.now()}`,
      sender: 'assistant',
      text: greeting,
      timestamp: timeStr,
    }

    setChatHistory([initialMsg])
    setConversationActive(true)
    speakText(greeting)
  }, [instructions, speakText])

  // Handle Doorbell Ring Clicks (3 clicks within 10 seconds)
  const handleDoorbellRing = () => {
    if (conversationActive) return

    setOwnerAvailableNotice(null)

    // Clear previous idle timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }

    setRingCount((prev) => {
      const nextCount = prev + 1

      if (nextCount >= 3) {
        // Reset counter
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)

        if (busyModeEnabled) {
          setTimeout(() => {
            setRingCount(0)
            triggerAssistantGreeting()
          }, 300)
        } else {
          setRingCount(0)
          setOwnerAvailableNotice(
            'Owner is available. Please wait a moment for someone to open the door.'
          )
        }
        return 0
      }

      // Idle reset after 10 seconds of no clicks
      idleTimerRef.current = setTimeout(() => {
        setRingCount(0)
      }, 10000)

      return nextCount
    })
  }

  // Process visitor message via API route
  const submitVisitorMessage = async (textToSend: string) => {
    const text = textToSend.trim()
    if (!text || isProcessing) return

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const visitorMsg: ChatMessage = {
      id: `vis_${Date.now()}`,
      sender: 'visitor',
      text,
      timestamp: timeStr,
    }

    const updatedHistory = [...chatHistory, visitorMsg]
    setChatHistory(updatedHistory)
    setInputText('')
    setIsProcessing(true)

    try {
      const res = await fetch('/api/visitor/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerInstructions: instructions,
          visitorMessage: text,
          history: updatedHistory.map((m) => ({
            sender: m.sender,
            text: m.text,
            timestamp: m.timestamp,
          })),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setAiEngine(data.method || 'fallback')

        const assistantReplyText =
          data.reply || "I've passed your message to the owner. Is there anything else?"

        const assistantMsg: ChatMessage = {
          id: `ast_${Date.now()}`,
          sender: 'assistant',
          text: assistantReplyText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }

        setChatHistory((prev) => [...prev, assistantMsg])
        speakText(assistantReplyText)

        // Classify and store to Owner's Phone
        if (data.intent === 'emergency') {
          const newAlert: OwnerEmergencyAlert = {
            id: `alt_${Date.now()}`,
            text,
            summary: data.summary || text,
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          }

          setAlerts((prev) => {
            const next = [newAlert, ...prev]
            localStorage.setItem('ring_owner_alerts', JSON.stringify(next))
            return next
          })

          // Browser Web Notification
          if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'granted') {
              new Notification('🚨 RING DOORBELL EMERGENCY', {
                body: `Visitor: "${text}"`,
                icon: '/favicon.ico',
              })
            }
          }
        } else if (data.intent === 'message') {
          const newMsg: OwnerMessage = {
            id: `msg_${Date.now()}`,
            text,
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          }

          setMessages((prev) => {
            const next = [newMsg, ...prev]
            localStorage.setItem('ring_owner_messages', JSON.stringify(next))
            return next
          })
        }
      }
    } catch (err) {
      console.error('Visitor reply failed:', err)
      const fallbackReply = "I've alerted the owner right now. If anyone is in danger, please call 112."
      setChatHistory((prev) => [
        ...prev,
        {
          id: `ast_${Date.now()}`,
          sender: 'assistant',
          text: fallbackReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
      speakText(fallbackReply)
    } finally {
      setIsProcessing(false)
    }
  }

  // Real-time Web Audio API meter to visualize mic pickup
  const startAudioMeter = async (): Promise<MediaStream | null> => {
    try {
      if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return stream

      const audioCtx = new AudioContextClass()
      audioContextRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const updateMeter = () => {
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        const normalized = Math.min(100, Math.round((avg / 128) * 100))
        setAudioLevel(normalized)
        animFrameRef.current = requestAnimationFrame(updateMeter)
      }

      updateMeter()
      return stream
    } catch (err: any) {
      console.warn('Audio meter init error:', err)
      return null
    }
  }

  const stopAudioMeter = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close()
      } catch {}
      audioContextRef.current = null
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      } catch {}
      mediaStreamRef.current = null
    }
    setAudioLevel(0)
  }

  // Clean up speech recognition and audio meter on unmount
  useEffect(() => {
    return () => {
      stopAudioMeter()
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {}
      }
    }
  }, [])

  // Web Speech API Voice Input
  const handleToggleMic = async () => {
    if (typeof window === 'undefined') return

    // Immediately stop assistant speech so mic doesn't capture it
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }

    if (isListening) {
      stopAudioMeter()
      try {
        recognitionRef.current?.stop()
      } catch {}
      setIsListening(false)
      return
    }

    setMicError(null)

    // 1. Start audio visualizer stream
    const stream = await startAudioMeter()
    if (!stream) {
      setMicError(
        'Microphone permission blocked or mic not found. Please click the camera/mic icon in your browser address bar to allow access.'
      )
      return
    }

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognitionClass) {
      setMicError(
        'Speech recognition (speech-to-text) is not supported in this browser. Please use Google Chrome or Edge, or type your message.'
      )
      setIsListening(true)
      return
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {}
      }

      const recognition = new SpeechRecognitionClass()
      // continuous = false triggers onresult promptly without long buffering
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = navigator.language || 'en-US'
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsListening(true)
        setMicError(null)
        setLiveCaption('Listening... Speak into your mic now.')
      }

      recognition.onresult = (event: any) => {
        let transcript = ''
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + ' '
        }
        const trimmed = transcript.trim()
        if (trimmed) {
          setLiveCaption(trimmed)
          setInputText(trimmed)
        }
      }

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error)
        if (event.error === 'not-allowed') {
          setMicError(
            'Microphone permission blocked. Click the lock/tune icon in your address bar to allow.'
          )
        } else if (event.error === 'no-speech') {
          setMicError('No speech detected. Please speak closer to your mic or type below.')
        } else if (event.error === 'audio-capture') {
          setMicError('No microphone detected on your device or mic is busy.')
        } else if (event.error === 'network') {
          setMicError(
            'Browser speech service network error (Google speech service unreachable). You can type or use the quick buttons below.'
          )
        } else {
          setMicError(`Mic notice: ${event.error}`)
        }
      }

      recognition.onend = () => {
        stopAudioMeter()
        setIsListening(false)
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (e: any) {
      console.error('Mic start error:', e)
      stopAudioMeter()
      setIsListening(false)
      setMicError('Could not start microphone. Please type your message below.')
    }
  }

  // Reset conversation
  const handleResetConversation = () => {
    setChatHistory([])
    setConversationActive(false)
    setRingCount(0)
    setOwnerAvailableNotice(null)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
  }

  // Clear phone alerts / messages
  const handleClearPhoneHistory = () => {
    setMessages([])
    setAlerts([])
    localStorage.removeItem('ring_owner_messages')
    localStorage.removeItem('ring_owner_alerts')
  }

  return (
    <div className="min-h-screen flex flex-col bg-dash-bg text-slate-100 font-sans">
      <Header sourceMode="simulator" currentPage="visitor" />

      {/* Main 2-Column Responsive Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* ======================================================== */}
        {/* LEFT COLUMN: AT THE DOOR (VISITOR SIDE)                  */}
        {/* ======================================================== */}
        <div className="bg-dash-panel border border-slate-700/80 rounded-xl p-4 shadow-sm flex flex-col space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xl">🚪</span>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                At the Door <span className="text-slate-400 font-normal">(Visitor Side)</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  aiEngine === 'bedrock'
                    ? 'bg-purple-950 text-purple-300 border-purple-700'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                AI: {aiEngine === 'bedrock' ? 'Bedrock (Nova)' : 'Fallback'}
              </span>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-xs text-slate-400 hover:text-white transition px-2 py-0.5 rounded bg-slate-800 border border-slate-700"
                title={isMuted ? 'Unmute Assistant' : 'Mute Assistant Voice'}
              >
                {isMuted ? '🔇 Muted' : '🔊 Voice On'}
              </button>
            </div>
          </div>

          {/* Doorbell Trigger Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-3">
            <button
              onClick={handleDoorbellRing}
              className="w-full max-w-xs py-3 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-extrabold text-sm rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
            >
              <span className="text-lg">🔔</span>
              <span>Ring Doorbell</span>
            </button>

            {/* 3-Ring Indicator Dots */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-medium">Ring Count:</span>
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((idx) => (
                  <span
                    key={idx}
                    className={`w-3 h-3 rounded-full transition-all duration-300 ${
                      idx < ringCount
                        ? 'bg-amber-400 ring-2 ring-amber-400/50 scale-110'
                        : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs font-mono font-bold text-amber-400">{ringCount}/3</span>
            </div>

            <p className="text-[11px] text-slate-400 max-w-md leading-relaxed">
              Press 3 times within 10 seconds to engage the automated assistant.
              <span className="block text-[10px] text-slate-500 italic mt-0.5">
                Simulated doorbell. A real Ring doorbell event would trigger this.
              </span>
            </p>

            {/* Notice when Busy Mode is OFF and 3 rings occur */}
            {ownerAvailableNotice && (
              <div className="w-full bg-emerald-950/80 border border-emerald-600/80 rounded-lg p-2.5 text-xs text-emerald-200 animate-fadeIn flex items-center justify-center gap-2">
                <span>🟢</span>
                <span>{ownerAvailableNotice}</span>
              </div>
            )}
          </div>

          {/* Conversation Transcript */}
          <div className="space-y-2 flex-1 flex flex-col">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                Doorbell Conversation
              </span>
              {conversationActive && (
                <button
                  onClick={handleResetConversation}
                  className="text-[11px] text-slate-400 hover:text-red-300 transition"
                >
                  Clear Chat 🔄
                </button>
              )}
            </div>

            <div
              ref={chatScrollRef}
              className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 h-72 overflow-y-auto space-y-3 text-xs"
            >
              {chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-1">
                  <span className="text-2xl">💬</span>
                  <p>Doorbell is quiet.</p>
                  <p className="text-[11px]">Ring the doorbell 3 times to start talking.</p>
                </div>
              ) : (
                chatHistory.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.sender === 'visitor' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <span className="text-[10px] text-slate-500 font-mono mb-0.5 px-1">
                      {msg.sender === 'visitor' ? 'Visitor' : 'Doorbell Assistant'} •{' '}
                      {msg.timestamp}
                    </span>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                        msg.sender === 'visitor'
                          ? 'bg-cyan-600 text-white rounded-br-none shadow'
                          : 'bg-slate-800/90 text-slate-100 rounded-bl-none border border-slate-700/80'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              {isProcessing && (
                <div className="flex items-center gap-2 text-slate-400 text-xs italic">
                  <span className="animate-spin">⏳</span>
                  <span>Assistant is thinking...</span>
                </div>
              )}
            </div>

            {/* Live Speech Feedback or Mic Error Notice */}
            {(isListening || liveCaption || micError) && (
              <div
                className={`p-2.5 rounded-lg text-xs border transition ${
                  micError
                    ? 'bg-red-950/80 border-red-800 text-red-200'
                    : 'bg-black/75 border-cyan-800 text-slate-100 shadow'
                }`}
              >
                {micError ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span>⚠️</span>
                      <span>{micError}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setMicError(null)}
                      className="text-[10px] text-slate-400 hover:text-white transition px-1.5 py-0.5 rounded bg-slate-800"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-[10px] uppercase tracking-wider">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                        <span>Microphone Active • Speak clearly</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Click Stop Mic when done
                      </span>
                    </div>
                    <p className="font-mono text-cyan-200 text-xs break-words">
                      "{liveCaption || 'Listening...'}"
                    </p>

                    {/* Real-time Audio Level Bar */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] text-slate-400 font-mono">Audio Level:</span>
                      <div className="flex-1 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-rose-500 transition-all duration-75"
                          style={{ width: `${Math.max(4, audioLevel)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-cyan-300 w-8 text-right">
                        {audioLevel}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Visitor Response Controls */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (isListening) {
                  stopAudioMeter()
                  try {
                    recognitionRef.current?.stop()
                  } catch {}
                  setIsListening(false)
                }
                submitVisitorMessage(inputText)
              }}
              className="flex items-center gap-2 pt-1"
            >
              <button
                type="button"
                onClick={handleToggleMic}
                disabled={!conversationActive || isProcessing}
                className={`px-3 py-2 rounded-lg border text-xs font-semibold transition flex items-center gap-1.5 shrink-0 disabled:opacity-40 ${
                  isListening
                    ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                    : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-cyan-400'
                }`}
                title={isListening ? 'Stop listening' : 'Speak using microphone'}
              >
                <span>{isListening ? '⏹' : '🎤'}</span>
                <span>{isListening ? 'Stop' : 'Mic'}</span>
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={!conversationActive || isProcessing}
                placeholder={
                  conversationActive
                    ? isListening
                      ? 'Listening to your voice...'
                      : 'Type your reply (or click Mic)...'
                    : 'Ring 3 times to start conversation...'
                }
                className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={!conversationActive || isProcessing || !inputText.trim()}
                className="px-4 py-2 bg-dash-cyan hover:bg-cyan-300 text-black font-bold rounded-lg text-xs shadow transition disabled:opacity-40 shrink-0"
              >
                Send
              </button>
            </form>

            {/* Quick Visitor Speech Presets */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
              <span className="text-slate-400 font-medium">Quick speech:</span>
              {[
                'I have a package to deliver for you',
                'Please tell the owner David stopped by',
                'Help! There is an emergency at the door!',
              ].map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => {
                    setInputText(phrase)
                    submitVisitorMessage(phrase)
                  }}
                  disabled={!conversationActive || isProcessing}
                  className="px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition disabled:opacity-40 text-[10px]"
                >
                  💬 "{phrase}"
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: OWNER (BUSY MODE & PHONE MOCK)             */}
        {/* ======================================================== */}
        <div className="space-y-4">
          {/* Busy Mode Settings Card */}
          <div className="bg-dash-panel border border-slate-700/80 rounded-xl p-4 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">📴</span>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Owner Settings <span className="text-indigo-400">(Busy Mode)</span>
                </h2>
              </div>

              {/* Busy Mode Toggle Switch */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs font-semibold text-slate-300">
                  {busyModeEnabled ? 'Busy Mode ON' : 'Busy Mode OFF'}
                </span>
                <div
                  onClick={handleToggleBusyMode}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-300 cursor-pointer ${
                    busyModeEnabled ? 'bg-indigo-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-300 ${
                      busyModeEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </div>
              </label>
            </div>

            {/* Instructions Textarea */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Instructions for the Assistant:</span>
                <span className="text-[10px] text-slate-500">
                  Relayed accurately to visitors
                </span>
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                placeholder="I'm busy today, tell everyone I'm available after evening..."
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 leading-relaxed"
              />
            </div>

            {/* Quick Add Chips */}
            <div className="space-y-1">
              <span className="text-[11px] text-slate-400 font-medium">Quick Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Busy until evening',
                  'Leave packages at the gate',
                  'No visitors today',
                  'In a meeting, back at 5 PM',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setInstructions(chip)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-full text-[11px] transition"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Save & Permission Strip */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveInstructions}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs shadow transition flex items-center gap-1.5"
                >
                  <span>💾</span>
                  <span>Save Instructions</span>
                </button>
                {savedFeedback && (
                  <span className="text-emerald-400 text-xs font-medium animate-fadeIn">
                    ✓ Saved!
                  </span>
                )}
              </div>

              {notificationPermission !== 'granted' && (
                <button
                  onClick={handleRequestNotification}
                  className="text-[11px] text-slate-400 hover:text-cyan-300 transition underline"
                  title="Enable browser notifications for emergency alerts"
                >
                  🔔 Enable Notifications
                </button>
              )}
            </div>
          </div>

          {/* Owner's Phone Mock Card */}
          <div className="bg-slate-950 border-2 border-slate-700/90 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">📱</span>
                <span className="text-xs font-extrabold text-white uppercase tracking-wider">
                  Owner's Phone <span className="text-slate-500">(Escalation Feed)</span>
                </span>
              </div>
              {(alerts.length > 0 || messages.length > 0) && (
                <button
                  onClick={handleClearPhoneHistory}
                  className="text-[10px] text-slate-500 hover:text-red-400 transition"
                >
                  Clear History
                </button>
              )}
            </div>

            {/* Emergency Alerts Section (Red with Pulse) */}
            {alerts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span>Emergency Alerts ({alerts.length})</span>
                </div>
                {alerts.map((alt) => (
                  <div
                    key={alt.id}
                    className="bg-gradient-to-r from-rose-950/90 via-red-950/90 to-slate-900 border-2 border-rose-500 rounded-xl p-3 shadow-lg space-y-1 animate-pulse"
                  >
                    <div className="flex items-center justify-between text-[11px] font-bold text-rose-200">
                      <span>🚨 VISITOR REPORTED EMERGENCY</span>
                      <span className="font-mono text-rose-300">{alt.timestamp}</span>
                    </div>
                    <p className="text-xs text-white font-semibold leading-snug">
                      "{alt.text}"
                    </p>
                    <p className="text-[10px] text-rose-300 font-mono">
                      Action taken: Visitor advised to call 112 if in danger.
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Normal Messages List */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide block">
                Messages from Visitors ({messages.length})
              </span>

              {messages.length === 0 && alerts.length === 0 ? (
                <div className="p-4 text-center text-slate-600 text-xs italic bg-slate-900/40 rounded-xl border border-slate-900">
                  No alerts or messages received yet.
                </div>
              ) : messages.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic px-1">
                  No normal messages.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-xs space-y-0.5 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span className="font-semibold text-slate-300">💬 Visitor Note</span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <p className="text-slate-200 text-xs leading-relaxed">
                        "{msg.text}"
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
