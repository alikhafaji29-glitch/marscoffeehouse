import { useState } from 'react'
import { useLang } from '../i18n'
import { iqd } from '../account'
import { ALL_ITEMS as ITEMS } from '../menu'
import type { MenuItem } from '../menu'
import { useMenuVersion } from '../menuAdmin'
import { categoryOf } from '../menuMeta'
import { catLabel } from '../components/MenuSection'
import { Thumb } from './Catalog'
import { costOf, sellOf, uid, update, useStaff } from './store'
import type { Ingredient, Recipe } from './store'
import { useS } from './strings'
import { Field, I, Modal, Stat } from './ui'

/* Warehouse, after the live panel: what each ingredient costs, the recipe behind each item, and from those the
 * cost, profit and margin per item (for sized items: the smaller size). Stock levels are typed in by hand here. */
const LOW_MARGIN = 40 // % under which an item is flagged
const UNITS = ['g', 'ml', 'pc']
const num = (x: string) => Number(x.replace(/[^\d.]/g, '')) || 0
const marginOf = (it: MenuItem, cost: number) => { const sell = sellOf(it); return sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0 }

function RecipeEditor({ item, onClose, toIngredients }: { item: MenuItem; onClose: () => void; toIngredients: () => void }) {
  const s = useS()
  const data = useStaff()
  const [lines, setLines] = useState<Recipe>(() => data.recipes[item.name] ?? [])
  const cost = Math.round(lines.reduce((n, l) => n + (data.ingredients.find((i) => i.id === l.ing)?.cost ?? 0) * l.qty, 0))
  const sell = sellOf(item)
  const save = () => {
    const clean = lines.filter((l) => l.ing && l.qty > 0)
    update((st) => { const recipes = { ...st.recipes }; if (clean.length) recipes[item.name] = clean; else delete recipes[item.name]; return { recipes } })
    onClose()
  }
  return (
    <Modal title={`${s('recipe')} · ${item.name}`} onClose={onClose}
      footer={<><button type="button" className="d-btn text" onClick={onClose}>{s('cancel')}</button><button type="button" className="d-btn solid" onClick={save}>{s('save')}</button></>}>
      {!data.ingredients.length ? (
        <>
          <p className="d-hint">{s('needIngredients')}</p>
          <button type="button" className="d-btn outline" onClick={() => { onClose(); toIngredients() }}><I.plus />{s('newIngredient')}</button>
        </>
      ) : (
        <>
          {lines.map((l, i) => {
            const ing = data.ingredients.find((x) => x.id === l.ing)
            return (
              <div key={i} className="d-form-row recipe">
                <Field label={s('ingredient')}>
                  <select value={l.ing} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, ing: e.target.value } : x)))}>
                    <option value="">—</option>
                    {data.ingredients.map((x) => <option key={x.id} value={x.id}>{x.name || '—'}</option>)}
                  </select>
                </Field>
                <Field label={`${s('qty')}${ing ? ` (${ing.unit})` : ''}`}><input inputMode="decimal" dir="ltr" value={l.qty || ''} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: num(e.target.value) } : x)))} /></Field>
                <span className="d-line-cost" dir="ltr">{iqd(Math.round((ing?.cost ?? 0) * l.qty))} IQD</span>
                <button type="button" className="d-icon-btn warn" aria-label={s('remove')} onClick={() => setLines(lines.filter((_, k) => k !== i))}><I.trash /></button>
              </div>
            )
          })}
          <button type="button" className="d-btn text" onClick={() => setLines([...lines, { ing: '', qty: 0 }])}><I.plus />{s('addLine')}</button>
          <dl className="d-totals">
            <div><dt>{s('sellPrice')}</dt><dd dir="ltr">{iqd(sell)} IQD</dd></div>
            <div><dt>{s('cost')}</dt><dd dir="ltr">{iqd(cost)} IQD</dd></div>
            <div><dt>{s('profit')}</dt><dd dir="ltr">{iqd(sell - cost)} IQD</dd></div>
            <div><dt>{s('margin')}</dt><dd dir="ltr">{sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0}%</dd></div>
          </dl>
        </>
      )}
    </Modal>
  )
}

function Ingredients() {
  const s = useS()
  const data = useStaff()
  const set = (id: string, patch: Partial<Ingredient>) => update((st) => ({ ingredients: st.ingredients.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
  const add = () => update((st) => ({ ingredients: [...st.ingredients, { id: uid(), name: '', unit: 'g', cost: 0, stock: 0, low: 0 }] }))
  const remove = (id: string) => update((st) => ({
    ingredients: st.ingredients.filter((i) => i.id !== id),
    recipes: Object.fromEntries(Object.entries(st.recipes).map(([k, r]) => [k, r.filter((l) => l.ing !== id)] as const).filter(([, r]) => r.length)),
  }))
  return (
    <>
      <div className="d-toolbar"><p className="d-hint">{s('ingredientsHint')}</p><button type="button" className="d-btn solid" onClick={add}><I.plus />{s('newIngredient')}</button></div>
      {data.ingredients.length ? (
        <div className="d-table-wrap">
          <table className="d-table">
            <thead><tr><th>{s('ingredient')}</th><th>{s('unit')}</th><th>{s('costPerUnit')}</th><th>{s('inStockQty')}</th><th>{s('lowLevel')}</th><th /></tr></thead>
            <tbody>
              {data.ingredients.map((i) => (
                <tr key={i.id} className={i.low > 0 && i.stock <= i.low ? 'low' : ''}>
                  <td><input value={i.name} onChange={(e) => set(i.id, { name: e.target.value })} placeholder={s('ingredientName')} aria-label={s('ingredient')} /></td>
                  <td><select value={i.unit} onChange={(e) => set(i.id, { unit: e.target.value })} aria-label={s('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                  <td><input inputMode="decimal" dir="ltr" value={i.cost || ''} onChange={(e) => set(i.id, { cost: num(e.target.value) })} aria-label={s('costPerUnit')} /></td>
                  <td><input inputMode="decimal" dir="ltr" value={i.stock || ''} onChange={(e) => set(i.id, { stock: num(e.target.value) })} aria-label={s('inStockQty')} /></td>
                  <td><input inputMode="decimal" dir="ltr" value={i.low || ''} onChange={(e) => set(i.id, { low: num(e.target.value) })} aria-label={s('lowLevel')} /></td>
                  <td><button type="button" className="d-icon-btn warn" aria-label={s('delete')} onClick={() => remove(i.id)}><I.trash /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="staff-empty">{s('noIngredients')}</p>}
    </>
  )
}

export function Warehouse() {
  const s = useS()
  const { lang } = useLang()
  const data = useStaff()
  useMenuVersion()
  const [tab, setTab] = useState<'items' | 'ingredients'>('items')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'costed' | 'not' | 'low'>('all')
  const [recipe, setRecipe] = useState<MenuItem | null>(null)
  // the branch's own items only
  const rows = ITEMS.filter((it) => !it.hidden).map((it) => { const cost = costOf(it.name, data); return { it, cost, margin: cost === null ? null : marginOf(it, cost) } })
  const costed = rows.filter((r) => r.cost !== null)
  const low = costed.filter((r) => r.margin! < LOW_MARGIN)
  const lowStock = data.ingredients.filter((i) => i.low > 0 && i.stock <= i.low)
  const avg = costed.length ? Math.round(costed.reduce((n, r) => n + r.margin!, 0) / costed.length) : null
  const query = q.trim().toLowerCase()
  const shown = rows.filter((r) => (!query || r.it.name.toLowerCase().includes(query)) && (filter === 'all' || (filter === 'costed' ? r.cost !== null : filter === 'not' ? r.cost === null : r.margin !== null && r.margin < LOW_MARGIN)))
  return (
    <>
      <p className="d-lead">{s('warehouseLead')}</p>
      <div className="d-stats">
        <Stat icon={<I.flask />} value={data.ingredients.length} label={s('ingredients')} note={lowStock.length ? s('lowStockN', { n: lowStock.length }) : s('stockOk')} tone={lowStock.length ? 'red' : 'navy'} />
        <Stat icon={<I.receipt />} tone="sky" value={`${costed.length}/${rows.length}`} label={s('itemsCosted')} note={s('coverage', { n: Math.round((costed.length / Math.max(1, rows.length)) * 100) })} />
        <Stat icon={<I.trend />} tone="green" value={avg === null ? '—' : `${avg}%`} label={s('avgMargin')} />
        <Stat icon={<I.alert />} tone={low.length ? 'red' : 'green'} value={low.length} label={s('lowMargin')} note={low.length ? s('underN', { n: LOW_MARGIN }) : s('allGood')} />
      </div>
      <div className="d-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'items'} className={tab === 'items' ? 'on' : ''} onClick={() => setTab('items')}>{s('items')}</button>
        <button role="tab" aria-selected={tab === 'ingredients'} className={tab === 'ingredients' ? 'on' : ''} onClick={() => setTab('ingredients')}>{s('ingredients')} · {data.ingredients.length}</button>
      </div>
      {tab === 'ingredients' ? <Ingredients /> : (
        <>
          <div className="d-toolbar start">
            <input type="search" className="d-search" placeholder={s('searchItems')} aria-label={s('searchItems')} value={q} onChange={(e) => setQ(e.target.value)} />
            <Field label={s('marginFilter')}>
              <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                <option value="all">{s('fAll')}</option><option value="costed">{s('fCosted')}</option><option value="not">{s('fNot')}</option><option value="low">{s('lowMargin')}</option>
              </select>
            </Field>
          </div>
          <div className="d-table-wrap">
            <table className="d-table">
              <thead><tr><th>{s('item')}</th><th>{s('category')}</th><th className="num">{s('sellPrice')}</th><th className="num">{s('cost')}</th><th className="num">{s('profit')}</th><th className="num">{s('margin')}</th><th>{s('recipe')}</th></tr></thead>
              <tbody>
                {shown.map(({ it, cost, margin }) => (
                  <tr key={it.name} className={margin !== null && margin < LOW_MARGIN ? 'low' : ''}>
                    <td><span className="d-item-cell"><Thumb name={it.name} size={34} /><span><b>{it.name}</b>{it.sizes && <small>{s('showingSize', { size: it.sizes[0] })}</small>}</span></span></td>
                    <td>{catLabel(categoryOf(it.name), lang)}</td>
                    <td className="num" dir="ltr">{iqd(sellOf(it))} IQD</td>
                    <td className="num" dir="ltr">{cost === null ? '—' : iqd(cost)}</td>
                    <td className="num" dir="ltr">{cost === null ? '—' : iqd(sellOf(it) - cost)}</td>
                    <td className="num" dir="ltr">{margin === null ? '—' : `${margin}%`}</td>
                    <td><button type="button" className="d-btn outline small" onClick={() => setRecipe(it)}>{cost === null ? s('add') : s('edit')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!shown.length && <p className="staff-empty">{s('nothingHere')}</p>}
        </>
      )}
      {recipe && <RecipeEditor item={recipe} onClose={() => setRecipe(null)} toIngredients={() => setTab('ingredients')} />}
    </>
  )
}
