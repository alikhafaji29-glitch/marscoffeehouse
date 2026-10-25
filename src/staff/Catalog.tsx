import { useEffect, useRef, useState } from 'react'
import { LANGS, useLang } from '../i18n'
import type { Lang } from '../i18n'
import { iqd } from '../account'
import { backendOn } from '../backend'
import { ALL_ITEMS as ALL, MENU } from '../menu'
import type { Badge, MenuItem } from '../menu'
import { addCategory, addItem, basePrice, branchCats, canReset, catKind, editCategory, moveCategory, isAddedCat, isChanged, itemState, menuSaveFailed, moveItem, moveToCategory, nameOf, outCount, removeCategory, removeItem, removePhoto, uploadPhoto, resetMenu, resetPrice, saveItem, setOut, setPrice, useMenuVersion, photoOf, photoStyle, fitStyle } from '../menuAdmin'
import type { PhotoFit } from '../menuAdmin'
import type { CatKind, NutritionEntry } from '../menuAdmin'
import { DESC, TINT, categoryOf, isIced } from '../menuMeta'
import { catLabel } from '../components/MenuSection'
import { MiniCup } from '../components/MiniCup'
import { nutrientLabel as NKEY, nutrientUnit as UNIT } from './nutrients'
import { NUTRIENTS, branchName, useStaff } from './store'
import type { L3, Nutrient } from './store'
import { useS } from './strings'
import type { SKey } from './strings'
import { Field, I, Switch } from './ui'

/*
 * Drinks and Food: one page per category (prices and stock change right in the list) and an Edit Item page with
 * Details, Pricing and Nutrition, after the live panel. Everything here is for the branch chosen in the side menu:
 * each branch has its own prices, stock, tags, descriptions and nutrition (menuAdmin.ts). With the backend on the
 * changes are written to the database and reach that branch's customers; in the demo they stay on this device.
 * Add Item and Add Category (owner, 2026-10-14) put a new item or category on that branch's menu.
 */
// fit: the editor's unsaved place and size for the photo (its preview)
export const Thumb = ({ name, size = 40, fit }: { name: string; size?: number; fit?: PhotoFit }) => {
  const cat = categoryOf(name)
  return <span className="d-thumb" style={{ width: size, height: size }}>{photoOf(name) ? <img src={photoOf(name)} alt="" style={fit ? fitStyle(fit) : photoStyle(name)} /> : <MiniCup color={TINT[cat] || [200, 200, 200]} ice={isIced(cat) ? 1 : 0} size={size * 0.8} />}</span>
}
const MAX_FLAVOURS = 12
const MAX_SIZES = 3
const SIZE_NAMES = ['8oz', '12oz', '16oz', '20oz']
type SizeRow = { k: string; label: string; price: string }
const TAGS: { id: Badge | ''; key: SKey }[] = [{ id: '', key: 'tagNone' }, { id: 'top', key: 'tagTop' }, { id: 'premium', key: 'tagPremium' }, { id: 'signature', key: 'tagSignature' }]

/* a price is saved when the field is left or Enter is pressed; an empty or bad value goes back */
function PriceField({ item, i, label }: { item: MenuItem; i: number | null; label: string }) {
  const cur = i === null ? (item.price as number) : (item.price as number[])[i]
  const [draft, setDraft] = useState(String(cur))
  useEffect(() => setDraft(String(cur)), [cur])
  const commit = () => {
    const n = Number(draft.replace(/[^\d]/g, ''))
    if (!draft.trim() || !Number.isFinite(n) || n === cur) { setDraft(String(cur)); return }
    if (i === null) setPrice(item.name, n)
    else { const p = [...(item.price as number[])]; p[i] = n; setPrice(item.name, p) }
  }
  return (
    <label className="sm-price">
      {i !== null && <span>{item.sizes?.[i]}</span>}
      <input inputMode="numeric" dir="ltr" value={draft} aria-label={label}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(String(cur)); (e.target as HTMLInputElement).blur() } }} />
    </label>
  )
}

function Row({ item, onEdit, move }: { item: MenuItem; onEdit: () => void; move?: { up: boolean; down: boolean } }) {
  const { t } = useLang()
  const s = useS()
  const shown = nameOf(item.name, 'en') // as the branch writes it
  const label = t('staffPriceOf').replace('{item}', shown)
  // the branch does not sell it: named, greyed, nothing to change here (Edit Item can put it back when the branch has it)
  if (item.hidden) {
    return (
      <li className="sm-row off">
        <Thumb name={item.name} />
        <div className="sm-name"><b>{shown}</b><small>{s('notSoldHere')}</small></div>
        <span /><span />
        <div className="sm-acts"><button type="button" className="d-icon-btn" onClick={onEdit} aria-label={`${s('edit')} ${shown}`}><I.edit /></button></div>
      </li>
    )
  }
  const base = basePrice(item.name)
  const changed = isChanged(item.name)
  const baseText = base === undefined ? '' : Array.isArray(base) ? base.map(iqd).join(' / ') : iqd(base)
  return (
    <li className={'sm-row' + (item.soldOut ? ' out' : '')}>
      <Thumb name={item.name} />
      <div className="sm-name">
        <b>{shown}{item.badge &&<em className={'d-tag ' + item.badge}>{s(TAGS.find((x) => x.id === item.badge)!.key)}</em>}</b>
        {changed && <small>{t('staffWas').replace('{p}', baseText)} · <button type="button" className="sm-reset" onClick={() => resetPrice(item.name)}>{t('staffReset')}</button></small>}
      </div>
      <div className={'sm-prices' + (changed ? ' changed' : '')}>
        {Array.isArray(item.price)
          ? item.price.map((_, i) => <PriceField key={i} item={item} i={i} label={`${label} ${item.sizes?.[i] ?? ''}`} />)
          : <PriceField item={item} i={null} label={label} />}
        <small dir="ltr">IQD</small>
      </div>
      <div className="sm-stock">
        <span>{item.soldOut ? t('staffOutOfStock') : t('staffInStock')}</span>
        <Switch on={!item.soldOut} onChange={(v) => setOut(item.name, !v)} label={`${shown}: ${t('staffInStock')}`} />
      </div>
      <div className="sm-acts">
        {move && <>
          <button type="button" className="d-icon-btn" disabled={!move.up} onClick={() => moveItem(item.name, -1)} aria-label={`${s('moveUp')}: ${shown}`} title={s('moveUp')}><I.chevron dir="up" /></button>
          <button type="button" className="d-icon-btn" disabled={!move.down} onClick={() => moveItem(item.name, 1)} aria-label={`${s('moveDown')}: ${shown}`} title={s('moveDown')}><I.chevron dir="down" /></button>
        </>}
        <button type="button" className="d-icon-btn" onClick={onEdit} aria-label={`${s('edit')} ${shown}`}><I.edit /></button>
      </div>
    </li>
  )
}

export function Category({ id, go }: { id: string; go: (page: string) => void }) {
  const { t, lang } = useLang()
  const s = useS()
  useMenuVersion()
  const data = useStaff()
  const [q, setQ] = useState('')
  const [onlyOut, setOnlyOut] = useState(false)
  const [sure, setSure] = useState(false)
  const query = q.trim().toLowerCase()
  const mine = { drink: branchCats('drink'), food: branchCats('food') }
  const cats = MENU.filter((c) => (id === 'all' ? mine.drink.includes(c.id) || mine.food.includes(c.id) : c.id === id))
    .map((c) => ({ id: c.id, items: c.items.filter((i) => (!query || i.name.toLowerCase().includes(query) || nameOf(i.name, 'en').toLowerCase().includes(query)) && (!onlyOut || (i.soldOut && !i.hidden))) }))
    .filter((c) => c.items.length)
  const filtered = !!query || onlyOut
  const reset = () => { if (!sure) { setSure(true); return } resetMenu(); setSure(false); setOnlyOut(false) }
  const [delSure, setDelSure] = useState(false)
  const [notEmpty, setNotEmpty] = useState(false)
  const delCat = () => {
    if (!delSure) { setDelSure(true); return }
    setDelSure(false)
    if (removeCategory(id) === 'notEmpty') { setNotEmpty(true); return }
    go('cat:all')
  }
  return (
    <div className="staff-menu">
      {menuSaveFailed() && <p className="d-error" role="alert">{s('menuSaveFailed')}</p>}
      {notEmpty && <p className="d-error" role="alert">{s('catNotEmpty')}</p>}
      <div className="sm-tools">
        <input type="search" placeholder={t('staffMenuSearch')} aria-label={t('staffMenuSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className={'chip' + (onlyOut ? ' on' : '')} aria-pressed={onlyOut} onClick={() => setOnlyOut(!onlyOut)}>{t('staffOnlyOut').replace('{n}', String(outCount()))}</button>
        {id === 'all' && canReset && <button type="button" className={'chip ghost' + (sure ? ' warn' : '')} onClick={reset} onBlur={() => setSure(false)}>{sure ? t('staffResetSure') : t('staffResetAll')}</button>}
        {id !== 'all' && <button type="button" className="chip ghost" onClick={() => go('editcat:' + id)}>{s('rename')}</button>}
        {id !== 'all' && isAddedCat(id) && <button type="button" className={'chip ghost' + (delSure ? ' warn' : '')} onClick={delCat} onBlur={() => setDelSure(false)}>{delSure ? s('deleteSure') : s('deleteCategory')}</button>}
        {id === 'all' && <button type="button" className="d-btn outline sm-add" onClick={() => go('newcat:drink')}><I.plus />{s('addCategory')}</button>}
        <button type="button" className={'d-btn solid' + (id === 'all' ? '' : ' sm-add')} onClick={() => go('new:' + id)}><I.plus />{s('addItem')}</button>
      </div>
      {cats.length ? cats.map((c) => (
        <section key={c.id} className="sm-cat">
          {id === 'all' && (
            <h2>
              <button type="button" className="sm-cat-name" onClick={() => go('cat:' + c.id)}>{catLabel(c.id, lang)}</button>
              {!filtered && (() => {
                const list = mine[catKind(c.id)]
                const at = list.indexOf(c.id)
                return (
                  <span className="sm-acts">
                    <button type="button" className="d-icon-btn" disabled={at <= 0} onClick={() => moveCategory(c.id, -1)} aria-label={`${s('moveUp')}: ${catLabel(c.id, lang)}`} title={s('moveUp')}><I.chevron dir="up" /></button>
                    <button type="button" className="d-icon-btn" disabled={at >= list.length - 1} onClick={() => moveCategory(c.id, 1)} aria-label={`${s('moveDown')}: ${catLabel(c.id, lang)}`} title={s('moveDown')}><I.chevron dir="down" /></button>
                    <button type="button" className="d-icon-btn" onClick={() => go('editcat:' + c.id)} aria-label={`${s('rename')}: ${catLabel(c.id, lang)}`} title={s('rename')}><I.edit /></button>
                  </span>
                )
              })()}
            </h2>
          )}
          <ul>{c.items.map((it) => {
            // the order can be changed on a category's own page, with the whole list in view
            const sold = c.items.filter((x) => !x.hidden)
            const at = sold.indexOf(it)
            return <Row key={it.name} item={it} onEdit={() => go('item:' + it.name)} move={id !== 'all' && !filtered && at >= 0 && sold.length > 1 ? { up: at > 0, down: at < sold.length - 1 } : undefined} />
          })}</ul>
        </section>
      )) : <p className="staff-empty">{filtered ? t('staffNoMatch') : s('emptyCat')}</p>}
      <p className="demo-note">{backendOn ? s('menuLiveNote', { branch: branchName(data.branch) }) : t('staffMenuNote')}</p>
    </div>
  )
}

type NDraft = Partial<Record<Nutrient, string>>
const vkey = (size: string, flavor: string) => size + '|' + flavor

export function ItemEditor({ name, go }: { name: string; go: (page: string) => void }) {
  const { t, lang } = useLang()
  const s = useS()
  const data = useStaff()
  useMenuVersion()
  const item = ALL.find((i) => i.name === name)
  const st = itemState(name, data.branch)
  // the sizes as being edited: one row = a single price; `k` keeps a row's nutrition with it while its name changes
  const [rows, setRows] = useState<SizeRow[]>(() => (!st ? [] : st.sizes.length ? st.sizes.map((z, i) => ({ k: z, label: z, price: String(st.prices[i] ?? '') })) : [{ k: '', label: '', price: String(st.prices[0] ?? '') }]))
  const seq = useRef(0)
  const [flav, setFlav] = useState<string[]>(() => st?.flavors ?? []) // the flavours as being edited
  const [newFlav, setNewFlav] = useState('')
  const flavors = flav.length ? flav : ['']
  const [delSure, setDelSure] = useState(false)
  const [tab, setTab] = useState<'details' | 'pricing' | 'nutrition'>('details')
  const [dl, setDl] = useState<Lang>(lang)
  const [names, setNames] = useState<L3>(() => ({ en: st?.names.en || name, ar: st?.names.ar ?? '', ku: st?.names.ku ?? '' }))
  const [desc, setDesc] = useState<L3>(() => st?.desc ?? { en: '', ar: '', ku: '' })
  const [tag, setTag] = useState<Badge | ''>(() => st?.tag ?? '')
  const [inStock, setInStock] = useState(() => st?.inStock ?? true)
  const [available, setAvailable] = useState(() => st?.available ?? true)
  // the photo moved left / right, up / down and zoomed (owner, 2026-10-25); saved with Save
  const [photoX, setPhotoX] = useState(() => st?.photoX ?? 0)
  const [photoY, setPhotoY] = useState(() => st?.photoY ?? 0)
  const [photoZoom, setPhotoZoom] = useState(() => st?.photoZoom ?? 100)
  const [sizeK, setSize] = useState(rows[0]?.k ?? '')
  const size = rows.some((r) => r.k === sizeK) ? sizeK : rows[0]?.k ?? ''
  const [picked, setFlavor] = useState(flavors[0])
  const flavor = flavors.includes(picked) ? picked : flavors[0]
  // nutrition: one set of facts per size and flavour
  const [nut, setNut] = useState<Record<string, NDraft>>(() => Object.fromEntries((st?.nutrition ?? []).map((e) => [vkey(e.size, e.flavor), Object.fromEntries(NUTRIENTS.filter((k) => e[k] !== undefined).map((k) => [k, String(e[k])])) as NDraft])))
  const [bad, setBad] = useState(false)
  const [extra, setExtra] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(st?.flavorExtra ?? {}).map(([f, n]) => [f, String(n)]))) // what a flavour adds, as typed
  const cat = categoryOf(name)
  const cats = [...branchCats('drink'), ...branchCats('food')]
  const [category, setCategory] = useState(cat)
  const fileRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<'' | 'photoBusy' | 'photoBad' | 'photoFailed'>('')
  const hasPhoto = !!st?.photo
  const pick = async (file?: File) => {
    if (!file) return
    setPhoto('photoBusy')
    const res = await uploadPhoto(name, file)
    setPhoto(res === 'ok' ? '' : res === 'bad' ? 'photoBad' : 'photoFailed')
  }
  const back = () => go('cat:' + cat)
  if (!item) return <p className="staff-empty">{t('staffNoMatch')}</p>
  if (!st) {
    return (
      <>
        <div className="d-page-actions"><button type="button" className="d-btn text" onClick={back}><I.back />{s('cancel')}</button></div>
        <p className="staff-empty">{s('notOnBranch', { branch: branchName(data.branch) })}</p>
      </>
    )
  }
  const addFlavour = () => {
    const f = newFlav.trim().replace(/\s+/g, ' ').slice(0, 30)
    setNewFlav('')
    if (!f || flav.length >= MAX_FLAVOURS || flav.some((x) => x.toLowerCase() === f.toLowerCase())) return
    // the first flavour takes over the facts entered for the item without flavours
    if (!flav.length) setNut((n) => ({ ...n, ...Object.fromEntries(rows.filter((r) => n[vkey(r.k, '')]).map((r) => [vkey(r.k, f), n[vkey(r.k, '')]])) }))
    setFlav([...flav, f])
  }
  const del = () => { if (!delSure) { setDelSure(true); return } removeItem(name); back() }
  const addSize = () => {
    setBad(false)
    const base = rows.length === 1 && !rows[0].label.trim() ? [{ ...rows[0], label: SIZE_NAMES[0] }] : rows
    const used = base.map((r) => r.label.trim().toLowerCase())
    setRows([...base, { k: '#' + ++seq.current, label: SIZE_NAMES.find((z) => !used.includes(z)) ?? '', price: '' }])
  }
  const save = () => {
    const sized = rows.length > 1
    const nums = rows.map((r) => Number(r.price.replace(/[^\d]/g, '')))
    const labels = rows.map((r) => r.label.trim())
    const badSizes = sized && (labels.some((l) => !l) || new Set(labels.map((l) => l.toLowerCase())).size !== labels.length)
    if (rows.some((r) => !r.price.trim()) || nums.some((n) => !Number.isFinite(n)) || badSizes) { setBad(true); setTab('pricing'); return }
    const nutrition: NutritionEntry[] = rows.flatMap((r, i) => flavors.map((f) => {
      const facts = Object.fromEntries(Object.entries(nut[vkey(r.k, f)] ?? {}).filter(([, v]) => v !== undefined && v.trim() !== '' && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]))
      return Object.keys(facts).length ? ({ size: sized ? labels[i] : '', flavor: f, ...facts } as NutritionEntry) : null
    })).filter((e): e is NutritionEntry => !!e)
    const flavorExtra = Object.fromEntries(flav.map((f) => [f, Number((extra[f] ?? '').replace(/[^\d]/g, ''))] as const).filter(([, n]) => n > 0))
    saveItem(name, { prices: nums, sizes: sized ? labels : [], inStock, available, tag, flavors: flav, flavorExtra, names: { en: names.en.trim() || name, ar: names.ar.trim(), ku: names.ku.trim() }, desc: { en: desc.en.trim(), ar: desc.ar.trim(), ku: desc.ku.trim() }, nutrition, ...(photoX !== (st.photoX ?? 0) && { photoX }), ...(photoY !== (st.photoY ?? 0) && { photoY }), ...(photoZoom !== (st.photoZoom ?? 100) && { photoZoom }) })
    if (category !== cat && cats.includes(category)) { moveToCategory(name, category); go('cat:' + category); return }
    back()
  }
  const cur = nut[vkey(size, flavor)] ?? {}
  return (
    <>
      <div className="d-page-actions">
        <button type="button" className={'d-btn text danger' + (delSure ? ' sure' : '')} onClick={del} onBlur={() => setDelSure(false)} title={s('deleteHint', { branch: branchName(data.branch) })}><I.trash />{delSure ? s('deleteSure') : s('deleteItem')}</button>
        <button type="button" className="d-btn text" onClick={back}><I.back />{s('cancel')}</button>
        <button type="button" className="d-btn solid" onClick={save}><I.save />{s('save')}</button>
      </div>
      <section className="d-card d-editor">
        <div className="d-tabs" role="tablist">
          {(['details', 'pricing', 'nutrition'] as const).map((x) => <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>{s(x === 'details' ? 'tabDetails' : x === 'pricing' ? 'tabPricing' : 'tabNutrition')}</button>)}
        </div>
        {tab === 'details' && (
          <div className="d-editor-details">
            <div className="d-editor-image">
              <p>{s('image')}</p>
              <Thumb name={name} size={180} fit={{ x: photoX, y: photoY, zoom: photoZoom }} />
              {photoOf(name) && (
                <div className="d-photo-x">
                  <p>{s('photoFitHint')}</p>
                  {/* left is left (and smaller is left) in every language */}
                  <label>
                    <span>{s('photoPos')}</span>
                    <input type="range" min={-40} max={40} step={1} dir="ltr" value={photoX} onChange={(e) => setPhotoX(Number(e.target.value))} aria-valuetext={`${photoX}%`} />
                  </label>
                  <label>
                    <span>{s('photoPosY')}</span>
                    <input type="range" min={-40} max={40} step={1} dir="ltr" value={photoY} onChange={(e) => setPhotoY(Number(e.target.value))} aria-valuetext={`${photoY}%`} />
                  </label>
                  <label>
                    <span>{s('photoZoom')} · {photoZoom}%</span>
                    <input type="range" min={50} max={200} step={5} dir="ltr" value={photoZoom} onChange={(e) => setPhotoZoom(Number(e.target.value))} aria-valuetext={`${photoZoom}%`} />
                  </label>
                  {(photoX !== 0 || photoY !== 0 || photoZoom !== 100) && <button type="button" className="d-btn text small" onClick={() => { setPhotoX(0); setPhotoY(0); setPhotoZoom(100) }}>{s('photoCentre')}</button>}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
              <div className="d-photo-acts">
                <button type="button" className="d-btn outline small" disabled={photo === 'photoBusy'} onClick={() => fileRef.current?.click()}>{photo === 'photoBusy' ? s('photoBusy') : hasPhoto ? s('changePhoto') : s('uploadPhoto')}</button>
                {hasPhoto && photo !== 'photoBusy' && <button type="button" className="d-btn text small" onClick={() => removePhoto(name)}>{s('removePhoto')}</button>}
              </div>
              {(photo === 'photoBad' || photo === 'photoFailed') && <p className="d-error" role="alert">{s(photo)}</p>}
              <small>{s('imageHint')}</small>
            </div>
            <div className="d-form">
              <div className="d-tabs small" role="tablist">
                {LANGS.map(({ code, label }) => <button key={code} role="tab" aria-selected={dl === code} className={dl === code ? 'on' : ''} onClick={() => setDl(code)}>{label}</button>)}
              </div>
              <Field label={`${s('name')} (${dl.toUpperCase()})`} wide hint={s('nameHint')}>
                <input value={names[dl]} maxLength={80} dir={dl === 'en' ? 'ltr' : 'rtl'} placeholder={dl === 'en' ? name : names.en} onChange={(e) => setNames({ ...names, [dl]: e.target.value })} />
              </Field>
              <Field label={`${s('description')} (${dl.toUpperCase()})`} wide>
                <textarea rows={4} dir={dl === 'en' ? 'ltr' : 'rtl'} value={desc[dl]} onChange={(e) => setDesc({ ...desc, [dl]: e.target.value })}
                  placeholder={dl === lang ? (DESC[name] ? t(DESC[name]) : t('descDefault')) : ''} />
              </Field>
              <Field label={s('category')} wide hint={category !== cat ? s('categoryHint') : undefined}>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>{cats.map((x) => <option key={x} value={x}>{catLabel(x, lang)}</option>)}</select>
              </Field>
              <Field label={s('tag')} wide>
                <select value={tag} onChange={(e) => setTag(e.target.value as Badge | '')}>{TAGS.map((x) => <option key={x.id} value={x.id}>{s(x.key)}</option>)}</select>
              </Field>
              <div className="d-field wide d-flavours">
                <span>{s('flavours')}</span>
                <div className="d-chips">
                  {flav.map((f) => <span key={f} className="d-chip">{f}<button type="button" aria-label={`${s('remove')} ${f}`} onClick={() => setFlav(flav.filter((x) => x !== f))}><I.close /></button></span>)}
                  {flav.length < MAX_FLAVOURS && <input value={newFlav} maxLength={30} placeholder={s('flavourAdd')} aria-label={s('flavourAdd')} onChange={(e) => setNewFlav(e.target.value)} onBlur={addFlavour} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addFlavour() } }} />}
                </div>
                <small>{s('flavoursHint')}</small>
              </div>
              <div className="d-switch-row">
                <Switch on={inStock} onChange={setInStock} label={t('staffInStock')} />
                <div><b>{inStock ? t('staffInStock') : t('staffOutOfStock')}</b><small>{s('stockHint')}</small></div>
              </div>
              <div className="d-switch-row">
                <Switch on={available} onChange={setAvailable} label={s('soldHere')} />
                <div><b>{available ? s('soldHere') : s('notSoldHere')}</b><small>{s('soldHereHint')}</small></div>
              </div>
            </div>
          </div>
        )}
        {tab === 'pricing' && (
          <div className="d-form">
            <p className="d-form-title">{rows.length > 1 ? s('sizePrices') : s('price')}</p>
            {rows.map((r) => (
              <div key={r.k} className="d-form-row sizes">
                {rows.length > 1 && (
                  <Field label={s('sizeName')}>
                    <input value={r.label} maxLength={12} dir="ltr" onChange={(e) => { setBad(false); setRows(rows.map((x) => (x === r ? { ...x, label: e.target.value } : x))) }} />
                  </Field>
                )}
                <Field label="IQD">
                  <input inputMode="numeric" dir="ltr" value={r.price} onChange={(e) => { setBad(false); setRows(rows.map((x) => (x === r ? { ...x, price: e.target.value } : x))) }} />
                </Field>
                {rows.length > 1 && <button type="button" className="d-icon-btn" aria-label={`${s('removeSize')} ${r.label}`} title={s('removeSize')} onClick={() => { setBad(false); setRows(rows.filter((x) => x !== r)) }}><I.trash /></button>}
              </div>
            ))}
            {rows.length < MAX_SIZES && <div><button type="button" className="d-btn outline small" onClick={addSize}><I.plus />{s('addSize')}</button></div>}
            {bad && <p className="d-error">{s(rows.length > 1 ? 'sizesBad' : 'priceNeeded')}</p>}
            <p className="d-hint">{s('sizesHint')}</p>
            {flav.length > 0 && (
              <>
                <p className="d-form-title">{s('flavourPrices')}</p>
                <div className="d-form-row">
                  {flav.map((f) => (
                    <Field key={f} label={`${f} (+ IQD)`}>
                      <input inputMode="numeric" dir="ltr" placeholder="0" value={extra[f] ?? ''} onChange={(e) => setExtra({ ...extra, [f]: e.target.value })} />
                    </Field>
                  ))}
                </div>
                <p className="d-hint">{s('flavourPriceHint')}</p>
              </>
            )}
          </div>
        )}
        {tab === 'nutrition' && (
          <div className="d-form">
            <p className="d-form-title">{flav.length ? s('nutritionPerVariant') : rows.length > 1 ? s('nutritionPerSize') : s('tabNutrition')}</p>
            {rows.length > 1 && (
              <div className="d-tabs small" role="tablist" aria-label={t('size')}>
                {rows.map((r) => <button key={r.k} role="tab" aria-selected={size === r.k} className={size === r.k ? 'on' : ''} onClick={() => setSize(r.k)}>{r.label.trim() || '?'}</button>)}
              </div>
            )}
            {flavors.length > 1 && (
              <div className="d-seg" role="tablist" aria-label={s('flavours')}>
                {flavors.map((f) => <button key={f} type="button" role="tab" aria-selected={flavor === f} className={flavor === f ? 'on' : ''} onClick={() => setFlavor(f)}>{f}</button>)}
              </div>
            )}
            <div className="d-form-grid">
              {NUTRIENTS.map((k) => (
                <Field key={k} label={`${s(NKEY[k])} (${UNIT[k]})`}>
                  <input inputMode="decimal" dir="ltr" value={cur[k] ?? ''} onChange={(e) => setNut({ ...nut, [vkey(size, flavor)]: { ...cur, [k]: e.target.value } })} />
                </Field>
              ))}
            </div>
            <p className="d-hint">{s('nutritionHint')}</p>
          </div>
        )}
      </section>
    </>
  )
}

const SIZE_SETS: string[][] = [[], ['8oz', '12oz'], ['12oz', '16oz'], ['8oz', '12oz', '16oz']] // the menu's two pairs (hot, cold) and all three
const clean = (v: string) => v.trim().replace(/\s+/g, ' ')

/** Add Item: a new item on the dashboard's branch. `cat` is the category the button was pressed in ('all' = pick one) */
export function NewItem({ cat, go }: { cat: string; go: (page: string) => void }) {
  const { t, lang } = useLang()
  const s = useS()
  const data = useStaff()
  useMenuVersion()
  const cats = [...branchCats('drink'), ...branchCats('food')]
  const [category, setCategory] = useState(cats.includes(cat) ? cat : cats[0])
  const [names, setNames] = useState<L3>({ en: '', ar: '', ku: '' })
  const [dl, setDl] = useState<Lang>(lang)
  const [desc, setDesc] = useState<L3>({ en: '', ar: '', ku: '' })
  const [set, setSet] = useState(0)
  const [prices, setPrices] = useState(['', '', ''])
  const [tag, setTag] = useState<Badge | ''>('')
  const [err, setErr] = useState<'' | 'nameNeeded' | 'priceNeeded' | 'itemExists' | 'menuNotReady'>('')
  const sizes = SIZE_SETS[set]
  const back = () => go('cat:' + cat)
  const save = () => {
    const name = clean(names.en)
    if (!name) { setErr('nameNeeded'); return }
    const shown = prices.slice(0, sizes.length || 1)
    const nums = shown.map((p) => Number(p.replace(/[^\d]/g, '')))
    if (shown.some((p) => !p.trim()) || nums.some((n) => !Number.isFinite(n))) { setErr('priceNeeded'); return }
    const res = addItem({ name, cat: category, names: { en: name, ar: clean(names.ar), ku: clean(names.ku) }, prices: nums, sizes, tag, desc: { en: desc.en.trim(), ar: desc.ar.trim(), ku: desc.ku.trim() } })
    if (res !== 'ok') { setErr(res === 'exists' ? 'itemExists' : 'menuNotReady'); return }
    go('cat:' + category)
  }
  return (
    <>
      <div className="d-page-actions">
        <button type="button" className="d-btn text" onClick={back}><I.back />{s('cancel')}</button>
        <button type="button" className="d-btn solid" onClick={save}><I.save />{s('save')}</button>
      </div>
      <section className="d-card d-editor">
        <div className="d-form">
          {err && <p className="d-error" role="alert">{s(err)}</p>}
          <div className="d-form-row">
            {LANGS.map(({ code, label }) => (
              <Field key={code} label={s('nameIn', { lang: label })}>
                <input value={names[code]} maxLength={80} dir={code === 'en' ? 'ltr' : 'rtl'} required={code === 'en'} onChange={(e) => { setErr(''); setNames({ ...names, [code]: e.target.value }) }} />
              </Field>
            ))}
          </div>
          <div className="d-form-row">
            <Field label={s('category')}>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>{cats.map((c) => <option key={c} value={c}>{catLabel(c, lang)}</option>)}</select>
            </Field>
            <Field label={s('tag')}>
              <select value={tag} onChange={(e) => setTag(e.target.value as Badge | '')}>{TAGS.map((x) => <option key={x.id} value={x.id}>{s(x.key)}</option>)}</select>
            </Field>
          </div>
          <div className="d-form-row">
            <Field label={s('sizesLabel')}>
              <select value={set} onChange={(e) => setSet(Number(e.target.value))}>{SIZE_SETS.map((z, i) => <option key={i} value={i}>{z.length ? z.join(' / ') : s('pricingSingle')}</option>)}</select>
            </Field>
            {(sizes.length ? sizes : ['']).map((z, i) => (
              <Field key={i} label={z ? `${z} (IQD)` : `${s('price')} (IQD)`}>
                <input inputMode="numeric" dir="ltr" value={prices[i]} onChange={(e) => { setErr(''); setPrices(prices.map((x, k) => (k === i ? e.target.value : x))) }} />
              </Field>
            ))}
          </div>
          <div className="d-tabs small" role="tablist">
            {LANGS.map(({ code, label }) => <button key={code} type="button" role="tab" aria-selected={dl === code} className={dl === code ? 'on' : ''} onClick={() => setDl(code)}>{label}</button>)}
          </div>
          <Field label={`${s('description')} (${dl.toUpperCase()})`} wide>
            <textarea rows={3} dir={dl === 'en' ? 'ltr' : 'rtl'} value={desc[dl]} placeholder={dl === lang ? t('descDefault') : ''} onChange={(e) => setDesc({ ...desc, [dl]: e.target.value })} />
          </Field>
          <p className="d-hint">{s('newItemHint', { branch: branchName(data.branch) })}</p>
        </div>
      </section>
    </>
  )
}

/** Add Category: a new category on the dashboard's branch, among the drinks or the food */
export function NewCategory({ kind: first, edit, go }: { kind: CatKind; edit?: string; go: (page: string) => void }) {
  const s = useS()
  const data = useStaff()
  const [kind, setKind] = useState<CatKind>(() => (edit ? catKind(edit) : first))
  const [names, setNames] = useState<L3>(() => (edit ? { en: catLabel(edit, 'en'), ar: catLabel(edit, 'ar'), ku: catLabel(edit, 'ku') } : { en: '', ar: '', ku: '' }))
  const [err, setErr] = useState<'' | 'nameNeeded' | 'catExists' | 'menuNotReady'>('')
  const save = () => {
    const en = clean(names.en)
    if (!en) { setErr('nameNeeded'); return }
    const next = { en, ar: clean(names.ar), ku: clean(names.ku) }
    if (edit) { editCategory(edit, next, kind); go('cat:' + edit); return }
    const res = addCategory(next, kind)
    if (typeof res === 'string') { setErr(res === 'exists' ? 'catExists' : 'menuNotReady'); return }
    go('cat:' + res.id)
  }
  return (
    <>
      <div className="d-page-actions">
        <button type="button" className="d-btn text" onClick={() => go('cat:all')}><I.back />{s('cancel')}</button>
        <button type="button" className="d-btn solid" onClick={save}><I.save />{s('save')}</button>
      </div>
      <section className="d-card d-editor">
        <div className="d-form">
          {err && <p className="d-error" role="alert">{s(err)}</p>}
          <div className="d-form-row">
            {LANGS.map(({ code, label }) => (
              <Field key={code} label={s('nameIn', { lang: label })}>
                <input value={names[code]} maxLength={60} dir={code === 'en' ? 'ltr' : 'rtl'} required={code === 'en'} onChange={(e) => { setErr(''); setNames({ ...names, [code]: e.target.value }) }} />
              </Field>
            ))}
          </div>
          <div className="d-seg" role="radiogroup" aria-label={s('catType')}>
            {(['drink', 'food'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{s(k === 'drink' ? 'navDrinks' : 'navFood')}</button>)}
          </div>
          <p className="d-hint">{s(edit ? 'renameCatHint' : 'newCatHint', { branch: branchName(data.branch) })}</p>
        </div>
      </section>
    </>
  )
}
