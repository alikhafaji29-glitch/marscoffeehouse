import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../i18n'
import { unlockAudio } from '../chime'
import { iqd, normPhone, placeOfferOrder, saveContact, savedContact, useAccount, useMyOrders } from '../account'
import type { GeoPoint } from '../account'
import { ALL_ITEMS as ALL, MENU } from '../menu'
import type { MenuItem } from '../menu'
import { TINT, categoryOf, isIced } from '../menuMeta'
import { offersFor, settingsFor, useStaff } from '../staff/store'
import type { OfferGroup } from '../staff/store'
import { useS } from '../staff/strings'
import { catLabel } from './MenuSection'
import { MiniCup } from './MiniCup'
import { OrderTracker } from './OrderTracker'
import { TimeWheel } from './TimeWheel'
import { nameOf, photoOf } from '../menuAdmin'
import { defaultPicks, extras, groupsFor, summary, timesPicked } from '../customize'
import type { CustGroup, Picks } from '../customize'
import { arrivalSlots, timeText, whenText } from '../orders'
import { ShareLocation, mapsLink } from './ShareLocation'
import { IconCheck } from './Icons'
import { useCountdown } from './useCountdown'
import { clockNow } from '../clock'

/*
 * An offer's combo order (owner, 2026-10-12: "first the user chooses the sandwich, then chooses the drink, then fills
 * his name, number, address, then the order appears in the dashboard as a new request so the tracking works").
 * The steps are the offer's groups from the staff dashboard (Offers), in their order; then the details; then the order
 * is placed at the combo price (plus the service fee when the offer has one), cash on delivery, with no sign-in.
 * It lands on the staff Orders page as "Request received" and the customer follows it on the tracker.
 * It starts by asking how many combos (owner, 2026-10-19); each combo's steps then follow in turn ("Combo 2 of 3",
 * with "Same as combo 1"), the bill is the count times the combo price plus one service fee. While there are two or
 * more, any one combo can be removed in the details' list before ordering (the Skip button on its steps was taken
 * out, owner 2026-10-21). Instead, finishing a combo shows a short screen "Combo 1 is ready" with Next combo and
 * Skip combo 2.
 * A drink in a combo has the same choices as on its menu page (owner, 2026-10-21): its flavour, the milk, flavour
 * pumps and add-ons, at the menu's prices on top of the combo price (`custom`, per combo and item).
 * A step with several menu categories (the drinks) has a row of category chips on top that stays in view: it lights
 * the category being looked at and a tap jumps to one (owner, 2026-10-19).
 */
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
const MAX_COMBOS = 10 // in one order
/** a combo drink's choices, compact, under its card: one row of chips per group (flavour, milk, add-ons) and − n +
 *  for pumps; the same groups and prices as the item's menu page (customize.ts) */
function ComboChoices({ groups, picks: given, onChange }: { groups: CustGroup[]; picks?: Picks; onChange: (p: Picks) => void }) {
  const { t } = useLang()
  if (!groups.length) return null
  const picks = given ?? defaultPicks(groups)
  const set = (g: CustGroup, ids: string[]) => onChange({ ...picks, [g.id]: ids })
  return (
    <div className="combo-choices">
      {groups.map((g) => (
        <div key={g.id} className="combo-choice">
          <span className="combo-choice-title">{g.title}</span>
          <div className="combo-chips" role={g.kind === 'choice' ? 'radiogroup' : 'group'} aria-label={g.title}>
            {g.options.map((o) => {
              const cur = picks[g.id] ?? []
              const n = timesPicked(picks, g, o.id)
              const price = o.price ? <small dir="ltr"> +{iqd(o.price)}</small> : null
              if (g.kind === 'count') {
                const full = cur.length >= (g.max ?? 9)
                return (
                  <span key={o.id} className={'combo-chip count' + (n ? ' on' : '')}>
                    <button type="button" disabled={!n} onClick={() => { const at = cur.lastIndexOf(o.id); set(g, [...cur.slice(0, at), ...cur.slice(at + 1)]) }} aria-label={`${t('fewer')} ${o.label}`}>−</button>
                    <span>{o.label}{n ? <b dir="ltr"> ×{n}</b> : price}</span>
                    <button type="button" disabled={full} onClick={() => set(g, [...cur, o.id])} aria-label={`${t('more')} ${o.label}`}>+</button>
                  </span>
                )
              }
              const on = cur.includes(o.id)
              const tap = () => set(g, g.kind === 'toggle' ? (on ? cur.filter((x) => x !== o.id) : [...cur, o.id]) : [o.id])
              return <button key={o.id} type="button" role={g.kind === 'choice' ? 'radio' : 'checkbox'} aria-checked={on} className={'combo-chip' + (on ? ' on' : '')} onClick={tap}>{o.label}{price}</button>
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
/** the times a pre-order can be asked for: every 15 minutes within the offer's hours, today if they are still to
 *  come, else tomorrow (by the review clock, like the countdown) */
function preorderSlots(start: string, end: string): { at: number; time: string; today: boolean }[] {
  const now = clockNow()
  const [s, e] = [hm(start), hm(end)]
  const day = new Date(now)
  day.setHours(s.h, s.m, 0, 0)
  const endToday = new Date(now)
  endToday.setHours(e.h, e.m, 0, 0)
  const today = now < day
  if (!today && now >= endToday) day.setDate(day.getDate() + 1)
  const out: { at: number; time: string; today: boolean }[] = []
  const stop = new Date(day)
  stop.setHours(e.h, e.m, 0, 0)
  for (const t = new Date(day); t < stop; t.setMinutes(t.getMinutes() + 15)) out.push({ at: t.getTime(), time: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`, today })
  return out
}
/** today's end of the offer's hours (ms), for the latest arrival time */
const endOfOffer = (end: string, now: number) => { const e = hm(end); const d = new Date(now); d.setHours(e.h, e.m, 0, 0); return d.getTime() }
const hm = (x: string) => { const [h, m] = x.split(':').map(Number); return { h: h || 0, m: m || 0 } }

export function ComboFlow({ offerId, onClose }: { offerId: string; onClose: () => void }) {
  const { t, lang } = useLang()
  const s = useS()
  const data = useStaff()
  const a = useAccount()
  const orders = useMyOrders()
  const offer = offersFor().find((o) => o.id === offerId && o.active) // the customer's branch's offer
  const groups = useMemo(() => (offer?.groups ?? []).map((g) => ({ g, cats: choices(g) })).filter((x) => x.cats.length), [offer, data])
  const live = useCountdown(offer ? [hm(offer.start), hm(offer.end)] : undefined).active
  const set = settingsFor()
  // delivery or pickup: the customer chooses among what the branch offers (Tools); delivery first when it can
  const [how, setHow] = useState<'delivery' | 'pickup'>(() => (set.delivery ? 'delivery' : 'pickup'))
  const delivery = set.delivery && (how === 'delivery' || !set.pickup)
  const [wantAt, setWantAt] = useState(0) // a pre-order's chosen time (ms); 0 = not chosen yet
  const [arriveAt, setArriveAt] = useState(0) // a live pickup: when the customer will arrive (ms; owner, 2026-10-22)
  const [step, setStep] = useState(0) // 0 = how many, then each combo's groups in turn, then the details, then placed
  const [count, setCount] = useState(1) // how many combos
  const [picks, setPicks] = useState<Record<string, string[]>>({}) // 'combo:group' → item names
  const [sizes, setSizes] = useState<Record<string, number>>({}) // 'combo:item' → size index (only when the offer lets customers choose)
  const [custom, setCustom] = useState<Record<string, Picks>>({}) // 'combo:item' → its choices (flavour, milk, pumps, add-ons)
  const [name, setName] = useState(() => a?.name ?? savedContact().name ?? '')
  const [phone, setPhone] = useState(() => a?.phone ?? savedContact().phone ?? '')
  const [address, setAddress] = useState(() => a?.address ?? savedContact().address ?? '')
  const [location, setLocation] = useState<GeoPoint | null>(null) // "Share my location": asked fresh for each order, never remembered
  const [note, setNote] = useState('')
  const [staffNote, setStaffNote] = useState('') // the customer's note for the café
  const [placedId, setPlacedId] = useState('')
  // between two combos (owner, 2026-10-21): after a combo's last step a short screen offers the next combo or skipping it
  const [between, setBetween] = useState(false)
  // the category chips of a step with several categories: the one in view, and a jump to one
  const bodyRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState('')
  const atStep = step >= 1 ? groups[(step - 1) % Math.max(1, groups.length)] : undefined // the group a pick step shows
  const stepCats = (step >= 1 && step <= count * groups.length ? atStep?.cats ?? [] : []).map((c) => c.cat).join('|')
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
  // the pick steps: every group of combo 1, then of combo 2, …
  const pickSteps = Array.from({ length: count }, (_, k) => groups.map((_, i) => ({ k, i }))).flat()
  const ASK = 0
  const DETAILS = pickSteps.length + 1
  const DONE = DETAILS + 1
  const ps = step > ASK && step < DETAILS ? pickSteps[step - 1] : undefined
  const cur = ps ? groups[ps.i] : groups[0]
  const ck = ps?.k ?? 0
  const kk = (k: number, x: string) => `${k}:${x}`
  const chosen = (k: number, id: string) => picks[kk(k, id)] ?? []
  const full = (n: number) => { const x = pickSteps[n]; return !!x && chosen(x.k, groups[x.i].g.id).length >= groups[x.i].g.pick } // n = pick step, from 0
  const label = (g: OfferGroup) => g.label[lang] || g.label.en
  const stepLabel = (x: { k: number; i: number }) => (count > 1 ? `${s('comboN', { n: x.k + 1 })} · ${label(groups[x.i].g)}` : label(groups[x.i].g))
  const sizeOf = (k: number, it: MenuItem) => (it.sizes ? it.sizes[offer.sizes ? sizes[kk(k, it.name)] ?? 0 : 0] : undefined)
  // a line the staff read: the item first (Analytics counts by it), the combo before the quantity when there are several
  const optsOf = (k: number, it: MenuItem): { groups: CustGroup[]; picks: Picks } => { const groups = groupsFor(it, 'en'); return { groups, picks: custom[kk(k, it.name)] ?? defaultPicks(groups) } }
  // the choices made on a combo drink, in the customer's language, for the details' list
  const choiceWords = (k: number, it: MenuItem) => { const gs = groupsFor(it, lang); const pk = custom[kk(k, it.name)] ?? defaultPicks(gs); return gs.flatMap((g) => g.options.filter((o) => pk[g.id]?.includes(o.id) && (g.always || o.id !== g.defaultId)).map((o) => { const n = timesPicked(pk, g, o.id); return o.label + (g.kind === 'count' && n > 1 ? ` ×${n}` : '') })).join(', ') }
  const lineOf = (k: number, n: string) => { const it = ALL.find((i) => i.name === n); const z = it && sizeOf(k, it); const o = it && optsOf(k, it); const words = o ? summary(o.picks, o.groups) : []; return `${n}${z ? ` (${z})` : ''}${words.length ? ` · ${words.join(', ')}` : ''}${count > 1 ? ` · Combo ${k + 1}` : ''} ×1` }
  const lines = pickSteps.flatMap((x) => chosen(x.k, groups[x.i].g.id).map((n) => lineOf(x.k, n)))
  // a picked item's choices: the ones made, else its defaults; their extra cost on top of the combo price
  const extraCost = pickSteps.reduce((n, x) => n + chosen(x.k, groups[x.i].g.id).reduce((m, name) => { const it = ALL.find((i) => i.name === name); if (!it) return m; const o = optsOf(x.k, it); return m + extras(o.picks, o.groups) }, 0), 0)
  const total = offer.price * count + extraCost + fee // the service fee is per order, not per combo
  const setCountTo = (n: number) => {
    const c = Math.min(MAX_COMBOS, Math.max(1, n))
    setCount(c)
    const keep = (key: string) => Number(key.split(':')[0]) < c // a combo taken away takes its choices with it
    setPicks((p) => Object.fromEntries(Object.entries(p).filter(([key]) => keep(key))))
    setSizes((z) => Object.fromEntries(Object.entries(z).filter(([key]) => keep(key))))
    setCustom((z) => Object.fromEntries(Object.entries(z).filter(([key]) => keep(key))))
  }
  // "Same as combo n": the previous combo's choices, then on to the next combo (or the details)
  // remove one combo before ordering: the ones after it move up a place, with their choices
  const removeCombo = (k: number) => {
    if (count <= 1) return
    const shift = <T,>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).flatMap(([key, v]) => {
      const at = key.indexOf(':')
      const c = Number(key.slice(0, at))
      return c === k ? [] : [[c > k ? `${c - 1}${key.slice(at)}` : key, v]]
    }))
    setPicks((m) => shift(m))
    setSizes((m) => shift(m))
    setCustom((m) => shift(m))
    setCount(count - 1)
    setNote('')
    // from the details stay on the details; from a combo's steps go on to the next combo (or the details)
    const details = (count - 1) * groups.length + 1
    setStep(step >= DETAILS ? details : Math.min(k * groups.length + 1, details))
  }
  // forward from a step: after a combo's last step comes "Combo n is ready" (Next combo / Skip) when another combo
  // follows. The Next button, a tap that moves on by itself and "Same as combo n" all go through here; the tap and
  // "Same as" used to jump straight to the next combo (owner, 2026-10-22: "next combo screen doesn't show sometimes")
  const stepNow = useRef(step)
  stepNow.current = step
  const forward = (from: number) => {
    if (stepNow.current !== from) return // already moved (a second tap, or Back during the pause)
    const p = from > ASK && from < DETAILS ? pickSteps[from - 1] : undefined
    if (p && p.i === groups.length - 1 && p.k < count - 1) { setStep(from); setBetween(true) } else setStep(from + 1)
  }
  const sameAsBefore = () => {
    if (!ps || ps.k === 0) return
    const from = ps.k - 1
    const copy: Record<string, string[]> = {}
    const zs: Record<string, number> = {}
    const cs: Record<string, Picks> = {}
    for (const { g } of groups) {
      copy[kk(ps.k, g.id)] = chosen(from, g.id)
      for (const n of chosen(from, g.id)) {
        if (sizes[kk(from, n)] !== undefined) zs[kk(ps.k, n)] = sizes[kk(from, n)]
        if (custom[kk(from, n)]) cs[kk(ps.k, n)] = custom[kk(from, n)]
      }
    }
    setPicks({ ...picks, ...copy })
    setSizes({ ...sizes, ...zs })
    setCustom({ ...custom, ...cs })
    const last = step + groups.length - 1 - ps.i // this combo's last step, all of it now filled
    stepNow.current = last
    setStep(last)
    forward(last)
  }

  const pick = (k: number, g: OfferGroup, n: string) => {
    const now = chosen(k, g.id)
    const next = now.includes(n) ? now.filter((x) => x !== n) : g.pick === 1 ? [n] : now.length < g.pick ? [...now, n] : now
    setPicks({ ...picks, [kk(k, g.id)]: next })
    // one choice per step: the tap also moves on (the Back button returns to change it)
    const it = ALL.find((i) => i.name === n)
    if (g.pick === 1 && !now.includes(n) && !(offer.sizes && it?.sizes) && !(it && groupsFor(it, 'en').length)) { const from = step; setTimeout(() => forward(from), 260) }
  }
  const place = () => {
    unlockAudio() // this tap lets the order's status sounds play later
    const nm = name.trim()
    if (nm.length < 2 || normPhone(phone).length < 10 || (delivery && address.trim().length < 6 && !location)) { setNote(delivery ? s('comboNeed') : s('comboNeedPickup')); return }
    if (!live && !wantAt) { setNote(s('comboNeedTime')); return }
    const arrive = live && !delivery ? arriveAt : 0 // a pre-order's pickup time is its chosen time
    if (live && !delivery && arriveAt < clockNow().getTime()) { setNote(s('arriveNeed')); return }
    const res = placeOfferOrder({ total, items: lines, name: nm, phone: phone.trim(), address: delivery ? address.trim() : undefined, location: delivery && location ? location : undefined, offer: { name: offer.name.en, price: offer.price, count: count > 1 ? count : undefined, fee: fee || undefined, pre: !live || undefined, wantAt: !live ? wantAt : undefined }, note: staffNote.trim() || undefined, arriveAt: arrive || undefined })
    if (!res.ok) return
    saveContact({ name: nm, phone: phone.trim(), address: address.trim() })
    setPlacedId(res.orderId)
    setStep(DONE)
  }
  const placed = orders.find((o) => o.id === placedId)
  const firstName = name.trim().split(/\s+/)[0] ?? '' // the thank-you after ordering says it
  const waLink = placed && set.reach === 'whatsapp'
    ? `https://wa.me/${set.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent([`Mars CoffeeHouse · ${offer.name.en} · #${placed.id}`, ...placed.items, `${iqd(placed.total)} IQD`, `${name.trim()} · ${phone.trim()}`, ...(placed.delivery ? [placed.delivery.address, placed.delivery.location ? mapsLink(placed.delivery.location) : ''].filter(Boolean) : [t('getPickup')]), ...(placed.offer?.wantAt ? [t('scheduledFor').replace('{t}', whenText(placed.offer.wantAt, lang))] : []), ...(placed.arriveAt ? [s('arriveAt', { t: timeText(placed.arriveAt) })] : []), ...(placed.note ? [`${t('orderNote')}: ${placed.note}`] : [])].join('\n'))}`
    : ''

  return createPortal(
    <div className="modal-overlay combo-overlay" onClick={onClose}>
      <div className="combo" role="dialog" aria-modal="true" aria-labelledby="combo-title" onClick={(e) => e.stopPropagation()}>
        <header className="combo-head">
          <div>
            <p className="combo-eyebrow">{title}{ps && count > 1 && !between && <span className="combo-of">{s('comboOf', { n: ps.k + 1, of: count })}</span>}{!live && step !== DONE && <em>{t('preOrder').replace(/\s*!$/, '')}</em>}</p>
            <h2 id="combo-title">{between && ps ? s('comboReady', { n: ps.k + 1 }) : step === DONE ? (firstName ? t('thanksName').replace('{name}', firstName) : t('orderPlaced')) : step === DETAILS ? s('comboDetails') : step === ASK ? s('comboHowMany') : label(cur.g)}</h2>
          </div>
          <button type="button" className="combo-close" onClick={onClose} aria-label={t('close')}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <div className="combo-body" ref={bodyRef} onScroll={watch}>
          {step === ASK && (
            <div className="combo-count">
              <p className="combo-hint">{s('comboHowManyHint')}</p>
              <div className="combo-stepper">
                <button type="button" onClick={() => setCountTo(count - 1)} disabled={count <= 1} aria-label={s('comboFewer')}>−</button>
                <output aria-live="polite" dir="ltr">{count}</output>
                <button type="button" onClick={() => setCountTo(count + 1)} disabled={count >= MAX_COMBOS} aria-label={s('comboMore')}>+</button>
              </div>
              <p className="combo-count-sum" dir="ltr">{count} × {iqd(offer.price)} = <b>{iqd(offer.price * count)} IQD</b></p>
              {/* Next right under the counter, not at the foot of an empty screen (owner, 2026-10-21) */}
              <button type="button" className="combo-next combo-next-inline" onClick={() => setStep(step + 1)}>{s('comboNext')}</button>
            </div>
          )}

          {between && ps && (
            <div className="combo-between">
              <p className="combo-hint">{s('comboReadyHint', { n: ps.k + 2 })}</p>
              <button type="button" className="combo-next combo-next-inline" onClick={() => { setBetween(false); setStep(step + 1) }}>{s('comboNextCombo')}</button>
              <button type="button" className="combo-skip" onClick={() => { setBetween(false); removeCombo(ps.k + 1) }}>{s('comboSkip', { n: ps.k + 2 })}</button>
            </div>
          )}
          {ps && !between && (
            <>
              <p className="combo-hint">{s('comboPick', { n: cur.g.pick })}</p>
              {ps.k > 0 && ps.i === 0 && (
                <div className="combo-tools">
                  {ps.k > 0 && ps.i === 0 && groups.every(({ g }) => chosen(ps.k - 1, g.id).length >= g.pick) && (
                    <button type="button" className="combo-same" onClick={sameAsBefore}>{s('comboSame', { n: ps.k })}</button>
                  )}
                </div>
              )}
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
                      const on = chosen(ck, cur.g.id).includes(it.name)
                      const cat = categoryOf(it.name)
                      return (
                        <div key={it.name} className={'combo-item' + (on ? ' on' : '')}>
                          <button type="button" role={cur.g.pick === 1 ? 'radio' : 'checkbox'} aria-checked={on} onClick={() => pick(ck, cur.g, it.name)}>
                            <span className="combo-tile" aria-hidden="true">{photoOf(it.name) ? <img src={photoOf(it.name)} alt="" loading="lazy" /> : FOOD.includes(cat) ? <FoodIcon sweet={cat === 'sweets'} /> : <MiniCup color={TINT[cat] || [200, 200, 200]} ice={isIced(cat) ? 1 : 0} size={54} />}</span>
                            <span className="combo-name">{nameOf(it.name, lang)}{it.sizes && !offer.sizes && <small dir="ltr">{it.sizes[0]}</small>}</span>
                            <span className="combo-check">{on && <IconCheck />}</span>
                          </button>
                          {on && offer.sizes && it.sizes && (
                            <div className="combo-sizes" role="radiogroup" aria-label={t('size')}>
                              {it.sizes.map((z, i) => <button key={z} type="button" role="radio" aria-checked={(sizes[kk(ck, it.name)] ?? 0) === i} className={(sizes[kk(ck, it.name)] ?? 0) === i ? 'on' : ''} onClick={() => setSizes({ ...sizes, [kk(ck, it.name)]: i })} dir="ltr">{z}</button>)}
                            </div>
                          )}
                          {on && <ComboChoices groups={groupsFor(it, lang)} picks={custom[kk(ck, it.name)]} onChange={(p) => setCustom({ ...custom, [kk(ck, it.name)]: p })} />}
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
                {pickSteps.map((x, n) => (
                  <Fragment key={kk(x.k, groups[x.i].g.id)}>
                  {count > 1 && x.i === 0 && (
                    <li className="combo-sum-head"><b>{s('comboN', { n: x.k + 1 })}</b><button type="button" className="combo-remove" onClick={() => removeCombo(x.k)} aria-label={s('comboRemove', { n: x.k + 1 })}>{s('comboRemoveShort')}</button></li>
                  )}
                  <li><span>{count > 1 ? label(groups[x.i].g) : stepLabel(x)}</span><b>{chosen(x.k, groups[x.i].g.id).map((m) => { const it = ALL.find((y) => y.name === m); const z = it && sizeOf(x.k, it); const picked = it ? choiceWords(x.k, it) : ''; return nameOf(m, lang) + (z ? ` (${z})` : '') + (picked ? ` · ${picked}` : '') }).join(', ')}</b><button type="button" className="link-btn" onClick={() => setStep(n + 1)}>{s('comboChange')}</button></li>
                  </Fragment>
                ))}
              </ul>
              {count < MAX_COMBOS && (
                <button type="button" className="combo-add" onClick={() => { setNote(''); setStep(count * groups.length + 1); setCount(count + 1) }}>+ {s('comboAddAnother')}</button>
              )}
              <div className="combo-form">
                {set.delivery && set.pickup && (
                  <div className="combo-how" role="radiogroup" aria-label={s('comboHow')}>
                    <button type="button" role="radio" aria-checked={delivery} className={delivery ? 'on' : ''} onClick={() => { setHow('delivery'); setNote('') }}>{t('getDelivery')}</button>
                    <button type="button" role="radio" aria-checked={!delivery} className={!delivery ? 'on' : ''} onClick={() => { setHow('pickup'); setNote('') }}>{t('getPickup')}</button>
                  </div>
                )}
                {!live && (
                  <label><span>{s(delivery ? 'comboWhenDelivery' : 'comboWhenPickup')}</span>
                    <select value={wantAt || ''} onChange={(e) => { setWantAt(Number(e.target.value)); setNote('') }}>
                      <option value="" disabled>{s('comboPickTime')}</option>
                      {preorderSlots(offer.start, offer.end).map((x) => <option key={x.at} value={x.at}>{x.today ? s('comboToday') : s('comboTomorrow')} · {x.time}</option>)}
                    </select>
                  </label>
                )}
                {live && !delivery && (() => { const now = clockNow().getTime(); return (
                  <div className="arrive">
                    <span className="arrive-title">{s('arriveWhen')}</span>
                    <TimeWheel slots={arrivalSlots(now, endOfOffer(offer.end, now))} value={arriveAt} onChange={(at) => { setArriveAt(at); setNote('') }} label={s('arriveWhen')} />
                    {arriveAt > 0 && <small className="arrive-in">{s('arriveIn', { n: Math.max(1, Math.round((arriveAt - now) / 60_000)) })}</small>}
                  </div>
                ) })()}
                <label><span>{t('nameLabel')}</span><input value={name} onChange={(e) => { setName(e.target.value); setNote('') }} autoComplete="given-name" /></label>
                <label><span>{t('deliveryPhone')}</span><input type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => { setPhone(e.target.value); setNote('') }} autoComplete="tel" placeholder="0750 000 0000" /></label>
                {delivery
                  ? <>
                    <label><span>{t('deliveryAddress')}</span><textarea rows={2} value={address} onChange={(e) => { setAddress(e.target.value); setNote('') }} placeholder={t('addressHint')} autoComplete="street-address" /></label>
                    <ShareLocation value={location} onChange={(p) => { setLocation(p); setNote('') }} />
                  </>
                  : <p className="combo-hint">{s('comboPickupNote')}</p>}
                <label><span>{t('orderNoteLabel')}</span><textarea rows={2} maxLength={300} value={staffNote} onChange={(e) => setStaffNote(e.target.value)} placeholder={t('orderNotePh')} /></label>
              </div>
              <dl className="combo-bill">
                <div><dt>{title}{count > 1 && <span dir="ltr"> × {count}</span>}</dt><dd dir="ltr">{iqd(offer.price * count)} IQD</dd></div>
                {extraCost > 0 && <div><dt>{s('comboExtras')}</dt><dd dir="ltr">{iqd(extraCost)} IQD</dd></div>}
                {fee > 0 && <div><dt>{s('serviceFee')}</dt><dd dir="ltr">{iqd(fee)} IQD</dd></div>}
                {delivery && offer.freeDelivery && <div><dt>{t('getDelivery')}</dt><dd>{t('free')}</dd></div>}
                <div className="sum"><dt>{s('comboTotal')}</dt><dd dir="ltr">{iqd(total)} IQD</dd></div>
              </dl>
              <p className="combo-hint">{delivery ? `${t('payOnDelivery')} · ${t('payOnDeliveryHint')}` : t('payAtPickup')}</p>{/* a pre-order's day and time are the chosen time above */}
              {note && <p className="combo-note" role="alert">{note}</p>}
            </>
          )}

          {step === DONE && (
            <>
              {placed && <p className="combo-thanks">{t('thanksReady')}</p>}
              {placed && <OrderTracker order={placed} />}
              {waLink && <a className="combo-wa" href={waLink} target="_blank" rel="noreferrer">{s('siteSendWhatsapp')}</a>}
            </>
          )}
        </div>

        {step !== ASK && <footer className="combo-foot">
          {step === DONE ? (
            <button type="button" className="combo-next" onClick={onClose}>{t('close')}</button>
          ) : (
            <>
              {step > 0 && <button type="button" className="combo-back" onClick={() => { setNote(''); if (between) setBetween(false); else setStep(step - 1) }}>{t('back')}</button>}
              {between ? null : step < DETAILS
                ? <button type="button" className="combo-next" disabled={step > ASK && !full(step - 1)} onClick={() => forward(step)}>{s('comboNext')}</button>
                : <button type="button" className="combo-next" onClick={place}>{live ? s('comboPlace') : s('comboPlacePre')} · <span dir="ltr">{iqd(total)} IQD</span></button>}
            </>
          )}
        </footer>}
      </div>
    </div>,
    document.body,
  )
}
