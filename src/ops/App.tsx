import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ops, keeps, ROLE } from './client'
import type { Material, Staff, Supplier, Unit } from './client'

/*
 * Mars Ops, week 1 (owner, 2026-11-04: "Approve, start"; HANDOFF decision 246): sign in, then raw materials and suppliers.
 * Purchases, stock, invoices to branches, the POS and Master come in the next weeks. English only for now.
 * Staff accounts are made in Supabase (Authentication → Users) and given a role in public.staff; a signed-in person with
 * no active staff row sees only "not set up".
 */
const iqd = (n: number) => Math.round(n).toLocaleString('en-US')
const UNIT: Record<Unit, string> = { g: 'grams', ml: 'millilitres', pc: 'pieces' }
const num = (v: string) => { const n = Number(v.replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0 }

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<Staff | null | undefined>(undefined)
  useEffect(() => {
    void ops.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = ops.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) { setMe(session === null ? null : undefined); return }
    void ops.from('staff').select('user_id,name,role,branch_id,active').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => setMe(data && data.active ? (data as Staff) : null))
  }, [session])

  if (session === undefined) return <p className="ops-wait">Loading…</p>
  if (!session) return <SignIn />
  if (me === undefined) return <p className="ops-wait">Loading…</p>
  if (!me) return (
    <div className="ops-center">
      <div className="ops-card">
        <h1>Not set up yet</h1>
        <p>You are signed in as {session.user.email}, but this account has no role in Mars Ops yet. Ask the owner.</p>
        <button type="button" className="ops-btn" onClick={() => void ops.auth.signOut()}>Sign out</button>
      </div>
    </div>
  )
  return <Shell me={me} email={session.user.email ?? ''} />
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await ops.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setErr('Wrong email or password.')
  }
  return (
    <div className="ops-center">
      <form className="ops-card" onSubmit={(e) => void go(e)}>
        <h1>Mars Ops</h1>
        <p className="ops-muted">Warehouse, POS and reports</p>
        <label className="ops-field"><span>Email</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="ops-field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <p className="ops-bad" role="alert">{err}</p>}
        <button type="submit" className="ops-btn solid" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}

type Tab = 'materials' | 'suppliers'
function Shell({ me, email }: { me: Staff; email: string }) {
  const [tab, setTab] = useState<Tab>('materials')
  return (
    <div className="ops-app">
      <header className="ops-top">
        <b>Mars Ops</b>
        <nav>
          <button type="button" className={tab === 'materials' ? 'on' : ''} onClick={() => setTab('materials')}>Materials</button>
          <button type="button" className={tab === 'suppliers' ? 'on' : ''} onClick={() => setTab('suppliers')}>Suppliers</button>
        </nav>
        <span className="ops-me">{me.name} · {ROLE[me.role]}{me.branch_id ? ` · ${me.branch_id}` : ''}</span>
        <button type="button" className="ops-link" title={email} onClick={() => void ops.auth.signOut()}>Sign out</button>
      </header>
      <main className="ops-main">{tab === 'materials' ? <Materials me={me} /> : <Suppliers me={me} />}</main>
    </div>
  )
}

/* ---- raw materials ---- */
const blankMaterial = { name: '', unit: 'g' as Unit, pack_name: '', pack_size: '', cost: '', min_stock: '' }
function Materials({ me }: { me: Staff }) {
  const [rows, setRows] = useState<Material[] | null>(null)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Material | 'new' | null>(null)
  const load = () => void ops.from('materials').select('*').order('name').then(({ data }) => setRows((data ?? []) as Material[]))
  useEffect(load, [])
  const shown = useMemo(() => (rows ?? []).filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase())), [rows, q])
  return (
    <section>
      <div className="ops-bar">
        <h2>Raw materials</h2>
        <input className="ops-search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        {keeps(me.role) && <button type="button" className="ops-btn solid" onClick={() => setEdit('new')}>Add material</button>}
      </div>
      {rows === null ? <p className="ops-muted">Loading…</p> : !shown.length ? <p className="ops-muted">{rows.length ? 'Nothing matches.' : 'No materials yet.'}</p> : (
        <table className="ops-table">
          <thead><tr><th>Name</th><th>Unit</th><th>Bought as</th><th className="r">Cost per unit</th><th className="r">Warn below</th><th /></tr></thead>
          <tbody>{shown.map((m) => (
            <tr key={m.id} className={m.active ? '' : 'off'}>
              <td>{m.name}{!m.active && ' (off)'}</td><td>{m.unit}</td>
              <td>{m.pack_name && m.pack_size ? `${m.pack_name} of ${iqd(m.pack_size)} ${m.unit}` : '-'}</td>
              <td className="r">{Number(m.cost).toLocaleString('en-US', { maximumFractionDigits: 2 })} IQD</td>
              <td className="r">{iqd(m.min_stock)} {m.unit}</td>
              <td className="r">{keeps(me.role) && <button type="button" className="ops-link" onClick={() => setEdit(m)}>Edit</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {edit && <MaterialForm m={edit === 'new' ? null : edit} onClose={(saved) => { setEdit(null); if (saved) load() }} />}
    </section>
  )
}

function MaterialForm({ m, onClose }: { m: Material | null; onClose: (saved: boolean) => void }) {
  const [f, setF] = useState(m ? { name: m.name, unit: m.unit, pack_name: m.pack_name ?? '', pack_size: m.pack_size ? String(m.pack_size) : '', cost: String(m.cost), min_stock: String(m.min_stock) } : blankMaterial)
  const [active, setActive] = useState(m?.active ?? true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p })
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) { setErr('A name is needed.'); return }
    setBusy(true); setErr('')
    const row = { name: f.name.trim(), unit: f.unit, pack_name: f.pack_name.trim() || null, pack_size: num(f.pack_size) || null, cost: num(f.cost), min_stock: num(f.min_stock), active }
    const { error } = m ? await ops.from('materials').update(row).eq('id', m.id) : await ops.from('materials').insert(row)
    setBusy(false)
    if (error) { setErr(error.code === '23505' ? 'A material with this name already exists.' : 'Could not save. Try again.'); return }
    onClose(true)
  }
  return (
    <div className="ops-modal" role="dialog" aria-modal="true">
      <form className="ops-card" onSubmit={(e) => void save(e)}>
        <h2>{m ? 'Edit material' : 'New material'}</h2>
        <label className="ops-field"><span>Name</span><input value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} autoFocus /></label>
        <label className="ops-field"><span>Counted in</span>
          <select value={f.unit} onChange={(e) => set({ unit: e.target.value as Unit })}>{(Object.keys(UNIT) as Unit[]).map((u) => <option key={u} value={u}>{UNIT[u]} ({u})</option>)}</select>
        </label>
        <div className="ops-two">
          <label className="ops-field"><span>Bought as (e.g. bag)</span><input value={f.pack_name} onChange={(e) => set({ pack_name: e.target.value })} maxLength={40} /></label>
          <label className="ops-field"><span>{f.unit} in one</span><input inputMode="decimal" dir="ltr" value={f.pack_size} onChange={(e) => set({ pack_size: e.target.value })} placeholder="1000" /></label>
        </div>
        <div className="ops-two">
          <label className="ops-field"><span>Cost per {f.unit} (IQD)</span><input inputMode="decimal" dir="ltr" value={f.cost} onChange={(e) => set({ cost: e.target.value })} placeholder="12.5" /></label>
          <label className="ops-field"><span>Warn below ({f.unit})</span><input inputMode="decimal" dir="ltr" value={f.min_stock} onChange={(e) => set({ min_stock: e.target.value })} placeholder="5000" /></label>
        </div>
        {m && <label className="ops-check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use</label>}
        {err && <p className="ops-bad" role="alert">{err}</p>}
        <div className="ops-actions">
          <button type="button" className="ops-btn" onClick={() => onClose(false)}>Cancel</button>
          <button type="submit" className="ops-btn solid" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

/* ---- suppliers ---- */
function Suppliers({ me }: { me: Staff }) {
  const [rows, setRows] = useState<Supplier[] | null>(null)
  const [edit, setEdit] = useState<Supplier | 'new' | null>(null)
  const load = () => void ops.from('suppliers').select('*').order('name').then(({ data }) => setRows((data ?? []) as Supplier[]))
  useEffect(load, [])
  return (
    <section>
      <div className="ops-bar">
        <h2>Suppliers</h2>
        {keeps(me.role) && <button type="button" className="ops-btn solid" onClick={() => setEdit('new')}>Add supplier</button>}
      </div>
      {rows === null ? <p className="ops-muted">Loading…</p> : !rows.length ? <p className="ops-muted">No suppliers yet.</p> : (
        <table className="ops-table">
          <thead><tr><th>Name</th><th>Phone</th><th>Notes</th><th /></tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id} className={s.active ? '' : 'off'}>
              <td>{s.name}{!s.active && ' (off)'}</td><td dir="ltr">{s.phone ?? '-'}</td><td>{s.notes ?? ''}</td>
              <td className="r">{keeps(me.role) && <button type="button" className="ops-link" onClick={() => setEdit(s)}>Edit</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {edit && <SupplierForm s={edit === 'new' ? null : edit} onClose={(saved) => { setEdit(null); if (saved) load() }} />}
    </section>
  )
}

function SupplierForm({ s, onClose }: { s: Supplier | null; onClose: (saved: boolean) => void }) {
  const [name, setName] = useState(s?.name ?? '')
  const [phone, setPhone] = useState(s?.phone ?? '')
  const [notes, setNotes] = useState(s?.notes ?? '')
  const [active, setActive] = useState(s?.active ?? true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setErr('A name is needed.'); return }
    setBusy(true); setErr('')
    const row = { name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null, active }
    const { error } = s ? await ops.from('suppliers').update(row).eq('id', s.id) : await ops.from('suppliers').insert(row)
    setBusy(false)
    if (error) { setErr(error.code === '23505' ? 'A supplier with this name already exists.' : 'Could not save. Try again.'); return }
    onClose(true)
  }
  return (
    <div className="ops-modal" role="dialog" aria-modal="true">
      <form className="ops-card" onSubmit={(e) => void save(e)}>
        <h2>{s ? 'Edit supplier' : 'New supplier'}</h2>
        <label className="ops-field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus /></label>
        <label className="ops-field"><span>Phone</span><input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} /></label>
        <label className="ops-field"><span>Notes</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={400} /></label>
        {s && <label className="ops-check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use</label>}
        {err && <p className="ops-bad" role="alert">{err}</p>}
        <div className="ops-actions">
          <button type="button" className="ops-btn" onClick={() => onClose(false)}>Cancel</button>
          <button type="submit" className="ops-btn solid" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
