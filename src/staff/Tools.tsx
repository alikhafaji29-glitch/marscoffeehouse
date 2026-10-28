import { useEffect, useState } from 'react'
import { branchName, settingsFor, update, useStaff } from './store'
import type { CourierShare, Driver, Settings, Shop } from './store'
import { parsePlace } from './routes'
import { useLang } from '../i18n'
import type { Lang } from '../i18n'
import { sIn, useS } from './strings'
import { backendOn } from '../backend'
import { LEAD_MIN } from '../orders'
import { Card, Field, I, Switch } from './ui'
import { L3Fields } from './Events'

/* Tools, after the live panel's order settings: how a finished order reaches the staff, and which of Delivery /
 * Pickup the customer is offered at checkout. Per branch; saved as soon as it is changed. */
export function Tools() {
  const s = useS()
  const data = useStaff()
  const set = settingsFor(data.branch)
  const patch = (p: Partial<Settings>) => update((st) => ({ settings: { ...st.settings, [st.branch]: { ...settingsFor(st.branch), ...p } } }))
  return (
    <div className="d-narrow">
      <p className="d-lead">{s('toolsLead', { branch: branchName(data.branch) })}</p>
      {/* stop taking orders for a while, with an apology (owner, 2026-10-26); the database refuses new orders too */}
      <Card title={s('pauseTitle')} sub={s('pauseSub')} className={set.paused ? 'd-paused' : ''}>
        <div className="d-switch-row">
          <span className="d-row-icon"><I.store /></span>
          <div><b>{set.paused ? s('pauseOn') : s('pauseOff')}</b><small>{set.paused ? s('pauseOnHint') : s('pauseOffHint')}</small></div>
          <Switch on={!!set.paused} onChange={(v) => patch({ paused: v })} label={s('pauseTitle')} />
        </div>
        <div className="d-pause-msg">
          {/* the boxes start with the default apology (owner, 2026-10-26: "with these messages as default") */}
          <L3Fields label={s('pauseMsg')} value={set.pauseMsg ?? PAUSE_DEFAULT} onChange={(pauseMsg) => patch({ pauseMsg })} area rows={4} />
          <p className="d-hint">{s('pauseMsgHint')}</p>
        </div>
      </Card>
      {/* the number customers call (owner, 2026-10-27): filled into the automated WhatsApp location request */}
      <Card title={s('branchPhone')} sub={s('branchPhoneSub')}>
        <Field label={s('branchPhone')}>
          <input type="tel" inputMode="tel" dir="ltr" value={set.phone ?? ''} placeholder="0750 000 0000" onChange={(e) => patch({ phone: e.target.value.replace(/[^\d+ ]/g, '').slice(0, 20) })} />
        </Field>
      </Card>
      <Shops />
      <Card title={s('reachTitle')} sub={s('reachSub')}>
        <div className="d-seg big" role="radiogroup" aria-label={s('reachTitle')}>
          <button type="button" role="radio" aria-checked={set.reach === 'whatsapp'} className={set.reach === 'whatsapp' ? 'on' : ''} onClick={() => patch({ reach: 'whatsapp' })}><I.whatsapp />{s('reachWhatsapp')}</button>
          <button type="button" role="radio" aria-checked={set.reach === 'dashboard'} className={set.reach === 'dashboard' ? 'on' : ''} onClick={() => patch({ reach: 'dashboard' })}><I.cashier />{s('reachDashboard')}</button>
        </div>
        <p className="d-hint">{set.reach === 'whatsapp' ? s('reachWhatsappHint') : s('reachDashboardHint')}</p>
        {set.reach === 'whatsapp' && (
          <Field label={s('whatsappNumber')} hint={s('whatsappNumberHint')}>
            <input type="tel" inputMode="tel" dir="ltr" value={set.whatsapp} onChange={(e) => patch({ whatsapp: e.target.value.replace(/[^\d+ ]/g, '') })} placeholder="+964 750 000 0000" />
          </Field>
        )}
      </Card>
      <Card title={s('fulfilTitle')} sub={s('fulfilSub')}>
        <div className="d-switch-row line">
          <span className="d-row-icon"><I.bike /></span>
          <div><b>{s('delivery')}</b><small>{s('deliveryHint')}</small></div>
          <Switch on={set.delivery} onChange={(v) => patch({ delivery: v })} label={s('delivery')} disabled={set.delivery && !set.pickup} />
        </div>
        <div className="d-switch-row line">
          <span className="d-row-icon"><I.store /></span>
          <div><b>{s('pickup')}</b><small>{s('pickupHint')}</small></div>
          <Switch on={set.pickup} onChange={(v) => patch({ pickup: v })} label={s('pickup')} disabled={set.pickup && !set.delivery} />
        </div>
        <p className="d-hint">{s('fulfilOne')}</p>
      </Card>
      <Drivers />
      <Card title={s('leadTitle')} sub={s('leadSub')}>
        <div className="d-seg" role="radiogroup" aria-label={s('leadTitle')}>
          {[10, 15, 20, 30].map((n) => <button key={n} type="button" role="radio" aria-checked={(set.lead ?? LEAD_MIN) === n} className={(set.lead ?? LEAD_MIN) === n ? 'on' : ''} onClick={() => patch({ lead: n })}>{s('leadMin', { n })}</button>)}
        </div>
      </Card>
      <p className="demo-note">{s(backendOn ? 'savedAutoDrivers' : 'savedAuto')}</p>
    </div>
  )
}

const PAUSE_DEFAULT = { en: sIn('en', 'pausedDefault'), ar: sIn('ar', 'pausedDefault'), ku: sIn('ku', 'pausedDefault') }
const LANGS: [Lang, string][] = [['en', 'English'], ['ar', 'العربية'], ['ku', 'کوردی']]

/* Delivery drivers, each with the language their WhatsApp message goes in (owner, 2026-10-25: "make it per driver,
 * and put a save button"). Edited as a draft and stored only on Save, unlike the rest of Tools. */
function Drivers() {
  const s = useS()
  const { lang } = useLang()
  const data = useStaff()
  const saved = settingsFor(data.branch).drivers ?? []
  const [draft, setDraft] = useState<Driver[]>(saved)
  const [done, setDone] = useState(false)
  // another branch chosen, or the database's copy arrived: start again from what is stored
  const key = data.branch + JSON.stringify(saved)
  useEffect(() => { setDraft(saved) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const edit = (i: number, p: Partial<Driver>) => { setDone(false); setDraft(draft.map((x, j) => (j === i ? { ...x, ...p } : x))) }
  const save = () => {
    update((st) => ({ settings: { ...st.settings, [st.branch]: { ...settingsFor(st.branch), drivers: draft } } }))
    setDone(true)
  }
  return (
    <Card title={s('driversTitle')} sub={s('driversSub')}>
      {draft.map((d, i) => (
        <div key={i} className="d-driver">
          <Field label={s('driverName')}><input value={d.name} maxLength={40} onChange={(e) => edit(i, { name: e.target.value })} /></Field>
          <Field label={s('driverPhone')}><input type="tel" inputMode="tel" dir="ltr" value={d.phone} placeholder="0750 000 0000" onChange={(e) => edit(i, { phone: e.target.value.replace(/[^\d+ ]/g, '') })} /></Field>
          <Field label={s('driverLang')}>
            <select value={d.lang ?? lang} onChange={(e) => edit(i, { lang: e.target.value as Lang })}>
              {LANGS.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
            </select>
          </Field>
          {/* what the company keeps of each delivered order, for the Deliveries report (owner, 2026-10-28) */}
          <Field label={s('shareKind')}>
            <select value={d.share?.kind ?? ''} onChange={(e) => edit(i, { share: e.target.value ? { kind: e.target.value as CourierShare['kind'], value: e.target.value === 'fee' ? 0 : d.share?.value ?? 0 } : undefined })}>
              <option value="">{s('shareNone')}</option>
              <option value="fixed">{s('shareFixed')}</option>
              <option value="pct">{s('sharePct')}</option>
              <option value="fee">{s('shareFee')}</option>
            </select>
          </Field>
          {d.share && d.share.kind !== 'fee' && (
            <Field label={d.share.kind === 'pct' ? s('shareValuePct') : s('shareValueIqd')}>
              <input dir="ltr" inputMode="numeric" value={d.share.value || ''} placeholder={d.share.kind === 'pct' ? '10' : '2000'} onChange={(e) => { const n = Number(e.target.value.replace(/[^\d]/g, '').slice(0, 7)) || 0; edit(i, { share: { kind: d.share!.kind, value: d.share!.kind === 'pct' ? Math.min(n, 100) : n } }) }} />
            </Field>
          )}
          <button type="button" className="d-btn line" onClick={() => { setDone(false); setDraft(draft.filter((_, j) => j !== i)) }}>{s('driverRemove')}</button>
        </div>
      ))}
      {!draft.length && <p className="d-hint">{s('driversNone')}</p>}
      <div className="d-driver-actions">
        <button type="button" className="d-btn" onClick={() => { setDone(false); setDraft([...draft, { name: '', phone: '', lang }]) }}><I.plus />{s('driverAdd')}</button>
        <button type="button" className="d-btn solid" disabled={!dirty} onClick={save}>{s('driversSave')}</button>
        {dirty ? <small className="d-hint">{s('driversUnsaved')}</small> : done && <small className="d-hint" role="status">{s('driversSaved')}</small>}
      </div>
    </Card>
  )
}

/* Where the branch's shops are (owner, 2026-10-27): delivery routes start there. Kirkuk has two; with more than one, the
 * routes window asks which shop the drivers leave from. A Google Maps link or "lat, lng" can be pasted. */
function Shops() {
  const s = useS()
  const data = useStaff()
  const shops = settingsFor(data.branch).shops ?? []
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [finding, setFinding] = useState(-1)
  const save = (next: Shop[]) => update((st) => ({ settings: { ...st.settings, [st.branch]: { ...settingsFor(st.branch), shops: next } } }))
  const edit = (i: number, p: Partial<Shop>) => save(shops.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const place = (i: number, text: string) => {
    setDrafts({ ...drafts, [i]: text })
    const pt = parsePlace(text)
    if (pt) edit(i, pt)
  }
  const here = (i: number) => {
    if (!navigator.geolocation) return
    setFinding(i)
    navigator.geolocation.getCurrentPosition(
      (p) => { setFinding(-1); edit(i, { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }); setDrafts({ ...drafts, [i]: '' }) },
      () => setFinding(-1),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }
  return (
    <Card title={s('shopsTitle')} sub={s('shopsSub')}>
      {shops.map((sh, i) => {
        const draft = drafts[i]
        const bad = draft !== undefined && draft.trim() !== '' && !parsePlace(draft)
        return (
          <div key={i} className="d-shop">
            <Field label={s('shopName')}><input value={sh.name} maxLength={40} onChange={(e) => edit(i, { name: e.target.value })} /></Field>
            <Field label={s('shopPlace')} hint={bad ? s('shopPlaceBad') : `${sh.lat.toFixed(5)}, ${sh.lng.toFixed(5)}`}>
              <input dir="ltr" value={draft ?? ''} placeholder={`${sh.lat}, ${sh.lng}`} onChange={(e) => place(i, e.target.value)} />
            </Field>
            <div className="d-shop-acts">
              <a className="d-btn text small" href={`https://www.google.com/maps?q=${sh.lat},${sh.lng}`} target="_blank" rel="noreferrer">{s('openInMaps')}</a>
              <button type="button" className="d-btn text small" disabled={finding === i} onClick={() => here(i)}>{finding === i ? s('locFinding') : s('shopHere')}</button>
              <button type="button" className="d-btn text small danger" onClick={() => save(shops.filter((_, j) => j !== i))}>{s('remove')}</button>
            </div>
          </div>
        )
      })}
      {!shops.length && <p className="d-hint">{s('shopsNone')}</p>}
      <button type="button" className="d-btn" onClick={() => save([...shops, { name: branchName(data.branch), lat: 0, lng: 0 }])}><I.plus />{s('shopAdd')}</button>
    </Card>
  )
}
