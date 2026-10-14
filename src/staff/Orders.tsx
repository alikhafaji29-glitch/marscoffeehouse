import { useState } from 'react'
import { useLang } from '../i18n'
import type { Lang, TKey } from '../i18n'
import { iqd } from '../account'
import type { Order } from '../account'
import { STAGES, isActive, nextStage, stageIndex, stagesFor, useNow } from '../orders'
import type { Stage } from '../orders'
import { IconCheck, IconPin } from '../components/Icons'
import { mapsLink } from '../components/ShareLocation'
import { moveOrder } from './remote'
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

export function OrderCard({ o }: { o: Order }) {
  const { t, lang } = useLang()
  const s = useS()
  const now = useNow(15000)
  const cur = stageIndex(o)
  const next = nextStage(o)
  const stages = stagesFor(o)
  return (
    <article className={'staff-order' + (isActive(o) ? '' : ' finished')}>
      <header className="staff-order-head">
        <b dir="ltr">#{o.id}</b>
        <span className="staff-ago">{ago(o.at, now, lang, t('justNow'))}</span>
        <span className={'staff-stage s-' + stages[cur]}>{t(STAGE_LABEL[stages[cur]])}</span>
      </header>
      <p className="staff-customer">
        <span className={'staff-how ' + (o.fulfil === 'delivery' ? 'deliv' : 'pick')}>{o.fulfil === 'delivery' ? t('getDelivery') : t('getPickup')}</span>
        {o.giftTo && <span className="staff-how gift">{t('giftBadge')}</span>}
        {o.offer && <span className="staff-how offer">{o.offer.name}</span>}
        {o.offer?.pre && <span className="staff-how pre">{s('preOrderBadge')}</span>}
        {o.customer && <>{o.customer.name} · <a dir="ltr" href={'tel:' + (o.delivery?.phone ?? o.customer.phone)}>{o.delivery?.phone ?? o.customer.phone}</a></>}
      </p>
      {o.delivery && (
        <p className="staff-address">
          {o.giftTo ? `${t('giftFor')} ${o.giftTo} · ` : ''}{o.delivery.address}
          {o.delivery.location && <a className="staff-map" href={mapsLink(o.delivery.location)} target="_blank" rel="noreferrer"><IconPin />{s('openInMaps')}</a>}
        </p>
      )}
      <ul className="staff-items">{o.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      <p className="staff-total"><b dir="ltr">{iqd(o.total)} IQD</b> · {o.pay === 'wallet' ? t('paidByWallet') : o.fulfil === 'delivery' ? t('payOnDelivery') : t('payAtPickup')}{o.offer?.fee ? <> · {s('inclFee', { n: iqd(o.offer.fee) })}</> : null}</p>
      <ol className="staff-steps" aria-label={t('trackOrder')}>
        {stages.map((st, i) => (
          <li key={st} className={i < cur ? 'past' : i === cur ? 'now' : ''}>
            <button type="button" onClick={() => moveOrder(o, st)} aria-current={i === cur ? 'step' : undefined}>
              <span className="staff-dot">{i < cur ? <IconCheck /> : i + 1}</span>
              <span>{t(STAGE_LABEL[st])}</span>
            </button>
          </li>
        ))}
      </ol>
      {next && (
        <button type="button" className="staff-next" onClick={() => moveOrder(o, next)}>
          {t('markAs').replace('{stage}', t(STAGE_LABEL[next]))}
        </button>
      )}
    </article>
  )
}

export function Orders({ orders, live = false }: { orders: Order[]; live?: boolean }) {
  const { t } = useLang()
  const s = useS()
  const [tab, setTab] = useState<'active' | 'all' | Stage>('active')
  const active = orders.filter((o) => isActive(o))
  const shown = tab === 'active' ? active : tab === 'all' ? orders : orders.filter((o) => (o.status ?? 'received') === tab)
  const counts = STAGES.map((st) => orders.filter((o) => (o.status ?? 'received') === st).length)
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
      </div>
      <div className="staff-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'active'} className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>{t('staffActive')} · {active.length}</button>
        <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{t('staffAll')} · {orders.length}</button>
      </div>
      {shown.length ? <div className="staff-list">{shown.map((o) => <OrderCard key={o.uid ?? o.id} o={o} />)}</div> : <p className="staff-empty">{orders.length ? t('staffNoneHere') : t('staffNoOrders')}</p>}
      {!live && <p className="demo-note">{t('staffDemoNote')}</p>}
    </>
  )
}
