import { useEffect, useState } from 'react'

/*
 * Review clock (owner, 2026-09-27: "put a time changer to review onsite whenever I want").
 * Everything that depends on the time of day (Positive Hours, Lunch Hours, the night reel, mood greetings and
 * the mood game's late-night rule) reads clockNow() instead of new Date(). The time changer shifts it; the shift
 * is kept on this device (localStorage) until "Live" is chosen again.
 * Turn SHOW_TIME_CHANGER off before launch so customers never see the button.
 */
export const SHOW_TIME_CHANGER = true
/** the review time a visitor starts at, until they pick another or "Live now" (owner, 2026-10-22: the demo site opens
 *  during Positive Hours). Off with the time changer, so the real site always runs on the real time. */
const DEFAULT_PREVIEW: string | null = SHOW_TIME_CHANGER ? '09:00' : null

const KEY = 'mars-preview-offset' // ms to add to the real time; '0' = live chosen; absent = DEFAULT_PREVIEW
const offsetTo = (hm: string) => {
  const [h, m] = hm.split(':').map(Number)
  const target = new Date()
  target.setHours(h, m, 0, 0)
  return target.getTime() - Date.now()
}
let offset = 0
try {
  const saved = localStorage.getItem(KEY)
  offset = saved !== null ? Number(saved) || 0 : DEFAULT_PREVIEW ? offsetTo(DEFAULT_PREVIEW) : 0
} catch { offset = DEFAULT_PREVIEW ? offsetTo(DEFAULT_PREVIEW) : 0 }
const subs = new Set<() => void>()

/** the site's "now": real time, or the review time while one is set */
export const clockNow = (): Date => new Date(Date.now() + offset)
export const isPreviewing = () => offset !== 0

/** jump to hh:mm today (keeps ticking from there); null = back to live */
export function setPreviewTime(hm: string | null) {
  offset = hm ? offsetTo(hm) : 0
  // live is kept as '0' so the default review time does not come back on the next visit
  try { localStorage.setItem(KEY, String(offset)) } catch { /* private mode: still works for this visit */ }
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
