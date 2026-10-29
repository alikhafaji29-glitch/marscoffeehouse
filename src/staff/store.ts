import { useSyncExternalStore } from 'react'
import { ALL_ITEMS as ITEMS, ORDER_MENU, SEASON_PICKS } from '../menu'
import type { MenuItem } from '../menu'
import type { Lang } from '../i18n'
import { POSITIVE_HOURS } from '../components/useCountdown'
import { backendOn, getClient } from '../backend'

/*
 * Everything the staff dashboard sets apart from the menu itself (prices, stock, tags, descriptions, nutrition are
 * menuAdmin.ts): the branch, how orders reach the staff, events, offers and the warehouse. Modelled on the live Mars admin panel
 * (owner's screenshots, 2026-10-02). DEMO: one object in this browser (`mars-staff-data`); other tabs follow
 * through the `storage` event. The real version keeps the same shapes in backend tables.
 * The website follows: the branch list, Delivery / Pickup at checkout, the Positive Hours window and price,
 * and the New Season section (the active event).
 * Each branch's settings and offers also live in the database (`branch_config`, owner 2026-10-22: "each branch
 * unique"): staff changes are sent there, and every page reads them with the menu (menuAdmin.ts), so customers get
 * the branch's own Positive Hours, delivery / pickup and WhatsApp number. This device's copy is the cache.
 */
export type L3 = { en: string; ar: string; ku: string }
export const l3 = (en = '', ar = '', ku = ''): L3 => ({ en, ar, ku })

/** a branch: its id (also its folder and its key in every table), its names, and whether customers can choose it */
export interface Branch { id: string; name: string; names: L3; active: boolean; sort: number }
/** the branches. A live list: the owner adds branches in the dashboard and menuAdmin.ts rewrites this in place
 *  (from the database, or from this device in the demo), so read it when needed, do not copy it */
export const BRANCHES: Branch[] = [
  { id: 'erbil', name: 'Erbil', names: l3('Erbil', 'أربيل', 'هەولێر'), active: true, sort: 1 },
  { id: 'kirkuk', name: 'Kirkuk', names: l3('Kirkuk', 'كركوك', 'کەرکووک'), active: true, sort: 2 },
]
export type BranchId = string
export const branchName = (id?: string) => BRANCHES.find((b) => b.id === id)?.name ?? BRANCHES[0].name
/** a branch's name in the customer's language */
export const branchLabel = (id: string, lang: keyof L3) => { const b = BRANCHES.find((x) => x.id === id); return b?.names[lang] || b?.name || id }

/** Coffee of the day (owner, 2026-10-22): a Home slide; any of `items` at one price for its smallest size */
export interface Cotd { on: boolean; price: number; items: string[] }
export const COTD_DEFAULT: Cotd = { on: true, price: 3500, items: ['Americano', 'Espresso', 'Turkish Coffee', 'Filter Coffee'] } // 3,500 for now; the owner's order (2026-10-23)
export interface Driver { name: string; phone: string; lang?: Lang; share?: CourierShare } // lang: the WhatsApp message's language (owner, 2026-10-25); missing = the dashboard's
/** what a delivery company keeps of each delivered order (owner, 2026-10-28: "put it as an option"): a fixed amount, a
 *  percentage of what the customer paid, or the delivery fee on the order; the Deliveries report works it out */
// kind 'both' (owner, 2026-10-29: "a company may take a fixed amount + a percentage"): `value` IQD plus `pct` % of the order
export interface CourierShare { kind: 'fixed' | 'pct' | 'fee' | 'both'; value: number; pct?: number }
/** a flavour of the branch's list (Dashboard → Flavours, owner 2026-10-26): `id` is the English name it was made with and
 *  never changes (items and orders keep it); `name` is what customers see; `out` = out of stock, hidden on item pages */
export interface FlavourDef { id: string; name: L3; out?: boolean }
/** where a branch's shop is (owner, 2026-10-27; Kirkuk has two shops): where delivery routes start */
export interface Shop { name: string; lat: number; lng: number }
export interface Settings { reach: 'dashboard' | 'whatsapp'; whatsapp: string; delivery: boolean; pickup: boolean; lead?: number; cotd?: Cotd; drivers?: Driver[]; paused?: boolean; pauseMsg?: L3; flavours?: FlavourDef[]; phone?: string; shops?: Shop[] } // phone: the number customers call (owner, 2026-10-27; in the location-request WhatsApp message; also gets the 10-minute waiting-order alert, server: order-alert) // paused: no new orders, pauseMsg: the apology customers see (owner, 2026-10-26) // lead: minutes before a timed order's time that it moves from Later to Active (LEAD_MIN when missing)
export interface EventX { id: string; name: L3; theme: string; desc: L3; promo: L3; items: string[]; active: boolean }
// skip: items of the chosen categories left out of the step (owner, 2026-10-26: whole categories, then untick items)
export interface OfferGroup { id: string; label: L3; pick: number; mode: 'cats' | 'items'; cats: string[]; items: string[]; skip?: string[] }
export interface Offer {
  id: string; name: L3; slug: string; price: number; start: string; end: string // HH:MM, local time, daily
  freeDelivery: boolean; feeOn: boolean; fee: number; sizes: boolean; sub: L3; fine: L3; groups: OfferGroup[]; active: boolean
}
export interface Ingredient { id: string; name: string; unit: string; cost: number; stock: number; low: number }
export type Recipe = { ing: string; qty: number }[]
export const NUTRIENTS = ['energy', 'fat', 'satFat', 'carbs', 'sugar', 'fibre', 'protein', 'salt', 'caffeine'] as const
export type Nutrient = (typeof NUTRIENTS)[number]
export type Nutrition = Partial<Record<Nutrient, number>>

export interface StaffData {
  branch: BranchId // the branch the dashboard is looking at
  customerBranch: BranchId // the branch picked on the Order screen
  seasonSet?: number // 3 = the saved New Season list was moved to Pink + / Kakaw Crunch / Carrot Cake (2026-10-22)
  branchChosen?: boolean // the customer chose it (the first-visit question, a /kirkuk link, or the Order screen's list)
  settings: Record<BranchId, Settings> // a branch without an entry has NO_SETTINGS
  events: EventX[]
  offers: Record<BranchId, Offer[]> // per branch (owner, 2026-10-22); a branch without an entry has none
  ingredients: Ingredient[]
  recipes: Record<string, Recipe>
  visits: Record<string, Record<string, number>> // day (YYYY-MM-DD) → source → visits
}

export const THEMES = [
  { id: 'spring', name: 'Spring Bloom', color: '#e0336e' },
  { id: 'summer', name: 'Summer Sun', color: '#dc8638' },
  { id: 'autumn', name: 'Autumn Spice', color: '#935b25' },
  { id: 'winter', name: 'Winter Sky', color: '#4d97cf' },
]

const NO_SETTINGS: Settings = { reach: 'dashboard', whatsapp: '', delivery: true, pickup: true }
const KEY = 'mars-staff-data'
const SANDWICHES = ['Turkey Sandwich (Lightly Spiced)', 'Halloumi Sandwich', 'Caesar Sandwich'].filter((n) => ITEMS.some((i) => i.name === n))
const DRINK_CATS = ['coffeeMore', 'coffeeMilk', 'coldCoffee', 'matcha', 'mojito', 'refreshers']

const defaults = (): StaffData => ({
  branch: 'erbil',
  customerBranch: 'erbil',
  settings: {
    erbil: { reach: 'dashboard', whatsapp: '', delivery: true, pickup: true },
    kirkuk: { reach: 'dashboard', whatsapp: '', delivery: true, pickup: true },
  },
  events: [{
    id: 'season', name: l3('New Season', 'جديد الموسم', 'نوێی ئەم وەرزە'), theme: 'summer',
    desc: l3('The drinks of the season, for a short time.', 'مشروبات الموسم، لفترة محدودة.', 'خواردنەوەکانی ئەم وەرزە، بۆ ماوەیەکی کورت.'),
    promo: l3(), items: [...SEASON_PICKS], active: true,
  }],
  offers: Object.fromEntries(['erbil', 'kirkuk'].map((b) => [b, [positiveDefault()]])),
  ingredients: [],
  recipes: {},
  visits: {},
})
/** the Positive Hours offer a branch starts with, until staff change it */
const positiveDefault = (): Offer => ({
    id: 'positive', name: l3('Positive Hours', 'ساعات إيجابية', 'کاتژمێرە ئەرێنییەکان'), slug: 'positive-hours', price: 5500,
    start: '07:30', end: '12:00', freeDelivery: true, feeOn: false, fee: 1000, sizes: false,
    sub: l3('One sandwich + one drink, free delivery', 'ساندويتش واحد + مشروب واحد، مع توصيل مجاني', 'یەک ساندویچ + یەک خواردنەوە، بە گەیاندنی بەخۆڕایی'),
    fine: l3(), active: true,
    groups: [
      { id: 'g1', label: l3('Sandwich', 'ساندويتش', 'ساندویچ'), pick: 1, mode: 'items', cats: [], items: SANDWICHES },
      { id: 'g2', label: l3('Drink', 'مشروب', 'خواردنەوە'), pick: 1, mode: 'cats', cats: DRINK_CATS, items: [] },
    ],
})

function load(): StaffData {
  const d = defaults()
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<StaffData> | null
    if (raw && typeof raw === 'object') {
      // offers were one list for every branch until 2026-10-22: each branch starts from that list
      const offers = Array.isArray(raw.offers) ? Object.fromEntries(Object.keys(d.offers).map((b) => [b, raw.offers as unknown as Offer[]])) : { ...d.offers, ...raw.offers }
      // New Season became Pink + and Kakaw Crunch on 2026-10-22 (owner): a device's saved season list is replaced once
      const events = raw.seasonSet === 3 || !Array.isArray(raw.events) ? raw.events : raw.events.map((e) => e.id === 'season' ? { ...e, items: [...SEASON_PICKS] } : e)
      return { ...d, ...raw, events: events ?? d.events, seasonSet: 3, settings: { ...d.settings, ...raw.settings }, offers }
    }
  } catch { /* no storage or bad data: the defaults */ }
  return d
}

let state: StaffData = load()
let version = 0
const listeners = new Set<() => void>()
const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return { h: h || 0, m: m || 0 } }
const season = ORDER_MENU.find((c) => c.id === 'season')

/** writes the dashboard's choices onto what the website reads */
function apply() {
  const list = offersFor()
  const offer = list.find((o) => o.id === 'positive') ?? list[0]
  if (offer) { POSITIVE_HOURS[0] = hm(offer.start); POSITIVE_HOURS[1] = hm(offer.end) }
  refreshSeason()
  version++
  listeners.forEach((fn) => fn())
}
/** the New Season section = the active event's items (menuAdmin.ts asks again when staff add an item an event names) */
export function refreshSeason() {
  const ev = activeEvent()
  if (season) season.items = ev ? ev.items.map((n) => ITEMS.find((i) => i.name === n)).filter((x): x is MenuItem => !!x) : []
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ }
  apply()
}
apply()
// the old site's addresses (marscoffeehouse.com/erbil, /kirkuk) open that branch: the choice is made and the address
// becomes the site's own (owner, 2026-10-22)
if (typeof location !== 'undefined') {
  const path = location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
  const b = BRANCHES.find((x) => x.id === path && x.active)
  if (b) {
    state = { ...state, customerBranch: b.id, branchChosen: true }
    save()
    history.replaceState(null, '', '/' + location.search + location.hash)
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) { state = load(); apply() } })
}

/** the dashboard's data; re-renders the caller on every change */
export function useStaff(): StaffData {
  useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => version)
  return state
}
export const staffData = () => state
/** told after every change (menuAdmin.ts: the branch being looked at may have changed) */
export function subscribeStaff(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
export function update(fn: (s: StaffData) => Partial<StaffData>) {
  const before = state
  state = { ...state, ...fn(state) }
  save()
  // a branch's settings or offers changed here: send them to the database (only staff of that branch may)
  if (backendOn) for (const b of new Set([...Object.keys(before.settings), ...Object.keys(state.settings), ...Object.keys(before.offers), ...Object.keys(state.offers)])) {
    if (JSON.stringify(before.settings[b]) !== JSON.stringify(state.settings[b]) || JSON.stringify(before.offers[b]) !== JSON.stringify(state.offers[b])) sendConfig(b)
  }
}

/* ---- the branches' settings and offers in the database ---- */
const pending = new Map<BranchId, number>() // branch → timer of a change still to send; the database's copy waits
const toRow = (b: BranchId) => ({ branch: b, settings: state.settings[b] ?? NO_SETTINGS, offers: state.offers[b] ?? [] })
function sendConfig(b: BranchId) {
  clearTimeout(pending.get(b))
  pending.set(b, window.setTimeout(() => {
    void (async () => {
      const sb = await getClient()
      const { data } = (await sb?.auth.getSession()) ?? { data: null }
      if (!sb || !data?.session || data.session.user.is_anonymous) { pending.delete(b); return } // not staff: this device only
      const { error } = await sb.from('branch_config').upsert(toRow(b), { onConflict: 'branch' })
      if (error) console.warn('[backend] branch settings not saved:', error.message)
      pending.delete(b)
    })()
  }, 600))
}
let remoteBranches = new Set<BranchId>()
/** the database's settings and offers (read with the menu): they replace this device's copy, except a branch whose
 *  change from here is still on its way */
export function applyRemoteConfig(rows: { branch: BranchId; settings: Partial<Settings>; offers: Offer[] }[]) {
  remoteBranches = new Set(rows.map((r) => r.branch))
  const settings = { ...state.settings }
  const offers = { ...state.offers }
  for (const r of rows) {
    if (pending.has(r.branch)) continue
    settings[r.branch] = { ...NO_SETTINGS, ...r.settings }
    if (Array.isArray(r.offers)) offers[r.branch] = r.offers
  }
  if (JSON.stringify(settings) === JSON.stringify(state.settings) && JSON.stringify(offers) === JSON.stringify(state.offers)) return
  state = { ...state, settings, offers }
  save()
}
/** staff signed in: a branch they run that has no settings in the database yet gets this device's (the first time) */
export async function seedConfig(branch: BranchId | null) {
  const sb = await getClient()
  if (!sb) return
  const { data, error } = await sb.from('branch_config').select('branch')
  if (error) return
  const have = new Set((data as { branch: string }[]).map((r) => r.branch))
  remoteBranches = have
  const mine = branch ? [branch] : BRANCHES.map((b) => b.id)
  const missing = mine.filter((b) => !have.has(b))
  if (missing.length) {
    const { error: e } = await sb.from('branch_config').upsert(missing.map(toRow), { onConflict: 'branch', ignoreDuplicates: true })
    if (e) console.warn('[backend] branch settings not set up:', e.message)
  }
}
export const configInDatabase = (b: BranchId) => remoteBranches.has(b)
export const uid = () => Math.random().toString(36).slice(2, 9)

/* ---- what the website asks ---- */
export const customerBranch = () => state.customerBranch
export const setCustomerBranch = (b: BranchId) => update(() => ({ customerBranch: b, branchChosen: true }))
export const settingsFor = (b: BranchId = state.customerBranch): Settings => state.settings[b] ?? NO_SETTINGS
export const cotdFor = (b: BranchId = state.customerBranch): Cotd => settingsFor(b).cotd ?? COTD_DEFAULT
/** the list of branches changed: put it in place, and move whoever is looking at a branch that is gone or hidden */
export function setBranches(list: Branch[]) {
  if (!list.length) return
  BRANCHES.splice(0, BRANCHES.length, ...list)
  const open = BRANCHES.filter((b) => b.active)
  const patch: Partial<StaffData> = {}
  if (!open.some((b) => b.id === state.customerBranch)) patch.customerBranch = (open[0] ?? BRANCHES[0]).id
  if (!BRANCHES.some((b) => b.id === state.branch)) patch.branch = BRANCHES[0].id
  if (Object.keys(patch).length) update(() => patch)
}
export function activeEvent(): EventX | undefined { return state.events.find((e) => e.active && e.items.length) } // a declaration: apply() runs before this line
/** a branch's offers: the customer's branch on the website, the dashboard's branch when it passes `data.branch` */
export function offersFor(b: BranchId = state.customerBranch): Offer[] { return state.offers[b] ?? [] } // a declaration: apply() runs before this line
export const positiveOffer = (b?: BranchId): Offer | undefined => offersFor(b).find((o) => o.id === 'positive')

/* ---- warehouse ---- */
export const costOf = (name: string, s: StaffData = state): number | null => {
  const r = s.recipes[name]
  if (!r?.length) return null
  return Math.round(r.reduce((sum, l) => sum + (s.ingredients.find((i) => i.id === l.ing)?.cost ?? 0) * l.qty, 0))
}
export const sellOf = (it: MenuItem) => (Array.isArray(it.price) ? it.price[0] : it.price)

/* ---- visits (Analytics → Traffic): one per browser session, by where the visitor came from ---- */
export function recordVisit() {
  try {
    if (sessionStorage.getItem('mars-visit')) return
    sessionStorage.setItem('mars-visit', '1')
  } catch { return }
  const ref = document.referrer
  const q = location.search
  const host = ref ? new URL(ref).hostname : ''
  const source = /igsh|utm_source=ig/i.test(q) || /instagram/i.test(host) ? 'Instagram'
    : /facebook|fb\./i.test(host) ? 'Facebook'
      : /google/i.test(host) ? 'Google'
        : !host || host === location.hostname ? 'Direct' : 'Referral'
  const d = new Date()
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` // local day, as stats.ts reads it
  update((s) => ({ visits: { ...s.visits, [day]: { ...s.visits[day], [source]: (s.visits[day]?.[source] ?? 0) + 1 } } }))
}
