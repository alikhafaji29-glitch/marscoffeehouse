/*
 * New-order chime for the staff dashboard: two soft bell notes, synthesised with
 * the Web Audio API (no audio file to load). Browsers only let audio start after a
 * tap, so unlockAudio() runs on the PIN "Enter" and on the sound toggle.
 * statusSound() is the customer's: a short tone when staff move their order (owner, 2026-10-19).
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

/** the customer's order moved on: a short rising ding; delivered = three rising notes; cancelled = two falling, lower.
 *  Phones that can also buzz do so. Silent until the visitor has tapped the page once (the browser's rule). */
export function statusSound(status: string) {
  try { navigator.vibrate?.(status === 'cancelled' ? [120, 80, 120] : 90) } catch { /* no vibration */ }
  if (!ctx || ctx.state !== 'running') return
  const t0 = ctx.currentTime + 0.02
  if (status === 'cancelled') { note(659.3, t0, 0.35, 0.2); note(523.3, t0 + 0.22, 0.5, 0.2); return } // E5 → C5
  if (status === 'delivered') { note(1046.5, t0, 0.3); note(1318.5, t0 + 0.14, 0.3); note(1568, t0 + 0.28, 0.55); return } // C6 E6 G6
  note(1046.5, t0, 0.3); note(1318.5, t0 + 0.15, 0.5) // C6 → E6
}
