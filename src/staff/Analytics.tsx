import { useMemo, useState } from 'react'
import { useLang } from '../i18n'
import { iqd } from '../account'
import type { Order } from '../account'
import { useNow } from '../orders'
import { catLabel } from '../components/MenuSection'
import { RANGES, dayKey, rowsFromOrders, sampleRows, sampleVisits, summarize, toCsv, traffic } from './stats'
import type { Range } from './stats'
import { useStaff } from './store'
import { useS } from './strings'
import type { SKey } from './strings'
import { Bars, Card, Columns, I, Stat, Switch } from './ui'

/* Analytics, after the live panel: a range, then Sales (orders, revenue, what sells, when) and Traffic (visits and
 * where they come from). Real numbers are this browser's orders and visits; "Sample data" shows made-up ones. */
const RANGE_LABEL: Record<Range, SKey> = { today: 'rToday', '7': 'r7', '30': 'r30', '90': 'r90', all: 'rAll' }
const SOURCE_COLOR: Record<string, string> = { Instagram: '#e0336e', Direct: '#8a94a6', Referral: '#db863a', Google: '#397dc9', Facebook: '#002f6d' }
const shortDay = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export function Analytics({ orders }: { orders: Order[] }) {
  const s = useS()
  const { lang } = useLang()
  const data = useStaff()
  const now = useNow(60000)
  const [range, setRange] = useState<Range>('30')
  const [sample, setSample] = useState(orders.length < 3)
  const [copied, setCopied] = useState(false)
  const rows = useMemo(() => (sample ? sampleRows(data.branch, now) : rowsFromOrders(orders)), [sample, data.branch, orders, now])
  const visits = useMemo(() => (sample ? sampleVisits(data.branch, now) : data.visits), [sample, data.branch, data.visits, now])
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
        <label className="d-inline-switch"><Switch on={sample} onChange={setSample} label={s('sampleData')} /><span>{s('sampleData')}</span></label>
        <button type="button" className="d-btn outline" onClick={exportCsv}><I.download />{copied ? s('csvCopied') : s('exportCsv')}</button>
      </div>
      {sample && <p className="d-banner">{s('sampleNote')}</p>}

      <h2 className="d-h2">{s('sales')}</h2>
      <div className="d-stats">
        <Stat icon={<I.receipt />} value={sum.orders.toLocaleString('en-US')} label={s('orders')} note={s('ordersSplit', { done: sum.done, pending: sum.pending })} />
        <Stat icon={<I.money />} tone="green" value={iqd(sum.revenue)} label={s('revenueIqd')} note={s('avgOrder', { n: iqd(sum.avg) })} />
        <Stat icon={<I.bag />} tone="caramel" value={sum.units.toLocaleString('en-US')} label={s('itemsSold')} note={sum.orders ? `${s('perOrder', { n: (sum.units / sum.orders).toFixed(1) })}${sum.combos ? ` · ${s('nCombos', { n: sum.combos })}` : ''}` : undefined} />
        <Stat icon={<I.bike />} tone="sky" value={`${sum.delivery} / ${sum.pickup}`} label={s('deliveryPickup')} />
      </div>

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
