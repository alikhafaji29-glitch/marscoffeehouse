import { useState } from 'react'
import { useLang } from '../i18n'
import type { Lang, TKey } from '../i18n'
import { iqd, waNumber } from '../account'
import type { Order } from '../account'
import { CANCEL_REASONS, LEAD_MIN, STAGES, dueOf, groupLines, isActive, isCancelled, isLater, mergedInto, nextStage, reasonText, stageIndex, stagesFor, timeText, untilText, useNow, whenText } from '../orders'
import { branchName, settingsFor, useStaff } from './store'
import { printReceipt } from './receipt'
import type { ReceiptText } from './receipt'
import type { Stage } from '../orders'
import { IconCheck, IconPin } from '../components/Icons'
import { mapsLink } from '../components/ShareLocation'
import { cancelOrder, mergeOrders, moveOrder, sendWhatsApp } from './remote'
import { useS } from './strings'
import { backendOn } from '../backend'
import { I } from './ui'

/*
 * Orders: the incoming orders and the buttons that move each one through the tracking stages the customer sees
 * (request received → preparing → done → on the way → order received). DEMO: the orders stored in this browser;
 * see src/orders.ts for what the real version needs.
 */
export const STAGE_LABEL: Record<Stage, TKey> = { received: 'stReceived', preparing: 'stPreparing', done: 'stDone', onway: 'stOnWay', delivered: 'stDelivered' }

export function ago(at: number, now: number, lang: Lang, justNow: string): string {
  const s = Math.round((now - at) / 1000)
  if (s < 45) return justNow
  const [n, unit, short]: [number, Intl.RelativeTimeFormatUnit, string] = s < 3600 ? [Math.round(s / 60), 'minute', 'min'] : s < 86400 ? [Math.round(s / 3600), 'hour', 'h'] : [Math.round(s / 86400), 'day', 'd']
  // old browser engines (the Sunmi D2mini's, before Chrome 71) have no RelativeTimeFormat: "8 min" instead of crashing
  if (typeof Intl.RelativeTimeFormat !== 'function') return `${n} ${short}`
  return new Intl.RelativeTimeFormat(lang === 'ku' ? 'ckb' : lang, { numeric: 'always' }).format(-n, unit)
}

const phoneOf = (o: Order) => o.delivery?.phone ?? o.customer?.phone ?? ''

/*
 * Send a delivery order to a driver on WhatsApp (owner, 2026-10-23): one button per driver set in Tools, and Other…
 * to pick any chat. A driver button sends through the WhatsApp Cloud API (owner, 2026-10-24) with no step in WhatsApp;
 * when that cannot send (not set up yet, Meta refuses) WhatsApp opens with the order written out (who, phone, address,
 * map link, items, note, what to collect) and staff press Send there, as before. Other… always opens WhatsApp.
 * This device remembers who it went to, to show on the card.
 */
const SENT_KEY = 'mars-staff-sent'
const readSent = (): Record<string, { name: string; at: number; api?: boolean }> => { try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}') } catch { return {} } }
function SendToDriver({ o }: { o: Order }) {
  const { t, lang } = useLang()
  const s = useS()
  const now = useNow(30000)
  const viewing = useStaff().branch
  const drivers = (settingsFor(o.branch ?? viewing).drivers ?? []).filter((d) => d.phone.replace(/\D/g, '').length >= 8)
  const key = o.uid ?? o.id
  const [sent, setSent] = useState(() => readSent()[key])
  const text = () => {
    const lines = [`Mars CoffeeHouse · ${branchName(o.branch)} · #${o.id}`, '']
    if (o.customer) lines.push(`${s('waCustomer')}: ${o.customer.name} · ${phoneOf(o)}`)
    if (o.delivery?.address) lines.push(`${s('waAddress')}: ${o.delivery.address}`)
    // the plain map link of the customer's pin (owner chose it over a directions link, 2026-10-23); WhatsApp links cannot carry a location pin
    if (o.delivery?.location) lines.push(`${s('waLocation')}: ${mapsLink(o.delivery.location)}`)
    lines.push('')
    for (const g of groupLines(o.items)) { if (g.combo) lines.push(s('comboN', { n: g.combo })); for (const x of g.lines) lines.push('• ' + x) }
    if (o.note) lines.push('', `${t('orderNote')}: ${o.note}`)
    lines.push('', o.pay === 'wallet' ? t('paidByWallet') : s('waCollect', { n: iqd(o.total) }))
    return lines.join('\n')
  }
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')
  const remember = (name: string, api?: boolean) => {
    const all = readSent()
    all[key] = { name, at: Date.now(), ...(api && { api }) }
    try { localStorage.setItem(SENT_KEY, JSON.stringify(all)) } catch { /* ignore */ }
    setSent(all[key])
  }
  const send = async (name: string, phone?: string) => {
    setFailed('')
    if (phone && o.uid) {
      setBusy(true)
      const r = await sendWhatsApp(o.uid, waNumber(phone), text(), lang) // the template in the dashboard's language (Kurdish: Arabic)
      setBusy(false)
      if (r.ok) { remember(name, true); return }
      // not set up yet (or no backend): quietly the old way; a real refusal is shown
      if (r.reason !== 'not_configured' && r.reason !== 'no_backend' && r.reason !== 'unreachable') setFailed(s('waApiFailed', { why: r.message || r.reason || '?' }))
    }
    const w = window.open(`https://wa.me/${phone ? waNumber(phone) : ''}?text=${encodeURIComponent(text())}`, '_blank')
    if (w) w.opener = null
    remember(name)
  }
  return (
    <>
      {/* in the card's action row, beside Print receipt (owner, 2026-10-23) */}
      {drivers.map((d, i) => <button key={i} type="button" className="staff-wa" title={s('sendToDriver')} disabled={busy} onClick={() => void send(d.name || d.phone, d.phone)}><I.whatsapp />{busy ? s('waSending') : d.name || d.phone}</button>)}
      <button type="button" className={'staff-wa' + (drivers.length ? ' other' : '')} title={s('sendToDriver')} disabled={busy} onClick={() => void send(drivers.length ? s('sendOther') : 'WhatsApp')}><I.whatsapp />{drivers.length ? s('sendOther') : s('sendWhatsapp')}</button>
      {failed && <small className="staff-sent staff-wa-failed" role="alert">{failed}</small>}
      {sent && <small className="staff-sent">{s(sent.api ? 'sentApi' : 'sentTo', { name: sent.name, t: ago(sent.at, now, lang, t('justNow')) })}</small>}
    </>
  )
}

/** the receipt's words for an order, in the dashboard's language (the Print button and auto-print use it) */
export function useReceiptText(): (o: Order) => ReceiptText {
  const { t, lang } = useLang()
  const s = useS()
  return (o) => ({
    branch: branchName(o.branch),
    dir: lang === 'en' ? 'ltr' : 'rtl',
    when: whenText(o.at, lang),
    how: o.fulfil === 'delivery' ? t('getDelivery') : t('getPickup'),
    scheduled: o.offer?.wantAt ? t('scheduledFor').replace('{t}', whenText(o.offer.wantAt, lang)) : o.arriveAt ? s('arriveAt', { t: timeText(o.arriveAt, lang) }) : undefined,
    customer: s('secCustomer'),
    combo: (n) => s('comboN', { n }),
    note: t('orderNote'),
    deliverTo: o.giftTo ? `${t('giftFor')} ${o.giftTo}` : s('secDeliverTo'),
    pay: o.pay === 'wallet' ? t('paidByWallet') : o.fulfil === 'delivery' ? t('payOnDelivery') : t('payAtPickup'),
    fee: o.offer?.fee ? s('inclFee', { n: iqd(o.offer.fee) }) : undefined,
    thanks: s('rcThanks'),
  })
}
const PrintIcon = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /></svg>
export const PhoneIcon = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
/*
 * The same customer placing a second order soon after the first (owner, 2026-10-24: customers order one combo, then
 * another, instead of several in one order): the active orders from the same phone, in the same branch, within 30
 * minutes of this one, so staff prepare and deliver them together.
 */
const SAME_WINDOW = 30 * 60_000
const phoneKey = (o: Order) => phoneOf(o).replace(/\D/g, '').slice(-9)
export function sameCustomer(o: Order, all: Order[]): Order[] {
  const k = phoneKey(o)
  if (k.length < 9 || !isActive(o)) return []
  return all.filter((x) => x !== o && (x.uid ?? x.id) !== (o.uid ?? o.id) && isActive(x) && (x.branch ?? '') === (o.branch ?? '') && Math.abs(x.at - o.at) <= SAME_WINDOW && phoneKey(x) === k).sort((a, b) => a.at - b.at)
}

export function OrderCard({ o, lead = LEAD_MIN, all = [] }: { o: Order; lead?: number; all?: Order[] }) {
  const { t, lang } = useLang()
  const s = useS()
  const now = useNow(15000)
  const cur = stageIndex(o)
  const next = nextStage(o)
  const stages = stagesFor(o)
  const cancelled = isCancelled(o)
  const receipt = useReceiptText()
  const same = sameCustomer(o, all)
  const [merging, setMerging] = useState('') // the order waiting for the confirming second tap
  const [mergeBusy, setMergeBusy] = useState(false)
  const [mergeError, setMergeError] = useState('')
  const merge = async (keep: Order, absorb: Order) => {
    const id = absorb.uid ?? absorb.id
    if (merging !== id) { setMerging(id); setMergeError(''); return }
    setMergeBusy(true)
    const why = await mergeOrders(keep, absorb)
    setMergeBusy(false)
    setMerging('')
    if (why) setMergeError(why)
  }
  // cancelling: a reason is required, a ready-made one or the staff's own words
  const [asking, setAsking] = useState(false)
  const [why, setWhy] = useState('')
  const [other, setOther] = useState('')
  const [need, setNeed] = useState(false)
  const confirmCancel = () => {
    const reason = why === 'other' ? other.trim().slice(0, 200) : why ? 'r:' + why : ''
    if (!reason) { setNeed(true); return }
    cancelOrder(o, reason)
    setAsking(false)
  }
  return (
    <article id={'order-' + o.id} className={'staff-order' + (isActive(o) ? '' : ' finished') + (cancelled ? ' cancelled' : '')}>
      <header className="staff-order-head">
        <b dir="ltr">#{o.id}</b>
        <span className="staff-ago">{ago(o.at, now, lang, t('justNow'))}</span>
        <span className={'staff-stage s-' + (cancelled ? 'cancelled' : stages[cur])}>{cancelled ? t('stCancelled') : t(STAGE_LABEL[stages[cur]])}</span>
      </header>
      <p className="staff-badges">
        <span className={'staff-how ' + (o.fulfil === 'delivery' ? 'deliv' : 'pick')}>{o.fulfil === 'delivery' ? t('getDelivery') : t('getPickup')}</span>
        {o.giftTo && <span className="staff-how gift">{t('giftBadge')}</span>}
        {o.offer && <span className="staff-how offer">{o.offer.name}{(o.offer.count ?? 1) > 1 && <span dir="ltr"> ×{o.offer.count}</span>}</span>}
        {o.offer?.pre && <span className="staff-how pre">{s('preOrderBadge')}</span>}
        {dueOf(o) && isActive(o) && (o.status ?? 'received') === 'received' && !isLater(o, now, lead) && <span className="staff-how now">{s('makeNow')}</span>}
      </p>
      {same.length > 0 && (
        <p className="staff-same" role="note">
          <b>{s('sameCustomer')}</b>{' '}
          {same.map((x) => <button key={x.uid ?? x.id} type="button" className="link-btn" dir="ltr" onClick={() => document.getElementById('order-' + x.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>#{x.id}</button>)}
          <small> · {s('sameTogether')}</small>
          {/* merge (2026-10-24): the newer order always goes into the older one; a second tap confirms */}
          {backendOn && same.map((x) => {
            const [keep, absorb] = x.at < o.at ? [x, o] : [o, x]
            const id = absorb.uid ?? absorb.id
            return (
              <button key={'m' + id} type="button" className={'staff-merge' + (merging === id ? ' sure' : '')} disabled={mergeBusy} onClick={() => void merge(keep, absorb)}>
                {merging === id ? s('mergeSure', { a: absorb.id, b: keep.id }) : keep === o ? s('mergeHere', { code: absorb.id }) : s('mergeInto', { code: keep.id })}
              </button>
            )
          })}
          {mergeError && <small className="staff-merge-err" role="alert">{s('mergeFailed', { why: mergeError })}</small>}
        </p>
      )}
      {o.offer?.wantAt && <p className="staff-want">{t('scheduledFor').replace('{t}', whenText(o.offer.wantAt, lang))}{isActive(o) && o.offer.wantAt > now && <small> · {s('inTime', { t: untilText(o.offer.wantAt, now, s('hShort'), s('minShort')) })}</small>}</p>}
      {o.arriveAt && <p className="staff-want">{s('arriveAt', { t: timeText(o.arriveAt, lang) })}{isActive(o) && o.arriveAt > now && <small> · {s('inTime', { t: untilText(o.arriveAt, now, s('hShort'), s('minShort')) })}</small>}</p>}
      {/* top to bottom, as the cashier works through it (owner, 2026-10-19): who, how to reach them, what, where */}
      {o.customer && (
        <div className="staff-sec staff-who">
          <span className="staff-sec-label">{s('secCustomer')}</span>
          <b className="staff-name">{o.customer.name}</b>
          <a className="staff-phone" dir="ltr" href={'tel:' + phoneOf(o)}><PhoneIcon />{phoneOf(o)}</a>
        </div>
      )}
      <div className="staff-sec">
        <span className="staff-sec-label">{s('secOrder')}</span>
        {groupLines(o.items).map((g, k) => (
          <div key={k} className="staff-combo">
            {g.combo && <span className="staff-combo-label">{s('comboN', { n: g.combo })}</span>}
            <ul className="staff-items">{g.lines.map((it, i) => <li key={i}>{it}</li>)}</ul>
          </div>
        ))}
        {o.note && <p className="staff-note"><b>{t('orderNote')}:</b> {o.note}</p>}
      </div>
      {o.delivery && (
        <div className="staff-sec staff-where">
          <span className="staff-sec-label">{o.giftTo ? `${t('giftFor')} ${o.giftTo}` : s('secDeliverTo')}</span>
          {o.delivery.address && <p className="staff-address">{o.delivery.address}</p>}
          {o.delivery.location && <a className="staff-map" href={mapsLink(o.delivery.location)} target="_blank" rel="noreferrer"><IconPin />{s('openInMaps')}</a>}
        </div>
      )}
      <p className="staff-total"><b dir="ltr">{iqd(o.total)} IQD</b> · {o.pay === 'wallet' ? t('paidByWallet') : o.fulfil === 'delivery' ? t('payOnDelivery') : t('payAtPickup')}{o.offer?.fee ? <> · {s('inclFee', { n: iqd(o.offer.fee) })}</> : null}</p>
      <div className="staff-acts" role="group">
        <button type="button" className="staff-print" onClick={() => printReceipt(o, receipt(o))}><PrintIcon />{s('printReceipt')}</button>
        {o.fulfil === 'delivery' && !cancelled && isActive(o) && <SendToDriver o={o} />}
      </div>
      {cancelled && <p className="staff-cancel-reason"><b>{t('cancelReason')}:</b> {reasonText(o.cancelReason, t)}</p>}
      {!cancelled && <ol className="staff-steps" aria-label={t('trackOrder')}>
        {stages.map((st, i) => (
          <li key={st} className={i < cur ? 'past' : i === cur ? 'now' : ''}>
            <button type="button" onClick={() => moveOrder(o, st)} aria-current={i === cur ? 'step' : undefined}>
              <span className="staff-dot">{i < cur ? <IconCheck /> : i + 1}</span>
              <span>{t(STAGE_LABEL[st])}</span>
            </button>
          </li>
        ))}
      </ol>}
      {next && !cancelled && (
        <button type="button" className="staff-next" onClick={() => moveOrder(o, next)}>
          {t('markAs').replace('{stage}', t(STAGE_LABEL[next]))}
        </button>
      )}
      {isActive(o) && !asking && <button type="button" className="staff-cancel" onClick={() => setAsking(true)}>{s('cancelOrder')}</button>}
      {isActive(o) && asking && (
        <div className="staff-cancel-box" role="group" aria-label={s('cancelOrder')}>
          <p>{s('cancelWhy')}</p>
          {[...CANCEL_REASONS, 'other' as const].map((r) => (
            <label key={r} className="staff-cancel-opt">
              <input type="radio" name={'why-' + (o.uid ?? o.id)} checked={why === r} onChange={() => { setWhy(r); setNeed(false) }} />
              <span>{r === 'other' ? s('cancelOther') : t(('cr_' + r) as TKey)}</span>
            </label>
          ))}
          {why === 'other' && <input className="staff-cancel-text" maxLength={200} value={other} placeholder={s('cancelOtherPh')} onChange={(e) => { setOther(e.target.value); setNeed(false) }} />}
          {need && <p className="staff-cancel-need" role="alert">{s('cancelNeed')}</p>}
          <div className="staff-cancel-acts">
            <button type="button" className="staff-cancel-go" onClick={confirmCancel}>{s('cancelConfirm')}</button>
            <button type="button" className="staff-cancel-keep" onClick={() => { setAsking(false); setNeed(false) }}>{s('cancelKeep')}</button>
          </div>
        </div>
      )}
    </article>
  )
}

/*
 * Filter for the Orders page and the Dashboard (owner, 2026-10-24: "filter by date defaulted to today's date, by name,
 * by phone number"; "dashboard too"). The date follows the clock while it is on today (it moves on at midnight by
 * itself); '' = all dates. An order belongs to a day when it was placed that day or is scheduled for it. The search
 * matches the customer's name, or any part of the phone number however it was typed.
 */
const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export type OrderFilter = { day: string; today: boolean; q: string; setDay: (d: string | null) => void; setQ: (q: string) => void; byDay: (o: Order) => boolean; byText: (o: Order) => boolean }
export function useOrderFilter(): OrderFilter {
  const now = useNow(60000)
  const [picked, setPicked] = useState<string | null>(null) // null = today, '' = all dates, else YYYY-MM-DD
  const [q, setQ] = useState('')
  const day = picked ?? dayKey(now)
  const words = q.trim().toLowerCase()
  const digits = q.replace(/\D/g, '').replace(/^(00964|964|0)/, '')
  return {
    day, today: picked === null, q, setDay: setPicked, setQ,
    byDay: (o) => !day || dayKey(o.at) === day || (dueOf(o) !== undefined && dayKey(dueOf(o)!) === day),
    byText: (o) => {
      if (!words) return true
      if ((o.customer?.name ?? '').toLowerCase().includes(words) || o.id.toLowerCase().includes(words)) return true
      return digits.length >= 3 && [o.customer?.phone, o.delivery?.phone].some((p) => (p ?? '').replace(/\D/g, '').includes(digits))
    },
  }
}
export function OrderFilterBar({ f }: { f: OrderFilter }) {
  const s = useS()
  return (
    <div className="staff-filter" role="search">
      <label className="staff-filter-date">
        <span>{s('fDate')}</span>
        <input type="date" value={f.day} onChange={(e) => f.setDay(e.target.value)} dir="ltr" />
      </label>
      <button type="button" className={'staff-filter-chip' + (f.today ? ' on' : '')} onClick={() => f.setDay(null)}>{s('fToday')}</button>
      <button type="button" className={'staff-filter-chip' + (f.day === '' ? ' on' : '')} onClick={() => f.setDay('')}>{s('fAllDates')}</button>
      <span className="staff-filter-q">
        <input type="search" value={f.q} onChange={(e) => f.setQ(e.target.value)} placeholder={s('fSearch')} aria-label={s('fSearch')} />
        {f.q && <button type="button" className="link-btn" onClick={() => f.setQ('')}>{s('fClear')}</button>}
      </span>
    </div>
  )
}

export function Orders({ orders: everything, live = false }: { orders: Order[]; live?: boolean }) {
  const { t } = useLang()
  const s = useS()
  const f = useOrderFilter()
  const orders = everything.filter((o) => f.byDay(o) && f.byText(o))
  const [tab, setTab] = useState<'active' | 'later' | 'all' | Stage | 'cancelled'>('active')
  const branch = useStaff().branch
  const lead = settingsFor(branch).lead ?? LEAD_MIN
  const now = useNow(15000)
  // a timed order more than `lead` minutes away waits under Later; Active is sorted by when each order is needed
  // (its time, else when it was placed), the soonest first (owner, 2026-10-22)
  const need = (o: Order) => dueOf(o) ?? o.at
  const later = orders.filter((o) => isLater(o, now, lead)).sort((a, b) => need(a) - need(b))
  const active = orders.filter((o) => isActive(o) && !isLater(o, now, lead)).sort((a, b) => need(a) - need(b))
  const shown = tab === 'active' ? active : tab === 'later' ? later : tab === 'all' ? orders : orders.filter((o) => (o.status ?? 'received') === tab && !isLater(o, now, lead))
  const counts = STAGES.map((st) => orders.filter((o) => (o.status ?? 'received') === st && !isLater(o, now, lead)).length)
  const cancelledCount = orders.filter((o) => isCancelled(o) && !mergedInto(o)).length // a merged order was not lost
  return (
    <>
      <p className="d-lead">{s('ordersLead')}</p>
      <OrderFilterBar f={f} />
      {/* the stage counters are tabs too: tap one to see just that stage, tap it again to go back to Active */}
      <div className="staff-counts" role="tablist" aria-label={s('navOrders')}>
        {STAGES.map((st, i) => (
          <button key={st} role="tab" aria-selected={tab === st} className={'s-' + st + (tab === st ? ' on' : '')} onClick={() => setTab(tab === st ? 'active' : st)}>
            <b>{counts[i]}</b><span>{t(STAGE_LABEL[st])}</span>
          </button>
        ))}
        <button role="tab" aria-selected={tab === 'cancelled'} className={'s-cancelled' + (tab === 'cancelled' ? ' on' : '')} onClick={() => setTab(tab === 'cancelled' ? 'active' : 'cancelled')}>
          <b>{cancelledCount}</b><span>{t('stCancelled')}</span>
        </button>
      </div>
      <div className="staff-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'active'} className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>{t('staffActive')} · {active.length}</button>
        <button role="tab" aria-selected={tab === 'later'} className={tab === 'later' ? 'on' : ''} onClick={() => setTab('later')}>{s('laterTab')} · {later.length}</button>
        <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{t('staffAll')} · {orders.length}</button>
      </div>
      {shown.length ? <div className="staff-list">{shown.map((o) => <OrderCard key={o.uid ?? o.id} o={o} lead={lead} all={everything} />)}</div> : <p className="staff-empty">{tab === 'later' ? s('laterNone') : everything.length ? t('staffNoneHere') : t('staffNoOrders')}</p>}
      {!live && <p className="demo-note">{t('staffDemoNote')}</p>}
    </>
  )
}
