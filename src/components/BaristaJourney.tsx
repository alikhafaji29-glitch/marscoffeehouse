import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../i18n'
import type { TKey } from '../i18n'
import { LatteGame } from './LatteGame'
import { MojitoGame } from './MojitoGame'
import { MilkshakeGame } from './MilkshakeGame'
import { SmoothieGame } from './SmoothieGame'
import { MatchaGame } from './MatchaGame'
import { RefresherGame } from './RefresherGame'

/*
 * "Be the barista" (Build Your Drink → second option). First the customer picks WHAT to build (owner, 2026-09-29:
 * "you will ask the user what do you like to build? mojito, milkshake, latte, etc"). Each category is a barista
 * mini-game ordered as the real menu drink. The Soda card (the soft drink + syrups builder) was removed on 2026-09-30.
 */
export type Cat = 'latte' | 'mojito' | 'milkshake' | 'smoothie' | 'matcha' | 'refreshers'
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const ICON: Record<Cat, JSX.Element> = {
  latte: <svg viewBox="0 0 64 64" aria-hidden="true"><path {...S} d="M12 24h34l-3 24a6 6 0 0 1-6 5H21a6 6 0 0 1-6-5Z" /><path {...S} d="M46 30h4a6 6 0 0 1 0 12h-5M22 31c3-4 7-4 7 0 0-4 4-4 7 0-2 4-7 7-7 7s-5-3-7-7ZM22 16c0-4 4-4 4-8M32 16c0-4 4-4 4-8" /></svg>,
  mojito: <svg viewBox="0 0 64 64" aria-hidden="true"><path {...S} d="M16 12h32l-4 42a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4Z" /><path {...S} d="M38 6l-6 30M22 30l6 4 6-4M24 42h6M34 46h4" /><circle {...S} cx="46" cy="14" r="7" /><path {...S} d="M46 7v14M39 14h14" /></svg>,
  milkshake: <svg viewBox="0 0 64 64" aria-hidden="true"><path {...S} d="M18 26h28l-4 30H22Z" /><path {...S} d="M16 26c0-8 6-12 16-12s16 4 16 12ZM36 14l6-10M26 12a3 3 0 1 1 0 .1" /><path {...S} d="M22 36h20" /></svg>,
  smoothie: <svg viewBox="0 0 64 64" aria-hidden="true"><path {...S} d="M18 18h28l-4 38H22Z" /><path {...S} d="M30 18l10-14M18 30c6 3 10-3 14 0s8 3 14 0" /><path {...S} d="M46 10c4 0 6 3 6 6-4 0-6-3-6-6Z" /></svg>,
  matcha: <svg viewBox="0 0 64 64" aria-hidden="true"><path {...S} d="M10 30h44c0 14-10 24-22 24S10 44 10 30Z" /><path {...S} d="M22 30c0-8 4-14 10-14s10 6 10 14M32 16V6M28 22v8M36 22v8" /></svg>,
  refreshers: <svg viewBox="0 0 64 64" aria-hidden="true"><path {...S} d="M10 16h28l-4 40H14Z" /><path {...S} d="M11 28h26M28 6l-4 26" /><path {...S} d="M36 48a13 13 0 0 1 26 0Z" /><path {...S} d="M49 48v-11M49 48l-8-7M49 48l8-7" /></svg>,
}
const CATS: { id: Cat; name: TKey; sub: TKey; ready: boolean }[] = [
  { id: 'latte', name: 'catLatte', sub: 'catLatteSub', ready: true },
  { id: 'mojito', name: 'catMojito', sub: 'catMojitoSub', ready: true },
  { id: 'milkshake', name: 'catMilkshake', sub: 'catMilkshakeSub', ready: true },
  { id: 'smoothie', name: 'catSmoothie', sub: 'catSmoothieSub', ready: true },
  { id: 'matcha', name: 'catMatcha', sub: 'catMatchaSub', ready: true },
  { id: 'refreshers', name: 'catRefreshers', sub: 'catRefreshersSub', ready: true },
]

export function BaristaJourney({ start, onClose }: { start?: Cat; onClose: () => void }) {
  const { t } = useLang()
  const [cat, setCat] = useState<Cat | null>(start ?? null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  return createPortal(
    <div className="barista-overlay" role="dialog" aria-modal="true" aria-label={t('buildAskBarista')}>
      <div className="barista">
        <button type="button" className="barista-close" onClick={onClose} aria-label={t('close')}>×</button>
        {cat !== null ? (
          <>
            <button type="button" className="barista-back" onClick={() => setCat(null)}>{t('back')}</button>
            {cat === 'latte' ? <LatteGame onDone={onClose} /> : cat === 'mojito' ? <MojitoGame onDone={onClose} /> : cat === 'milkshake' ? <MilkshakeGame onDone={onClose} /> : cat === 'smoothie' ? <SmoothieGame onDone={onClose} /> : cat === 'matcha' ? <MatchaGame onDone={onClose} /> : <RefresherGame onDone={onClose} />}
          </>
        ) : (
          <div className="barista-cats">
            <h2 className="barista-q">{t('buildWhat')}</h2>
            <div className="barista-grid">
              {CATS.map((c) => (
                <button key={c.id} type="button" className={'barista-cat' + (c.ready ? '' : ' soon')} disabled={!c.ready} onClick={() => setCat(c.id)}>
                  <span className="barista-cat-icon">{ICON[c.id]}</span>
                  <b>{t(c.name)}</b>
                  <small>{t(c.sub)}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
