import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../i18n'
import { iqd } from '../account'
import type { Order } from '../account'
import { backendOn } from '../backend'
import { branchName, settingsFor, useStaff } from './store'
import type { CourierShare, Driver } from './store'
import { deliveredOrders, setCourier } from './remote'
import { useS } from './strings'
import { Card, Stat, I } from './ui'
import { dayKey, startOf } from './stats'

/*
 * Deliveries (owner, 2026-10-28: "a report for the delivery companies to collect revenues from them, and to give them their
 * share"). For a range of days (today unless chosen), per delivery company: the delivered orders (free gifts included,
 * cancelled ones never), the money they collected from customers (each order's total, after any discount; a gift is 0),
 * their share as set in Tools → Delivery drivers (a fixed amount per order, a percentage of what the customer paid, or
 * the delivery fee on the order), and what Mars receives from them. Orders with no company are listed apart with a choice,
 * and every listed order can be moved to another company (owner, 2026-10-28: "add the ability to change the delivery
 * company in reports"), so the report can be fixed on the spot. Print and CSV (the same text on the clipboard).
 */
type Line = { o: Order; share: number }
const DAY = 86400000
const dateValue = (t: number) => dayKey(t)
const fromValue = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d).getTime() }

/** what the company keeps of one order */
export function shareOf(o: Order, share?: CourierShare): number {
  if (!share) return 0
  if (share.kind === 'fixed') return share.value
  if (share.kind === 'pct') return Math.round((o.total * share.value) / 100)
  if (share.kind === 'both') return share.value + Math.round((o.total * (share.pct ?? 0)) / 100)
  return o.offer?.fee ?? 0
}

export function Deliveries({ orders: here }: { orders: Order[] }) {
  const { lang } = useLang()
  const s = useS()
  const branch = useStaff().branch
  const drivers: Driver[] = settingsFor(branch).drivers ?? []
  const today = startOf(Date.now())
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [rows, setRows] = useState<Order[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tick, setTick] = useState(0)
  const end = to + DAY
  useEffect(() => {
    let live = true
    setFailed(false)
    if (!backendOn) {
      // the demo: this device's orders
      setRows(here.filter((o) => (o.branch ?? 'erbil') === branch && o.fulfil === 'delivery' && o.status === 'delivered' && o.at >= from && o.at < end))
      return
    }
    setRows(null)
    void deliveredOrders(branch, from, end).then((r) => { if (!live) return; if (r) setRows(r); else setFailed(true) })
    return () => { live = false }
  }, [branch, from, end, tick, backendOn ? 0 : here]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const list = rows ?? []
    const names = [...drivers.map((d) => d.name || d.phone), ...list.map((o) => o.courier).filter((c): c is string => !!c)]
    return [...new Set(names)].map((name) => {
      const d = drivers.find((x) => (x.name || x.phone) === name)
      const lines: Line[] = list.filter((o) => o.courier === name).map((o) => ({ o, share: shareOf(o, d?.share) }))
      const collected = lines.reduce((n, l) => n + l.o.total, 0)
      const share = lines.reduce((n, l) => n + l.share, 0)
      return { name, d, lines, collected, share, gifts: lines.filter((l) => l.o.replenish).length }
    }).filter((g) => g.lines.length || g.d)
  }, [rows, drivers])
  const loose = (rows ?? []).filter((o) => !o.courier)
  // move an order to another company (or none): saved on the order, and the report follows at once
  const move = (o: Order, courier: string) => { setCourier(o, courier); setRows((rows ?? []).map((x) => (x === o ? { ...x, courier: courier || undefined } : x))) }
  const choices = drivers.map((d) => d.name || d.phone)
  const pick = (o: Order) => (
    <select aria-label={s('courierLabel')} value={o.courier ?? ''} onChange={(e) => move(o, e.target.value)}>
      <option value="">{s('courierNone')}</option>
      {[...choices, ...(o.courier && !choices.includes(o.courier) ? [o.courier] : [])].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  )
  const shareText = (d?: Driver) => !d?.share ? s('shareUnset') : d.share.kind === 'fixed' ? s('shareIsFixed', { n: iqd(d.share.value) }) : d.share.kind === 'pct' ? s('shareIsPct', { n: d.share.value }) : d.share.kind === 'both' ? s('shareIsBoth', { n: iqd(d.share.value), p: d.share.pct ?? 0 }) : s('shareIsFee')
  const range = from === to ? new Date(from).toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'ar' ? 'ar-IQ' : 'ckb-IQ') : `${new Date(from).toLocaleDateString('en-GB')} – ${new Date(to).toLocaleDateString('en-GB')}`
  const time = (t: number) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const note = (o: Order) => [o.replenish ? s('repBadge') : '', o.discount ? (o.discount.kind === 'pct' ? s('discPct', { n: o.discount.value }) : s('discFixed', { n: iqd(o.discount.value) })) : ''].filter(Boolean).join(' · ')

  const csv = () => {
    const out = [['company', 'date', 'order', 'customer', 'collected_iqd', 'share_iqd', 'note'].join(',')]
    for (const g of groups) for (const l of g.lines) out.push([g.name, time(l.o.at), l.o.id, l.o.customer?.name ?? '', l.o.total, l.share, note(l.o)].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    for (const o of loose) out.push(['', time(o.at), o.id, o.customer?.name ?? '', o.total, 0, s('courierNone')].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    return out.join('\n')
  }
  const exportCsv = () => {
    const text = csv()
    try {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
      a.download = `mars-deliveries-${branch}-${dateValue(from)}${from === to ? '' : '_' + dateValue(to)}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    } catch { /* clipboard only */ }
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) }).catch(() => {})
  }
  const print = () => {
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    const dir = lang === 'en' ? 'ltr' : 'rtl'
    const body = groups.filter((g) => g.lines.length).map((g) => `
      <h2>${esc(g.name)}</h2><p>${esc(shareText(g.d))}</p>
      <table><thead><tr><th>${esc(s('repTime'))}</th><th>${esc(s('repOrder'))}</th><th>${esc(s('secCustomer'))}</th><th>${esc(s('repCollected'))}</th><th>${esc(s('repShare'))}</th><th></th></tr></thead><tbody>
      ${g.lines.map((l) => `<tr><td>${time(l.o.at)}</td><td>#${esc(l.o.id)}</td><td>${esc(l.o.customer?.name ?? '')}</td><td>${iqd(l.o.total)}</td><td>${iqd(l.share)}</td><td>${esc(note(l.o))}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="3">${esc(s('delivN', { n: g.lines.length }))}</td><td>${iqd(g.collected)}</td><td>${iqd(g.share)}</td><td></td></tr></tfoot></table>
      <p class="sum">${esc(s('marsGets'))}: <b>${iqd(g.collected - g.share)} IQD</b></p>`).join('')
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>Mars · ${esc(s('navDeliveries'))}</title><style>
      body{font-family:system-ui,sans-serif;margin:24px;color:#10203a} h1{font-size:20px;margin:0} h2{font-size:17px;margin:22px 0 2px}
      p{margin:2px 0 8px;color:#445} table{width:100%;border-collapse:collapse;font-size:13px} th,td{border-bottom:1px solid #ccd;padding:5px 6px;text-align:start}
      tfoot td{font-weight:700;border-top:2px solid #10203a} .sum{font-size:15px;color:#10203a}
    </style></head><body><h1>Mars CoffeeHouse · ${esc(branchName(branch))} · ${esc(s('navDeliveries'))}</h1><p>${esc(range)}</p>${body || `<p>${esc(s('delivNone'))}</p>`}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  return (
    <>
      <p className="d-lead">{s('delivLead')}</p>
      <div className="d-toolbar deliv-bar">
        <label className="deliv-date"><span>{s('delivFrom')}</span><input type="date" value={dateValue(from)} max={dateValue(to)} onChange={(e) => e.target.value && setFrom(fromValue(e.target.value))} /></label>
        <label className="deliv-date"><span>{s('delivTo')}</span><input type="date" value={dateValue(to)} min={dateValue(from)} onChange={(e) => e.target.value && setTo(fromValue(e.target.value))} /></label>
        <button type="button" className={'d-btn' + (from === today && to === today ? ' solid' : ' outline')} onClick={() => { setFrom(today); setTo(today) }}>{s('fToday')}</button>
        <button type="button" className="d-btn outline" onClick={print} disabled={!rows?.length}>{s('printReport')}</button>
        <button type="button" className="d-btn outline" onClick={exportCsv} disabled={!rows?.length}><I.download />{copied ? s('csvCopied') : s('exportCsv')}</button>
      </div>
      {failed ? <p className="d-hint">{s('delivFailed')} <button type="button" className="link-btn" onClick={() => setTick(tick + 1)}>{s('delivRetry')}</button></p>
        : rows === null ? <p className="d-hint">{s('delivLoading')}</p>
          : (
            <>
              {groups.map((g) => (
                <Card key={g.name} title={g.name} sub={shareText(g.d)}>
                  <div className="d-stats deliv-stats">
                    <Stat icon={<I.bike />} tone="sky" value={String(g.lines.length)} label={s('delivOrders')} note={g.gifts ? s('delivGifts', { n: g.gifts }) : undefined} />
                    <Stat icon={<I.money />} tone="green" value={iqd(g.collected)} label={s('repCollected')} />
                    <Stat icon={<I.receipt />} tone="caramel" value={iqd(g.share)} label={s('repShare')} />
                    <Stat icon={<I.money />} value={iqd(g.collected - g.share)} label={s('marsGets')} />
                  </div>
                  {g.lines.length > 0 && (
                    <details className="deliv-list">
                      <summary>{s('delivShowOrders', { n: g.lines.length })}</summary>
                      <table>
                        <thead><tr><th>{s('repTime')}</th><th>{s('repOrder')}</th><th>{s('secCustomer')}</th><th>{s('repCollected')}</th><th>{s('repShare')}</th><th /><th>{s('courierLabel')}</th></tr></thead>
                        <tbody>{g.lines.map((l) => <tr key={l.o.uid ?? l.o.id}><td dir="ltr">{time(l.o.at)}</td><td dir="ltr">#{l.o.id}</td><td>{l.o.customer?.name}</td><td dir="ltr">{iqd(l.o.total)}</td><td dir="ltr">{iqd(l.share)}</td><td>{note(l.o)}</td><td>{pick(l.o)}</td></tr>)}</tbody>
                      </table>
                    </details>
                  )}
                </Card>
              ))}
              {loose.length > 0 && (
                <Card title={s('delivLoose', { n: loose.length })} sub={s('delivLooseSub')}>
                  <ul className="deliv-loose">
                    {loose.map((o) => (
                      <li key={o.uid ?? o.id}>
                        <span dir="ltr">{time(o.at)}</span> · <b dir="ltr">#{o.id}</b> · {o.customer?.name} · <span dir="ltr">{iqd(o.total)} IQD</span>
                        {pick(o)}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {!rows.length && <p className="d-hint">{s('delivNone')}</p>}
            </>
          )}
    </>
  )
}
