import { useEffect, useState } from 'react'

/*
 * Review clock (owner, 2026-09-27: "put a time changer to review onsite whenever I want").
 * Everything that depends on the time of day (Positive Hours, Lunch Hours, the night reel, mood greetings and
 * the mood game's late-night rule) reads clockNow() instead of new Date(). The time changer shifts it; the shift
 * is kept on this device (localStorage) until "Live" is chosen again.
 * Turn SHOW_TIME_CHANGER off before launch so customers never see the button.
 */
export const SHOW_TIME_CHANGER = true

const KEY = 'mars-preview-offset' // ms to add to the real time; absent = live
let offset = 0
try { offset = Number(localStorage.getItem(KEY)) || 0 } catch { offset = 0 }
const subs = new Set<() => void>()

/** the site's "now": real time, or the review time while one is set */
export const clockNow = (): Date => new Date(Date.now() + offset)
export const isPreviewing = () => offset !== 0

/** jump to hh:mm today (keeps ticking from there); null = back to live */
export function setPreviewTime(hm: string | null) {
  if (!hm) offset = 0
  else {
    const [h, m] = hm.split(':').map(Number)
    const target = new Date()
    target.setHours(h, m, 0, 0)
    offset = target.getTime() - Date.now()
  }
  try { if (offset) localStorage.setItem(KEY, String(offset)); else localStorage.removeItem(KEY) } catch { /* private mode: still works for this visit */ }
  subs.forEach((f) => f())
}

/** re-render when the review time changes */
export function useClock() {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump((n) => n + 1)
    subs.add(f)
    return () => { subs.delete(f) }
  }, [])
  return clockNow()
}
