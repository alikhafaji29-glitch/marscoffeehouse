import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { IconCheck } from '../components/Icons'

/* Shared pieces of the staff dashboard: line icons (no emoji, no icon font), cards, fields, a switch, a dialog and
 * the two chart shapes (columns over time, horizontal bars for rankings). */
const ic = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
export const I = {
  dashboard: () => <svg {...ic}><rect x="3.5" y="3.5" width="7" height="9" rx="1.2" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.2" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.2" /><rect x="3.5" y="15.5" width="7" height="5" rx="1.2" /></svg>,
  orders: () => <svg {...ic}><path d="M3 4h2.5l2 11h10.5l2-7.5H7" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></svg>,
  analytics: () => <svg {...ic}><path d="M5 20V11M12 20V4M19 20v-7" /></svg>,
  events: () => <svg {...ic}><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3.5v4M16 3.5v4" /><path d="m12 12.5.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z" /></svg>,
  offers: () => <svg {...ic}><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0z" /><circle cx="8" cy="8" r="1.4" /></svg>,
  warehouse: () => <svg {...ic}><path d="M3.5 20.5V9l8.5-5 8.5 5v11.5" /><path d="M8 20.5v-7h8v7M8 17h8" /></svg>,
  drinks: () => <svg {...ic}><path d="M5 7h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z" /><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17M4 21h14" /></svg>,
  food: () => <svg {...ic}><path d="M6 3.5v6a2 2 0 0 0 4 0v-6M8 9.5v11M16.5 3.5c-1.7 1-2.5 3-2.5 5.5s1 3 2.5 3.5v8" /></svg>,
  tools: () => <svg {...ic}><path d="M4 7h9M18 7h2M4 17h2M11 17h9" /><circle cx="15.5" cy="7" r="2.3" /><circle cx="8.5" cy="17" r="2.3" /></svg>,
  store: () => <svg {...ic}><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5v10.5h16V9.5M4 9.5h16M9.5 20v-5.5h5V20" /></svg>,
  chevron: ({ dir = 'down' }: { dir?: 'down' | 'up' | 'start' | 'end' }) => <svg {...ic} className={'d-chev ' + dir}><path d="M6 9l6 6 6-6" /></svg>,
  plus: () => <svg {...ic}><path d="M12 5v14M5 12h14" /></svg>,
  download: () => <svg {...ic}><path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 19.5h14" /></svg>,
  edit: () => <svg {...ic}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>,
  trash: () => <svg {...ic}><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" /></svg>,
  copy: () => <svg {...ic}><rect x="8.5" y="8.5" width="11" height="11" rx="1.8" /><path d="M5 15.5V5.5a1 1 0 0 1 1-1h10" /></svg>,
  clock: () => <svg {...ic}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  close: () => <svg {...ic}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  menu: () => <svg {...ic}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  money: () => <svg {...ic}><path d="M12 3.5v17M16 7.5c-.7-1.3-2.1-2-4-2-2.3 0-4 1.1-4 3s1.5 2.7 4 3.2 4 1.3 4 3.3-1.7 3-4 3c-2 0-3.6-.8-4.3-2.2" /></svg>,
  receipt: () => <svg {...ic}><path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" /><path d="M9 8.5h6M9 12h6M9 15.5h3.5" /></svg>,
  bike: () => <svg {...ic}><circle cx="6" cy="16.5" r="3" /><circle cx="18" cy="16.5" r="3" /><path d="M6 16.5 10 9h5l3 7.5M10 9l3 7.5M14 6.5h2.5" /></svg>,
  eye: () => <svg {...ic}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></svg>,
  trend: () => <svg {...ic}><path d="M3.5 17 9.5 11l3.5 3.5 7.5-8M15.5 6.5h5v5" /></svg>,
  people: () => <svg {...ic}><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.5-3 2.7-4.5 5.5-4.5s5 1.5 5.5 4.5" /><circle cx="17" cy="10" r="2.3" /><path d="M16 14.6c2.4-.2 4 1.2 4.5 3.4" /></svg>,
  flask: () => <svg {...ic}><path d="M9.5 3.5h5M10.5 3.5v6L5 19a1 1 0 0 0 .9 1.5h12.2A1 1 0 0 0 19 19l-5.5-9.5v-6" /><path d="M7.5 15h9" /></svg>,
  alert: () => <svg {...ic}><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5M12 17.2v.1" /></svg>,
  whatsapp: () => <svg {...ic}><path d="M4 20l1.3-4.2A8 8 0 1 1 8.3 19z" /><path d="M9 8.5c0 3 2.5 6 6 6.5l1-1.5-2-1-1 .8c-1-.5-1.8-1.3-2.3-2.3l.8-1-1-2z" /></svg>,
  cashier: () => <svg {...ic}><rect x="4" y="12" width="16" height="8" rx="1.5" /><path d="M7 12V5.5h7V12M9 8h3M8 16h8" /></svg>,
  bag: () => <svg {...ic}><path d="M5 8.5h14l-1 12H6z" /><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" /></svg>,
  save: () => <svg {...ic}><path d="M5 4.5h11l3.5 3.5v11.5H5z" /><path d="M8 4.5v5h7v-5M8 19.5v-6h8v6" /></svg>,
  back: () => <svg {...ic} className="d-flip"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>,
  print: () => <svg {...ic}><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /></svg>,
  sound: () => <svg {...ic}><path d="M4 10v4h3.5L12 18V6L7.5 10z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>,
  exit: () => <svg {...ic} className="d-flip"><path d="M10 4.5H5v15h5M14 8l4 4-4 4M18 12H9" /></svg>,
}

export function Card({ title, sub, icon, right, className = '', children }: { title?: ReactNode; sub?: ReactNode; icon?: ReactNode; right?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <section className={'d-card ' + className}>
      {(title || right) && (
        <header className="d-card-head">
          <div>
            {title && <h3>{icon}{title}</h3>}
            {sub && <p>{sub}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ icon, tone = 'navy', value, label, note }: { icon: ReactNode; tone?: 'navy' | 'green' | 'caramel' | 'sky' | 'red'; value: ReactNode; label: string; note?: ReactNode }) {
  return (
    <div className="d-stat">
      <span className={'d-stat-icon ' + tone}>{icon}</span>
      <div>
        <b dir="ltr">{value}</b>
        <span>{label}</span>
        {note && <small>{note}</small>}
      </div>
    </div>
  )
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      <span className="knob">{on ? <IconCheck /> : '×'}</span>
    </button>
  )
}

/** an outlined field with its label sitting on the border, like the live panel's */
export function Field({ label, children, wide, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return (
    <label className={'d-field' + (wide ? ' wide' : '')}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function Modal({ title, onClose, footer, children, wide }: { title: string; onClose: () => void; footer: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="d-overlay" onClick={onClose}>
      <div className={'d-modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="d-modal-body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  )
}

export interface Col { label: string; value: number; tip: string }
/** columns over time (orders per day, visits per day, orders per hour) */
export function Columns({ data, tone = 'navy', first, last, ticks }: { data: Col[]; tone?: 'navy' | 'caramel'; first?: string; last?: string; ticks?: string[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="d-cols-wrap">
      <div className={'d-cols ' + tone} role="img" aria-label={data.map((d) => d.tip).join('; ')}>
        {data.map((d, i) => (
          <span key={i} className={d.value ? '' : 'zero'} style={{ height: `${Math.max(d.value ? 6 : 3, (d.value / max) * 100)}%` }} title={d.tip} />
        ))}
      </div>
      <div className="d-cols-axis" dir="ltr">
        {ticks ? ticks.map((x) => <span key={x}>{x}</span>) : <><span>{first}</span><span>{last}</span></>}
      </div>
    </div>
  )
}

/** a ranking: label, bar, number (and a share when given) */
export function Bars({ rows, tone = 'navy', empty }: { rows: { label: string; value: number; share?: number; color?: string }[]; tone?: 'navy' | 'caramel'; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <p className="d-empty">{empty}</p>
  return (
    <ul className={'d-bars ' + tone}>
      {rows.map((r) => (
        <li key={r.label}>
          <span className="d-bars-label" title={r.label}>{r.label}</span>
          <span className="d-bars-track"><i style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: r.color }} /></span>
          <b dir="ltr">{r.value.toLocaleString('en-US')}</b>
          {r.share !== undefined && <small dir="ltr">{r.share}%</small>}
        </li>
      ))}
    </ul>
  )
}
