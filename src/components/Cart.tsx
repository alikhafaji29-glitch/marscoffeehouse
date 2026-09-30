import { useEffect, useState } from 'react'
import { lineKey, useCart } from '../cart'
import { useLang } from '../i18n'
import { dropsFrom } from '../fx'

export function CartBar({ onOpen }: { onOpen: () => void }) {
  const { t } = useLang()
  const { count, total, basket } = useCart()
  const [bump, setBump] = useState(false)

  // little hop every time something lands in the order
  useEffect(() => {
    if (count === 0) return
    setBump(true)
    const id = setTimeout(() => setBump(false), 600)
    return () => clearTimeout(id)
  }, [count])

  if (count === 0) return null
  return (
    <button className={'cart-bar' + (bump ? ' bump' : '')} onClick={onOpen}>
      <span className="cart-count">{count}</span>
      <span className="cart-bar-label">{t(basket === 'gift' ? 'viewGift' : 'viewOrder')}</span>
      <span className="cart-bar-total">
        {total.toLocaleString('en-US')} <small>IQD</small>
      </span>
    </button>
  )
}

export function CartModal({
  onClose,
  onCheckout,
}: {
  onClose: () => void
  onCheckout: () => void
}) {
  const { t } = useLang()
  const { lines, setQty, clear, total, basket } = useCart()

  return (
    <div className="modal-overlay sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-name">{t(basket === 'gift' ? 'yourGift' : 'yourOrder')}</div>

        <div className="cart-lines">
          {lines.map((l) => {
            const key = lineKey(l)
            return (
              <div key={key} className="cart-line">
                <div className="cart-line-main">
                  <span className="cart-line-name">{l.name}</span>
                  {l.size && <span className="cart-line-size">{l.size}</span>}
                  {l.opts?.length ? <span className="cart-line-opts">{l.opts.join(', ')}</span> : null}
                </div>
                <div className="qty-row small">
                  <button className="qty-btn" onClick={() => setQty(key, l.qty - 1)}>
                    &minus;
                  </button>
                  <span className="qty-val">{l.qty}</span>
                  <button className="qty-btn" onClick={() => setQty(key, l.qty + 1)}>
                    +
                  </button>
                </div>
                <span className="cart-line-price">
                  {(l.price * l.qty).toLocaleString('en-US')}
                </span>
              </div>
            )
          })}
        </div>

        <div className="cart-total">
          <span>{t('total')}</span>
          <span>
            {total.toLocaleString('en-US')} <small>IQD</small>
          </span>
        </div>

        <button
          className="add-btn"
          disabled={lines.length === 0}
          onClick={(e) => {
            dropsFrom(e.currentTarget, '#73c3ff', 22, 1.3)
            onCheckout()
          }}
        >
          {t(basket === 'gift' ? 'sendGiftBtn' : 'placeOrder')}
        </button>
        {/* See the menu next to Clear order (owner, 2026-09-28): back to the menu to add more */}
        <div className="cart-links">
          <a className="cart-clear" href="#menu" onClick={onClose}>{t('seeMenu')}</a>
          <button className="cart-clear" onClick={() => { clear(); onClose() }}>
            {t('clearOrder')}
          </button>
        </div>
      </div>
    </div>
  )
}
