import { useEffect, useLayoutEffect, useRef } from 'react'

/*
 * The arrival time as two wheels, hour and minute, like the iPhone alarm (owner, 2026-10-22: "make it smooth like the
 * iphone alarm"). Each wheel is a native scroller (momentum, snapping) whose rows are bent onto a drum and faded by
 * their distance from the middle on every frame, so the turn is continuous rather than a jump at the end.
 * The hour wheel lists the hours of `slots`; the minute wheel always lists 00–55, the ones not allowed in the chosen
 * hour greyed; a wheel left on a greyed minute slides to the nearest allowed one, and a changed hour does the same.
 * The first allowed time is chosen as soon as the wheels appear, so there is always a time.
 */
const ROW = 40 // px per row; five rows show, the middle one is the choice
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

export function TimeWheel({ slots, value, onChange, label }: { slots: number[]; value: number; onChange: (at: number) => void; label: string }) {
  const at = slots.includes(value) ? value : slots[0] ?? 0
  useEffect(() => { if (at && at !== value) onChange(at) }, [at, value, onChange])
  if (!slots.length) return null
  const hourOf = (t: number) => new Date(t).getHours()
  const minOf = (t: number) => new Date(t).getMinutes()
  const hours = slots.map(hourOf).filter((h, i, a) => a.indexOf(h) === i)
  const inHour = (h: number) => slots.filter((t) => hourOf(t) === h)
  /** the allowed time in hour h nearest to minute m */
  const nearest = (h: number, m: number) => inHour(h).reduce((b, t) => (Math.abs(minOf(t) - m) < Math.abs(minOf(b) - m) ? t : b))
  const allowed = new Set(inHour(hourOf(at)).map((t) => Math.round(minOf(t) / 5)))
  return (
    <div className="time-wheel" dir="ltr" role="group" aria-label={label}>
      <Wheel items={hours.map((h) => String(h).padStart(2, '0'))} index={hours.indexOf(hourOf(at))} onPick={(i) => onChange(nearest(hours[i], minOf(at)))} label={label} />
      <span className="tw-colon" aria-hidden="true">:</span>
      <Wheel items={MINUTES.map((m) => String(m).padStart(2, '0'))} index={Math.round(minOf(at) / 5)} off={(i) => !allowed.has(i)} onPick={(i) => onChange(nearest(hourOf(at), i * 5))} label={label} />
    </div>
  )
}

/** one wheel: native scroll with snapping; the rows are turned and faded by their distance from the middle each frame;
 *  when the scroll settles, the middle row is picked (or the nearest allowed one, which the wheel then slides to) */
function Wheel({ items, index, onPick, off = () => false, label }: { items: string[]; index: number; onPick: (i: number) => void; off?: (i: number) => boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  const frame = useRef(0)
  const latest = useRef(index)
  latest.current = index
  const draw = () => {
    const el = ref.current
    if (!el) return
    const mid = el.scrollTop / ROW
    Array.from(el.children as HTMLCollectionOf<HTMLElement>).forEach((row, i) => {
      const d = Math.max(-3, Math.min(3, i - mid))
      row.style.transform = `rotateX(${-d * 22}deg) scale(${1 - Math.abs(d) * 0.06})`
      row.style.opacity = String(Math.max(0, 1 - Math.abs(d) * 0.32) * (row.classList.contains('off') ? 0.35 : 1))
    })
  }
  const touching = useRef(false) // a finger is on the wheel: never move it under the finger
  // follow the choice only when it changes (a changed hour moved the minute, the first time was chosen); not on every
  // render: the order window redraws each second for its countdown, and that pulled a wheel back mid-scroll
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || touching.current) return
    if (Math.abs(el.scrollTop - index * ROW) > 2) el.scrollTo({ top: index * ROW, behavior: el.dataset.ready ? 'smooth' : 'auto' })
    el.dataset.ready = '1'
  }, [index])
  useLayoutEffect(draw) // the greyed rows can change with the hour
  const settle = () => {
    const el = ref.current
    if (!el || touching.current) return
    const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ROW)))
    if (i !== index) onPick(i)
    // left between rows, or on a greyed minute whose nearest allowed one is the current choice: slide back to it
    window.setTimeout(() => { const e = ref.current; if (e && !touching.current && Math.abs(e.scrollTop - latest.current * ROW) > 2) e.scrollTo({ top: latest.current * ROW, behavior: 'smooth' }) }, 60)
  }
  const onScroll = () => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(draw)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(settle, 160)
  }
  const touchStart = () => { touching.current = true; clearTimeout(timer.current) }
  const touchEnd = () => { touching.current = false; clearTimeout(timer.current); timer.current = window.setTimeout(settle, 160) } // momentum keeps it going
  useEffect(() => () => { clearTimeout(timer.current); cancelAnimationFrame(frame.current) }, [])
  const step = (d: number) => { const i = Math.max(0, Math.min(items.length - 1, index + d)); if (i !== index) onPick(i) }
  return (
    <div ref={ref} className="tw-col" role="listbox" aria-label={label} tabIndex={0} onScroll={onScroll} onTouchStart={touchStart} onTouchEnd={touchEnd} onTouchCancel={touchEnd}
      onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); step(1) } else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1) } }}>
      {items.map((x, i) => (
        <div key={i} role="option" aria-selected={i === index} aria-disabled={off(i) || undefined} className={'tw-row' + (i === index ? ' on' : '') + (off(i) ? ' off' : '')}
          onClick={() => ref.current?.scrollTo({ top: i * ROW, behavior: 'smooth' })}>{x}</div>
      ))}
    </div>
  )
}
