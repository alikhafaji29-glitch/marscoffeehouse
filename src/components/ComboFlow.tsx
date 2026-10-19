import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../i18n'
import { iqd, normPhone, placeOfferOrder, useAccount, useMyOrders } from '../account'
import type { GeoPoint } from '../account'
import { ALL_ITEMS as ALL, MENU } from '../menu'
import type { MenuItem } from '../menu'
import { TINT, categoryOf, isIced } from '../menuMeta'
import { settingsFor, useStaff } from '../staff/store'
import type { OfferGroup } from '../staff/store'
import { useS } from '../staff/strings'
import { catLabel } from './MenuSection'
import { MiniCup } from './MiniCup'
import { OrderTracker } from './OrderTracker'
import { nameOf, photoOf } from '../menuAdmin'
import { ShareLocation, mapsLink } from './ShareLocation'
import { IconCheck } from './Icons'
import { useCountdown } from './useCountdown'

/*
 * An offer's combo order (owner, 2026-10-12: "first the user chooses the sandwich, then chooses the drink, then fills
 * his name, number, address, then the order appears in the dashboard as a new request so the tracking works").
 * The steps are the offer's groups from the staff dashboard (Offers), in their order; then the details; then the order
 * is placed at the combo price (plus the service fee when the offer has one), cash on delivery, with no sign-in.
 * It lands on the staff Orders page as "Request received" and the customer follows it on the tracker.
 * A step with several menu categories (the drinks) has a row of category chips on top that stays in view: it lights
 * the category being looked at and a tap jumps to one (owner, 2026-10-19).
 */
const GUEST = 'mars-guest' // the name / number / address typed last time, for the next order
const saved = (): { name?: string; phone?: string; address?: string } => { try { return JSON.parse(localStorage.getItem(GUEST) || '{}') } catch { return {} } }
/** what the customer may pick in a group, grouped by menu category; out-of-stock items are left out */
function choices(g: OfferGroup): { cat: string; items: MenuItem[] }[] {
  const ok = (i: MenuItem) => !i.soldOut && (g.mode === 'items' ? g.items.includes(i.name) : true)
  return MENU.filter((c) => g.mode === 'items' || g.cats.includes(c.id)).map((c) => ({ cat: c.id, items: c.items.filter(ok) })).filter((c) => c.items.length)
}
// food without a photo gets a drawn sandwich or pastry rather than the drink cup
const FOOD = ['sweets', 'savory']
const FoodIcon = ({ sweet }: { sweet: boolean }) => (
  <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="#002f6d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {sweet ? (
      <><circle cx="24" cy="24" r="14" fill="#f3d9b5" /><circle cx="19" cy="20" r="1.6" fill="#935a25" stroke="none" /><circle cx="28" cy="18.5" r="1.6" fill="#935a25" stroke="none" /><circle cx="30" cy="27" r="1.6" fill="#935a25" stroke="none" /><circle cx="21" cy="29" r="1.6" fill="#935a25" stroke="none" /><circle cx="25" cy="24" r="1.3" fill="#935a25" stroke="none" /></>
    ) : (
      <><path d="M8 20c0-6 7-10 16-10s16 4 16 10z" fill="#f3d9b5" /><path d="M7 25h34" stroke="#3f8f4f" strokeWidth="3" /><path d="M9 29.5h30" stroke="#db863a" strokeWidth="3" /><path d="M8 34h32v1.5a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="#f3d9b5" /></>
    )}
  </svg>
)
const hm = (x: string) => { const [h, m] = x.split(':').map(Number); return { h: h || 0, m: m || 0 } }

export function ComboFlow({ offerId, onClose }: { offerId: string; onClose: () => void }) {
  const { t, lang } = useLang()
  const s = useS()
  const data = useStaff()
  const a = useAccount()
  const orders = useMyOrders()
  const offer = data.offers.find((o) => o.id === offerId && o.active)
  const groups = useMemo(() => (offer?.groups ?? []).map((g) => ({ g, cats: choices(g) })).filter((x) => x.cats.length), [offer, data])
  const live = useCountdown(offer ? [hm(offer.start), hm(offer.end)] : undefined).active
  const set = settingsFor()
  const delivery = set.delivery // the combo is delivered where the branch delivers; otherwise it is picked up
  const [step, setStep] = useState(0) // 0..groups-1 = a group, groups = the details, groups+1 = placed
  const [picks, setPicks] = useState<Record<string, string[]>>({})
  const [sizes, setSizes] = useState<Record<string, number>>({}) // item name → size index (only when the offer lets customers choose)
  const [name, setName] = useState(() => a?.name ?? saved().name ?? '')
  const [phone, setPhone] = useState(() => a?.phone ?? saved().phone ?? '')
  const [address, setAddress] = useState(() => a?.address ?? saved().address ?? '')
  const [location, setLocation] = useState<GeoPoint | null>(null) // "Share my location": asked fresh for each order, never remembered
  const [note, setNote] = useState('')
  const [placedId, setPlacedId] = useState('')
  // the category chips of a step with several categories: the one in view, and a jump to one
  const bodyRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState('')
  const stepCats = (groups[step]?.cats ?? []).map((c) => c.cat).join('|')
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); setInView(stepCats.split('|')[0] ?? '') }, [step, stepCats])
  const watch = () => {
    const body = bodyRef.current
    if (!body || !chipsRef.current) return
    const line = body.scrollTop + chipsRef.current.offsetHeight + 24
    const secs = [...body.querySelectorAll<HTMLElement>('section[data-cat]')]
    let now = secs[0]?.dataset.cat ?? '' // above the first heading the first category is the one in view
    for (const sec of secs) if (sec.offsetTop <= line) now = sec.dataset.cat ?? ''
    // at the very bottom the last category is the one in view, even when it is short
    if (body.scrollTop > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 2) now = secs[secs.length - 1]?.dataset.cat ?? now
    if (now && now !== inView) setInView(now)
  }
  useEffect(() => { // keep the lit chip in sight in its row (the row only, never the page)
    const row = chipsRef.current
    const chip = row?.querySelector<HTMLElement>(`[data-cat="${inView}"]`)
    if (!row || !chip) return
    // by how far the chip's middle is from the row's middle: the same sum left-to-right and right-to-left
    const r = row.getBoundingClientRect(), c = chip.getBoundingClientRect()
    const by = c.left + c.width / 2 - (r.left + r.width / 2)
    if (Math.abs(by) > 2) row.scrollBy({ left: by, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [inView])
  const jump = (cat: string) => {
    const body = bodyRef.current
    const sec = body?.querySelector<HTMLElement>(`section[data-cat="${cat}"]`)
    if (!body || !sec) return
    setInView(cat)
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    body.scrollTo({ top: sec.offsetTop - (chipsRef.current?.offsetHeight ?? 0) - 8, behavior: smooth ? 'smooth' : 'auto' })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  if (!offer || !groups.length) return null
  const title = offer.name[lang] || offer.name.en
  const fee = offer.feeOn ? offer.fee : 0
  const total = offer.price + fee
  const DETAILS = groups.length
  const DONE = groups.length + 1
  const cur = groups[step]
  const chosen = (id: string) => picks[id] ?? []
  const full = (i: number) => chosen(groups[i].g.id).length >= groups[i].g.pick
  const label = (g: OfferGroup) => g.label[lang] || g.label.en
  const sizeOf = (it: MenuItem) => (it.sizes ? it.sizes[offer.sizes ? sizes[it.name] ?? 0 : 0] : undefined)
  const lineOf = (n: string) => { const it = ALL.find((i) => i.name === n); const z = it && sizeOf(it); return `${n}${z ? ` (${z})` : ''} ×1` }
  const picked = groups.flatMap(({ g }) => chosen(g.id))

  const pick = (g: OfferGroup, n: string) => {
    const now = chosen(g.id)
    const next = now.includes(n) ? now.filter((x) => x !== n) : g.pick === 1 ? [n] : now.length < g.pick ? [...now, n] : now
    setPicks({ ...picks, [g.id]: next })
    // one choice per step: the tap also moves on (the Back button returns to change it)
    if (g.pick === 1 && !now.includes(n) && !(offer.sizes && ALL.find((i) => i.name === n)?.sizes)) setTimeout(() => setStep((x) => x + 1), 260)
  }
  const place = () => {
    const nm = name.trim()
    if (nm.length < 2 || normPhone(phone).length < 10 || (delivery && address.trim().length < 6 && !location)) { setNote(delivery ? s('comboNeed') : s('comboNeedPickup')); return }
    const res = placeOfferOrder({ total, items: picked.map(lineOf), name: nm, phone: phone.trim(), address: delivery ? address.trim() : undefined, location: delivery && location ? location : undefined, offer: { name: offer.name.en, price: offer.price, fee: fee || undefined, pre: !live || undefined } })
    if (!res.ok) return
    try { localStorage.setItem(GUEST, JSON.stringify({ name: nm, phone: phone.trim(), address: address.trim() })) } catch { /* ignore */ }
    setPlacedId(res.orderId)
    setStep(DONE)
  }
  const placed = orders.find((o) => o.id === placedId)
  const waLink = placed && set.reach === 'whatsapp'
    ? `https://wa.me/${set.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent([`Mars CoffeeHouse · ${offer.name.en} · #${placed.id}`, ...placed.items, `${iqd(placed.total)} IQD`, `${name.trim()} · ${phone.trim()}`, ...(placed.delivery ? [placed.delivery.address, placed.delivery.location ? mapsLink(placed.delivery.location) : ''].filter(Boolean) : [t('getPickup')])].join('\n'))}`
    : ''
  const steps = [...groups.map(({ g }) => label(g)), s('comboDetails')]

  return createPortal(
    <div className="modal-overlay combo-overlay" onClick={onClose}>
      <div className="combo" role="dialog" aria-modal="true" aria-labelledby="combo-title" onClick={(e) => e.stopPropagation()}>
        <header className="combo-head">
          <div>
            <p className="combo-eyebrow">{title}{!live && step !== DONE && <em>{t('preOrder').replace(/\s*!$/, '')}</em>}</p>
            <h2 id="combo-title">{step === DONE ? t('orderPlaced') : step === DETAILS ? s('comboDetails') : label(cur.g)}</h2>
          </div>
          <button type="button" className="combo-close" onClick={onClose} aria-label={t('close')}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
        {step !== DONE && (
          <ol className="combo-steps" aria-label={s('comboSteps')}>
            {steps.map((x, i) => (
              <li key={i} className={i < step ? 'past' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
                <button type="button" disabled={i > step && !groups.slice(0, i).every((_, k) => full(k))} onClick={() => { setNote(''); setStep(i) }}>
                  <span>{i < step ? <IconCheck /> : i + 1}</span>{x}
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="combo-body" ref={bodyRef} onScroll={watch}>
          {step < DETAILS && (
            <>
              <p className="combo-hint">{s('comboPick', { n: cur.g.pick })}</p>
              {cur.cats.length > 1 && (
                <div className="combo-cats" ref={chipsRef} role="tablist" aria-label={s('category')}>
                  {cur.cats.map((c) => (
                    <button key={c.cat} type="button" role="tab" data-cat={c.cat} aria-selected={inView === c.cat} className={inView === c.cat ? 'on' : ''} onClick={() => jump(c.cat)}>
                      {catLabel(c.cat, lang)}
                    </button>
                  ))}
                </div>
              )}
              {cur.cats.map((c) => (
                <section key={c.cat} data-cat={c.cat}>
                  {cur.cats.length > 1 && <h3>{catLabel(c.cat, lang)}</h3>}
                  <div className="combo-grid" role={cur.g.pick === 1 ? 'radiogroup' : 'group'}>
                    {c.items.map((it) => {
                      const on = chosen(cur.g.id).includes(it.name)
                      const cat = categoryOf(it.name)
                      return (
                        <div key={it.name} className={'combo-item' + (on ? ' on' : '')}>
                          <button type="button" role={cur.g.pick === 1 ? 'radio' : 'checkbox'} aria-checked={on} onClick={() => pick(cur.g, it.name)}>
                            <span className="combo-tile" aria-hidden="true">{photoOf(it.name) ? <img src={photoOf(it.name)} alt="" loading="lazy" /> : FOOD.includes(cat) ? <FoodIcon sweet={cat === 'sweets'} /> : <MiniCup color={TINT[cat] || [200, 200, 200]} ice={isIced(cat) ? 1 : 0} size={54} />}</span>
                            <span className="combo-name">{nameOf(it.name, lang)}{it.sizes && !offer.sizes && <small dir="ltr">{it.sizes[0]}</small>}</span>
                            <span className="combo-check">{on && <IconCheck />}</span>
                          </button>
                          {on && offer.sizes && it.sizes && (
                            <div className="combo-sizes" role="radiogroup" aria-label={t('size')}>
                              {it.sizes.map((z, i) => <button key={z} type="button" role="radio" aria-checked={(sizes[it.name] ?? 0) === i} className={(sizes[it.name] ?? 0) === i ? 'on' : ''} onClick={() => setSizes({ ...sizes, [it.name]: i })} dir="ltr">{z}</button>)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </>
          )}

          {step === DETAILS && (
            <>
              <ul className="combo-summary">
                {groups.map(({ g }, i) => (
                  <li key={g.id}><span>{label(g)}</span><b>{chosen(g.id).map((n) => { const it = ALL.find((x) => x.name === n); const z = it && sizeOf(it); return nameOf(n, lang) + (z ? ` (${z})` : '') }).join(', ')}</b><button type="button" className="link-btn" onClick={() => setStep(i)}>{s('comboChange')}</button></li>
                ))}
              </ul>
              <div className="combo-form">
                <label><span>{t('nameLabel')}</span><input value={name} onChange={(e) => { setName(e.target.value); setNote('') }} autoComplete="given-name" /></label>
                <label><span>{t('deliveryPhone')}</span><input type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => { setPhone(e.target.value); setNote('') }} autoComplete="tel" placeholder="0750 000 0000" /></label>
                {delivery
                  ? <>
                    <label><span>{t('deliveryAddress')}</span><textarea rows={2} value={address} onChange={(e) => { setAddress(e.target.value); setNote('') }} placeholder={t('addressHint')} autoComplete="street-address" /></label>
                    <ShareLocation value={location} onChange={(p) => { setLocation(p); setNote('') }} />
                  </>
                  : <p className="combo-hint">{s('comboPickupNote')}</p>}
              </div>
              <dl className="combo-bill">
                <div><dt>{title}</dt><dd dir="ltr">{iqd(offer.price)} IQD</dd></div>
                {fee > 0 && <div><dt>{s('serviceFee')}</dt><dd dir="ltr">{iqd(fee)} IQD</dd></div>}
                {delivery && offer.freeDelivery && <div><dt>{t('getDelivery')}</dt><dd>{t('free')}</dd></div>}
                <div className="sum"><dt>{s('comboTotal')}</dt><dd dir="ltr">{iqd(total)} IQD</dd></div>
              </dl>
              <p className="combo-hint">{delivery ? `${t('payOnDelivery')} · ${t('payOnDeliveryHint')}` : t('payAtPickup')}{!live && <> · {t('preOrderHint')}</>}</p>
              {note && <p className="combo-note" role="alert">{note}</p>}
            </>
          )}

          {step === DONE && (
            <>
              {placed && <OrderTracker order={placed} />}
              <p className="combo-hint">{!live ? t('preOrderHint') : s('comboTrackHint')}</p>
              {waLink && <a className="combo-wa" href={waLink} target="_blank" rel="noreferrer">{s('siteSendWhatsapp')}</a>}
            </>
          )}
        </div>

        <footer className="combo-foot">
          {step === DONE ? (
            <button type="button" className="combo-next" onClick={onClose}>{t('close')}</button>
          ) : (
            <>
              {step > 0 && <button type="button" className="combo-back" onClick={() => { setNote(''); setStep(step - 1) }}>{t('back')}</button>}
              {step < DETAILS
                ? <button type="button" className="combo-next" disabled={!full(step)} onClick={() => setStep(step + 1)}>{s('comboNext')} · <span dir="ltr">{iqd(offer.price)} IQD</span></button>
                : <button type="button" className="combo-next" onClick={place}>{live ? s('comboPlace') : s('comboPlacePre')} · <span dir="ltr">{iqd(total)} IQD</span></button>}
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
