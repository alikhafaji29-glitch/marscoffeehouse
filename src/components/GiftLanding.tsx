import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import { claimToWallet, clearGiftFromUrl, iqd, readGiftFromUrl, useAccount } from '../account'
import type { GiftPayload } from '../account'

/* Opened from a share link (?g=…): a menu drink a friend paid for, or a gift card. */
export function GiftLanding() {
  const { t } = useLang()
  const a = useAccount()
  const [gift, setGift] = useState<GiftPayload | null>(() => readGiftFromUrl())
  const [done, setDone] = useState('')
  useEffect(() => { if (gift) clearGiftFromUrl() }, [gift])
  if (!gift) return null
  const close = () => setGift(null)
  const goSignIn = () => { close(); location.hash = 'account' }

  return (
    <div className="modal-overlay review-overlay" onClick={close} role="presentation">
      <div className="review-sheet gift-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {gift.t === 'item' ? (
          <>
            <p className="gift-from">{t('giftFrom').replace('{name}', gift.from)}</p>
            <h3 className="review-title">{gift.name}{gift.size ? ` (${gift.size})` : ''}</h3>
            <p className="acct-hint">{gift.address ? t('giftOnWay').replace('{address}', gift.address) : t('giftPaid').replace('{n}', iqd(gift.paid))}</p>
            {done ? <p className="review-thanks" role="status">{done}</p> : gift.address ? (
              <div className="review-actions"><button className="add-btn" onClick={close}>{t('close')}</button></div>
            ) : (
              <div className="review-actions">
                <button className="wizard-back" onClick={close}>{t('notNow')}</button>
                {a ? <button className="add-btn" onClick={() => { claimToWallet(gift.paid, `gift from ${gift.from}`, 'gift-claim'); setDone(t('claimed')) }}>{t('claimGift')}</button>
                   : <button className="add-btn" onClick={goSignIn}>{t('signInToClaim')}</button>}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="gift-from">{t('giftFrom').replace('{name}', gift.from)}</p>
            <div className="giftcard-face big">
              <span className="giftcard-brand">mars</span>
              <span className="giftcard-amount">{iqd(gift.amount)} <small>IQD</small></span>
              <span className="giftcard-code" dir="ltr">{gift.code}</span>
            </div>
            {done ? <p className="review-thanks" role="status">{done}</p> : (
              <div className="review-actions">
                <button className="wizard-back" onClick={close}>{t('notNow')}</button>
                {a ? <button className="add-btn" onClick={() => { claimToWallet(gift.amount, `gift card ${gift.code}`, 'card-redeem'); setDone(t('redeemed')) }}>{t('redeemCard')}</button>
                   : <button className="add-btn" onClick={goSignIn}>{t('signInToClaim')}</button>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
