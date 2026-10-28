import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LANGS, useLang } from '../i18n'
import type { Lang } from '../i18n'
import { useAllOrders } from '../account'
import { LEAD_MIN, isActive, isLater, useNow } from '../orders'
import { Logo } from '../components/Header'
import { catLabel } from '../components/MenuSection'
import { chime, unlockAudio } from '../chime'
import { categoryOf } from '../menuMeta'
import { branchCats, nameOf, useMenuVersion } from '../menuAdmin'
import { Analytics } from './Analytics'
import { Deliveries } from './Deliveries'
import { Category, ItemEditor, NewCategory, NewItem } from './Catalog'
import { Branches } from './Branches'
import { Events } from './Events'
import { Offers } from './Offers'
import { Orders, useReceiptText } from './Orders'
import { printReceipt } from './receipt'
import { Overview } from './Overview'
import { Tools } from './Tools'
import { WaLog } from './WaLog'
import { Flavours } from './Flavours'
import { Warehouse } from './Warehouse'
import { backendOn } from '../backend'
import { staffSignIn, staffSignOut, useRemote, wakeRemote } from './remote'
import { BRANCHES, branchName, settingsFor, update, useStaff } from './store'
import type { BranchId } from './store'
import { useS } from './strings'
import type { SKey } from './strings'
import { I } from './ui'
import './staff.css'

/*
 * Staff dashboard (#staff), rebuilt on 2026-10-12 after the live Mars admin panel (owner's screenshots): a side menu
 * with the branch on top, then Dashboard, Orders, Analytics, Events, Offers, Warehouse, the menu by category
 * (Drinks, Food) and Tools. Orders keeps the order tracking: the buttons that move each order through the stages the
 * customer sees. DEMO: a PIN gate (1234) and everything stored in this browser.
 */
const PIN = '1234'
const DEMO_USER = 'demo' // the demo build only (no backend, nothing real behind it): username demo, password 1234
const RING_EVERY = 4000 // ms between chimes while an order waits as Request received (the chime itself lasts ~1.5 s)
const MAIN: { id: string; key: SKey; icon: () => ReactNode }[] = [
  { id: 'dashboard', key: 'navDashboard', icon: I.dashboard },
  { id: 'orders', key: 'navOrders', icon: I.orders },
  { id: 'analytics', key: 'navAnalytics', icon: I.analytics },
  { id: 'deliveries', key: 'navDeliveries', icon: I.bike }, // what each delivery company owes Mars and keeps (2026-10-28)
  { id: 'events', key: 'navEvents', icon: I.events },
  { id: 'offers', key: 'navOffers', icon: I.offers },
  { id: 'warehouse', key: 'navWarehouse', icon: I.warehouse },
]
const read = (k: string, fallback: string) => { try { return sessionStorage.getItem(k) ?? fallback } catch { return fallback } }

export function StaffScreen() {
  const { t, lang, setLang } = useLang()
  const s = useS()
  const data = useStaff()
  useMenuVersion() // staff may add a category
  // with the shared backend on, staff sign in with an email and password and the orders are the database's;
  // without it, the demo PIN and this browser's own orders
  const remote = useRemote()
  const [pinOk, setOk] = useState(() => read('mars-staff', '') === '1')
  const ok = backendOn ? !!remote.staff : pinOk
  const [pin, setPin] = useState('')
  const [user, setUser] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [signErr, setSignErr] = useState<'' | 'bad' | 'notstaff' | 'error'>('')
  const [err, setErr] = useState(false)
  useEffect(() => wakeRemote(), [])
  // a cashier belongs to one branch: the dashboard shows that branch
  const fixedBranch = backendOn ? remote.staff?.branch ?? null : null
  // the owner's sign-in is for every branch: it may switch between them and add one (the demo's PIN counts as the owner)
  const owner = backendOn ? !!remote.staff && remote.staff.branch === null : true
  useEffect(() => { if (fixedBranch && fixedBranch !== data.branch) update(() => ({ branch: fixedBranch as BranchId })) }, [fixedBranch, data.branch])
  // a barista's sign-in has the Dashboard and the Orders only; a manager (and the owner) everything (owner, 2026-10-22)
  const barista = backendOn && remote.staff?.role === 'barista'
  const BARISTA_PAGES = ['dashboard', 'orders']
  const [page, setPage] = useState(() => read('mars-staff-page', 'dashboard'))
  const [mini, setMini] = useState(false) // the side menu folded to its icons (desktop)
  const [drawer, setDrawer] = useState(false) // the side menu slid in (phones)
  const [openDrinks, setOpenDrinks] = useState(true)
  const [openFood, setOpenFood] = useState(true)
  const local = useAllOrders()
  const all = backendOn ? remote.orders : local
  const orders = all.filter((o) => (o.branch ?? BRANCHES[0].id) === data.branch)
  const now = useNow(15000)
  const lead = settingsFor(data.branch).lead ?? LEAD_MIN
  const active = orders.filter((o) => isActive(o) && !isLater(o, now, lead)).length // the menu badge: what to make now
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('mars-staff-sound') !== '0' } catch { return true } })
  const toggleSound = () => {
    const on = !sound
    setSound(on)
    try { localStorage.setItem('mars-staff-sound', on ? '1' : '0') } catch { /* ignore */ }
    if (on) chime() // also unlocks audio on this tap
  }
  // Auto-print (owner, 2026-10-23): this device prints the receipt of each new order of its branch as it arrives
  const [autoPrint, setAutoPrint] = useState(() => { try { return localStorage.getItem('mars-staff-autoprint') === '1' } catch { return false } })
  const toggleAutoPrint = () => {
    const on = !autoPrint
    setAutoPrint(on)
    try { localStorage.setItem('mars-staff-autoprint', on ? '1' : '0') } catch { /* ignore */ }
  }
  const receipt = useReceiptText()
  // a chime when an order id shows up that was not there before (not on the first render), and its receipt if asked
  const known = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = new Set(all.map((o) => o.uid ?? o.id))
    const fresh = known.current ? all.filter((o) => !known.current!.has(o.uid ?? o.id)) : []
    if (ok && sound && fresh.length) chime()
    if (ok && autoPrint) fresh.filter((o) => (o.branch ?? BRANCHES[0].id) === data.branch && isActive(o)).forEach((o) => { void printReceipt(o, receipt(o)) })
    known.current = ids
  }, [all, ok, sound]) // eslint-disable-line react-hooks/exhaustive-deps
  // a chime when a customer's location arrives on WhatsApp after "Ask for location" (2026-10-28)
  const waPins = all.filter((o) => o.locationFrom === 'wa' && o.delivery?.location).map((o) => `${o.uid ?? o.id}:${o.delivery!.location!.lat},${o.delivery!.location!.lng}`).join('|')
  const knownWaPins = useRef<string | null>(null)
  useEffect(() => {
    const before = knownWaPins.current
    if (before !== null && ok && sound && waPins.split('|').some((p) => p && !before.split('|').includes(p))) chime()
    knownWaPins.current = waPins
  }, [waPins]) // eslint-disable-line react-hooks/exhaustive-deps
  // and a chime when an order waiting under Later comes due (its time within `lead` minutes) and moves to Active
  const laterKey = orders.filter((o) => isLater(o, now, lead)).map((o) => o.uid ?? o.id).join(',')
  const wasLater = useRef<string[] | null>(null)
  useEffect(() => {
    const cur = laterKey ? laterKey.split(',') : []
    const due = (wasLater.current ?? []).some((id) => !cur.includes(id) && orders.some((o) => (o.uid ?? o.id) === id && isActive(o) && (o.status ?? 'received') === 'received'))
    if (wasLater.current && ok && sound && due) chime()
    wasLater.current = cur
  }, [laterKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // the chime keeps ringing while an order of this branch waits as Request received, until staff mark it Preparing
  // (or cancel it) (owner, 2026-10-25); orders under Later wait quietly until they come due; Sound off silences it
  const ringing = orders.filter((o) => isActive(o) && (o.status ?? 'received') === 'received' && !isLater(o, now, lead)).map((o) => o.uid ?? o.id).join(',')
  useEffect(() => {
    if (!ok || !sound || !ringing) return
    const id = window.setInterval(() => chime(), RING_EVERY)
    return () => window.clearInterval(id)
  }, [ringing, ok, sound])
  const go = (p: string) => {
    setPage(p)
    setDrawer(false)
    try { sessionStorage.setItem('mars-staff-page', p) } catch { /* ignore */ }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const enter = (e: FormEvent) => {
    e.preventDefault()
    unlockAudio()
    if (pin === PIN && user.trim().toLowerCase() === DEMO_USER) { setOk(true); try { sessionStorage.setItem('mars-staff', '1') } catch { /* ignore */ } } else setErr(true)
  }
  const leave = () => { if (backendOn) { void staffSignOut(); setPassword(''); return } setOk(false); setPin(''); setUser(''); try { sessionStorage.removeItem('mars-staff') } catch { /* ignore */ } }
  const signIn = async (e: FormEvent) => {
    e.preventDefault()
    unlockAudio()
    setBusy(true); setSignErr('')
    const res = await staffSignIn(email, password)
    setBusy(false)
    if (res === 'ok') setPassword('')
    else setSignErr(res)
  }

  const langSelect = (
    <select className="d-lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('language')}>
      {LANGS.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
    </select>
  )
  if (!ok) {
    return (
      <div className="dash dash-gate">
        <a href="#top" className="d-brand"><Logo /></a>
        {backendOn ? (
          <form className="staff-gate sign" onSubmit={signIn}>
            <label htmlFor="staff-email">{s('staffEmailOrUser')}</label>
            <input id="staff-email" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setSignErr('') }} dir="ltr" required />
            <label htmlFor="staff-password">{s('staffPassword')}</label>
            <input id="staff-password" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setSignErr('') }} dir="ltr" required />
            <button type="submit" className="d-btn solid" disabled={busy || !remote.ready}>{busy || !remote.ready ? s('staffChecking') : s('staffSignIn')}</button>
            <p className={'staff-hint' + (signErr ? ' err' : '')}>{signErr === 'bad' ? s('staffBadLogin') : signErr === 'notstaff' ? s('staffNotStaff') : signErr === 'error' ? s('staffConnErr') : s('staffSignHint')}</p>
          </form>
        ) : (
          <form className="staff-gate" onSubmit={enter}>
            <label htmlFor="staff-user">{s('staffUsername')}</label>
            <input id="staff-user" autoComplete="username" autoCapitalize="none" value={user} onChange={(e) => { setUser(e.target.value); setErr(false) }} dir="ltr" />
            <label htmlFor="staff-pin">{s('staffPassword')}</label>
            <input id="staff-pin" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => { setPin(e.target.value); setErr(false) }} dir="ltr" />
            <button type="submit" className="d-btn solid">{t('staffEnter')}</button>
            <p className={'staff-hint' + (err ? ' err' : '')}>{err ? t('staffWrongPin') : t('staffPinHint')}</p>
          </form>
        )}
        {langSelect}
      </div>
    )
  }

  const kind = barista && !BARISTA_PAGES.includes(page) ? 'orders' : page.startsWith('cat:') ? 'cat' : page.startsWith('item:') ? 'item' : page.startsWith('new:') ? 'new' : page.startsWith('newcat:') ? 'newcat' : page.startsWith('editcat:') ? 'editcat' : page
  const DRINK_CATS = branchCats('drink')
  const FOOD_CATS = branchCats('food')
  const asked = page.slice(page.indexOf(':') + 1)
  // a category the other branch added is not this branch's: show them all instead
  const arg = (kind === 'cat' || kind === 'new' || kind === 'editcat') && asked !== 'all' && !DRINK_CATS.includes(asked) && !FOOD_CATS.includes(asked) ? 'all' : asked
  const catId = kind === 'cat' || kind === 'new' || kind === 'editcat' ? arg : kind === 'item' ? categoryOf(arg) : ''
  const catName = (id: string) => (id === 'all' ? s('allCategories') : catLabel(id, lang))
  const group = FOOD_CATS.includes(catId) || page === 'newcat:food' ? s('navFood') : s('navDrinks')
  const title = kind === 'cat' ? catName(arg) : kind === 'item' ? s('editItem') : kind === 'new' ? s('addItem') : kind === 'newcat' ? s('addCategory') : kind === 'editcat' ? s('renameCategory') : kind === 'tools' ? s('navTools') : kind === 'walog' ? s('navWaLog') : kind === 'flavours' ? s('navFlavours') : kind === 'branches' ? s('navBranches') : s(MAIN.find((m) => m.id === kind)?.key ?? 'navDashboard')
  const catLink = (id: string) => (
    <button key={id} type="button" className={'d-nav-sub' + (catId === id && kind === 'cat' ? ' on' : catId === id ? ' near' : '')} onClick={() => go('cat:' + id)} title={catName(id)}>
      {id === 'all' && <I.dashboard />}<span>{catName(id)}</span>
    </button>
  )
  const addCat = (k: 'drink' | 'food') => (
    <button type="button" className={'d-nav-sub add' + (page === 'newcat:' + k ? ' on' : '')} onClick={() => go('newcat:' + k)} title={s('addCategory')}>
      <I.plus /><span>{s('addCategory')}</span>
    </button>
  )

  return (
    <div className={'dash' + (mini ? ' mini' : '') + (drawer ? ' drawer' : '')}>
      <aside className="d-side" aria-label={s('menu')}>
        <div className="d-side-top">
          <a href="#top" className="d-brand" title={s('toSite')}><Logo /></a>
          <button type="button" className="d-icon-btn d-fold" aria-label={s('foldMenu')} aria-expanded={!mini} onClick={() => (drawer ? setDrawer(false) : setMini(!mini))}><I.chevron dir={mini ? 'end' : 'start'} /></button>
        </div>
        <label className="d-branch">
          <I.store />
          <span className="sr-only">{t('branch')}</span>
          <select value={data.branch} disabled={!!fixedBranch} onChange={(e) => update(() => ({ branch: e.target.value as BranchId }))}>
            {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}{b.active ? '' : ` · ${s('branchHidden')}`}</option>)}
          </select>
        </label>
        <nav className="d-nav">
          {MAIN.filter((m) => !barista || BARISTA_PAGES.includes(m.id)).map((m) => (
            <button key={m.id} type="button" className={kind === m.id ? 'on' : ''} aria-current={kind === m.id ? 'page' : undefined} onClick={() => go(m.id)} title={s(m.key)}>
              <m.icon /><span>{s(m.key)}</span>{m.id === 'orders' && active > 0 && <b className="d-count">{active}</b>}
            </button>
          ))}
          {!barista && <>
          <hr />
          <button type="button" className={DRINK_CATS.includes(catId) || catId === 'all' ? 'near' : ''} aria-expanded={openDrinks} onClick={() => (mini ? go('cat:all') : setOpenDrinks(!openDrinks))} title={s('navDrinks')}>
            <I.drinks /><span>{s('navDrinks')}</span><I.chevron dir={openDrinks ? 'up' : 'down'} />
          </button>
          {openDrinks && !mini && <>{catLink('all')}{DRINK_CATS.map(catLink)}{addCat('drink')}</>}
          <button type="button" className={FOOD_CATS.includes(catId) ? 'near' : ''} aria-expanded={openFood} onClick={() => (mini ? go('cat:' + FOOD_CATS[0]) : setOpenFood(!openFood))} title={s('navFood')}>
            <I.food /><span>{s('navFood')}</span><I.chevron dir={openFood ? 'up' : 'down'} />
          </button>
          {openFood && !mini && <>{FOOD_CATS.map(catLink)}{addCat('food')}</>}
          <hr />
          {owner && (
            <button type="button" className={kind === 'branches' ? 'on' : ''} aria-current={kind === 'branches' ? 'page' : undefined} onClick={() => go('branches')} title={s('navBranches')}>
              <I.store /><span>{s('navBranches')}</span>
            </button>
          )}
          <button type="button" className={kind === 'flavours' ? 'on' : ''} aria-current={kind === 'flavours' ? 'page' : undefined} onClick={() => go('flavours')} title={s('navFlavours')}>
            <I.drinks /><span>{s('navFlavours')}</span>
          </button>
          <button type="button" className={kind === 'tools' ? 'on' : ''} aria-current={kind === 'tools' ? 'page' : undefined} onClick={() => go('tools')} title={s('navTools')}>
            <I.tools /><span>{s('navTools')}</span>
          </button>
          <button type="button" className={kind === 'walog' ? 'on' : ''} aria-current={kind === 'walog' ? 'page' : undefined} onClick={() => go('walog')} title={s('navWaLog')}>
            <I.whatsapp /><span>{s('navWaLog')}</span>
          </button>
          </>}
        </nav>
        <div className="d-side-foot">
          {langSelect}
          <button type="button" className={'d-foot-btn' + (autoPrint ? ' on' : '')} aria-pressed={autoPrint} onClick={toggleAutoPrint} title={s('autoPrintHint')}><I.print /><span>{autoPrint ? s('autoPrintOn') : s('autoPrintOff')}</span></button>
          <button type="button" className={'d-foot-btn' + (sound ? ' on' : '')} aria-pressed={sound} onClick={toggleSound} title={sound ? t('soundOn') : t('soundOff')}><I.sound /><span>{sound ? t('soundOn') : t('soundOff')}</span></button>
          <button type="button" className="d-foot-btn" onClick={leave} title={t('staffLeave')}><I.exit /><span>{t('staffLeave')}</span></button>
        </div>
      </aside>
      {drawer && <div className="d-scrim" onClick={() => setDrawer(false)} />}

      {/* a div, not <main>: the customer site styles main[data-view] */}
      <div className="d-main" role="main">
        <header className="d-top">
          <button type="button" className="d-icon-btn d-burger" aria-label={s('menu')} onClick={() => setDrawer(true)}><I.menu /></button>
          <div>
            {(kind === 'cat' || kind === 'item' || kind === 'new' || kind === 'newcat' || kind === 'editcat') && (
              <p className="d-crumbs">
                <span>{group}</span>
                {kind === 'item' && <> / <button type="button" onClick={() => go('cat:' + catId)}>{catName(catId)}</button> / <span>{nameOf(arg, 'en')}</span></>}
                {(kind === 'new' || kind === 'editcat') && arg !== 'all' && <> / <button type="button" onClick={() => go('cat:' + catId)}>{catName(catId)}</button></>}
              </p>
            )}
            <h1>{title}<em className="d-pill navy">{branchName(data.branch)}</em><em className={'d-pill ' + (backendOn ? 'ok' : 'line')} title={backendOn ? remote.staff?.email : undefined}>{backendOn ? s('liveOn') : s('liveOff')}</em></h1>
            {backendOn && remote.error && <p className="d-error" role="alert">{s(remote.error === 'move' ? 'moveFailed' : 'staffConnErr')}</p>}
          </div>
        </header>
        {settingsFor(data.branch).paused && kind !== 'tools' && <p className="d-paused-banner" role="status"><button type="button" className="link-btn" onClick={() => go('tools')}>{s('pausedBanner')}</button></p>}
        {kind === 'orders' ? <Orders orders={orders} live={backendOn} />
          : kind === 'analytics' ? <Analytics orders={orders} key={data.branch} />
          : kind === 'deliveries' ? <Deliveries orders={orders} key={data.branch} />
            : kind === 'events' ? <Events />
              : kind === 'offers' ? <Offers />
                : kind === 'warehouse' ? <Warehouse />
                  : kind === 'tools' ? <Tools />
                  : kind === 'walog' ? <WaLog key={data.branch} />
                  : kind === 'flavours' ? <Flavours key={data.branch} />
                    : kind === 'branches' && owner ? <Branches />
                    : kind === 'cat' ? <Category id={arg} go={go} key={arg} />
                      : kind === 'item' ? <ItemEditor name={arg} go={go} key={arg + data.branch} />
                        : kind === 'new' ? <NewItem cat={arg} go={go} key={arg + data.branch} />
                          : kind === 'newcat' ? <NewCategory kind={arg === 'food' ? 'food' : 'drink'} go={go} key={arg} />
                            : kind === 'editcat' && arg !== 'all' ? <NewCategory kind="drink" edit={arg} go={go} key={'edit' + arg + data.branch} />
                        : <Overview orders={orders} go={go} readOnly={barista} />}
      </div>
    </div>
  )
}
