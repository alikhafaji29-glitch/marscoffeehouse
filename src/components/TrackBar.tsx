import { useState } from 'react'
import { useLang } from '../i18n'
import { useMyOrders } from '../account'
import { useCart } from '../cart'
import { isActive, stageOf, useNow } from '../orders'
import { TrackModal } from './TrackModal'
import { IconTruck } from './Icons'

const LABEL = { received: 'stReceived', preparing: 'stPreparing', done: 'stDone', onway: 'stOnWay', delivered: 'stDelivered' } as const

/** Floating "Track order" bar (like the View order bar) while an order is on its way; opens the tracker window. */
export function TrackBar() {
  const { t } = useLang()
  const orders = useMyOrders() // the account's and this device's guest orders (the Positive Hours combo needs no sign-in)
  const { count } = useCart()
  const now = useNow()
  const [open, setOpen] = useState(false)
  const active = orders.filter((o) => isActive(o, now))
  if (!active.length) return null
  const stage = stageOf(active[0], now)
  return (
    <>
      <button className={'cart-bar track-bar' + (count > 0 ? ' raised' : '')} onClick={() => setOpen(true)}>
        <span className="track-bar-icon"><IconTruck /></span>
        <span className="cart-bar-label">{t('trackOrder')}</span>
        <span className="track-bar-stage">{t(LABEL[stage])}{active.length > 1 ? ` · ${active.length}` : ''}</span>
      </button>
      {open && <TrackModal orders={orders} onClose={() => setOpen(false)} />}
    </>
  )
}
