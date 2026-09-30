import { useState } from 'react'
import { useLang } from '../i18n'
import { useAccount } from '../account'
import { useCart } from '../cart'
import { isActive, stageOf, useNow } from '../orders'
import { TrackModal } from './TrackModal'
import { IconTruck } from './Icons'

const LABEL = { received: 'stReceived', preparing: 'stPreparing', done: 'stDone', onway: 'stOnWay', delivered: 'stDelivered' } as const

/** Floating "Track order" bar (like the View order bar) while an order is on its way; opens the tracker window. */
export function TrackBar() {
  const { t } = useLang()
  const a = useAccount()
  const { count } = useCart()
  const now = useNow()
  const [open, setOpen] = useState(false)
  const active = a ? a.orders.filter((o) => isActive(o, now)) : []
  if (!active.length) return null
  const stage = stageOf(active[0], now)
  return (
    <>
      <button className={'cart-bar track-bar' + (count > 0 ? ' raised' : '')} onClick={() => setOpen(true)}>
        <span className="track-bar-icon"><IconTruck /></span>
        <span className="cart-bar-label">{t('trackOrder')}</span>
        <span className="track-bar-stage">{t(LABEL[stage])}{active.length > 1 ? ` · ${active.length}` : ''}</span>
      </button>
      {open && <TrackModal orders={a!.orders} onClose={() => setOpen(false)} />}
    </>
  )
}
