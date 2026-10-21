import { useLang } from '../i18n'
import { iqd } from '../account'
import type { Order } from '../account'
import { isCancelled, reasonText, stageIndex, stagesFor, useNow, whenText } from '../orders'
import { IconCheck } from './Icons'
import { useS } from '../staff/strings'

const LABEL = { received: 'stReceived', preparing: 'stPreparing', done: 'stDone', onway: 'stOnWay', delivered: 'stDelivered' } as const

/** Where an order is right now: five steps, the ones passed ticked, the current one pulsing. */
export function OrderTracker({ order, dark = false, onOk }: { order: Order; dark?: boolean; onOk?: () => void }) {
  const { t, lang } = useLang()
  const s = useS()
  const now = useNow()
  const cur = stageIndex(order, now)
  return (
    <div className={'track' + (dark ? ' dark' : '')} aria-live="polite">
      <div className="track-head">
        <b dir="ltr">#{order.id}</b>
        <span dir="ltr">{iqd(order.total)} IQD</span>
      </div>
      <p className="track-items">{order.items.join(', ')}</p>
      {order.offer?.wantAt && <p className="track-items"><b>{t('scheduledFor').replace('{t}', whenText(order.offer.wantAt, lang))}</b></p>}
      {order.note && <p className="track-items">{t('orderNote')}: {order.note}</p>}
      {order.delivery && <p className="track-items">{t('deliveryTo')}: {[order.delivery.address, order.delivery.location && s('locPin')].filter(Boolean).join(' · ')}</p>}
      {isCancelled(order) && (
        <div className="track-cancelled" role="status">
          <b>{t('orderCancelled')}</b>
          {order.cancelReason && <span>{t('cancelReason')}: {reasonText(order.cancelReason, t)}</span>}
          {onOk && <button type="button" className="track-ok" onClick={onOk}>{t('cancelOk')}</button>}
        </div>
      )}
      {!isCancelled(order) && <ol className="track-steps">
        {stagesFor(order).map((s, i) => (
          <li key={s} className={i < cur ? 'past' : i === cur ? 'now' : ''} aria-current={i === cur ? 'step' : undefined}>
            <span className="track-dot">{i < cur ? <IconCheck /> : null}</span>
            <span className="track-label">{t(LABEL[s])}</span>
          </li>
        ))}
      </ol>}
    </div>
  )
}
