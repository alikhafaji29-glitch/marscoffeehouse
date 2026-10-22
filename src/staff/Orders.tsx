import { useState } from 'react'
import { useLang } from '../i18n'
import type { Lang, TKey } from '../i18n'
import { iqd } from '../account'
import type { Order } from '../account'
import { CANCEL_REASONS, LEAD_MIN, STAGES, dueOf, groupLines, isActive, isCancelled, isLater, nextStage, reasonText, stageIndex, stagesFor, timeText, untilText, useNow, whenText } from '../orders'
import { settingsFor, useStaff } from './store'
import type { Stage } from '../orders'
import { IconCheck, IconPin } from '../components/Icons'
import { mapsLink } from '../components/ShareLocation'
import { cancelOrder, moveOrder } from './remote'
import { useS } from './strings'

/*
 * Orders: the incoming orders and the buttons that move each one through the tracking stages the customer sees
 * (request received → preparing → done → on the way → order received). DEMO: the orders stored in this browser;
 * see src/orders.ts for what the real version needs.
 */
export const STAGE_LABEL: Record<Stage, TKey> = { received: 'stReceived', preparing: 'stPreparing', done: 'stDone', onway: 'stOnWay', delivered: 'stDelivered' }

export function ago(at: number, now: number, lang: Lang, justNow: string): string {
  const s = Math.round((now - at) / 1000)
  if (s < 45) return justNow
  const rtf = new Intl.RelativeTimeFormat(lang === 'ku' ? 'ckb' : lang, { numeric: 'always' })
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute')
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour')
  return rtf.format(-Math.round(s / 86400), 'day')
}

const phoneOf = (o: Order) => o.delivery?.phone ?? o.customer?.phone ?? ''
const PhoneIcon = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
export function OrderCard({ o, lead = LEAD_MIN }: { o: Order; lead?: number }) {
  const { t, lang } = useLang()
  const s = useS()
  const now = useNow(15000)
  const cur = stageIndex(o)
  const next = nextStage(o)
  const stages = stagesFor(o)
  const cancelled = isCancelled(o)
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
    <article className={'staff-order' + (isActive(o) ? '' : ' finished') + (cancelled ? ' cancelled' : '')}>
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

export function Orders({ orders, live = false }: { orders: Order[]; live?: boolean }) {
  const { t } = useLang()
  const s = useS()
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
  const cancelledCount = orders.filter((o) => isCancelled(o)).length
  return (
    <>
      <p className="d-lead">{s('ordersLead')}</p>
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
      {shown.length ? <div className="staff-list">{shown.map((o) => <OrderCard key={o.uid ?? o.id} o={o} lead={lead} />)}</div> : <p className="staff-empty">{tab === 'later' ? s('laterNone') : orders.length ? t('staffNoneHere') : t('staffNoOrders')}</p>}
      {!live && <p className="demo-note">{t('staffDemoNote')}</p>}
    </>
  )
}
