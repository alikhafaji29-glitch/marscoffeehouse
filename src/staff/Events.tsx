import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import { ALL_ITEMS, MENU } from '../menu'
import { catLabel } from '../components/MenuSection'
import { THEMES, branchName, l3, uid, update, useStaff } from './store'
import type { EventX, L3 } from './store'
import { useS } from './strings'
import { nameOf } from '../menuAdmin'
import { Thumb } from './Catalog'
import { Field, I, Modal, Switch } from './ui'

/* Events, after the live panel: limited-time seasonal menus. The active event is the website's New Season section
 * (its name, its items) and its promo text shows as a strip on top of the menu. One event runs at a time. */

/** three inputs for one text: English, Arabic, Kurdish */
export function L3Fields({ label, value, onChange, area, rows = 2 }: { label: string; value: L3; onChange: (v: L3) => void; area?: boolean; rows?: number }) {
  const langs: [keyof L3, string, 'ltr' | 'rtl'][] = [['en', 'English', 'ltr'], ['ar', 'العربية', 'rtl'], ['ku', 'کوردی', 'rtl']]
  return (
    <div className="d-form-row three">
      {langs.map(([k, n, dir]) => (
        <Field key={k} label={`${label} (${n})`}>
          {area
            ? <textarea rows={rows} dir={dir} value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
            : <input dir={dir} value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />}
        </Field>
      ))}
    </div>
  )
}

/** chosen menu items as chips, with a search box to add more */
export function ItemPicker({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const s = useS()
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const found = query ? ALL_ITEMS.map((i) => i.name).filter((n) => !value.includes(n) && n.toLowerCase().includes(query)).slice(0, 8) : []
  return (
    <div className="d-picker">
      <p className="d-form-title">{label} · {value.length}</p>
      <div className="d-chips">
        {value.map((n) => <span key={n} className="d-chip">{n}<button type="button" aria-label={`${s('remove')} ${n}`} onClick={() => onChange(value.filter((x) => x !== n))}><I.close /></button></span>)}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={s('addItems')} aria-label={s('addItems')} />
      </div>
      {found.length > 0 && <ul className="d-picker-list">{found.map((n) => <li key={n}><button type="button" onClick={() => { onChange([...value, n]); setQ('') }}>{n}</button></li>)}</ul>}
    </div>
  )
}

/** chosen categories as chips, with the rest offered underneath. With `onSkip` (an offer's step), a chosen category's
 *  name opens its items as tick boxes: unticked ones are left out of the step (owner, 2026-10-26: "if he presses on the
 *  selected category you will open all items of this category in a small window, for him to select what he wants") */
export function CatPicker({ value, onChange, label, skip = [], onSkip }: { value: string[]; onChange: (v: string[]) => void; label: string; skip?: string[]; onSkip?: (skip: string[]) => void }) {
  const { lang } = useLang()
  const s = useS()
  const [open, setOpen] = useState('')
  const rest = MENU.filter((c) => !value.includes(c.id))
  const itemsOf = (id: string) => MENU.find((c) => c.id === id)?.items ?? []
  const remove = (id: string) => {
    onChange(value.filter((x) => x !== id))
    const gone = new Set(itemsOf(id).map((i) => i.name))
    if (onSkip && skip.some((n) => gone.has(n))) onSkip(skip.filter((n) => !gone.has(n)))
  }
  return (
    <div className="d-picker">
      <p className="d-form-title">{label} · {value.length}</p>
      <div className="d-chips">
        {value.map((id) => {
          const all = itemsOf(id).length
          const left = itemsOf(id).filter((i) => !skip.includes(i.name)).length
          const count = left === all ? String(all) : s('nOfM', { n: left, m: all })
          return (
            <span key={id} className={'d-chip' + (left < all ? ' part' : '')}>
              {onSkip ? <button type="button" className="d-chip-open" title={s('catItemsOpen')} onClick={() => setOpen(id)}>{catLabel(id, lang)} · {count}</button> : <>{catLabel(id, lang)} · {count}</>}
              <button type="button" aria-label={`${s('remove')} ${id}`} onClick={() => remove(id)}><I.close /></button>
            </span>
          )
        })}
      </div>
      {onSkip && value.length > 0 && <p className="d-hint">{s('catItemsHint')}</p>}
      {rest.length > 0 && <div className="d-chips add">{rest.map((c) => <button key={c.id} type="button" className="d-chip ghost" onClick={() => onChange([...value, c.id])}><I.plus />{catLabel(c.id, lang)}</button>)}</div>}
      {open && onSkip && <CatItems cat={open} skip={skip} onSkip={onSkip} onClose={() => setOpen('')} />}
    </div>
  )
}

/** one category's items as tick boxes, over the offer editor; ticked = in the step */
function CatItems({ cat, skip, onSkip, onClose }: { cat: string; skip: string[]; onSkip: (skip: string[]) => void; onClose: () => void }) {
  const { lang } = useLang()
  const s = useS()
  const items = MENU.find((c) => c.id === cat)?.items ?? []
  const names = items.map((i) => i.name)
  // Escape closes this window only, not the offer editor under it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  const toggle = (n: string) => onSkip(skip.includes(n) ? skip.filter((x) => x !== n) : [...skip, n])
  return (
    <div className="d-overlay top" onClick={onClose}>
      <div className="d-modal d-cat-items" role="dialog" aria-modal="true" aria-label={catLabel(cat, lang)} onClick={(e) => e.stopPropagation()}>
        <h2>{catLabel(cat, lang)}</h2>
        <div className="d-modal-body">
          <p className="d-hint">{s('catItemsSub')}</p>
          <div className="d-cat-items-all">
            <button type="button" className="d-btn text small" onClick={() => onSkip(skip.filter((n) => !names.includes(n)))}>{s('selectAll')}</button>
            <button type="button" className="d-btn text small" onClick={() => onSkip([...skip.filter((n) => !names.includes(n)), ...names])}>{s('deselectAll')}</button>
          </div>
          <ul>
            {items.map((i) => {
              const on = !skip.includes(i.name)
              return (
                <li key={i.name}>
                  <label>
                    <input type="checkbox" checked={on} onChange={() => toggle(i.name)} />
                    <Thumb name={i.name} size={40} />
                    <span>{nameOf(i.name, lang)}{i.soldOut && <small> · {s('outOfStock')}</small>}</span>
                    <em>{on ? s('included') : s('leftOut')}</em>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
        <footer><button type="button" className="d-btn solid" onClick={onClose}>{s('done')}</button></footer>
      </div>
    </div>
  )
}

const blank = (): EventX => ({ id: uid(), name: l3(), theme: THEMES[0].id, desc: l3(), promo: l3(), items: [], active: false })

function EventEditor({ ev, isNew, onClose }: { ev: EventX; isNew: boolean; onClose: () => void }) {
  const s = useS()
  const [d, setD] = useState(ev)
  const [bad, setBad] = useState(false)
  const save = () => {
    if (!d.name.en.trim()) { setBad(true); return }
    update((st) => ({ events: isNew ? [...st.events, d] : st.events.map((e) => (e.id === d.id ? d : e)) }))
    onClose()
  }
  return (
    <Modal wide title={isNew ? s('newEvent') : s('editEvent')} onClose={onClose}
      footer={<><button type="button" className="d-btn text" onClick={onClose}>{s('cancel')}</button><button type="button" className="d-btn solid" onClick={save}>{s('save')}</button></>}>
      <L3Fields label={s('eventName')} value={d.name} onChange={(name) => { setBad(false); setD({ ...d, name }) }} />
      {bad && <p className="d-error">{s('nameNeeded')}</p>}
      <Field label={s('theme')} wide>
        <select value={d.theme} onChange={(e) => setD({ ...d, theme: e.target.value })}>{THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </Field>
      <L3Fields area label={s('description')} value={d.desc} onChange={(desc) => setD({ ...d, desc })} />
      <p className="d-form-title">{s('promoStrip')}</p>
      <L3Fields label={s('promoText')} value={d.promo} onChange={(promo) => setD({ ...d, promo })} />
      <ItemPicker label={s('eventItems')} value={d.items} onChange={(items) => setD({ ...d, items })} />
    </Modal>
  )
}

export function Events() {
  const s = useS()
  const { lang } = useLang()
  const data = useStaff()
  const [edit, setEdit] = useState<{ ev: EventX; isNew: boolean } | null>(null)
  const [open, setOpen] = useState('')
  const [sure, setSure] = useState('')
  // one event at a time: switching one on switches the others off
  const toggle = (id: string, on: boolean) => update((st) => ({ events: st.events.map((e) => ({ ...e, active: e.id === id ? on : on ? false : e.active })) }))
  const remove = (id: string) => { if (sure !== id) { setSure(id); return } update((st) => ({ events: st.events.filter((e) => e.id !== id) })); setSure('') }
  return (
    <>
      <div className="d-toolbar">
        <p className="d-lead">{s('eventsLead')}</p>
        <button type="button" className="d-btn solid" onClick={() => setEdit({ ev: blank(), isNew: true })}><I.plus />{s('newEvent')}</button>
      </div>
      {data.events.length ? data.events.map((e) => {
        const theme = THEMES.find((t) => t.id === e.theme) ?? THEMES[0]
        return (
          <section key={e.id} className={'d-card d-row-card' + (e.active ? ' active' : '')}>
            <div className="d-row-main">
              <span className="d-row-icon" style={{ color: theme.color, background: theme.color + '1f' }}><I.events /></span>
              <div className="d-row-text">
                <h3>{e.name[lang] || e.name.en}<em className="d-pill" style={{ color: theme.color, background: theme.color + '1f' }}>{theme.name}</em><em className={'d-pill ' + (e.active ? 'ok' : 'line')}>{e.active ? s('active') : s('inactive')}</em></h3>
                <p>{s('nItems', { n: e.items.length })}{(e.desc[lang] || e.desc.en) && <> — {e.desc[lang] || e.desc.en}</>}</p>
              </div>
              <Switch on={e.active} onChange={(v) => toggle(e.id, v)} label={`${e.name.en}: ${s('active')}`} disabled={!e.items.length} />
              <button type="button" className="d-icon-btn" aria-label={s('edit')} onClick={() => setEdit({ ev: e, isNew: false })}><I.edit /></button>
              <button type="button" className={'d-icon-btn' + (sure === e.id ? ' warn' : '')} aria-label={s('delete')} title={sure === e.id ? s('tapAgainDelete') : s('delete')} onClick={() => remove(e.id)} onBlur={() => setSure('')}><I.trash /></button>
              <button type="button" className="d-icon-btn" aria-expanded={open === e.id} aria-label={s('showItems')} onClick={() => setOpen(open === e.id ? '' : e.id)}><I.chevron dir={open === e.id ? 'up' : 'down'} /></button>
            </div>
            {sure === e.id && <p className="d-error">{s('tapAgainDelete')}</p>}
            {open === e.id && (e.items.length ? <ul className="d-chips plain">{e.items.map((n) => <li key={n} className="d-chip">{n}</li>)}</ul> : <p className="d-hint">{s('noItemsYet')}</p>)}
          </section>
        )
      }) : <p className="staff-empty">{s('noEvents')}</p>}
      <p className="demo-note">{s('eventsNote', { branch: branchName(data.branch) })}</p>
      {edit && <EventEditor ev={edit.ev} isNew={edit.isNew} onClose={() => setEdit(null)} />}
    </>
  )
}
