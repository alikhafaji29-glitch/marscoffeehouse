import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../i18n'
import type { Order } from '../account'
import { isActive, useNow } from '../orders'
import { OrderTracker } from './OrderTracker'

/** Small window opened by the "Track order" button: one live tracker per order still on its way. */
export function TrackModal({ orders, onClose }: { orders: Order[]; onClose: () => void }) {
  const { t } = useLang()
  const now = useNow()
  const active = orders.filter((o) => isActive(o, now))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal track-modal" role="dialog" aria-labelledby="track-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="track-title">{t('trackOrder')}</h3>
        {active.length ? active.map((o) => <OrderTracker key={o.id} order={o} dark />) : <p className="modal-line">{t('noActiveOrder')}</p>}
        <p className="modal-line small">{t('trackHint')}</p>
        <button className="btn-pill" onClick={onClose}>{t('close')}</button>
      </div>
    </div>,
    document.body,
  )
}
