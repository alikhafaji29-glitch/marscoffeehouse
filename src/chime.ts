/*
 * New-order chime for the staff dashboard: two soft bell notes, synthesised with
 * the Web Audio API (no audio file to load). Browsers only let audio start after a
 * tap, so unlockAudio() runs on the PIN "Enter" and on the sound toggle.
 */
let ctx: AudioContext | null = null

export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch { /* no audio on this device */ }
}

function note(freq: number, at: number, len: number, gain = 0.25) {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(freq, at)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, at + len)
  o.connect(g).connect(ctx.destination)
  o.start(at)
  o.stop(at + len + 0.05)
}

/** ding-dong, twice */
export function chime() {
  unlockAudio()
  if (!ctx) return
  const t0 = ctx.currentTime + 0.02
  for (const rep of [0, 0.9]) {
    note(880, t0 + rep, 0.45)          // A5
    note(1318.5, t0 + rep + 0.18, 0.6) // E6
  }
}
