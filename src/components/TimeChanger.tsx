import { useEffect, useState } from 'react'
import { SHOW_TIME_CHANGER, isPreviewing, setPreviewTime, useClock } from '../clock'

/* Review tool for the owner (2026-09-27): a small clock button that shows the site at any time of day.
 * English only on purpose: it is not customer-facing, and SHOW_TIME_CHANGER hides it for launch. */
const PRESETS: { hm: string; label: string }[] = [
  { hm: '09:00', label: 'Positive Hours' },
  { hm: '14:00', label: 'Lunch Hours' },
  { hm: '22:00', label: 'Night' },
]
const pad = (n: number) => String(n).padStart(2, '0')

export function TimeChanger() {
  const now = useClock()
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 20000); return () => clearInterval(id) }, [])
  if (!SHOW_TIME_CHANGER) return null
  void tick
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const preview = isPreviewing()
  const go = (v: string | null) => { setPreviewTime(v); setOpen(false) }
  return (
    <div className={'time-changer' + (preview ? ' is-preview' : '')} dir="ltr">
      {open && (
        <div className="time-panel" role="dialog" aria-label="Review time">
          <p className="time-panel-title">Review the site at</p>
          <div className="time-presets">
            <button type="button" className={!preview ? 'on' : ''} onClick={() => go(null)}>Live now</button>
            {PRESETS.map((p) => (
              <button type="button" key={p.hm} className={preview && hm.slice(0, 2) === p.hm.slice(0, 2) ? 'on' : ''} onClick={() => go(p.hm)}>
                <b>{p.hm}</b> {p.label}
              </button>
            ))}
          </div>
          <label className="time-custom">
            <span>Any time</span>
            <input type="time" value={hm} onChange={(e) => e.target.value && setPreviewTime(e.target.value)} />
          </label>
        </div>
      )}
      <button type="button" className="time-btn" aria-expanded={open} aria-label={`Review time: ${hm}${preview ? ' (preview)' : ''}`} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        <span>{hm}</span>
        {preview && <small>preview</small>}
      </button>
    </div>
  )
}
