import { useCallback, useEffect, useState } from 'react'
import { useStaff } from './store'
import { readWaLog } from './remote'
import type { WaLogRow } from './remote'
import { useS } from './strings'
import type { SKey } from './strings'
import { backendOn } from '../backend'
import { Card, I } from './ui'

/* WhatsApp log (owner, 2026-10-25: "i need wa msgs log to see what's delivered, what's read, what's failed"; HANDOFF
 * decision 205): every message the driver buttons sent through the Cloud API, one day at a time, with what Meta
 * reported back through wa-webhook. Messages sent by opening WhatsApp (Other…, or when the API could not send) are not
 * in it: Meta never sees those. Refreshed every 15 s while open. */
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hm = (t?: number) => (t ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')
const local = (to: string) => (to.startsWith('964') ? '0' + to.slice(3) : '+' + to)
const STATUS: Record<WaLogRow['status'], SKey> = { sent: 'waStSent', delivered: 'waStDelivered', read: 'waStRead', failed: 'waStFailed' }

export function WaLog() {
  const s = useS()
  const branch = useStaff().branch
  const [day, setDay] = useState(() => dayKey(new Date()))
  const [only, setOnly] = useState<'' | WaLogRow['status']>('')
  const [rows, setRows] = useState<WaLogRow[] | null>(null)
  const [failedRead, setFailedRead] = useState(false)
  const load = useCallback(async () => {
    const [y, m, d] = day.split('-').map(Number)
    const r = await readWaLog(branch, new Date(y, m - 1, d))
    setFailedRead(r === null)
    if (r) setRows(r)
  }, [branch, day])
  useEffect(() => {
    setRows(null)
    void load()
    const t = setInterval(() => void load(), 15000)
    return () => clearInterval(t)
  }, [load])

  if (!backendOn) return <div className="d-narrow"><p className="d-hint">{s('waLogDemo')}</p></div>
  const count = (st: WaLogRow['status']) => (rows ?? []).filter((r) => r.status === st).length
  const shown = (rows ?? []).filter((r) => !only || r.status === only)
  return (
    <div className="d-narrow">
      <p className="d-lead">{s('waLogLead')}</p>
      <div className="staff-filter" role="search">
        <label className="staff-filter-date">
          <span>{s('fDate')}</span>
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} dir="ltr" />
        </label>
        <button type="button" className={'staff-filter-chip' + (day === dayKey(new Date()) ? ' on' : '')} onClick={() => setDay(dayKey(new Date()))}>{s('fToday')}</button>
        <button type="button" className="staff-filter-chip" onClick={() => void load()}>{s('waLogRefresh')}</button>
      </div>
      <div className="wa-log-sum" role="group" aria-label={s('waLogFilter')}>
        <button type="button" className={only === '' ? 'on' : ''} onClick={() => setOnly('')}><b>{(rows ?? []).length}</b>{s('waLogAll')}</button>
        {(['sent', 'delivered', 'read', 'failed'] as const).map((st) => (
          <button key={st} type="button" className={'st-' + st + (only === st ? ' on' : '')} onClick={() => setOnly(only === st ? '' : st)}><b>{count(st)}</b>{s(STATUS[st])}</button>
        ))}
      </div>
      {failedRead && <p className="d-error" role="alert">{s('waLogReadErr')}</p>}
      <Card>
        {rows === null ? <p className="d-hint">{s('waLogLoading')}</p>
          : !shown.length ? <p className="d-hint">{s('waLogNone')}</p>
            : (
              <ul className="wa-log">
                {shown.map((r) => (
                  <li key={r.id}>
                    <span className="wa-log-time" dir="ltr">{hm(r.at)}</span>
                    <span className="wa-log-who"><b>#{r.code}</b> · <I.whatsapp /> {r.driver || '—'} <small dir="ltr">{local(r.to)}</small></span>
                    <span className={'wa-log-st st-' + r.status}>
                      {s(STATUS[r.status])}
                      <small dir="ltr">{hm(r.status === 'read' ? r.readAt : r.status === 'delivered' ? r.deliveredAt : r.status === 'failed' ? r.failedAt : undefined)}</small>
                    </span>
                    {r.error && <span className="wa-log-err">{r.error}</span>}
                  </li>
                ))}
              </ul>
            )}
      </Card>
    </div>
  )
}
