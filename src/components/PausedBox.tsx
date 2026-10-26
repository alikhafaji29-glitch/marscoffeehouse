import { createPortal } from 'react-dom'
import { useLang } from '../i18n'
import { useS } from '../staff/strings'
import { settingsFor } from '../staff/store'

/*
 * The branch is not taking orders (owner, 2026-10-26: "stop receiving orders, with an apology message in the main
 * site when customer tries to order"). Staff switch it in Dashboard → Tools → Pause orders, with their own words or
 * the default apology; both checkouts (the cart and Positive Hours) show this instead of the order form.
 */
export function PausedBox({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang()
  const s = useS()
  const own = settingsFor().pauseMsg
  const text = own?.[lang]?.trim() || own?.en?.trim() || s('pausedDefault')
  return createPortal(
    <div className="modal-overlay missing-overlay" onClick={onClose}>
      <div className="modal missing-box paused-box" role="alertdialog" aria-modal="true" aria-labelledby="paused-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="paused-title">{s('pausedTitle')}</h3>
        <p className="modal-line">{text}</p>
        <button type="button" className="btn-pill" autoFocus onClick={onClose}>{t('cancelOk')}</button>
      </div>
    </div>,
    document.body,
  )
}
