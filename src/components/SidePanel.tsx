import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../i18n'

/*
 * Blank Street-style side panel: slides in over the blurred page with the photo, the name, a short
 * description, an underlined primary action + "See the menu", and a "You might also like" row.
 */
export interface Related { title: string; img: string; onClick: () => void }
export function SidePanel({ title, img, desc, primary, onPrimary, related = [], onClose }: {
  title: string; img: string; desc: string; primary: string; onPrimary: () => void; related?: Related[]; onClose: () => void
}) {
  const { t } = useLang()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  return createPortal(
    <div className="panel-overlay" onClick={onClose} role="presentation">
      <aside className="side-panel" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="side-panel-close" onClick={onClose} aria-label={t('close')}>×</button>
        <div className="side-panel-photo"><img src={img} alt="" /></div>
        <div className="side-panel-body">
          <h2 className="side-panel-title">{title}</h2>
          <p className="side-panel-desc">{desc}</p>
          <div className="side-panel-actions">
            <button type="button" className="link-btn" onClick={onPrimary}>{primary}</button>
            <a className="link-btn" href="#menu" onClick={onClose}>{t('seeMenu')}</a>
          </div>
          {related.length > 0 && (
            <div className="side-panel-related">
              <p className="side-panel-related-title">{t('alsoLike')}</p>
              <div className="side-panel-related-row">
                {related.map((r) => (
                  <button type="button" key={r.title} className="related-card" onClick={r.onClick} aria-label={r.title}>
                    <img src={r.img} alt="" />
                    <span>{r.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
