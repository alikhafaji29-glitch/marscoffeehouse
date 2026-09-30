import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import { addPost } from '../community'
import { getAccount } from '../account'
import type { Recipe } from '../community'
import { IconStar } from './Icons'

/*
 * "How was it?" — two taps to share a drink with Mars Community.
 * Demo: saves on this device only (see community.ts).
 */
export function ReviewPrompt({ recipe, defaultTitle, onClose }: { recipe: Recipe; defaultTitle: string; onClose: () => void }) {
  const { t, lang } = useLang()
  const [rating, setRating] = useState<0 | 1 | 2 | 3 | 4 | 5>(0)
  const [title, setTitle] = useState(defaultTitle)
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!done) return
    const id = setTimeout(onClose, 1800)
    return () => clearTimeout(id)
  }, [done, onClose])

  const submit = () => {
    if (!rating) return
    const a = getAccount()
    addPost({
      phone: a?.phone,
      name: name.trim().slice(0, 24) || a?.name || t('guest'),
      title: title.trim().slice(0, 48) || defaultTitle,
      rating,
      text: text.trim().slice(0, 280),
      lang,
      recipe,
    })
    setDone(true)
  }

  return (
    <div className="modal-overlay review-overlay" onClick={onClose} role="presentation">
      <div className="review-sheet" role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <p className="review-thanks" role="status">{t('reviewThanks')}</p>
        ) : (
          <>
            <h3 id="review-title" className="review-title">{t('reviewTitle')}</h3>
            <div className="stars" role="radiogroup" aria-label={t('yourRating')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} / 5`}
                  className={'star' + (n <= rating ? ' on' : '')}
                  onClick={() => setRating(n as 1 | 2 | 3 | 4 | 5)}
                >
                  <IconStar filled={n <= rating} />
                </button>
              ))}
            </div>
            <label className="field">
              <span>{t('reviewDrinkName')}</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={48} />
            </label>
            <label className="field">
              <span>{t('reviewTextLabel')}</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={280} rows={3} />
            </label>
            <label className="field">
              <span>{t('reviewNameLabel')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoComplete="given-name" />
            </label>
            <div className="review-actions">
              <button type="button" className="wizard-back" onClick={onClose}>{t('notNow')}</button>
              <button type="button" className="add-btn" disabled={!rating} onClick={submit}>{t('reviewShare')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
