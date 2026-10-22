import { useEffect, useRef, useState } from 'react'
import { statusSound, unlockAudio } from '../chime'
import { useLang } from '../i18n'
import { useMyOrders } from '../account'
import { useCart } from '../cart'
import { isActive, recentlyCancelled, stageOf, useNow } from '../orders'
import { TrackModal } from './TrackModal'
import { askFeedback } from './FeedbackPrompt'
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
  // an order the branch cancelled stays in view for a few hours, so the customer learns of it and why
  const cancelled = orders.filter((o) => recentlyCancelled(o, now))
  // a sound when staff move one of this customer's orders (owner, 2026-10-19); the browser allows sound only after a
  // tap on the page, so while an order is on its way the first tap anywhere switches it on
  const seen = useRef<Map<string, string> | null>(null)
  useEffect(() => {
    const cur = new Map(orders.map((o) => [o.uid ?? o.id, o.status ?? 'received']))
    let changed = ''
    if (seen.current) for (const [k, st] of cur) {
      const was = seen.current.get(k)
      if (was && was !== st) {
        changed = st
        // the order reached its last stage: how was it? (owner, 2026-10-22)
        const o = orders.find((x) => (x.uid ?? x.id) === k)
        if (o && st === 'delivered') setTimeout(() => askFeedback(o, 'received'), 1500)
      }
    }
    seen.current = cur
    if (changed) statusSound(changed)
  }, [orders])
  const waiting = active.length > 0
  useEffect(() => {
    if (!waiting) return
    // every tap, and every return to the page, wakes the audio again: phones pause it when the screen locks or the
    // visitor switches apps, and then the status sound was silent (owner, 2026-10-22)
    const on = () => unlockAudio()
    const back = () => { if (!document.hidden) unlockAudio() }
    document.addEventListener('pointerdown', on)
    document.addEventListener('keydown', on)
    document.addEventListener('visibilitychange', back)
    return () => { document.removeEventListener('pointerdown', on); document.removeEventListener('keydown', on); document.removeEventListener('visibilitychange', back) }
  }, [waiting])
  if (!active.length && !cancelled.length) return null
  return (
    <>
      <button className={'cart-bar track-bar' + (count > 0 ? ' raised' : '') + (active.length ? '' : ' cancelled')} onClick={() => setOpen(true)}>
        <span className="track-bar-icon"><IconTruck /></span>
        <span className="cart-bar-label">{t('trackOrder')}</span>
        <span className="track-bar-stage">{active.length ? `${t(LABEL[stageOf(active[0], now)])}${active.length > 1 ? ` · ${active.length}` : ''}` : t('orderCancelled')}</span>
      </button>
      {open && <TrackModal orders={orders} onClose={() => setOpen(false)} />}
    </>
  )
}
