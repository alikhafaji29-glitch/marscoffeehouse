import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../i18n'
import { useMyOrders } from '../account'
import type { Order } from '../account'
import { FEEDBACK_TAGS, feedbackDone, markFeedbackDone, sendFeedback } from '../feedback'
import type { FeedbackKind } from '../feedback'
import { useS } from '../staff/strings'
import type { SKey } from '../staff/strings'

/*
 * The feedback window (owner, 2026-10-22). Opened by `askFeedback`: when one of this customer's orders reaches its last
 * stage (TrackBar), and when they tap OK on a cancellation (TrackModal). A received order also asks on a later visit,
 * within a day, if it was never answered or skipped. Options to tap ("lazy to write"), stars for a received order, an
 * optional comment; Send, or Not now (not asked again for that order).
 */
const ASK = 'mars-ask-feedback'
export const askFeedback = (o: Order, kind: FeedbackKind) => { if (!feedbackDone(o, kind)) window.dispatchEvent(new CustomEvent(ASK, { detail: { uid: o.uid ?? o.id, kind } })) }

export function FeedbackPrompt() {
  const { t } = useLang()
  const s = useS()
  const orders = useMyOrders()
  const [asking, setAsking] = useState<{ uid: string; kind: FeedbackKind } | null>(null)
  const [rating, setRating] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState(false)
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ uid: string; kind: FeedbackKind }>).detail; setAsking(d); setRating(0); setTags([]); setComment(''); setSent(false) }
    window.addEventListener(ASK, on)
    return () => window.removeEventListener(ASK, on)
  }, [])
  // a received order of the last day never answered nor skipped: asked once on this visit
  const [checked, setChecked] = useState(false)
  useEffect(() => {
    if (checked || !orders.length) return
    setChecked(true)
    const o = orders.find((x) => x.status === 'delivered' && Date.now() - (x.history?.[x.history.length - 1]?.at ?? x.at) < 24 * 3600_000 && !feedbackDone(x, 'received'))
    if (o) askFeedback(o, 'received')
  }, [orders, checked])
  const order = asking ? orders.find((o) => (o.uid ?? o.id) === asking.uid) : undefined
  if (!asking || !order) return null
  const kind = asking.kind
  const close = () => { if (!sent) markFeedbackDone(order, kind); setAsking(null) }
  const toggle = (id: string) => setTags((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))
  const send = async () => {
    await sendFeedback(order, kind, { rating: kind === 'received' && rating ? rating : undefined, tags, comment })
    setSent(true)
    setTimeout(() => setAsking(null), 1400)
  }
  const ready = rating > 0 || tags.length > 0 || comment.trim().length > 0
  return createPortal(
    <div className="modal-overlay" onClick={close}>
      <div className="modal feedback-box" role="dialog" aria-modal="true" aria-labelledby="fb-title" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <h3 id="fb-title">{s('fbThanks')}</h3>
        ) : (
          <>
            <h3 id="fb-title">{kind === 'received' ? s('fbReceivedTitle') : s('fbCancelledTitle')}</h3>
            <p className="modal-line small">{kind === 'received' ? s('fbReceivedSub', { id: order.id }) : s('fbCancelledSub')}</p>
            {kind === 'received' && (
              <div className="fb-stars" role="radiogroup" aria-label={s('fbRating')}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} / 5`} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</button>
                ))}
              </div>
            )}
            <div className="fb-tags" role="group" aria-label={s('fbPick')}>
              {FEEDBACK_TAGS[kind].map((id) => (
                <button key={id} type="button" aria-pressed={tags.includes(id)} className={'fb-tag' + (tags.includes(id) ? ' on' : '')} onClick={() => toggle(id)}>{s(('fb_' + id) as SKey)}</button>
              ))}
            </div>
            <textarea className="fb-comment" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={s('fbCommentPh')} aria-label={s('fbCommentPh')} />
            <button type="button" className="btn-pill fb-send" disabled={!ready} onClick={send}>{s('fbSend')}</button>
            <button type="button" className="fb-later" onClick={close}>{s('fbLater')}</button>
          </>
        )}
        {sent && <button type="button" className="btn-pill" onClick={() => setAsking(null)}>{t('close')}</button>}
      </div>
    </div>,
    document.body,
  )
}
