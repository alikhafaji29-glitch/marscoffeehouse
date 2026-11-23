import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../i18n'
import { iqd } from '../account'
import { REPLENISH_REASONS } from '../account'
import type { Order } from '../account'
import { PRE_AHEAD, countAt, isCancelled } from '../orders'
import { useNow } from '../orders'
import { catLabel } from '../components/MenuSection'
import { RANGES, dayKey, rangeStart, rowsFromOrders, stepTimes, summarize, toCsv, traffic } from './stats'
import type { StepKey } from './stats'
import { backendOn } from '../backend'
import { ordersInRange } from './remote'
import type { Range } from './stats'
import { useStaff } from './store'
import { useS } from './strings'
import type { SKey } from './strings'
import { Bars, Card, Columns, I, Stat } from './ui'

/* Analytics, after the live panel: a range, then Sales (orders, revenue, what sells, when) and Traffic (visits and
 * where they come from). Always the real orders and visits. */
const RANGE_LABEL: Record<Range, SKey> = { today: 'rToday', '7': 'r7', '30': 'r30', '90': 'r90', all: 'rAll' }
const SOURCE_COLOR: Record<string, string> = { Instagram: '#e0336e', Direct: '#8a94a6', Referral: '#dc8638', Google: '#4d97cf', Facebook: '#203469' }
const shortDay = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const STEP_LABEL: Record<StepKey, SKey> = { accept: 'stepAccept', prepare: 'stepPrepare', wait: 'stepWait', out: 'stepOut', road: 'stepRoad', handover: 'stepHandover', total: 'stepTotal' }
/** minutes as people say them: "45 sec", "7 min", "1 h 20 min" */
const mins = (m: number) => (m < 1 ? `${Math.round(m * 60)} sec` : m < 60 ? `${m < 10 ? Math.round(m * 10) / 10 : Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`)

export function Analytics({ orders: live }: { orders: Order[] }) {
  const s = useS()
  const { lang } = useLang()
  const data = useStaff()
  const now = useNow(60000)
  const [range, setRange] = useState<Range>('30')
  const [copied, setCopied] = useState(false)
  const [how, setHow] = useState<'delivery' | 'pickup'>('delivery')
  // the whole period from the database (the dashboard keeps only the latest 300 orders, so a week or a month was
  // counted short until 2026-11-23); the orders already on screen are laid over it, so a new order shows at once
  const [fetched, setFetched] = useState<{ key: string; list: Order[] } | null>(null)
  const today = dayKey(now)
  const key = `${data.branch}|${range}|${today}`
  useEffect(() => {
    if (!backendOn) return
    let off = false
    const from = range === 'all' ? 0 : rangeStart(range, Date.now())
    // a pre-order counts on the day it is for, so one placed just before the period can belong to it
    void ordersInRange(data.branch, Math.max(0, from - PRE_AHEAD), Date.now() + 60000).then((list) => { if (!off && list) setFetched({ key, list }) })
    return () => { off = true }
  }, [key, data.branch, range])
  const loading = backendOn && fetched?.key !== key
  const orders = useMemo(() => {
    if (!fetched || fetched.key !== key) return live
    const id = (o: Order) => o.uid ?? o.id
    const seen = new Set(live.map(id))
    return [...live, ...fetched.list.filter((o) => !seen.has(id(o)))]
  }, [fetched, key, live])
  const steps = useMemo(() => {
    const from = rangeStart(range, now, orders.length ? Math.min(...orders.map(countAt)) : undefined)
    return stepTimes(orders, how, from, now)
  }, [orders, how, range, now])
  const single = (k: StepKey) => k !== 'total' && k !== 'out' && k !== 'road' // the bars compare the shop's own steps
  const slowest = Math.max(1, ...steps.steps.filter((x) => single(x.key)).map((x) => x.avg))
  const headline = steps.steps.find((x) => x.key === (how === 'delivery' ? 'out' : 'total'))
  // replenishments are free orders sent to make up for another (2026-10-28): not sales, so not in orders, revenue or items
  const rows = useMemo(() => rowsFromOrders(orders.filter((o) => !o.replenish)), [orders])
  const given = useMemo(() => {
    const from = rangeStart(range, now, orders.length ? Math.min(...orders.map(countAt)) : undefined)
    const inRange = orders.filter((o) => countAt(o) >= from && countAt(o) <= now && !isCancelled(o))
    const reps = inRange.filter((o) => o.replenish)
    const disc = inRange.filter((o) => o.discount)
    return {
      reps: reps.length,
      why: REPLENISH_REASONS.map((r) => [r, reps.filter((o) => o.replenish!.reason === r).length] as const).filter(([, n]) => n),
      disc: disc.length,
      off: disc.reduce((n, o) => n + o.discount!.amount, 0),
    }
  }, [orders, range, now])
  const visits = data.visits
  const sum = useMemo(() => summarize(rows, range, now), [rows, range, now])
  const tr = useMemo(() => traffic(visits, range, now), [visits, range, now])
  const hourly = range === 'today'

  const exportCsv = () => {
    const csv = toCsv(sum)
    // a file where the browser allows downloads, and the same text on the clipboard (shared previews block downloads)
    try {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      a.download = `mars-analytics-${dayKey(now)}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    } catch { /* clipboard only */ }
    navigator.clipboard?.writeText(csv).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) }).catch(() => {})
  }

  return (
    <>
      <div className="d-toolbar">
        <div className="d-seg" role="tablist" aria-label={s('range')}>
          {RANGES.map((r) => <button key={r} role="tab" aria-selected={r === range} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{s(RANGE_LABEL[r])}</button>)}
        </div>
        <button type="button" className="d-btn outline" onClick={exportCsv}><I.download />{copied ? s('csvCopied') : s('exportCsv')}</button>
      </div>
      {loading && <p className="d-hint">{s('anLoading')}</p>}

      <h2 className="d-h2">{s('sales')}</h2>
      <div className="d-stats">
        <Stat icon={<I.receipt />} value={sum.orders.toLocaleString('en-US')} label={s('orders')} note={s('ordersSplit', { done: sum.done, pending: sum.pending })} />
        <Stat icon={<I.money />} tone="green" value={iqd(sum.revenue)} label={s('revenueIqd')} note={s('avgOrder', { n: iqd(sum.avg) })} />
        <Stat icon={<I.bag />} tone="caramel" value={sum.units.toLocaleString('en-US')} label={s('itemsSold')} note={sum.orders ? `${s('perOrder', { n: (sum.units / sum.orders).toFixed(1) })}${sum.combos ? ` · ${s('nCombos', { n: sum.combos })}` : ''}` : undefined} />
        <Stat icon={<I.bike />} tone="sky" value={`${sum.delivery} / ${sum.pickup}`} label={s('deliveryPickup')} />
      </div>
      {(given.reps > 0 || given.disc > 0) && (
        <div className="d-stats">
          <Stat icon={<I.receipt />} tone="green" value={given.reps.toLocaleString('en-US')} label={s('anReps')} note={given.why.map(([r, n]) => `${s(('repR_' + r) as SKey)} ${n}`).join(' · ') || undefined} />
          <Stat icon={<I.money />} tone="caramel" value={iqd(given.off)} label={s('anDiscIqd')} note={s('anDiscN', { n: given.disc })} />
        </div>
      )}

      <div className="d-grid2">
        <Card title={hourly ? s('ordersToday') : s('ordersPerDay')} sub={s('hoverRevenue')}>
          {sum.orders ? (
            hourly
              ? <Columns data={sum.perHour.map((v, h) => ({ label: String(h), value: v, tip: `${h}:00 · ${v}` }))} ticks={['12 AM', '6 AM', '12 PM', '6 PM', '11 PM']} />
              : <Columns data={sum.perDay.map((d) => ({ label: shortDay(d.day), value: d.orders, tip: `${shortDay(d.day)} · ${d.orders} · ${iqd(d.revenue)} IQD` }))} first={shortDay(sum.perDay[0].day)} last={shortDay(sum.perDay[sum.perDay.length - 1].day)} />
          ) : <p className="d-empty">{s('noOrdersRange')}</p>}
        </Card>
        <Card title={s('busiestHours')} icon={<I.clock />} sub={s('busiestSub')}>
          {sum.orders
            ? <Columns tone="caramel" data={sum.perHour.map((v, h) => ({ label: String(h), value: v, tip: `${h}:00 · ${v}` }))} ticks={['12 AM', '6 AM', '12 PM', '6 PM', '11 PM']} />
            : <p className="d-empty">{s('noOrdersRange')}</p>}
        </Card>
        <Card title={s('topSellers')} sub={s('topSellersSub')}>
          <Bars rows={sum.top} empty={s('noOrdersRange')} />
        </Card>
        <Card title={s('byCategory')} sub={s('byCategorySub')}>
          <Bars tone="caramel" rows={sum.cats.map((c) => ({ label: catLabel(c.id, lang), value: c.value, share: sum.units ? Math.round((c.value / sum.units) * 100) : 0 }))} empty={s('noOrdersRange')} />
        </Card>
      </div>

      <h2 className="d-h2">{s('stepTimes')}</h2>
      <Card title={s('stepTimesTitle')} sub={s('stepTimesSub', { n: steps.orders })} icon={<I.clock />}
        right={<div className="d-seg small" role="tablist" aria-label={s('deliveryPickup')}>
          <button type="button" role="tab" aria-selected={how === 'delivery'} className={how === 'delivery' ? 'on' : ''} onClick={() => setHow('delivery')}>{s('stepDelivery')}</button>
          <button type="button" role="tab" aria-selected={how === 'pickup'} className={how === 'pickup' ? 'on' : ''} onClick={() => setHow('pickup')}>{s('stepPickup')}</button>
        </div>}>
        {steps.orders ? (
          <>
            <table className="d-steps">
              <thead><tr><th>{s('stepCol')}</th><th>{s('stepAvg')}</th><th aria-hidden="true" /><th>{s('stepMedian')}</th><th>{s('stepSlow')}</th><th>{s('orders')}</th></tr></thead>
              <tbody>
                {steps.steps.map((x) => (
                  <tr key={x.key} className={x.key === 'total' || x.key === 'out' ? 'total' : ''}>
                    <th scope="row">{s(STEP_LABEL[x.key])}</th>
                    <td><b>{x.n ? mins(x.avg) : '-'}</b></td>
                    <td className="d-steps-bar">{single(x.key) && x.n > 0 && <i style={{ width: `${Math.max(2, (x.avg / slowest) * 100)}%` }} />}</td>
                    <td>{x.n ? mins(x.median) : '-'}</td>
                    <td>{x.n ? mins(x.slow) : '-'}</td>
                    <td>{x.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="d-hint">{s('stepNote')}{how === 'delivery' && steps.skippedRoad > 0 ? ` ${s('stepRoadSkipped', { n: steps.skippedRoad })}` : ''}{headline && headline.n ? ` ${s(how === 'delivery' ? 'stepOutNote' : 'stepTotalNote', { t: mins(headline.avg) })}` : ''}{how === 'delivery' ? ` ${s('stepRoadNote')}` : ''}</p>
          </>
        ) : <p className="d-empty">{s('noOrdersRange')}</p>}
      </Card>

      <h2 className="d-h2">{s('traffic')}</h2>
      <div className="d-stats">
        <Stat icon={<I.eye />} value={tr.total.toLocaleString('en-US')} label={s('totalVisits')} />
        <Stat icon={<I.trend />} value={tr.avg.toLocaleString('en-US')} label={s('avgPerDay')} />
        <Stat icon={<I.people />} tone="red" value={tr.sources.length} label={s('trafficSources')} />
        <Stat icon={<I.events />} tone="green" value={tr.best?.n ?? 0} label={s('bestDay')} note={tr.best ? shortDay(new Date(tr.best.day + 'T00:00').getTime()) : undefined} />
      </div>
      <div className="d-grid2">
        <Card title={s('trafficSources')}>
          <Bars rows={tr.sources.map((x) => ({ ...x, color: SOURCE_COLOR[x.label] }))} empty={s('noVisits')} />
        </Card>
        <Card title={s('dailyVisits')} sub={s(RANGE_LABEL[range])}>
          {tr.total
            ? <Columns data={tr.perDay.map((d) => ({ label: shortDay(d.day), value: d.n, tip: `${shortDay(d.day)} · ${d.n}` }))} first={shortDay(tr.perDay[0].day)} last={shortDay(tr.perDay[tr.perDay.length - 1].day)} />
            : <p className="d-empty">{s('noVisits')}</p>}
        </Card>
      </div>
      <Card title={s('howTrack')} className="d-note-card">
        <p>{s('howTrackText')}</p>
      </Card>
    </>
  )
}
