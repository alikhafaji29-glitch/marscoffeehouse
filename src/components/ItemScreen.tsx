import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useCart } from '../cart'
import { dropsFrom } from '../fx'
import { useLang } from '../i18n'
import type { MenuItem } from '../menu'
import { iqd } from '../account'
import { DESC, PHOTO, TINT, categoryOf, isIced } from '../menuMeta'
import { groupsFor, defaultPicks, extras, summary } from '../customize'
import type { CustGroup, Picks } from '../customize'
import { MiniCup } from './MiniCup'
import { IconCheck } from './Icons'

/*
 * Full-screen item page (owner, 2026-09-14, modelled on Blank Street's): back button, big photo on a
 * pale arc that fades into a compact sticky bar (thumbnail, name, price) as you scroll, a white card
 * with title, description, allergen note, size cards and quantity, then collapsible customization
 * groups (DEMO placeholders from src/customize.ts) and a sticky "Add to order" button.
 * In gift mode (#gift) the button reads "Add to gift": the item joins the gift basket, sent from the cart.
 */
const Chevron = ({ up }: { up?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
  </svg>
)
const Back = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

export function ItemScreen({ item, gift = false, onClose, onAdded }: { item: MenuItem; gift?: boolean; onClose: () => void; onAdded?: () => void }) {
  const { t } = useLang()
  const { add } = useCart()
  const dual = typeof item.price !== 'number'
  const [sizeIdx, setSizeIdx] = useState(0)
  const [qty, setQty] = useState(1)
  const groups = groupsFor(item.name)
  const [picks, setPicks] = useState<Picks>(() => defaultPicks(groups))
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [scrolled, setScrolled] = useState(false)
  const [fade, setFade] = useState(1)
  const scroller = useRef<HTMLDivElement>(null)

  const cat = categoryOf(item.name)
  const photo = PHOTO[item.name]
  const base = dual ? (item.price as [number, number])[sizeIdx] : (item.price as number)
  const size = dual && item.sizes ? item.sizes[sizeIdx] : undefined
  const unit = base + extras(picks, groups)
  const opts = summary(picks, t, groups)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  const onScroll = () => {
    const y = scroller.current?.scrollTop ?? 0
    setScrolled(y > 150)
    setFade(Math.max(0, 1 - y / 260))
  }
  const choose = (g: CustGroup, id: string) => setPicks((p) => {
    const cur = p[g.id] ?? []
    if (g.kind === 'toggle') return { ...p, [g.id]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }
    return { ...p, [g.id]: g.optional && cur[0] === id ? [] : [id] }
  })
  const chosen = (g: CustGroup) => g.options.filter((o) => picks[g.id]?.includes(o.id)).map((o) => t(o.label)).join(', ')
  const confirm = (e: MouseEvent<HTMLButtonElement>) => {
    dropsFrom(e.currentTarget, '#73c3ff', 14, 1.1)
    add({ name: item.name, size, price: unit, opts }, qty)
    onClose()
    onAdded?.() // e.g. from New this season: straight on to checkout
  }
  const cup = (px: number) => <MiniCup color={TINT[cat] || [200, 200, 200]} ice={isIced(cat) ? 1 : 0} size={px} />

  return createPortal(
    <div className="item-screen" ref={scroller} onScroll={onScroll} role="dialog" aria-modal="true" aria-labelledby="item-title">
      <button type="button" className="item-back" onClick={onClose} aria-label={t('back')}><Back /></button>
      <div className={'item-topbar' + (scrolled ? ' show' : '')} aria-hidden={!scrolled}>
        <span className="item-thumb">{photo ? <img src={photo} alt="" /> : cup(34)}</span>
        <span className="item-topbar-text"><strong>{item.name}</strong><span dir="ltr">{iqd(unit)} IQD</span></span>
      </div>

      <div className="item-hero" style={{ opacity: fade, transform: `scale(${0.85 + 0.15 * fade})` }}>
        <div className="item-arc" />
        {photo ? <img src={photo} alt="" /> : cup(210)}
      </div>

      <div className="item-body">
        <section className="item-card">
          <h1 id="item-title">{item.name}</h1>
          <p className="item-desc">{DESC[item.name] ? t(DESC[item.name]) : t('descDefault')}</p>
          <p className="item-desc">{t('allergenNote')}</p>
          {dual && item.sizes && (
            <>
              <p className="item-label">{t('size')}</p>
              <div className="size-cards" role="radiogroup" aria-label={t('size')}>
                {item.sizes.map((s, i) => (
                  <button key={s} type="button" role="radio" aria-checked={i === sizeIdx} className={'opt-card' + (i === sizeIdx ? ' on' : '')} onClick={() => setSizeIdx(i)}>
                    <span className="opt-head"><span className="opt-radio">{i === sizeIdx && <IconCheck />}</span><strong>{t(i === 0 ? 'sizeSmall' : 'sizeBig')}</strong><em dir="ltr">{s}</em></span>
                    <span className="opt-price" dir="ltr">{iqd((item.price as [number, number])[i])} IQD</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {(
            <div className="qty-card">
              <span>{t('qty')}</span>
              <span className="qty-ctl">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="-">&minus;</button>
                <b>{qty}</b>
                <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="+">+</button>
              </span>
            </div>
          )}
        </section>

        {groups.map((g) => {
          const isOpen = !!open[g.id]
          return (
            <section key={g.id} className={'cust-group' + (isOpen ? ' open' : '')}>
              <button type="button" className="cust-head" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}>
                <span className="cust-title">{t(g.title)}</span>
                <span className="cust-value">{chosen(g)}</span>
                <span className="cust-chev"><Chevron up={isOpen} /></span>
              </button>
              {isOpen && (
                <div className="cust-body">
                  {g.hint && <p className="cust-hint">{t(g.hint)}</p>}
                  {g.kind === 'choice' ? (
                    <div className="opt-grid" role={g.optional ? 'group' : 'radiogroup'}>
                      {g.options.map((o) => {
                        const on = !!picks[g.id]?.includes(o.id)
                        return (
                          <button key={o.id} type="button" role={g.optional ? 'checkbox' : 'radio'} aria-checked={on} className={'opt-card' + (on ? ' on' : '')} onClick={() => choose(g, o.id)}>
                            <span className="opt-head"><span className="opt-radio">{on && <IconCheck />}</span><strong>{t(o.label)}</strong></span>
                            {o.note && <span className="opt-note">{t(o.note)}</span>}
                            {o.price ? <span className="opt-price" dir="ltr">+{iqd(o.price)} IQD</span> : null}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    g.options.map((o) => {
                      const on = !!picks[g.id]?.includes(o.id)
                      return (
                        <div key={o.id} className="toggle-row">
                          <span className="toggle-label">{t(o.label)}</span>
                          <span className="toggle-state">{on ? t('on') : t('off')}</span>
                          <button type="button" role="switch" aria-checked={on} className={'switch' + (on ? ' on' : '')} onClick={() => choose(g, o.id)} aria-label={t(o.label)}>
                            <span className="knob">{on ? <IconCheck /> : '×'}</span>
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </section>
          )
        })}
        <div className="item-spacer" />
      </div>

      <div className="item-cta">
        {/* gift mode: the item joins the gift basket (several items, like an ordinary order — owner 2026-09-14) */}
        <button type="button" className="cta-btn" onClick={confirm}>{t(gift ? 'addToGift' : 'addToOrder')} · {iqd(unit * qty)} IQD</button>
      </div>
    </div>,
    document.body,
  )
}
