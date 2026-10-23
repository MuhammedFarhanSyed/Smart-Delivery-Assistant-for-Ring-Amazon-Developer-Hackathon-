'use client'

import { useState, useEffect, useRef } from 'react'

interface CourierDialogProps {
  onTranscriptReady: (transcript: string) => Promise<void>
  onGreetingSpoken?: (text: string) => void
  onResidentReply?: (text: string) => void
  loading?: boolean
}

export function CourierDialog({
  onTranscriptReady,
  onGreetingSpoken,
  onResidentReply,
  loading = false,
}: CourierDialogProps) {
  const [greetingText, setGreetingText] = useState(
    'Hi! Please leave the package or tell me where you left it.'
  )
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(true)
  const [liveCaption, setLiveCaption] = useState('')
  const [typedReply, setTypedReply] = useState('')
  const [residentText, setResidentText] = useState('')
  const [micError, setMicError] = useState<string | null>(null)

  const recognitionRef = useRef<any>(null)

  // Initialize SpeechRecognition if available
  useEffect(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognitionClass) {
      setSpeechSupported(false)
      return
    }

    try {
      const recognition = new SpeechRecognitionClass()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsListening(true)
        setMicError(null)
      }

      recognition.onresult = (event: any) => {
        let interimText = ''
        let finalText = ''

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i]
          if (res.isFinal) {
            finalText += res[0].transcript + ' '
          } else {
            interimText += res[0].transcript
          }
        }

        const combined = (finalText + interimText).trim()
        if (combined) {
          setLiveCaption(combined)
          setTypedReply(combined)
        }
      }

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error)
        setIsListening(false)
        if (event.error === 'not-allowed') {
          setMicError('Microphone permission blocked. Please allow mic access in your browser address bar.')
        } else if (event.error === 'no-speech') {
          setMicError('No speech detected. Please speak closer to your mic or type below.')
        } else if (event.error === 'audio-capture') {
          setMicError('No microphone was found on your device.')
        } else if (event.error === 'network') {
          setMicError('Browser speech service network error. Check your internet connection or type below.')
        }
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
    } catch (e) {
      console.warn('SpeechRecognition init error:', e)
      setSpeechSupported(false)
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {}
      }
    }
  }, [])

  // Speak greeting using SpeechSynthesis
  const speakGreeting = (textToSpeak: string = greetingText) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(textToSpeak)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => {
      setIsSpeaking(false)
      if (onGreetingSpoken) onGreetingSpoken(textToSpeak)
    }
    utterance.onerror = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
  }

  // Toggle listening for courier speech
  const toggleListening = async () => {
    if (typeof window === 'undefined') return

    // Cancel speech so mic doesn't capture speaker echo
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }

    if (!recognitionRef.current) {
      setMicError('Speech recognition is not initialized or unsupported in this browser.')
      return
    }

    if (isListening) {
      try {
        recognitionRef.current.stop()
      } catch {}
      setIsListening(false)
    } else {
      setMicError(null)
      setLiveCaption('Listening... Speak now.')

      try {
        recognitionRef.current.start()
      } catch (err: any) {
        console.warn('Could not start recognition:', err)
        try {
          recognitionRef.current.abort()
          recognitionRef.current.start()
        } catch {}
      }
    }
  }

  // Submit transcript to server
  const handleSubmitCourierReply = async () => {
    const text = typedReply.trim() || liveCaption.trim()
    if (!text) return
    await onTranscriptReady(text)
    setLiveCaption('')
    setTypedReply('')
  }

  // Resident replies aloud via TTS (Accessibility feature)
  const handleResidentSpeak = () => {
    const text = residentText.trim()
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => {
      setIsSpeaking(false)
      if (onResidentReply) onResidentReply(text)
      setResidentText('')
    }
    window.speechSynthesis.speak(utterance)
  }

  return (
    <div className="bg-dash-panel border border-slate-700 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <span>🎙️</span> Courier Conversation
        </h3>
        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
          Two-way Audio & Captions
        </span>
      </div>

      {/* Step 1: Automated Greeting */}
      <div className="space-y-1.5">
        <label className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
          <span>Automated Doorbell Greeting</span>
          {isSpeaking && <span className="text-cyan-400 animate-pulse">🔊 Speaking...</span>}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={greetingText}
            onChange={(e) => setGreetingText(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-dash-cyan"
          />
          <button
            onClick={() => speakGreeting()}
            disabled={isSpeaking}
            className="px-3 py-1.5 bg-dash-cyan text-black font-semibold rounded-lg text-xs hover:bg-cyan-300 disabled:opacity-50 transition"
          >
            🔊 Speak
          </button>
        </div>
      </div>

      {/* Step 2: Courier Reply (Speech / Text Fallback) */}
      <div className="space-y-2 border-t border-slate-700/60 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-medium">Capture Courier Reply</span>
          <div className="flex items-center gap-2">
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                  isListening
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600'
                }`}
              >
                <span>{isListening ? '⏹ Stop Mic' : '🎤 Listen (Mic)'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Mic Error Notice */}
        {micError && (
          <div className="p-2 rounded-lg bg-red-950/70 border border-red-800 text-red-200 text-xs flex items-center justify-between gap-2">
            <span>⚠️ {micError}</span>
            <button
              type="button"
              onClick={() => setMicError(null)}
              className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Live Captions Display */}
        {(isListening || liveCaption) && (
          <div className="p-2.5 rounded-lg bg-black/60 border border-cyan-800/60 text-xs">
            <span className="text-[10px] text-cyan-400 uppercase tracking-wider block font-semibold">
              Live Captions
            </span>
            <p className="text-slate-100 font-mono mt-0.5">
              {liveCaption || 'Listening to courier...'}
            </p>
          </div>
        )}

        {/* Typed fallback input */}
        <div className="space-y-1.5">
          <textarea
            rows={2}
            value={typedReply}
            onChange={(e) => setTypedReply(e.target.value)}
            placeholder="Courier speech transcript or type fallback (e.g. 'Left behind the planter, no signature')"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-dash-cyan placeholder-slate-500"
          />

          {/* Quick Voice Presets */}
          <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
            <span className="text-slate-400">Quick courier speech:</span>
            {[
              'Left behind the planter by the front door, no signature needed',
              'Package left at front door, signature required',
              'Nobody home, will reattempt delivery tomorrow',
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setTypedReply(preset)
                  setLiveCaption(preset)
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition"
              >
                💬 "{preset.slice(0, 24)}..."
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSubmitCourierReply}
              disabled={loading || (!typedReply.trim() && !liveCaption.trim())}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium rounded-lg text-xs transition"
            >
              {loading ? 'Processing...' : 'Process Instructions →'}
            </button>
          </div>
        </div>
      </div>

      {/* Step 3: Accessibility Mode (Resident Talkback via TTS) */}
      <div className="border-t border-slate-700/60 pt-3 space-y-1.5">
        <label className="text-[11px] text-purple-300 font-medium flex items-center gap-1.5">
          <span>♿ Resident Talkback (Text-to-Speech)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={residentText}
            onChange={(e) => setResidentText(e.target.value)}
            placeholder="Type message to speak aloud to courier..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-400 placeholder-slate-500"
          />
          <button
            onClick={handleResidentSpeak}
            disabled={!residentText.trim() || isSpeaking}
            className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white font-medium rounded-lg text-xs disabled:opacity-40 transition"
          >
            Speak to Courier
          </button>
        </div>
      </div>
    </div>
  )
}
