import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLang } from '../i18n'
import { giftLink, normPhone, sendGift, spendFromWallet, useAccount, waNumber } from '../account'
import type { GiftPayload } from '../account'

/*
 * "Send to a friend": the customer types the friend's phone number. The gift is stored
 * against that number (demo: on this device) and shows up under "Gifts for you" when the
 * friend signs in with it. WhatsApp to that number is offered as the delivery channel
 * because the demo has no SMS.
 */
export function SendToFriend({ payload, text, cardId, charge, address, send, onSent, onClose }: {
  payload: GiftPayload
  text: string
  cardId?: string
  charge?: number
  address?: boolean // also ask for the friend's address (drinks are delivered to them)
  send?: (to: string, address: string) => boolean // custom sender (default: sendGift + wallet charge)
  onSent?: () => void // after a successful send (the gift basket empties itself)
  onClose: () => void
}) {
  const { t } = useLang()
  const a = useAccount()
  const [to, setTo] = useState('')
  const [addr, setAddr] = useState('')
  const [err, setErr] = useState('')
  const [sent, setSent] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const d = normPhone(to)
    if (d.length < 10) { setErr(t('badPhone')); return }
    if (a && d === normPhone(a.phone)) { setErr(t('ownPhone')); return }
    if (address && addr.trim().length < 6) { setErr(t('needFriendAddress')); return }
    if (charge && (!a || a.balance < charge)) { setErr(t('notEnough')); return }
    if (send) {
      if (send(to, addr.trim())) { setErr(''); setSent(to.trim()); onSent?.() } else setErr(t('notEnough'))
      return
    }
    if (sendGift(to, payload, cardId)) {
      if (charge) spendFromWallet(charge, `gift to ${d}`)
      setErr(''); setSent(to.trim())
    }
  }
  const wa = `https://wa.me/${waNumber(to)}?text=${encodeURIComponent(text + '\n' + giftLink(payload))}`

  return (
    <form className="sendbox" onSubmit={submit}>
      {sent ? (
        <>
          <p className="sendbox-ok" role="status">{t('sentTo').replace('{n}', sent)}</p>
          <p className="acct-hint">{t('sentHint')}</p>
          <div className="sendbox-actions">
            <a className="chip" href={wa} target="_blank" rel="noreferrer">{t('notifyWhatsApp')}</a>
            <button type="button" className="chip ghost" onClick={onClose}>{t('close')}</button>
          </div>
        </>
      ) : (
        <>
          <label className="field">
            <span>{t('friendPhone')}</span>
            <input inputMode="tel" autoComplete="off" placeholder="0750 000 0000" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {address && (
            <label className="field">
              <span>{t('friendAddress')}</span>
              <textarea rows={2} value={addr} onChange={(e) => setAddr(e.target.value)} placeholder={t('addressHint')} />
            </label>
          )}
          {err && <p className="field-error" role="alert">{err}</p>}
          <div className="sendbox-actions">
            <button type="submit" className="chip solid">{t('send')}</button>
            <button type="button" className="chip ghost" onClick={onClose} aria-label={t('close')}>×</button>
          </div>
        </>
      )}
    </form>
  )
}
