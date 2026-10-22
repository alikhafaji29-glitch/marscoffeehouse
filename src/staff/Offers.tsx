import { useState } from 'react'
import { useLang } from '../i18n'
import { iqd } from '../account'
import { MENU } from '../menu'
import { CatPicker, ItemPicker, L3Fields } from './Events'
import { l3, offersFor, uid, update, useStaff } from './store'
import type { Offer, OfferGroup } from './store'
import { useS } from './strings'
import { Field, I, Modal, Switch } from './ui'

/* Offers, after the live panel: combo deals built from the menu, each with its own link, daily hours, price,
 * delivery and service fee, and the groups the customer picks from. The website's Positive Hours slide follows
 * the Positive Hours offer here: its hours, its price and its switch. */
const slugify = (x: string) => x.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const itemsIn = (g: OfferGroup) => (g.mode === 'items' ? MENU.flatMap((c) => c.items).filter((i) => g.items.includes(i.name) && !i.soldOut).length : MENU.filter((c) => g.cats.includes(c.id)).reduce((n, c) => n + c.items.filter((i) => !i.soldOut).length, 0))
const blankGroup = (): OfferGroup => ({ id: uid(), label: l3(), pick: 1, mode: 'cats', cats: [], items: [] })
const blank = (): Offer => ({ id: uid(), name: l3(), slug: '', price: 0, start: '07:00', end: '12:00', freeDelivery: false, feeOn: false, fee: 1000, sizes: false, sub: l3(), fine: l3(), groups: [blankGroup()], active: false })

function OfferEditor({ offer, isNew, onClose }: { offer: Offer; isNew: boolean; onClose: () => void }) {
  const s = useS()
  const [d, setD] = useState(offer)
  const [bad, setBad] = useState('')
  const setGroup = (id: string, patch: Partial<OfferGroup>) => setD({ ...d, groups: d.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) })
  const move = (i: number, by: number) => { const gs = [...d.groups]; const [g] = gs.splice(i, 1); gs.splice(i + by, 0, g); setD({ ...d, groups: gs }) }
  const save = () => {
    const slug = slugify(d.slug || d.name.en)
    if (!d.name.en.trim()) { setBad(s('nameNeeded')); return }
    if (!(d.price > 0)) { setBad(s('priceNeeded')); return }
    if (d.start >= d.end) { setBad(s('hoursNeeded')); return }
    const next = { ...d, slug }
    update((st) => { const list = st.offers[st.branch] ?? []; return { offers: { ...st.offers, [st.branch]: isNew ? [...list, next] : list.map((o) => (o.id === d.id ? next : o)) } } })
    onClose()
  }
  return (
    <Modal wide title={isNew ? s('newOffer') : s('editOffer')} onClose={onClose}
      footer={<>{bad && <span className="d-error">{bad}</span>}<button type="button" className="d-btn text" onClick={onClose}>{s('cancel')}</button><button type="button" className="d-btn solid" onClick={save}>{s('save')}</button></>}>
      <p className="d-form-title">{s('offerName')}</p>
      <L3Fields label={s('name')} value={d.name} onChange={(name) => { setBad(''); setD({ ...d, name }) }} />
      <Field label={s('adSlug')} wide hint={`${s('publicLink')}: #${slugify(d.slug || d.name.en) || '…'}`}>
        <input dir="ltr" value={d.slug} onChange={(e) => setD({ ...d, slug: e.target.value })} placeholder={slugify(d.name.en)} />
      </Field>
      <div className="d-form-row">
        <Field label={s('comboPrice')}><input inputMode="numeric" dir="ltr" value={d.price || ''} onChange={(e) => { setBad(''); setD({ ...d, price: Number(e.target.value.replace(/[^\d]/g, '')) }) }} /></Field>
        <Field label={s('startTime')}><input type="time" dir="ltr" value={d.start} onChange={(e) => { setBad(''); setD({ ...d, start: e.target.value }) }} /></Field>
        <Field label={s('endTime')}><input type="time" dir="ltr" value={d.end} onChange={(e) => { setBad(''); setD({ ...d, end: e.target.value }) }} /></Field>
      </div>
      <p className="d-hint">{s('timesHint')}</p>
      <div className="d-switch-row">
        <Switch on={d.freeDelivery} onChange={(v) => setD({ ...d, freeDelivery: v })} label={s('freeDelivery')} />
        <div><b>{s('freeDelivery')}</b></div>
      </div>
      <div className="d-switch-row">
        <Switch on={d.feeOn} onChange={(v) => setD({ ...d, feeOn: v })} label={s('serviceFee')} />
        <div><b>{s('serviceFee')}</b><small>{s('serviceFeeHint')}</small></div>
        {d.feeOn && <Field label={s('feeIqd')}><input inputMode="numeric" dir="ltr" value={d.fee || ''} onChange={(e) => setD({ ...d, fee: Number(e.target.value.replace(/[^\d]/g, '')) })} /></Field>}
      </div>
      <div className="d-switch-row">
        <Switch on={d.sizes} onChange={(v) => setD({ ...d, sizes: v })} label={s('chooseSize')} />
        <div><b>{s('chooseSize')}</b><small>{s('chooseSizeHint')}</small></div>
      </div>
      <p className="d-form-title">{s('subheadline')}</p>
      <L3Fields label={s('subcopy')} value={d.sub} onChange={(sub) => setD({ ...d, sub })} />
      <p className="d-form-title">{s('finePrint')}</p>
      <L3Fields label={s('finePrint')} value={d.fine} onChange={(fine) => setD({ ...d, fine })} />

      <div className="d-groups-head">
        <div><h3>{s('groups')}</h3><p className="d-hint">{s('groupsHint')}</p></div>
        <button type="button" className="d-btn text" onClick={() => setD({ ...d, groups: [...d.groups, blankGroup()] })}><I.plus />{s('addGroup')}</button>
      </div>
      {d.groups.map((g, i) => (
        <section key={g.id} className="d-group">
          <header>
            <b>{s('groupN', { n: i + 1 })}</b><span>{s('stepN', { n: i + 1 })}</span>
            <button type="button" className="d-icon-btn" disabled={i === 0} aria-label={s('moveUp')} onClick={() => move(i, -1)}><I.chevron dir="up" /></button>
            <button type="button" className="d-icon-btn" disabled={i === d.groups.length - 1} aria-label={s('moveDown')} onClick={() => move(i, 1)}><I.chevron dir="down" /></button>
            <button type="button" className="d-icon-btn warn" disabled={d.groups.length === 1} aria-label={s('delete')} onClick={() => setD({ ...d, groups: d.groups.filter((x) => x.id !== g.id) })}><I.trash /></button>
          </header>
          <L3Fields label={s('groupLabel')} value={g.label} onChange={(label) => setGroup(g.id, { label })} />
          <div className="d-form-row">
            <Field label={s('pick')}><input inputMode="numeric" dir="ltr" value={g.pick} onChange={(e) => setGroup(g.id, { pick: Math.max(1, Number(e.target.value.replace(/[^\d]/g, '')) || 1) })} /></Field>
            <div className="d-seg" role="tablist">
              <button type="button" role="tab" aria-selected={g.mode === 'cats'} className={g.mode === 'cats' ? 'on' : ''} onClick={() => setGroup(g.id, { mode: 'cats' })}>{s('wholeCats')}</button>
              <button type="button" role="tab" aria-selected={g.mode === 'items'} className={g.mode === 'items' ? 'on' : ''} onClick={() => setGroup(g.id, { mode: 'items' })}>{s('handPicked')}</button>
            </div>
          </div>
          {g.mode === 'cats'
            ? <CatPicker label={s('eligibleCats')} value={g.cats} onChange={(cats) => setGroup(g.id, { cats })} />
            : <ItemPicker label={s('eligibleItems')} value={g.items} onChange={(items) => setGroup(g.id, { items })} />}
          <p className="d-hint">{s('groupCount', { n: itemsIn(g) })}</p>
        </section>
      ))}
    </Modal>
  )
}

export function Offers() {
  const s = useS()
  const { lang } = useLang()
  const data = useStaff()
  const [edit, setEdit] = useState<{ offer: Offer; isNew: boolean } | null>(null)
  const [copied, setCopied] = useState('')
  const [sure, setSure] = useState('')
  const copy = (o: Offer) => { navigator.clipboard?.writeText(`${location.origin}${location.pathname}#${o.slug}`).then(() => { setCopied(o.id); setTimeout(() => setCopied(''), 2000) }).catch(() => {}) }
  const remove = (id: string) => { if (sure !== id) { setSure(id); return } update((st) => ({ offers: { ...st.offers, [st.branch]: (st.offers[st.branch] ?? []).filter((o) => o.id !== id) } })); setSure('') }
  return (
    <>
      <div className="d-toolbar">
        <p className="d-lead">{s('offersLead')}</p>
        <button type="button" className="d-btn solid" onClick={() => setEdit({ offer: blank(), isNew: true })}><I.plus />{s('newOffer')}</button>
      </div>
      {offersFor(data.branch).length ? offersFor(data.branch).map((o) => (
        <section key={o.id} className={'d-card d-row-card' + (o.active ? ' active' : '')}>
          <div className="d-row-main">
            <span className="d-row-icon"><I.offers /></span>
            <div className="d-row-text">
              <h3>
                {o.name[lang] || o.name.en}
                <em className={'d-pill ' + (o.active ? 'ok' : 'line')}>{o.active ? s('active') : s('inactive')}</em>
                <em className="d-pill line" dir="ltr"><I.clock />{o.start} – {o.end}</em>
                {o.freeDelivery && <em className="d-pill line"><I.bike />{s('freeDelivery')}</em>}
                {o.feeOn && <em className="d-pill line"><I.money />{s('serviceFee')} <span dir="ltr">{iqd(o.fee)} IQD</span></em>}
              </h3>
              <p><span dir="ltr">{iqd(o.price)} IQD</span> · {s('nGroups', { n: o.groups.length })} · {s('nItems', { n: o.groups.reduce((n, g) => n + itemsIn(g), 0) })}</p>
              <p className="d-slug"><code dir="ltr">#{o.slug}</code><button type="button" className="d-icon-btn" aria-label={s('copyLink')} onClick={() => copy(o)}><I.copy /></button>{copied === o.id && <small>{s('copied')}</small>}</p>
            </div>
            <Switch on={o.active} onChange={(v) => update((st) => ({ offers: { ...st.offers, [st.branch]: (st.offers[st.branch] ?? []).map((x) => (x.id === o.id ? { ...x, active: v } : x)) } }))} label={`${o.name.en}: ${s('active')}`} />
            <button type="button" className="d-icon-btn" aria-label={s('edit')} onClick={() => setEdit({ offer: o, isNew: false })}><I.edit /></button>
            {o.id !== 'positive' && <button type="button" className={'d-icon-btn' + (sure === o.id ? ' warn' : '')} aria-label={s('delete')} onClick={() => remove(o.id)} onBlur={() => setSure('')}><I.trash /></button>}
          </div>
          {sure === o.id && <p className="d-error">{s('tapAgainDelete')}</p>}
        </section>
      )) : <p className="staff-empty">{s('noOffers')}</p>}
      <p className="demo-note">{s('offersNote')}</p>
      {edit && <OfferEditor offer={edit.offer} isNew={edit.isNew} onClose={() => setEdit(null)} />}
    </>
  )
}
