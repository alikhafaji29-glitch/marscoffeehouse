import { useEffect, useState } from 'react'
import { clockNow, useClock } from '../clock'

type HM = { h: number; m: number }
// Positive Hours daily window (local time): 7:30 to 12:00 (owner, 2026-09-26). Outside it the slide shows Pre-order.
export const POSITIVE_HOURS: [HM, HM] = [{ h: 7, m: 30 }, { h: 12, m: 0 }]
// Lunch Hours: 12:00 to 17:00 (owner, 2026-09-27). After 17:00 its slide turns into a pre-order slide.
export const LUNCH_HOURS: [HM, HM] = [{ h: 12, m: 0 }, { h: 17, m: 0 }]

function compute(now: Date, [START, END]: [HM, HM]) {
  const mins = now.getHours() * 60 + now.getMinutes()
  const active = mins >= START.h * 60 + START.m && mins < END.h * 60 + END.m

  const target = new Date(now)
  if (active) {
    target.setHours(END.h, END.m, 0, 0)
  } else {
    target.setHours(START.h, START.m, 0, 0)
    if (now >= target) target.setDate(target.getDate() + 1)
  }

  const ms = Math.max(0, target.getTime() - now.getTime())
  const s = Math.floor(ms / 1000)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return { active, text: `${hh}:${pad(mm)}:${pad(ss)}` }
}

/** is the daily window open now, and the time left (open) or until it opens again (closed) */
export function useCountdown(span: [HM, HM] = POSITIVE_HOURS) {
  useClock() // the review time changer (src/clock.ts) re-renders at once
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return compute(clockNow(), span)
}
