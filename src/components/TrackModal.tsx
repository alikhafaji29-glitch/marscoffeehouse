import { useEffect, useState } from 'react'
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
  const [, setSeen] = useState(0) // redraw after an OK
  const active = orders.filter((o) => isActive(o, now) || recentlyCancelled(o, now)) // a recent cancellation shows with its reason, until OK
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal track-modal" role="dialog" aria-labelledby="track-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="track-title">{t('trackOrder')}</h3>
        {active.length ? active.map((o) => <OrderTracker key={o.id} order={o} onOk={isCancelled(o) ? () => { markCancelSeen(o); setSeen((n) => n + 1); if (active.length === 1) onClose(); if (!mergedInto(o)) askFeedback(o, 'cancelled') } : undefined} />) : <p className="modal-line">{t('noActiveOrder')}</p>}
        <button className="btn-pill" onClick={onClose}>{t('close')}</button>
      </div>
    </div>,
    document.body,
  )
}
