import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLang } from '../i18n'
import { dropsFrom } from '../fx'
import type { TKey } from '../i18n'
import type { MenuItem } from '../menu'
import { askMood, MoodUnavailable } from '../mood'
import type { MoodAnswer, MoodSource } from '../mood'
import { iqd } from '../account'
import { MiniCup } from './MiniCup'
import { ReviewPrompt } from './ReviewPrompt'

type Step = 0 | 1 | 2 | 3

const QUESTIONS: { key: TKey; options: [string, string]; alts: [string, string] }[] = [
  { key: 'q1', options: ['/assets/quiz/mood-sad.png?v=3', '/assets/quiz/mood-happy.png?v=3'], alts: ['sad', 'happy'] },
  { key: 'q2', options: ['/assets/quiz/choc.png?v=3', '/assets/quiz/lemon.png?v=3'], alts: ['chocolate', 'lemon'] },
  { key: 'q3', options: ['/assets/quiz/mood-sleepy.png?v=3', '/assets/quiz/mood-energy.png?v=3'], alts: ['sleepy', 'energetic'] },
]

// answer pattern (0/1 per question) -> recommended drink
const DRINKS: Record<string, string> = {
  '000': 'Cozy Choco Latte',
  '001': 'Mocha Thunder',
  '010': 'Sunrise Lemon Tea',
  '011': 'Citrus Cold Brew',
  '100': 'Berry-bloom Matcha',
  '101': 'Choco Cloud Frappé',
  '110': 'Lemon Mint Splash',
  '111': 'Sunny Citrus Energizer',
}

function MoodBadge() {
  return (
    <div className="badge">
      <span className="script">YourMood</span>{' '}
      <span className="tag navy">DRINK</span>
    </div>
  )
}

const CHIPS: TKey[] = ['chipTired', 'chipStressed', 'chipHappy', 'chipHot', 'chipFocus', 'chipSweet', 'chipLight']

/* Describe your mood in your own words → one drink, with a reason. */
export function MoodAsk({ onPick, chips = true, onDone }: { onPick: (item: MenuItem) => void; chips?: boolean; onDone?: () => void }) {
  const { t, lang } = useLang()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState<string | null>(null) // no AI barista here: why (owner, 2026-09-29: free text is AI only)
  const [result, setResult] = useState<{ answer: MoodAnswer; source: MoodSource } | null>(null)
  const [review, setReview] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const ask = async (e?: FormEvent) => {
    e?.preventDefault()
    const q = text.trim()
    if (!q || busy) return
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    setBusy(true)
    setOffline(null)
    try {
      const r = await askMood(q, lang, ctl.signal)
      if (!ctl.signal.aborted) { setResult(r); setTimeout(() => dropsFrom(document.querySelector('.mood-card .minicup, .mood-card svg'), '#f28ab2', 16, 1.2), 350) }
    } catch (err) { if (err instanceof MoodUnavailable && !ctl.signal.aborted) setOffline(err.why) /* else cancelled */ } finally { if (abort.current === ctl) setBusy(false) }
  }
  const addChip = (k: TKey) => setText((v) => (v.trim() ? v.replace(/[,،]?\s*$/, '') + (lang === 'en' ? ', ' : '، ') : '') + t(k))
  const again = () => { setResult(null); setReview(false) }

  const a = result?.answer
  const title = a ? a.item.name : ''
  const price = a ? (Array.isArray(a.item.price) ? a.item.price[0] : a.item.price) : 0

  return (
    <div className="mood-ask">
      {!a ? (
        <form onSubmit={ask}>
          <label className="mood-label" htmlFor="mood-text">{t('moodAsk')}</label>
          <textarea id="mood-text" rows={3} maxLength={400} placeholder={t('moodPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
          {chips && (
            <div className="mood-chips" aria-label={t('moodAsk')}>
              {CHIPS.map((k) => <button key={k} type="button" className="mood-chip" onClick={() => addChip(k)} disabled={busy}>{t(k)}</button>)}
            </div>
          )}
          <button type="submit" className="btn-pill" disabled={!text.trim() || busy} aria-busy={busy}>{busy ? t('moodThinking') : t('moodFind')}</button>
          {offline !== null && <p className="mood-offline" role="alert">{t('moodAIUnavailable')}<small dir="ltr">{offline}</small></p>}
          <p className="mood-note">{t('moodAiNote')}</p>
        </form>
      ) : (
        <div className="mood-card" role="status">
          <div className="mood-card-top">
            <MiniCup color={[242, 150, 190]} ice={1} size={56} />
            <div>
              <div className="mood-card-name">{title}</div>
              <div className="mood-card-meta">{t('moodMenuTag')} · <span dir="ltr">{iqd(price)} IQD</span></div>
            </div>
          </div>
          <p className="mood-card-reason">{a.reason}</p>
          <small className="mood-source">{result!.source === 'local' ? t('moodByMars') : t('moodByAI')}</small>
          <div className="mood-actions">
            <button className="btn-pill" onClick={() => { onDone?.(); onPick(a.item) }}>{t('orderNow')}</button>
            <button className="btn-pill ghost" onClick={() => setReview(true)}>{t('rateThis')}</button>
          </div>
          <button className="mood-again" onClick={again}>{t('moodAgain')}</button>
          {review && <ReviewPrompt recipe={{ kind: 'mood', drink: a.item.name }} defaultTitle={title} onClose={() => setReview(false)} />}
        </div>
      )}
    </div>
  )
}

/* The small window behind "Order mood drink" on the home slide: the question, a plain text box, the answer. */
export function MoodDialog({ onPick, onClose }: { onPick: (item: MenuItem) => void; onClose: () => void }) {
  const { t } = useLang()
  return (
    <div className="modal-overlay review-overlay" onClick={onClose} role="presentation">
      <div className="review-sheet mood-dialog" role="dialog" aria-modal="true" aria-label={t('cardMood')} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="mood-dialog-close" onClick={onClose} aria-label={t('close')}>×</button>
        <MoodAsk onPick={onPick} chips={false} onDone={onClose} />
      </div>
    </div>
  )
}

export function MoodQuiz({ onOrder, onPick }: { onOrder: () => void; onPick: (item: MenuItem) => void }) {
  const { t } = useLang()
  const [step, setStep] = useState<Step>(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [started, setStarted] = useState(false)
  const [review, setReview] = useState(false)

  const pick = (i: number) => {
    setAnswers((a) => [...a, i])
    setStep((s) => (s + 1) as Step)
  }

  const reset = () => {
    setAnswers([])
    setStep(0)
    setStarted(false)
  }

  const drink = DRINKS[answers.join('')] ?? 'Berry-bloom Matcha'

  useEffect(() => {
    if (step !== 3) return
    const id = setTimeout(() => dropsFrom(document.querySelector('.mood-result img'), '#f28ab2', 18, 1.2), 450)
    return () => clearTimeout(id)
  }, [step])

  return (
    <section className="mood" id="mood">
      <div className="mood-inner">
        <MoodBadge />
        <div className="mood-title">{t('moodTitle')}</div>

        <MoodAsk onPick={onPick} />

        {!started ? (
          <button className="mood-again" onClick={() => setStarted(true)}>
            {t('moodQuizToggle')}
          </button>
        ) : step < 3 ? (
          <>
            <div className="mood-q">{t(QUESTIONS[step].key)}</div>
            <div className="mood-choices">
              <button className="mood-choice" onClick={() => pick(0)}>
                <img src={QUESTIONS[step].options[0]} alt={QUESTIONS[step].alts[0]} />
              </button>
              <div className="divider" />
              <button className="mood-choice" onClick={() => pick(1)}>
                <img src={QUESTIONS[step].options[1]} alt={QUESTIONS[step].alts[1]} />
              </button>
            </div>
          </>
        ) : (
          <div className="mood-result">
            <div className="mood-q">{t('result')}</div>
            <img src="/assets/drink-berry-bloom.png" alt={drink} />
            <div className="drink-name">{drink}</div>
            <div className="mood-actions">
              <button className="btn-pill" onClick={onOrder}>
                {t('orderNow')}
              </button>
              <button className="btn-pill ghost" onClick={() => setReview(true)}>
                {t('rateThis')}
              </button>
            </div>
            {review && <ReviewPrompt recipe={{ kind: 'mood', drink }} defaultTitle={drink} onClose={() => setReview(false)} />}
            <div>
              <button className="mood-again" onClick={reset}>
                {t('tryAgain')}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
