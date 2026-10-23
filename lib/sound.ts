/**
 * Doorbell Chime Sound Synthesizer using Web Audio API.
 * Synthesizes a classic two-tone ("Ding-Dong") chime without requiring external audio files.
 */
export function playDoorbellChime() {
  try {
    if (typeof window === 'undefined') return
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return

    const ctx = new AudioContextClass()
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    const now = ctx.currentTime

    // 1. First chime ("Ding" ~830 Hz)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(830, now)

    gain1.gain.setValueAtTime(0.35, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.85)

    osc1.connect(gain1)
    gain1.connect(ctx.destination)

    osc1.start(now)
    osc1.stop(now + 0.85)

    // 2. Second chime ("Dong" ~622 Hz, begins 160ms later)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(622, now + 0.16)

    gain2.gain.setValueAtTime(0.35, now + 0.16)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2)

    osc2.connect(gain2)
    gain2.connect(ctx.destination)

    osc2.start(now + 0.16)
    osc2.stop(now + 1.2)
  } catch (err) {
    console.warn('Doorbell chime sound error:', err)
  }
}
