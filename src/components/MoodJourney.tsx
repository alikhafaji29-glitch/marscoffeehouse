import { clockNow } from '../clock'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../i18n'
import type { MenuItem } from '../menu'
import { MoodGame, periodOf } from './MoodGame'

/* "Based On Your Mood" pops up like Build Your Drink (owner, 2026-09-14): a full-screen sheet that holds the
 * fill-the-cup journey. Escape or the X closes it.
 * Art direction (owner's brief, 2026-09-28): limited palette (brand blues on white), sketch icons, 2D — a blue
 * checkerboard strip on top, hand-drawn doodles around the edges, halftone dots at the bottom. */
/* Sketch style of the doodles, answer icons and cup (owner is comparing, 2026-09-28):
 * 'clean' = even line drawing · 'marker' = wobbly felt-tip · 'pencil' = double sketchy pencil lines · 'sticker' = chunky filled stickers.
 * The owner compared all four and picked marker, then switched to sticker (2026-09-28); the others stay one word away. */
export type SketchStyle = 'clean' | 'marker' | 'pencil' | 'sticker'
export const SKETCH_STYLE: SketchStyle = 'sticker' // owner's pick, 2026-09-28 (marker before)
/* the hand-drawn wobble: noise that nudges every line a little (used by marker and pencil) */
function SketchFilters() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <filter id="sk-wobble" filterUnits="userSpaceOnUse" x="-110" y="-110" width="330" height="330">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="sk-pencil" filterUnits="userSpaceOnUse" x="-20" y="-20" width="200" height="200">
        <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="a" />
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="21" result="n2" />
        <feDisplacementMap in="SourceGraphic" in2="n2" scale="3" xChannelSelector="G" yChannelSelector="R" result="b0" />
        <feOffset in="b0" dx="1.2" dy="0.8" result="b" />
        <feComponentTransfer in="b" result="bf"><feFuncA type="linear" slope="0.55" /></feComponentTransfer>
        <feMerge><feMergeNode in="bf" /><feMergeNode in="a" /></feMerge>
      </filter>
    </svg>
  )
}
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
function Doodles() {
  return (
    <div className="mood-doodles" aria-hidden="true">
      {/* cookie */}
      <svg className="dd fl dd-cookie" viewBox="0 0 64 64"><path {...S} d="M32 6c9 0 13 5 18 7s8 9 8 17c0 13-11 26-26 26S6 45 6 31 18 6 32 6Z" /><path {...S} d="M22 22c2 0 3 1 3 3M38 18c1 1 1 3 0 4M42 34c2 0 3 2 2 4M24 40c2-1 4 0 4 2M31 30h.01M17 32h.01M34 46h.01M48 24h.01" /></svg>
      {/* coffee bean */}
      <svg className="dd fl dd-bean" viewBox="0 0 64 64"><ellipse {...S} cx="32" cy="32" rx="16" ry="23" transform="rotate(28 32 32)" /><path {...S} d="M24 14c10 8-2 18 8 36" /></svg>
      {/* croissant */}
      <svg className="dd fl dd-croissant" viewBox="0 0 64 64"><path {...S} d="M8 40c4-12 14-20 24-20s20 8 24 20c-4 3-8 3-12 1-3 3-8 4-12 4s-9-1-12-4c-4 2-8 2-12-1Z" /><path {...S} d="M22 26l4 16M32 21v22M42 26l-4 16" /></svg>
      {/* sparkles */}
      <svg className="dd dd-spark1" viewBox="0 0 24 24"><path {...S} d="M12 2c0 6 4 10 10 10-6 0-10 4-10 10 0-6-4-10-10-10 6 0 10-4 10-10Z" /></svg>
      <svg className="dd dd-spark2" viewBox="0 0 24 24"><path {...S} d="M12 2c0 6 4 10 10 10-6 0-10 4-10 10 0-6-4-10-10-10 6 0 10-4 10-10Z" /></svg>
      <svg className="dd dd-spark3" viewBox="0 0 24 24"><path {...S} d="M12 2c0 6 4 10 10 10-6 0-10 4-10 10 0-6-4-10-10-10 6 0 10-4 10-10Z" /></svg>
      {/* three "pop" strokes, like the poster */}
      <svg className="dd dd-pop" viewBox="0 0 40 40"><path {...S} strokeWidth={3} d="M8 30 4 20M18 26l2-12M28 30l8-8" /></svg>
      {/* floating ingredients (owner, 2026-09-28): orange slice, banana, strawberry, mint leaf, ice cube, another bean */}
      <svg className="dd fl dd-orange" viewBox="0 0 64 64"><circle {...S} cx="32" cy="32" r="22" /><circle {...S} cx="32" cy="32" r="17" /><path {...S} d="M32 32V15M32 32l14.7-8.5M32 32l14.7 8.5M32 32v17M32 32l-14.7 8.5M32 32l-14.7-8.5" /></svg>
      <svg className="dd fl dd-banana" viewBox="0 0 64 64"><path {...S} d="M10 20c2 18 16 32 36 32 6 0 10-2 12-4-18 0-32-12-38-28Z" /><path {...S} d="M10 20 8 13l5-1M17 25c4 11 13 19 27 22" /></svg>
      <svg className="dd fl dd-berry" viewBox="0 0 64 64"><path {...S} d="M32 58c-12-6-20-18-18-30 2-8 10-12 18-8 8-4 16 0 18 8 2 12-6 24-18 30Z" /><path {...S} d="M22 20l4-8 6 6 6-6 4 8M26 31h.01M37 31h.01M31 39h.01M24 41h.01M39 41h.01M31 49h.01" /></svg>
      <svg className="dd fl dd-leaf" viewBox="0 0 64 64"><path {...S} d="M12 52C12 30 30 12 52 12c0 22-18 40-40 40Z" /><path {...S} d="M12 52 44 20M24 40l-4-10M32 32l10 2M28 36l-2-8" /></svg>
      <svg className="dd fl dd-ice" viewBox="0 0 64 64"><path {...S} d="M16 22l16-8 16 8v18l-16 8-16-8Z" /><path {...S} d="M16 22l16 8 16-8M32 30v18M22 26l4 2" /></svg>
      <svg className="dd fl dd-bean2" viewBox="0 0 64 64"><ellipse {...S} cx="32" cy="32" rx="16" ry="23" transform="rotate(-24 32 32)" /><path {...S} d="M40 12c-10 8 2 18-8 38" /></svg>
    </div>
  )
}

export function MoodJourney({ onPick, onWords, onClose }: { onPick: (item: MenuItem) => void; onWords: () => void; onClose: () => void }) {
  const { t } = useLang()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  return createPortal(
    <div className="mood-journey-overlay" data-period={periodOf(clockNow().getHours())} data-sketch={SKETCH_STYLE} role="dialog" aria-modal="true" aria-label={t('sectionsMood')}>
      <SketchFilters />
      <Doodles />
      <div className="mood-journey">
        <button type="button" className="mood-journey-close" onClick={onClose} aria-label={t('close')}>×</button>
        <MoodGame onPick={(it) => { onClose(); onPick(it) }} onWords={() => { onClose(); onWords() }} onDone={onClose} />
      </div>
    </div>,
    document.body,
  )
}
