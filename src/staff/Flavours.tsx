import { useState } from 'react'
import { ALL_ITEMS } from '../menu'
import { flavourList, optsOf } from '../customize'
import { saveItem, useMenuVersion } from '../menuAdmin'
import { branchName, settingsFor, update, useStaff } from './store'
import type { FlavourDef } from './store'
import { useS } from './strings'
import { Card, I, Switch } from './ui'

/*
 * Flavours (owner, 2026-10-26: "we need a new section in dashboard called flavours, to add there"): the branch's list
 * of flavours, with what customers see in each language and whether it is in stock. Edit Item → Options then picks,
 * per item, which of them the customer chooses one of and which come as extra pumps. Until the list is first edited
 * it is every flavour the menu already uses. Saved with the branch's settings, like Tools.
 */
export function Flavours() {
  const s = useS()
  const data = useStaff()
  useMenuVersion()
  const list = flavourList()
  const [fresh, setFresh] = useState('')
  const [sure, setSure] = useState('')
  const save = (next: FlavourDef[]) => update((st) => ({ settings: { ...st.settings, [st.branch]: { ...settingsFor(st.branch), flavours: next } } }))
  const edit = (id: string, p: Partial<FlavourDef>) => save(list.map((f) => (f.id === id ? { ...f, ...p } : f)))
  const usedBy = (id: string) => ALL_ITEMS.filter((i) => !i.hidden && ((i.flavors ?? []).includes(id) || optsOf(i).pumps.includes(id)))
  const add = () => {
    const n = fresh.trim().replace(/\s+/g, ' ').slice(0, 30)
    if (!n || list.some((f) => f.id.toLowerCase() === n.toLowerCase() || f.name.en.toLowerCase() === n.toLowerCase())) return
    save([...list, { id: n, name: { en: n, ar: '', ku: '' } }])
    setFresh('')
  }
  // a removed flavour also leaves the items that offered it
  const remove = (id: string) => {
    if (sure !== id) { setSure(id); return }
    for (const i of usedBy(id)) {
      const o = optsOf(i)
      saveItem(i.name, {
        ...((i.flavors ?? []).includes(id) && { flavors: (i.flavors ?? []).filter((x) => x !== id) }),
        ...(o.pumps.includes(id) && { opts: { ...o, pumps: o.pumps.filter((x) => x !== id) } }),
      })
    }
    save(list.filter((f) => f.id !== id))
    setSure('')
  }
  return (
    <div className="d-narrow">
      <p className="d-lead">{s('flavoursLead', { branch: branchName(data.branch) })}</p>
      <Card title={s('navFlavours')} sub={s('flavoursSub')}>
        {!list.length && <p className="d-hint">{s('flavoursEmpty')}</p>}
        <ul className="d-flavour-list">
          {list.map((f) => {
            const n = usedBy(f.id).length
            return (
              <li key={f.id} className={f.out ? 'out' : ''}>
                <div className="d-flavour-names">
                  <label><span>English</span><input value={f.name.en} maxLength={30} dir="ltr" onChange={(e) => edit(f.id, { name: { ...f.name, en: e.target.value } })} /></label>
                  <label><span>العربية</span><input value={f.name.ar} maxLength={30} dir="rtl" placeholder={f.name.en} onChange={(e) => edit(f.id, { name: { ...f.name, ar: e.target.value } })} /></label>
                  <label><span>کوردی</span><input value={f.name.ku} maxLength={30} dir="rtl" placeholder={f.name.en} onChange={(e) => edit(f.id, { name: { ...f.name, ku: e.target.value } })} /></label>
                </div>
                <div className="d-flavour-side">
                  <Switch on={!f.out} onChange={(v) => edit(f.id, { out: !v })} label={s('flavourInStock')} />
                  <small>{f.out ? s('outOfStock') : s('flavourIn')} · {s('flavourUsedBy', { n })}</small>
                  <button type="button" className={'d-btn text small danger' + (sure === f.id ? ' sure' : '')} onBlur={() => setSure('')} onClick={() => remove(f.id)}>
                    <I.trash />{sure === f.id ? (n ? s('flavourRemoveUsed', { n }) : s('deleteSure')) : s('remove')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="d-flavour-add">
          <input value={fresh} maxLength={30} placeholder={s('flavourNew')} aria-label={s('flavourNew')} onChange={(e) => setFresh(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button type="button" className="d-btn solid small" disabled={!fresh.trim()} onClick={add}><I.plus />{s('flavourAddBtn')}</button>
        </div>
        <p className="d-hint">{s('flavoursHint2')}</p>
      </Card>
    </div>
  )
}
