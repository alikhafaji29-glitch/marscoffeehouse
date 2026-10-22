import { createPortal } from 'react-dom'
import { useLang } from '../i18n'
import { useS } from '../staff/strings'
import type { SKey } from '../staff/strings'

/*
 * "Almost there!" (owner, 2026-10-22: customers did not notice they had not written their location): when an order
 * cannot be placed, a window says exactly what is missing; OK takes the customer to the first missing field, and the
 * missing fields are outlined until filled. Used by the Positive Hours order and the cart's checkout. A shared map
 * pin makes the address optional, as before.
 */
export type Missing = 'name' | 'phone' | 'place' | 'when' | 'arrive'
const WORDS: Record<Missing, SKey> = { name: 'missName', phone: 'missPhone', place: 'missPlace', when: 'missWhen', arrive: 'missArrive' }

/** the first missing field, brought into view and focused */
export function goToMissing(first: Missing | undefined) {
  if (!first) return
  const el = document.querySelector<HTMLElement>(`[data-field="${first}"]`)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  setTimeout(() => el.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true }), 350)
}

export function MissingBox({ missing, onOk }: { missing: Missing[]; onOk: () => void }) {
  const { t } = useLang()
  const s = useS()
  return createPortal(
    <div className="modal-overlay missing-overlay" onClick={onOk}>
      <div className="modal missing-box" role="alertdialog" aria-modal="true" aria-labelledby="missing-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="missing-title">{s('missTitle')}</h3>
        <p className="modal-line small">{s('missSub')}</p>
        <ul className="missing-list">{missing.map((m) => <li key={m}>{s(WORDS[m])}</li>)}</ul>
        <button type="button" className="btn-pill" autoFocus onClick={onOk}>{t('cancelOk')}</button>
      </div>
    </div>,
    document.body,
  )
}
