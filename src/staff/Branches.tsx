import { useState } from 'react'
import { LANGS } from '../i18n'
import { backendOn } from '../backend'
import { addBranch, menuSaveFailed, saveBranch, useMenuVersion } from '../menuAdmin'
import { BRANCHES } from './store'
import type { Branch, L3 } from './store'
import { useS } from './strings'
import { Card, Field, I, Switch } from './ui'

/*
 * Branches (owner, 2026-10-14: "Add Branch" in the dashboard). Only a sign-in for every branch (the owner's) sees
 * this page. A branch has its names in three languages and a switch for whether customers can choose it. A new
 * branch starts as a copy of another branch's menu and hidden, so it can be checked before customers see it.
 * Its own staff sign-in is still made in Supabase.
 */
const clean = (v: string) => v.trim().replace(/\s+/g, ' ')

function BranchRow({ b, last }: { b: Branch; last: boolean }) {
  const s = useS()
  const [names, setNames] = useState<L3>(b.names)
  const [open, setOpen] = useState(false)
  const [warn, setWarn] = useState(false)
  const save = () => { if (!clean(names.en)) return; saveBranch(b.id, { names: { en: clean(names.en), ar: clean(names.ar), ku: clean(names.ku) } }); setOpen(false) }
  return (
    <li className="d-row-card">
      <div className="d-branch-row">
        <span className="d-thumb" style={{ width: 40, height: 40 }}><I.store /></span>
        <div className="sm-name"><b>{b.name}</b><small dir="ltr">{b.id}</small></div>
        <div className="sm-stock">
          <span>{b.active ? s('branchShown') : s('branchHidden')}</span>
          <Switch on={b.active} label={`${b.name}: ${s('branchShown')}`} onChange={(v) => { if (!v && last) { setWarn(true); return } setWarn(false); saveBranch(b.id, { active: v }) }} />
        </div>
        <button type="button" className="d-icon-btn" aria-expanded={open} aria-label={`${s('edit')} ${b.name}`} onClick={() => setOpen(!open)}><I.edit /></button>
      </div>
      {warn && <p className="d-error" role="alert">{s('lastBranch')}</p>}
      {open && (
        <div className="d-form">
          <div className="d-form-row">
            {LANGS.map(({ code, label }) => (
              <Field key={code} label={s('nameIn', { lang: label })}>
                <input value={names[code]} maxLength={40} dir={code === 'en' ? 'ltr' : 'rtl'} onChange={(e) => setNames({ ...names, [code]: e.target.value })} />
              </Field>
            ))}
          </div>
          <div><button type="button" className="d-btn solid small" onClick={save}><I.save />{s('save')}</button></div>
        </div>
      )}
    </li>
  )
}

export function Branches() {
  const s = useS()
  useMenuVersion()
  const [names, setNames] = useState<L3>({ en: '', ar: '', ku: '' })
  const [from, setFrom] = useState(BRANCHES[0].id)
  const [state, setState] = useState<'' | 'busy' | 'nameNeeded' | 'branchExists' | 'branchFailed' | 'menuNotReady' | 'branchAdded'>('')
  const shown = BRANCHES.filter((b) => b.active).length
  const add = async () => {
    const en = clean(names.en)
    if (!en) { setState('nameNeeded'); return }
    setState('busy')
    const res = await addBranch({ en, ar: clean(names.ar), ku: clean(names.ku) }, from)
    setState(res === 'ok' ? 'branchAdded' : res === 'exists' ? 'branchExists' : res === 'offline' ? 'menuNotReady' : 'branchFailed')
    if (res === 'ok') setNames({ en: '', ar: '', ku: '' })
  }
  return (
    <>
      {menuSaveFailed() && <p className="d-error" role="alert">{s('branchFailed')}</p>}
      <p className="d-lead">{s('branchesLead')}</p>
      <ul className="d-list">{BRANCHES.map((b) => <BranchRow key={b.id + JSON.stringify(b.names)} b={b} last={b.active && shown === 1} />)}</ul>
      <Card title={s('addBranch')} icon={<I.plus />}>
        <div className="d-form">
          {state && state !== 'busy' && <p className={state === 'branchAdded' ? 'd-hint' : 'd-error'} role="status">{s(state)}</p>}
          <div className="d-form-row">
            {LANGS.map(({ code, label }) => (
              <Field key={code} label={s('nameIn', { lang: label })}>
                <input value={names[code]} maxLength={40} dir={code === 'en' ? 'ltr' : 'rtl'} onChange={(e) => { setState(''); setNames({ ...names, [code]: e.target.value }) }} />
              </Field>
            ))}
          </div>
          <div className="d-form-row">
            <Field label={s('copyMenuFrom')}>
              <select value={from} onChange={(e) => setFrom(e.target.value)}>{BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </Field>
          </div>
          <div><button type="button" className="d-btn solid" disabled={state === 'busy'} onClick={() => void add()}><I.plus />{state === 'busy' ? s('branchBusy') : s('addBranch')}</button></div>
          <p className="d-hint">{s(backendOn ? 'branchNewHint' : 'branchNewHintDemo')}</p>
        </div>
      </Card>
    </>
  )
}
