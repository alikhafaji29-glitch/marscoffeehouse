import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import { unlockAudio } from '../chime'
import { useCart } from '../cart'
import { iqd, normPhone, payAtPickup, payFromWallet, placeOfferOrder, saveContact, savedContact, sendDrinkGift, useAccount, useMyOrders } from '../account'
import { SendToFriend } from './SendToFriend'
import type { Delivery, GeoPoint } from '../account'
import { ShareLocation, mapsLink } from './ShareLocation'
import { OrderTracker } from './OrderTracker'
import { TimeWheel } from './TimeWheel'
import { MissingBox, goToMissing } from './MissingBox'
import type { Missing } from './MissingBox'
import { settingsFor } from '../staff/store'
import { arrivalSlots, timeText } from '../orders'
import { clockNow } from '../clock'
import { useS } from '../staff/strings'
import { FEATURES } from '../features'

/*
 * How to pay: at pickup (demo order, nothing charged) or from the demo wallet;
 * both record the order and start the tracker. This is the website, there is
 * no app and no other ordering site (owner, 2026-09-12), so nothing else is offered.
 */
export function OrderModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const s = useS()
  const set = settingsFor() // the branch's order settings (staff dashboard → Tools)
  const { lines, total, clear, basket } = useCart()
  const a = useAccount()
  const [note, setNote] = useState('')
  const [staffNote, setStaffNote] = useState('') // the customer's note for the café
  const [paid, setPaid] = useState<{ orderId: string; points: number; reward: boolean } | null>(null)
  // Delivery first when the branch delivers (owner, 2026-10-24: customers thought ordering defaulted to pickup)
  const [how, setHow] = useState<'pickup' | 'delivery'>(set.delivery ? 'delivery' : 'pickup')
  const [phone, setPhone] = useState(() => a?.phone ?? savedContact().phone ?? '')
  const [address, setAddress] = useState(() => a?.address ?? savedContact().address ?? '')
  // no sign-in needed to order (owner, 2026-10-22): a customer who is not signed in gives a name and a number, as in
  // the Positive Hours order; the device remembers them for next time and follows the order live
  const [name, setName] = useState(() => a?.name ?? savedContact().name ?? '')
  const guestMode = !a && total > 0
  const mine = useMyOrders()
  const [location, setLocation] = useState<GeoPoint | null>(null)
  const [arriveAt, setArriveAt] = useState(0) // a pickup: when the customer will arrive (ms; owner, 2026-10-22)
  // Coffee of the day is for pickup only (owner, 2026-10-22): an order holding one is picked up, at a time on the wheel
  const pickupOnly = lines.some((l) => l.opts?.includes('Coffee of the day'))
  const [missing, setMissing] = useState<Missing[]>([]) // what kept the order from being placed (owner, 2026-10-22)
  const [missOpen, setMissOpen] = useState(false)
  const filled = (m: Missing) => setMissing((x) => x.filter((y) => y !== m))
  /** everything missing at once; a shared pin stands in for the address */
  const check = (): boolean => {
    const miss: Missing[] = []
    if (how !== 'delivery' && arriveAt < clockNow().getTime()) miss.push('arrive')
    if (guestMode && name.trim().length < 2) miss.push('name')
    if ((guestMode || how === 'delivery') && normPhone(phone).length < 10) miss.push('phone')
    if (how === 'delivery' && !location) miss.push('place') // the shared pin is required for delivery (owner, 2026-10-23); the address is extra
    if (miss.length) { setMissing(miss); setMissOpen(true); return false }
    return true
  }
  useEffect(() => { if (pickupOnly && how !== 'pickup') setHow('pickup') }, [pickupOnly, how])
  const canWallet = !!a && total > 0
  const placed = paid ? mine.find((o) => o.id === paid.orderId) : undefined
  // orders by WhatsApp: the order written out, for the customer to send to the branch
  const waLink = placed && set.reach === 'whatsapp'
    ? `https://wa.me/${set.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent([`Mars CoffeeHouse · #${placed.id}`, ...placed.items, `${iqd(placed.total)} IQD`, ...(placed.delivery ? [`${t('getDelivery')}: ${placed.delivery.address} · ${placed.delivery.phone}`, placed.delivery.location ? mapsLink(placed.delivery.location) : ''].filter(Boolean) : [t('getPickup'), ...(placed.arriveAt ? [s('arriveAt', { t: timeText(placed.arriveAt) })] : [])]), ...(placed.note ? [`${t('orderNote')}: ${placed.note}`] : [])].join('\n'))}`
    : ''

  const itemLines = () => lines.map((l) => `${l.name}${l.size ? ` (${l.size})` : ''}${l.opts?.length ? ` · ${l.opts.join(', ')}` : ''} ×${l.qty}`)
  /** the delivery details when delivering; null when something is missing (a note is shown) */
  const details = (): Delivery | undefined | null => {
    if (!check()) return null
    if (how !== 'delivery') return undefined
    return { phone: phone.trim(), address: address.trim(), location: location ?? undefined }
  }
  const payWallet = () => {
    unlockAudio() // this tap lets the order's status sounds play later
    const d = details(); if (d === null) return
    const res = payFromWallet(total, itemLines(), d, staffNote.trim() || undefined, d ? undefined : arriveAt)
    if (!res.ok) { setNote(t('notEnough')); return }
    clear()
    setPaid(res)
  }
  const pickup = () => {
    unlockAudio()
    const d = details(); if (d === null) return
    if (guestMode) {
      saveContact({ name: name.trim(), phone: phone.trim(), ...(d && { address: d.address }) })
      const res = placeOfferOrder({ total, items: itemLines(), name: name.trim(), phone: phone.trim(), address: d ? d.address : undefined, location: d?.location, note: staffNote.trim() || undefined, arriveAt: d ? undefined : arriveAt })
      if (!res.ok) return
      clear()
      setPaid(res)
      return
    }
    const res = payAtPickup(total, itemLines(), d, staffNote.trim() || undefined, d ? undefined : arriveAt)
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
            <h3>{(a?.name || name.trim()) ? t('thanksName').replace('{name}', (a?.name || name).trim().split(/\s+/)[0]) : t('orderPlaced')}</h3>
            {placed && <p className="modal-line">{t('thanksReady')}</p>}
            {placed && <OrderTracker order={placed} />}
            {waLink && <><a className="btn-pill" href={waLink} target="_blank" rel="noreferrer">{s('siteSendWhatsapp')}</a><p className="modal-line small">{s('siteWhatsappHint')}</p></>}
            {a && <p className="modal-line">{t('pointsEarned').replace('{n}', String(paid.points))}</p>}
            {paid.reward && <p className="modal-line"><b>{t('rewardUnlocked')}</b></p>}
            <button className="btn-pill" onClick={onClose}>{t('close')}</button>
          </>
        ) : (
          <>
            <h3>{t('howPay')}</h3>
            {(canWallet || guestMode) && (
              <>
                {guestMode && (
                  <div className="deliv-form guest-form">
                    <label data-field="name" className={missing.includes('name') ? 'missing' : ''}><span>{t('nameLabel')}</span><input value={name} onChange={(e) => { setName(e.target.value); setNote(''); filled('name') }} autoComplete="given-name" /></label>
                    <label data-field="phone" className={missing.includes('phone') ? 'missing' : ''}><span>{t('deliveryPhone')}</span><input type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => { setPhone(e.target.value); setNote(''); filled('phone') }} autoComplete="tel" placeholder="0750 000 0000" /></label>
                  </div>
                )}
                {pickupOnly && <p className="modal-line small cotd-pickup-note">{s('cotdPickupOnly')}</p>}
                {!pickupOnly && set.pickup && set.delivery && <div className="get-toggle" role="radiogroup" aria-label={t('getHow')}>
                  <button type="button" role="radio" aria-checked={how === 'delivery'} className={how === 'delivery' ? 'on' : ''} onClick={() => setHow('delivery')}>{t('getDelivery')}</button>
                  <button type="button" role="radio" aria-checked={how === 'pickup'} className={how === 'pickup' ? 'on' : ''} onClick={() => { setHow('pickup'); setNote('') }}>{t('getPickup')}</button>
                </div>}
                {how === 'delivery' && (
                  <div className="deliv-form">
                    {!guestMode && <label data-field="phone" className={missing.includes('phone') ? 'missing' : ''}>
                      <span>{t('deliveryPhone')}</span>
                      <input type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => { setPhone(e.target.value); setNote(''); filled('phone') }} autoComplete="tel" />
                    </label>}
                    <div data-field="place" className={'place-fields' + (missing.includes('place') ? ' missing' : '')}>
                    <label>
                      <span>{t('deliveryAddress')}</span>
                      <textarea rows={2} value={address} onChange={(e) => { setAddress(e.target.value); setNote('') }} placeholder={t('addressHint')} autoComplete="street-address" />
                    </label>
                    <ShareLocation value={location} onChange={(p) => { setLocation(p); setNote(''); if (p) filled('place') }} />
                    </div>
                  </div>
                )}
                {how === 'pickup' && (() => { const now = clockNow().getTime(); return (
                  <div className={'arrive' + (missing.includes('arrive') ? ' missing' : '')} data-field="arrive">
                    <span className="arrive-title">{s('arriveWhen')}</span>
                    <TimeWheel slots={arrivalSlots(now)} value={arriveAt} onChange={(at) => { setArriveAt(at); setNote(''); filled('arrive') }} label={s('arriveWhen')} />
                    {arriveAt > 0 && <small className="arrive-in">{s('arriveIn', { n: Math.max(1, Math.round((arriveAt - now) / 60_000)) })}</small>}
                  </div>
                ) })()}
                <label className="order-note">
                  <span>{t('orderNoteLabel')}</span>
                  <textarea rows={2} maxLength={300} value={staffNote} onChange={(e) => setStaffNote(e.target.value)} placeholder={t('orderNotePh')} />
                </label>
                <button className="btn-pill wallet-pay" onClick={pickup}>
                  {how === 'delivery' ? t('payOnDelivery') : t('payAtPickup')} · <span className="nowrap" dir="ltr">{iqd(total)} IQD</span>
                  <small>{how === 'delivery' ? t('payOnDeliveryHint') : t('payAtPickupHint')}</small>
                </button>
              </>
            )}
            {canWallet && FEATURES.wallet && (
              <button className="btn-pill wallet-pay" onClick={payWallet} disabled={a!.balance < total}>
                {t('payWallet')} · <span className="nowrap" dir="ltr">{iqd(total)} IQD</span>
                <small>{t('walletBalance')} {iqd(a!.balance)}{a!.balance < total ? <> · <a href="#account" onClick={onClose} className="inline-link light">{t('topUpLink')}</a></> : null}</small>
              </button>
            )}
            {!a && total > 0 && FEATURES.wallet && (
              <a className="btn-pill ghost" href="#account" onClick={onClose}>{t('signInToPay')}</a>
            )}
            {note && <div className="note" role="status">{note}</div>}
          </>
        )}
        {missOpen && <MissingBox missing={missing} onOk={() => { setMissOpen(false); goToMissing(missing[0]) }} />}
      </div>
    </div>
  )
}
