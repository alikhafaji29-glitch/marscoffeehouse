import { useMemo, useState } from 'react'
import { useLang } from '../i18n'
import type { Lang } from '../i18n'
import type { Order } from '../account'
import { waNumber } from '../account'
import { branchName, settingsFor, useStaff } from './store'
import { moveOrder, sendWhatsApp } from './remote'
import { sIn, useS } from './strings'
import { Modal } from './ui'
import { km, orderStops, planRoutes, routeLink } from './routes'
import type { Pt } from './routes'
import { markSent, orderText } from './Orders'

/*
 * Delivery routes (owner, 2026-10-27): staff tick the ready orders and say how many drivers are going; the routes are
 * suggested (routes.ts) and staff move an order between routes if they know better. "Send driver" moves every order
 * of the route to On the way; no WhatsApp from here (owner, 2026-10-27: "no need for it, instead put send driver"), the
 * card's buttons still send one. "Open route" / "Copy route link" give a Google Maps link through the stops.
 * The driver's phone + "Send route on WhatsApp" (owner, 2026-10-27, "option 1"): every order of the route goes from the
 * business number to that phone, one after another in stop order, as the card's driver buttons send it (the approved
 * message with the map pin on top; a pinless order without the pin). Where the WhatsApp sending is not set up (the
 * demo), WhatsApp opens on this device with the whole route written in instead, as the cards do.
 * Kirkuk has two shops: staff pick where they leave from.
 */
type Stop = { o: Order; key: string; pt?: Pt }
const keyOf = (o: Order) => o.uid ?? o.id
const ptOf = (o: Order): Pt | undefined => (o.delivery?.location ? { lat: o.delivery.location.lat, lng: o.delivery.location.lng } : undefined)
const fmtKm = (n: number) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`)
/** the route as one WhatsApp message: which route, the Maps link, then every stop in order */
function routeText(L: Lang, branch: string, r: number, stops: Stop[], link: string): string {
  const lines = [`Mars CoffeeHouse · ${branchName(branch)} · ${sIn(L, 'dispWaHead', { r: r + 1, n: stops.length })}`]
  if (link) lines.push(`${sIn(L, 'dispWaLink')}: ${link}`)
  stops.forEach(({ o }, i) => lines.push('', `${i + 1}) #${o.id}`, ...orderText(o, L).split('\n').slice(2).filter(Boolean)))
  return lines.join('\n')
}

export function Dispatch({ orders: given, onClose }: { orders: Order[]; onClose: () => void }) {
  // the orders as they were when the window opened: sending moves them to On the way, and the other routes must not reshuffle
  const [orders] = useState(given)
  const { lang } = useLang()
  const s = useS()
  const branch = useStaff().branch
  const set = settingsFor(branch)
  const shops = (set.shops ?? []).filter((sh) => sh.lat || sh.lng)
  const [picked, setPicked] = useState<Set<string>>(() => new Set(orders.map(keyOf)))
  const [count, setCount] = useState(() => Math.min(2, Math.max(1, orders.length)))
  const [shopIdx, setShopIdx] = useState<number | null>(shops.length === 1 ? 0 : null)
  const [moves, setMoves] = useState<Record<string, number>>({})
  const [sure, setSure] = useState(-1)
  const [sent, setSent] = useState<Record<number, number>>({}) // route → how many orders went On the way
  const [copied, setCopied] = useState(-1)
  const [phones, setPhones] = useState<Record<number, string>>({})
  const [waSent, setWaSent] = useState<Record<number, { phone: string; ok: number; n: number; failed: { code: string; why: string }[]; opened?: boolean }>>({})
  const [waBusy, setWaBusy] = useState(-1)

  const chosen = orders.filter((o) => picked.has(keyOf(o)))
  const pinned: Stop[] = chosen.filter((o) => ptOf(o)).map((o) => ({ o, key: keyOf(o), pt: ptOf(o)! }))
  const loose: Stop[] = chosen.filter((o) => !ptOf(o)).map((o) => ({ o, key: keyOf(o) }))
  const needShop = shops.length > 1 && shopIdx === null
  // where the routes start: the chosen shop, else the middle of the orders (no shop set in Tools yet)
  const start: Pt | null = shops.length ? (shopIdx === null ? null : shops[shopIdx]) : pinned.length ? { lat: pinned.reduce((a, x) => a + x.pt!.lat, 0) / pinned.length, lng: pinned.reduce((a, x) => a + x.pt!.lng, 0) / pinned.length } : null
  const plan = useMemo(() => {
    const out: Record<string, number> = {}
    if (!start) return out
    planRoutes(start, pinned.map((x) => ({ ...x, pt: x.pt! })), count).forEach((rt, i) => rt.forEach((x) => { out[x.key] = i }))
    return out
  }, [start?.lat, start?.lng, count, pinned.map((x) => x.key).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const routeOf = (x: Stop) => moves[x.key] ?? (x.pt ? plan[x.key] : -1) ?? -1
  const routes = Array.from({ length: count }, (_, r) => {
    const withPin = start ? orderStops(start, pinned.filter((x) => routeOf(x) === r).map((x) => ({ ...x, pt: x.pt! }))) : []
    const noPin = loose.filter((x) => routeOf(x) === r)
    const legs: number[] = []
    let at = start
    for (const x of withPin) { legs.push(at ? km(at, x.pt) : 0); at = x.pt }
    return { stops: [...withPin, ...noPin] as Stop[], legs, total: legs.reduce((a, b) => a + b, 0), link: start ? routeLink(start, withPin.map((x) => x.pt)) : '' }
  })
  const unrouted = [...pinned, ...loose].filter((x) => routeOf(x) < 0 || routeOf(x) >= count)
  const reset = () => { setMoves({}); setSure(-1) }

  const send = (r: number) => {
    setSure(-1)
    for (const { o } of routes[r].stops) moveOrder(o, 'onway')
    setSent({ ...sent, [r]: routes[r].stops.length })
  }
  const sendWa = async (r: number) => {
    const phone = phones[r] ?? ''
    const stops = routes[r].stops
    const failed: { code: string; why: string }[] = []
    let ok = 0
    setWaBusy(r)
    for (const { o } of stops) {
      // one after another, so they arrive in stop order
      const res = o.uid ? await sendWhatsApp(o.uid, waNumber(phone), orderText(o, lang), lang, phone) : { ok: false, reason: 'no_backend' }
      if (res.ok) { markSent(o, phone, true); ok++; continue }
      if (res.reason === 'not_configured' || res.reason === 'no_backend' || res.reason === 'unreachable') {
        // no WhatsApp sending here: the whole route written into WhatsApp on this device, staff tap send
        const w = window.open(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(routeText(lang, branch, r, stops, routes[r].link))}`, '_blank')
        if (w) w.opener = null
        for (const x of stops) markSent(x.o, phone)
        setWaSent({ ...waSent, [r]: { phone, ok: 0, n: stops.length, failed: [], opened: true } })
        setWaBusy(-1)
        return
      }
      failed.push({ code: o.id, why: res.message || res.reason || '?' })
    }
    setWaSent({ ...waSent, [r]: { phone, ok, n: stops.length, failed } })
    setWaBusy(-1)
  }
  const copy = async (r: number) => {
    try { await navigator.clipboard.writeText(routes[r].link); setCopied(r); setTimeout(() => setCopied(-1), 2000) } catch { /* no clipboard: Open route still works */ }
  }

  return (
    <Modal wide title={s('dispTitle')} onClose={onClose} footer={<button type="button" className="d-btn" onClick={onClose}>{s('prevPinsClose')}</button>}>
      <div className="disp">
        <section>
          <p className="d-form-title">{s('dispReady')} · {chosen.length}/{orders.length}</p>
          <div className="d-ticks">
            {orders.map((o) => {
              const k = keyOf(o)
              return (
                <label key={k} className={ptOf(o) ? '' : 'nopin'}>
                  <input type="checkbox" checked={picked.has(k)} onChange={() => { const n = new Set(picked); if (n.has(k)) n.delete(k); else n.add(k); setPicked(n); reset() }} />
                  <span>#{o.id} · {o.customer?.name ?? ''}{!ptOf(o) && <small> · {s('dispNoPinShort')}</small>}</span>
                </label>
              )
            })}
          </div>
        </section>
        <section className="disp-row">
          <label className="disp-count"><span>{s('dispDrivers')}</span>
            <span className="disp-stepper">
              <button type="button" disabled={count <= 1} onClick={() => { setCount(count - 1); reset() }} aria-label="−">−</button>
              <b>{count}</b>
              <button type="button" disabled={count >= 6} onClick={() => { setCount(count + 1); reset() }} aria-label="+">+</button>
            </span>
          </label>
          {shops.length > 1 && (
            <label className="disp-from"><span>{s('dispFrom')}</span>
              <select value={shopIdx ?? ''} onChange={(e) => { setShopIdx(e.target.value === '' ? null : Number(e.target.value)); reset() }}>
                <option value="" disabled>{s('dispFromPick')}</option>
                {shops.map((sh, i) => <option key={i} value={i}>{sh.name}</option>)}
              </select>
            </label>
          )}
        </section>
        {!shops.length && <p className="d-hint">{s('dispNoShop')}</p>}
        {needShop ? <p className="d-error">{s('dispFromFirst')}</p>
          : !chosen.length ? <p className="d-hint">{s('dispNothing')}</p>
            : (
              <div className="disp-routes">
                {routes.map((rt, r) => {
                  const done = sent[r] !== undefined
                  return (
                    <section key={r} className="disp-route">
                      <header>
                        <b>{s('dispRoute', { n: r + 1 })}</b>
                        <span>{rt.stops.length ? s('dispStops', { n: rt.stops.length, km: fmtKm(rt.total) }) : s('dispEmpty')}</span>
                      </header>
                      <ol>
                        {rt.stops.map((x, i) => (
                          <li key={x.key} className={x.pt ? '' : 'nopin'}>
                            <span className="disp-stop">
                              <span><b>#{x.o.id}</b> · {x.o.customer?.name ?? ''}</span>
                              <small>{x.o.delivery?.address || '—'}{x.pt ? ` · ${i === 0 ? s('dispFromShop') : s('dispFromPrev')} ${fmtKm(rt.legs[i])}` : ` · ${s('dispNoPinShort')}`}</small>
                            </span>
                            {count > 1 && (
                              <select aria-label={s('dispMoveTo')} value={r} disabled={done} onChange={(e) => { setMoves({ ...moves, [x.key]: Number(e.target.value) }); setSure(-1) }}>
                                {Array.from({ length: count }, (_, j) => <option key={j} value={j}>{s('dispRoute', { n: j + 1 })}</option>)}
                                <option value={-1}>{s('dispNotAssigned')}</option>
                              </select>
                            )}
                          </li>
                        ))}
                      </ol>
                      {rt.stops.length > 0 && (
                        <div className="disp-acts">
                          {rt.link && <a className="d-btn text small" href={rt.link} target="_blank" rel="noreferrer">{s('dispOpenRoute')}</a>}
                          {rt.link && <button type="button" className="d-btn text small" onClick={() => void copy(r)}>{copied === r ? s('dispCopied') : s('dispCopy')}</button>}
                          <button type="button" className="d-btn solid small" disabled={done} onClick={() => setSure(r)}>{s('dispSendDriver')}</button>
                        </div>
                      )}
                      {rt.stops.length > 0 && (
                        <div className="disp-wa">
                          <input type="tel" dir="ltr" inputMode="tel" maxLength={20} placeholder={s('dispPhone')} aria-label={s('dispPhone')} value={phones[r] ?? ''} onChange={(e) => setPhones({ ...phones, [r]: e.target.value })} />
                          <button type="button" className="staff-wa" disabled={waBusy >= 0 || (phones[r] ?? '').replace(/\D/g, '').length < 8} onClick={() => void sendWa(r)}>{waBusy === r ? s('waSending') : s('dispWa')}</button>
                        </div>
                      )}
                      {waSent[r] && <p className="d-hint">{waSent[r].opened ? s('dispWaDone', { phone: waSent[r].phone }) : s('dispWaSent', { phone: waSent[r].phone, ok: waSent[r].ok, n: waSent[r].n })}</p>}
                      {waSent[r]?.failed.map((f) => <p key={f.code} className="staff-wa-failed">{s('dispWaFailed', { code: f.code, why: f.why })}</p>)}
                      {sure === r && (
                        <div className="staff-prev-confirm" role="alertdialog">
                          <p>{s('dispSendSure', { n: rt.stops.length, r: r + 1 })}</p>
                          <button type="button" className="staff-prev-yes" onClick={() => send(r)}>{s('dispSendDriver')}</button>
                          <button type="button" className="link-btn" onClick={() => setSure(-1)}>{s('cancel')}</button>
                        </div>
                      )}
                      {done && <p className="d-hint">{s('dispSent', { n: sent[r] })}</p>}
                    </section>
                  )
                })}
                {unrouted.length > 0 && (
                  <section className="disp-route disp-unrouted">
                    <header><b>{s('dispNotAssigned')}</b><span>{s('dispUnroutedHint')}</span></header>
                    <ol>
                      {unrouted.map((x) => (
                        <li key={x.key} className={x.pt ? '' : 'nopin'}>
                          <span className="disp-stop"><span><b>#{x.o.id}</b> · {x.o.customer?.name ?? ''}</span><small>{x.o.delivery?.address || '—'}{!x.pt && ` · ${s('dispNoPinShort')}`}</small></span>
                          <select aria-label={s('dispMoveTo')} value={-1} onChange={(e) => setMoves({ ...moves, [x.key]: Number(e.target.value) })}>
                            <option value={-1}>{s('dispNotAssigned')}</option>
                            {Array.from({ length: count }, (_, j) => <option key={j} value={j}>{s('dispRoute', { n: j + 1 })}</option>)}
                          </select>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              </div>
            )}
      </div>
    </Modal>
  )
}
