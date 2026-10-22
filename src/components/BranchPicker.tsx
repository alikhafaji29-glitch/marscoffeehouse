import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../i18n'
import { BRANCHES, branchLabel, setCustomerBranch, useStaff } from '../staff/store'
import { useS } from '../staff/strings'
import { IconPin } from './Icons'

/*
 * The first visit asks which branch the customer orders from (owner, 2026-10-22: two branches, each with its own
 * menu, prices, stock and orders). Asked once per device; a /erbil or /kirkuk link answers it, and the Order screen's
 * list changes it later. With one branch open there is nothing to ask. The header's branch button opens it again
 * (then it can be closed without changing anything).
 */
const OPEN = 'mars-pick-branch'
export const openBranchPicker = () => window.dispatchEvent(new Event(OPEN))

export function BranchPicker() {
  const { lang, t } = useLang()
  const s = useS()
  const data = useStaff()
  const [asked, setAsked] = useState(false) // opened from the header
  useEffect(() => {
    const on = () => setAsked(true)
    window.addEventListener(OPEN, on)
    return () => window.removeEventListener(OPEN, on)
  }, [])
  useEffect(() => {
    if (!asked) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAsked(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [asked])
  const open = BRANCHES.filter((b) => b.active)
  const first = !data.branchChosen
  if ((!first && !asked) || open.length < 2) return null
  const pick = (id: string) => { setCustomerBranch(id); setAsked(false) }
  return createPortal(
    <div className="modal-overlay branch-pick-overlay" onClick={first ? undefined : () => setAsked(false)}>
      <div className="modal branch-pick" role="dialog" aria-modal="true" aria-labelledby="branch-pick-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="branch-pick-title">{s('pickBranchTitle')}</h3>
        <p className="modal-line small">{s('pickBranchSub')}</p>
        <div className="branch-pick-list">
          {open.map((b) => (
            <button key={b.id} type="button" className={'branch-pick-btn' + (!first && b.id === data.customerBranch ? ' on' : '')} aria-pressed={!first && b.id === data.customerBranch} onClick={() => pick(b.id)}>{branchLabel(b.id, lang)}</button>
          ))}
        </div>
        {!first && <button type="button" className="branch-pick-close" onClick={() => setAsked(false)}>{t('close')}</button>}
      </div>
    </div>,
    document.body,
  )
}

/** the header's branch button: the customer's branch, a tap to change it (owner, 2026-10-22) */
export function HeaderBranch() {
  const { lang } = useLang()
  const s = useS()
  const data = useStaff()
  if (BRANCHES.filter((b) => b.active).length < 2) return null
  const name = branchLabel(data.customerBranch, lang)
  return (
    <button type="button" className="header-branch" onClick={openBranchPicker} aria-label={`${s('pickBranchTitle')}: ${name}`}>
      <IconPin /><span>{name}</span>
    </button>
  )
}
