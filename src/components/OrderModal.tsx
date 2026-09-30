import { useState } from 'react'
import { useLang } from '../i18n'
import { useCart } from '../cart'
import { iqd, normPhone, payAtPickup, payFromWallet, sendDrinkGift, useAccount } from '../account'
import { SendToFriend } from './SendToFriend'
import type { Delivery } from '../account'
import { OrderTracker } from './OrderTracker'

/*
 * How to pay: at pickup (demo order, nothing charged) or from the demo wallet;
 * both record the order and start the tracker. This is the website, there is
 * no app and no other ordering site (owner, 2026-09-12), so nothing else is offered.
 */
export function OrderModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const { lines, total, clear, basket } = useCart()
  const a = useAccount()
  const [note, setNote] = useState('')
  const [paid, setPaid] = useState<{ orderId: string; points: number; reward: boolean } | null>(null)
  const [how, setHow] = useState<'pickup' | 'delivery'>('pickup')
  const [phone, setPhone] = useState(a?.phone ?? '')
  const [address, setAddress] = useState(a?.address ?? '')
  const canWallet = !!a && total > 0
  const placed = paid ? a?.orders.find((o) => o.id === paid.orderId) : undefined

  const itemLines = () => lines.map((l) => `${l.name}${l.size ? ` (${l.size})` : ''}${l.opts?.length ? ` · ${l.opts.join(', ')}` : ''} ×${l.qty}`)
  /** the delivery details when delivering; null when something is missing (a note is shown) */
  const details = (): Delivery | undefined | null => {
    if (how !== 'delivery') return undefined
    if (normPhone(phone).length < 10 || address.trim().length < 6) { setNote(t('needAddress')); return null }
    return { phone: phone.trim(), address: address.trim() }
  }
  const payWallet = () => {
    const d = details(); if (d === null) return
    const res = payFromWallet(total, itemLines(), d)
    if (!res.ok) { setNote(t('notEnough')); return }
    clear()
    setPaid(res)
  }
  const pickup = () => {
    const d = details(); if (d === null) return
    const res = payAtPickup(total, itemLines(), d)
    if (!res.ok) return
    clear()
    setPaid(res)
  }

  if (basket === 'gift') {
    // Surprise your friend: the whole gift basket goes to the friend's number + address, paid from the wallet
    const giftName = itemLines().join(', ')
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal gift-modal" onClick={(e) => e.stopPropagation()}>
          <h3>{t('sendGiftTitle')}</h3>
          <p className="modal-line small">{giftName}</p>
          {!a ? (
            <a className="btn-pill" href="#account" onClick={onClose}>{t('signInToSend')}</a>
          ) : (
            <>
              <p className="modal-line small">{t('giftDeliveredHint')} · {t('walletBalance')} {iqd(a.balance)} · <b dir="ltr">{iqd(total)} IQD</b></p>
              <SendToFriend
                payload={{ t: 'item', from: a.name, name: giftName, price: total, paid: total }}
                text={t('giftItemText').replace('{from}', a.name).replace('{item}', giftName)}
                charge={total}
                address
                send={(to, address) => sendDrinkGift(to, address, { name: giftName, price: total, items: itemLines() })}
                onSent={clear}
                onClose={onClose}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {paid ? (
          <>
            <h3>{t('orderPlaced')}</h3>
            {placed && <OrderTracker order={placed} dark />}
            <p className="modal-line">{t('pointsEarned').replace('{n}', String(paid.points))}</p>
            {paid.reward && <p className="modal-line"><b>{t('rewardUnlocked')}</b></p>}
            <button className="btn-pill" onClick={onClose}>{t('close')}</button>
          </>
        ) : (
          <>
            <h3>{t('howPay')}</h3>
            {canWallet && (
              <>
                <div className="get-toggle" role="radiogroup" aria-label={t('getHow')}>
                  <button type="button" role="radio" aria-checked={how === 'pickup'} className={how === 'pickup' ? 'on' : ''} onClick={() => { setHow('pickup'); setNote('') }}>{t('getPickup')}</button>
                  <button type="button" role="radio" aria-checked={how === 'delivery'} className={how === 'delivery' ? 'on' : ''} onClick={() => setHow('delivery')}>{t('getDelivery')}</button>
                </div>
                {how === 'delivery' && (
                  <div className="deliv-form">
                    <label>
                      <span>{t('deliveryPhone')}</span>
                      <input type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => { setPhone(e.target.value); setNote('') }} autoComplete="tel" />
                    </label>
                    <label>
                      <span>{t('deliveryAddress')}</span>
                      <textarea rows={2} value={address} onChange={(e) => { setAddress(e.target.value); setNote('') }} placeholder={t('addressHint')} autoComplete="street-address" />
                    </label>
                  </div>
                )}
                <button className="btn-pill wallet-pay" onClick={pickup}>
                  {how === 'delivery' ? t('payOnDelivery') : t('payAtPickup')} · {iqd(total)} IQD
                  <small>{how === 'delivery' ? t('payOnDeliveryHint') : t('payAtPickupHint')}</small>
                </button>
              </>
            )}
            {canWallet && (
              <button className="btn-pill wallet-pay" onClick={payWallet} disabled={a!.balance < total}>
                {t('payWallet')} · {iqd(total)} IQD
                <small>{t('walletBalance')} {iqd(a!.balance)}{a!.balance < total ? <> · <a href="#account" onClick={onClose} className="inline-link light">{t('topUpLink')}</a></> : null}</small>
              </button>
            )}
            {!a && total > 0 && (
              <a className="btn-pill ghost" href="#account" onClick={onClose}>{t('signInToPay')}</a>
            )}
            {note && <div className="note" role="status">{note}</div>}
          </>
        )}
      </div>
    </div>
  )
}
