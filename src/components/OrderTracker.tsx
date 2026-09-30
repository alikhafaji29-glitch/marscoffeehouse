import { useLang } from '../i18n'
import { iqd } from '../account'
import type { Order } from '../account'
import { stageIndex, stagesFor, useNow } from '../orders'
import { IconCheck } from './Icons'

const LABEL = { received: 'stReceived', preparing: 'stPreparing', done: 'stDone', onway: 'stOnWay', delivered: 'stDelivered' } as const

/** Where an order is right now: five steps, the ones passed ticked, the current one pulsing. */
export function OrderTracker({ order, dark = false }: { order: Order; dark?: boolean }) {
  const { t } = useLang()
  const now = useNow()
  const cur = stageIndex(order, now)
  return (
    <div className={'track' + (dark ? ' dark' : '')} aria-live="polite">
      <div className="track-head">
        <b dir="ltr">#{order.id}</b>
        <span dir="ltr">{iqd(order.total)} IQD</span>
      </div>
      <p className="track-items">{order.items.join(', ')}</p>
      {order.delivery && <p className="track-items">{t('deliveryTo')}: {order.delivery.address}</p>}
      <ol className="track-steps">
        {stagesFor(order).map((s, i) => (
          <li key={s} className={i < cur ? 'past' : i === cur ? 'now' : ''} aria-current={i === cur ? 'step' : undefined}>
            <span className="track-dot">{i < cur ? <IconCheck /> : null}</span>
            <span className="track-label">{t(LABEL[s])}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
