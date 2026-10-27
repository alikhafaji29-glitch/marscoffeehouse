import { useEffect, useState } from 'react'
import { dict, useLang } from '../i18n'
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
import { applyPreviousPin, cancelOrder, mergeOrders, moveOrder, previousPins, sendWhatsApp } from './remote'
import type { PrevPin } from './remote'
import { sIn, useS } from './strings'
import type { SKey } from './strings'
import { ALL_ITEMS } from '../menu'
import { nameOf } from '../menuAdmin'
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
/* An order without a pin: the same customer's earlier pins at this branch, to add one after confirming with the
 * customer that it is the same place (owner, 2026-10-27: "for sure that's after they make sure it's the same location") */
const pinDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' + new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
function PreviousPins({ o }: { o: Order }) {
  const s = useS()
  // looked up once when the card shows; the button only appears when there is an earlier pin (owner, 2026-10-27: "yet they
  // don't have, why you show this message?")
  const [pins, setPins] = useState<PrevPin[] | null>(null)
  const [open, setOpen] = useState(false)
  const [sure, setSure] = useState('')
  const [failed, setFailed] = useState(false)
  const key = o.uid ?? o.id
  useEffect(() => {
    let live = true
    void previousPins(o).then((p) => { if (live) setPins(p ?? []) })
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const use = async (p: PrevPin) => {
    setFailed(false)
    if (!(await applyPreviousPin(o, p))) { setFailed(true); return }
    setSure(''); setOpen(false)
  }
  if (!pins?.length) return null // still looking, or none: nothing on the card
  if (!open) return <button type="button" className="link-btn staff-prev-open" onClick={() => setOpen(true)}><IconPin />{s('prevPins')} ({pins.length})</button>
  return (
    <div className="staff-prev">
      <p className="staff-prev-title">{s('prevPins')}</p>
      <ul>
        {pins.map((p) => (
          <li key={p.code}>
            <div className="staff-prev-row">
              <span><b dir="ltr">{pinDate(p.at)}</b> · #{p.code}
                {/* what the customer typed with that pin, on its own line (owner, 2026-10-27) */}
                <small className="staff-prev-addr">{p.address ? <>{s('prevTyped')}: <b>{p.address}</b></> : s('prevNoTyped')}</small>
              </span>
              <a href={mapsLink(p.location)} target="_blank" rel="noreferrer">{s('openInMaps')}</a>
              {sure !== p.code && <button type="button" className="staff-prev-use" onClick={() => { setSure(p.code); setFailed(false) }}>{s('usePinBtn')}</button>}
            </div>
            {sure === p.code && (
              <div className="staff-prev-confirm" role="alertdialog">
                <p>{s('usePinConfirm')}</p>
                <button type="button" className="staff-prev-yes" onClick={() => void use(p)}>{s('usePinYes')}</button>
                <button type="button" className="link-btn" onClick={() => setSure('')}>{s('cancel')}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {failed && <small className="staff-wa-failed" role="alert">{s('usePinFailed')}</small>}
      <button type="button" className="link-btn" onClick={() => { setOpen(false); setSure('') }}>{s('prevPinsClose')}</button>
    </div>
  )
}

function SendToDriver({ o }: { o: Order }) {
  const { t, lang } = useLang()
  const s = useS()
  const now = useNow(30000)
  const viewing = useStaff().branch
  const drivers = (settingsFor(o.branch ?? viewing).drivers ?? []).filter((d) => d.phone.replace(/\D/g, '').length >= 8)
  const key = o.uid ?? o.id
  const [sent, setSent] = useState(() => readSent()[key])
  // the message in the driver's language (Other…: the dashboard's)
  const text = (L: Lang = lang) => {
    const lines = [`Mars CoffeeHouse · ${branchName(o.branch)} · #${o.id}`, '']
    if (o.customer) lines.push(`${sIn(L, 'waCustomer')}: ${o.customer.name} · ${phoneOf(o)}`)
    if (o.delivery?.address) lines.push(`${sIn(L, 'waAddress')}: ${o.delivery.address}`)
    // the plain map link of the customer's pin (owner chose it over a directions link, 2026-10-23); WhatsApp links cannot carry a location pin
    if (o.delivery?.location) lines.push(`${sIn(L, 'waLocation')}: ${mapsLink(o.delivery.location)}`)
    lines.push('')
    for (const g of groupLines(o.items)) { if (g.combo) lines.push(sIn(L, 'comboN', { n: g.combo })); for (const x of g.lines) lines.push('• ' + x) }
    if (o.note) lines.push('', `${dict[L].orderNote}: ${o.note}`)
    lines.push('', o.pay === 'wallet' ? dict[L].paidByWallet : sIn(L, 'waCollect', { n: iqd(o.total) }))
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
  const send = async (name: string, phone?: string, L: Lang = lang) => {
    setFailed('')
    if (phone && o.uid) {
      setBusy(true)
      const r = await sendWhatsApp(o.uid, waNumber(phone), text(L), L, name) // the template in the driver's language (Kurdish: filed as Persian)
      setBusy(false)
      if (r.ok) { remember(name, true); return }
      // not set up yet (or no backend): quietly the old way; a real refusal is shown
      if (r.reason !== 'not_configured' && r.reason !== 'no_backend' && r.reason !== 'unreachable') setFailed(s('waApiFailed', { why: r.message || r.reason || '?' }))
    }
    const w = window.open(`https://wa.me/${phone ? waNumber(phone) : ''}?text=${encodeURIComponent(text(L))}`, '_blank')
    if (w) w.opener = null
    remember(name)
  }
  return (
    <>
      {/* in the card's action row, beside Print receipt (owner, 2026-10-23) */}
      {drivers.map((d, i) => <button key={i} type="button" className="staff-wa" title={s('sendToDriver')} disabled={busy} onClick={() => void send(d.name || d.phone, d.phone, d.lang ?? lang)}><I.whatsapp />{busy ? s('waSending') : d.name || d.phone}</button>)}
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
          {o.delivery.location && o.locationFrom && <small className="staff-pin-from">{s('pinFrom', { code: o.locationFrom })}</small>}
          {!o.delivery.location && !cancelled && isActive(o) && !o.giftTo && <PreviousPins o={o} />}
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
 * itself); '' = all dates. An order belongs to a day when it was placed that day or is scheduled for it.
 * The search (owner, 2026-10-26: "advanced search … items, address, notes, and what else we have") looks in the
 * customer's name, any part of a phone number however it was typed, the order number, the items (their English names
 * as stored, and their Arabic / Kurdish names), the address, the note and the cancel reason. Advanced narrows it: one
 * Advanced has a box per field (owner, 2026-10-26: "can we combine it like filters", "one box per field"): every box
 * filled must match, together with delivery / pickup, Positive Hours / menu orders, an amount range, scheduled only.
 */
const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export type Field = 'name' | 'phone' | 'code' | 'items' | 'address' | 'note' | 'reason'
export type Adv = { by: Partial<Record<Field, string>>; fulfil: '' | 'delivery' | 'pickup'; kind: '' | 'offer' | 'menu'; min: string; max: string; timed: boolean }
const NO_ADV: Adv = { by: {}, fulfil: '', kind: '', min: '', max: '', timed: false }
export type OrderFilter = {
  day: string; today: boolean; q: string; adv: Adv; advCount: number
  setDay: (d: string | null) => void; setQ: (q: string) => void; setAdv: (a: Adv) => void
  byDay: (o: Order) => boolean; byText: (o: Order) => boolean
}
// Arabic / Kurdish spellings people mix up are searched as one: ة ه ە, أ إ آ ا, ى ي ی, ك ک; marks and ـ ignored
const norm = (x: string) => x.toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/[ةە]/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/[ىی]/g, 'ي').replace(/ک/g, 'ك')
// item names in every language, to find "لاتيه" in an order stored as "Latte Classic (8oz) ×1"; longest names first
let NAMES: [string, string][] | null = null
const namesIndex = () => (NAMES ??= ALL_ITEMS.map((i) => i.name).sort((a, b) => b.length - a.length)
  .map((n) => [n, [n, nameOf(n, 'en'), nameOf(n, 'ar'), nameOf(n, 'ku')].join(' ').toLowerCase()] as [string, string]))
const itemsText = (o: Order) => {
  const lines = o.items.join(' · ')
  const extra = namesIndex().filter(([n]) => lines.includes(n)).map(([, all]) => all)
  return norm(lines + ' ' + extra.join(' '))
}
export function useOrderFilter(): OrderFilter {
  const { t } = useLang()
  const now = useNow(60000)
  const [picked, setPicked] = useState<string | null>(null) // null = today, '' = all dates, else YYYY-MM-DD
  const [q, setQ] = useState('')
  const [adv, setAdv] = useState<Adv>(NO_ADV)
  const day = picked ?? dayKey(now)
  const wordsOf = (x: string) => norm(x.trim()).split(/\s+/).filter(Boolean)
  const digitsOf = (x: string) => x.replace(/\D/g, '').replace(/^(00964|964|0)/, '')
  const words = wordsOf(q)
  const by = Object.entries(adv.by).filter(([, v]) => v?.trim()) as [Field, string][]
  const min = Number(adv.min.replace(/\D/g, '')) || 0
  const max = Number(adv.max.replace(/\D/g, '')) || 0
  const advCount = by.length + [!!adv.fulfil, !!adv.kind, !!min || !!max, adv.timed].filter(Boolean).length
  const fields = (o: Order): Record<Exclude<Field, 'phone'>, () => string> => ({
    name: () => norm(o.customer?.name ?? ''),
    code: () => o.id.toLowerCase(),
    items: () => itemsText(o),
    address: () => norm(o.delivery?.address ?? ''),
    note: () => norm(o.note ?? ''),
    reason: () => norm(reasonText(o.cancelReason, t)),
  })
  const phoneHit = (o: Order, digits: string) => digits.length >= 3 && [o.customer?.phone, o.delivery?.phone].some((p) => (p ?? '').replace(/\D/g, '').includes(digits))
  // every word somewhere ("caesar latte" finds an order with both)
  const hit = (hay: string, text: string) => wordsOf(text).every((w) => hay.includes(w))
  return {
    day, today: picked === null, q, adv, advCount, setDay: setPicked, setQ, setAdv,
    byDay: (o) => !day || dayKey(o.at) === day || (dueOf(o) !== undefined && dayKey(dueOf(o)!) === day),
    byText: (o) => {
      if (adv.fulfil && o.fulfil !== adv.fulfil) return false
      if (adv.kind === 'offer' && !o.offer) return false
      if (adv.kind === 'menu' && o.offer) return false
      if (min && o.total < min) return false
      if (max && o.total > max) return false
      if (adv.timed && dueOf(o) === undefined) return false
      const f = fields(o)
      // each field's own box, all of them together
      for (const [k, v] of by) if (!(k === 'phone' ? phoneHit(o, digitsOf(v)) : hit(f[k](), v))) return false
      // the main box: anywhere (a phone number too)
      if (!words.length) return true
      return hit(Object.values(f).map((g) => g()).join(' \n '), q) || phoneHit(o, digitsOf(q))
    },
  }
}
export function OrderFilterBar({ f }: { f: OrderFilter }) {
  const s = useS()
  const [open, setOpen] = useState(false)
  const set = (p: Partial<Adv>) => f.setAdv({ ...f.adv, ...p })
  const FIELDS: [Field, SKey][] = [['name', 'fInName'], ['phone', 'fInPhone'], ['code', 'fInCode'], ['items', 'fInItems'], ['address', 'fInAddress'], ['note', 'fInNote'], ['reason', 'fInReason']]
  return (
    <>
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
        <button type="button" className={'staff-filter-chip' + (open || f.advCount ? ' on' : '')} aria-expanded={open} onClick={() => setOpen(!open)}>{s('fAdvanced')}{f.advCount > 0 && ` · ${f.advCount}`}</button>
      </div>
      {open && (
        <div className="staff-adv">
          <div className="staff-adv-fields">
            {FIELDS.map(([k, key]) => (
              <label key={k}><span>{s(key)}</span>
                <input type="search" value={f.adv.by[k] ?? ''} inputMode={k === 'phone' ? 'tel' : undefined} dir={k === 'phone' || k === 'code' ? 'ltr' : undefined}
                  onChange={(e) => set({ by: { ...f.adv.by, [k]: e.target.value } })} />
              </label>
            ))}
          </div>
          <label><span>{s('fType')}</span>
            <select value={f.adv.fulfil} onChange={(e) => set({ fulfil: e.target.value as Adv['fulfil'] })}>
              <option value="">{s('fAny')}</option><option value="delivery">{s('delivery')}</option><option value="pickup">{s('pickup')}</option>
            </select>
          </label>
          <label><span>{s('fKind')}</span>
            <select value={f.adv.kind} onChange={(e) => set({ kind: e.target.value as Adv['kind'] })}>
              <option value="">{s('fAny')}</option><option value="offer">{s('fKindOffer')}</option><option value="menu">{s('fKindMenu')}</option>
            </select>
          </label>
          <label><span>{s('fAmount')}</span>
            <span className="staff-adv-range">
              <input inputMode="numeric" dir="ltr" placeholder={s('fFrom')} value={f.adv.min} onChange={(e) => set({ min: e.target.value.replace(/[^\d]/g, '') })} />
              <input inputMode="numeric" dir="ltr" placeholder={s('fTo')} value={f.adv.max} onChange={(e) => set({ max: e.target.value.replace(/[^\d]/g, '') })} />
            </span>
          </label>
          <label className="staff-adv-check"><input type="checkbox" checked={f.adv.timed} onChange={(e) => set({ timed: e.target.checked })} /><span>{s('fTimed')}</span></label>
          {f.advCount > 0 && <button type="button" className="link-btn" onClick={() => f.setAdv(NO_ADV)}>{s('fReset')}</button>}
        </div>
      )}
    </>
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
