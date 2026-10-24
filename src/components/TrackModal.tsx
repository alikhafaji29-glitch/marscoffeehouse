import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../i18n'
import type { Order } from '../account'
import { isActive, isCancelled, markCancelSeen, mergedInto, recentlyCancelled, useNow } from '../orders'
import { OrderTracker } from './OrderTracker'
import { askFeedback } from './FeedbackPrompt'

/** Small window opened by the "Track order" button: one live tracker per order still on its way. */
export function TrackModal({ orders, onClose }: { orders: Order[]; onClose: () => void }) {
  const { t } = useLang()
  const now = useNow()
  const active = orders.filter((o) => isActive(o, now) || recentlyCancelled(o, now)) // a recent cancellation shows with its reason
  // closing the window is the customer having seen a cancellation: it leaves the Track order bar and the short
  // "what happened" question follows (owner, 2026-10-25: "close is enough, why OK"; it used to need its own OK)
  const close = () => {
    const seen = active.filter((o) => isCancelled(o))
    seen.forEach((o) => markCancelSeen(o))
    onClose()
    const ask = seen.find((o) => !mergedInto(o))
    if (ask) askFeedback(ask, 'cancelled')
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className="modal-overlay" onClick={close}>
      <div className="modal track-modal" role="dialog" aria-labelledby="track-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="track-title">{t('trackOrder')}</h3>
        {active.length ? active.map((o) => <OrderTracker key={o.id} order={o} />) : <p className="modal-line">{t('noActiveOrder')}</p>}
        <button className="btn-pill" onClick={close}>{t('close')}</button>
      </div>
    </div>,
    document.body,
  )
}
