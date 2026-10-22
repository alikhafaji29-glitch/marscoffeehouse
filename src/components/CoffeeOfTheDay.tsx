import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../i18n'
import type { Deal, MenuItem } from '../menu'
import { iqd } from '../account'
import { nameOf } from '../menuAdmin'
import { cotdFor, settingsFor } from '../staff/store'
import { useS } from '../staff/strings'
import { ItemPic } from './MenuSection'

/*
 * Coffee of the day on Home (owner, 2026-10-22): one button; pressing it opens the list of the day's coffees, laid out
 * like the menu's rows, each at the one price (the smallest size). Choosing one opens it in the item window with that
 * price. The branch's manager sets the price and the coffees in Tools.
 */
export function CoffeeOfTheDay({ items, onPick }: { items: MenuItem[]; onPick: (item: MenuItem, o: { deal: Deal }) => void }) {
  const { t, lang } = useLang()
  const s = useS()
  const cotd = cotdFor()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!cotd.on || !items.length || !settingsFor().pickup) return null // pickup only: not shown while the branch takes no pickups
  const price = iqd(cotd.price)
  const pick = (it: MenuItem) => { setOpen(false); onPick(it, { deal: { price: cotd.price, label: 'Coffee of the day' } }) }
  return (
    <section className="slide slide-duo slide-build-one slide-cotd" id="coffee-of-the-day">
      {/* the size of the Based On Your Mood card (owner, 2026-10-22: "the slide is too small"); a tap opens the list */}
      <article className="duo-card duo-cotd" onClick={() => setOpen(true)}>
        <span className="cotd-art" aria-hidden="true"><ItemPic name={items[0].name} size={240} /></span>
        <div className="duo-text">
          <h2>{s('cotdTitle')}</h2>
          <p className="cotd-card-sub">{s('cotdSub', { price })}<br /><small>{s('cotdPickupShort')}</small></p>
          <button type="button" className="pill soft small" aria-haspopup="dialog" onClick={(e) => { e.stopPropagation(); setOpen(true) }}>{s('cotdChoose')}</button>
        </div>
      </article>
      {open && createPortal(
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal cotd-list" role="dialog" aria-modal="true" aria-labelledby="cotd-list-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="cotd-list-title">{s('cotdTitle')}</h3>
            <p className="modal-line small">{s('cotdSub', { price })} · {s('cotdPickupShort')}</p>
            <ul className="ocards">
              {items.map((it) => (
                <li key={it.name}>
                  <button type="button" className={'ocard' + (it.soldOut ? ' sold' : '')} disabled={it.soldOut} onClick={() => pick(it)}>
                    <span className="ocard-tile" aria-hidden="true">
                      <ItemPic name={it.name} />
                      {it.soldOut && <span className="ocard-sold">{t('soldOut')}</span>}
                    </span>
                    <span className="ocard-main">
                      <span className="ocard-head">
                        <span className="ocard-name">{nameOf(it.name, lang)}</span>
                        <span className="ocard-price" dir="ltr">{price}<small> IQD</small></span>
                      </span>
                      {it.sizes?.[0] && <span className="ocard-line" dir="ltr">{it.sizes[0]}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-pill" onClick={() => setOpen(false)}>{t('close')}</button>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}
