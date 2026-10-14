import { useSyncExternalStore } from 'react'
import { ALL_ITEMS as ITEMS, ORDER_MENU, SEASON_PICKS } from '../menu'
import type { MenuItem } from '../menu'
import { POSITIVE_HOURS } from '../components/useCountdown'

/*
 * Everything the staff dashboard sets apart from the menu itself (prices, stock, tags, descriptions, nutrition are
 * menuAdmin.ts): the branch, how orders reach the staff, events, offers and the warehouse. Modelled on the live Mars admin panel
 * (owner's screenshots, 2026-10-02). DEMO: one object in this browser (`mars-staff-data`); other tabs follow
 * through the `storage` event. The real version keeps the same shapes in backend tables.
 * The website follows: the branch list, Delivery / Pickup at checkout, the Positive Hours window and price,
 * and the New Season section (the active event).
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

export interface Settings { reach: 'dashboard' | 'whatsapp'; whatsapp: string; delivery: boolean; pickup: boolean }
export interface EventX { id: string; name: L3; theme: string; desc: L3; promo: L3; items: string[]; active: boolean }
export interface OfferGroup { id: string; label: L3; pick: number; mode: 'cats' | 'items'; cats: string[]; items: string[] }
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
  settings: Record<BranchId, Settings> // a branch without an entry has NO_SETTINGS
  events: EventX[]
  offers: Offer[]
  ingredients: Ingredient[]
  recipes: Record<string, Recipe>
  visits: Record<string, Record<string, number>> // day (YYYY-MM-DD) → source → visits
}

export const THEMES = [
  { id: 'spring', name: 'Spring Bloom', color: '#e0336e' },
  { id: 'summer', name: 'Summer Sun', color: '#db863a' },
  { id: 'autumn', name: 'Autumn Spice', color: '#935a25' },
  { id: 'winter', name: 'Winter Sky', color: '#397dc9' },
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
  offers: [{
    id: 'positive', name: l3('Positive Hours', 'ساعات إيجابية', 'کاتژمێرە ئەرێنییەکان'), slug: 'positive-hours', price: 5500,
    start: '07:30', end: '12:00', freeDelivery: true, feeOn: false, fee: 1000, sizes: false,
    sub: l3('One sandwich + one drink, free delivery', 'ساندويتش واحد + مشروب واحد، مع توصيل مجاني', 'یەک ساندویچ + یەک خواردنەوە، بە گەیاندنی بەخۆڕایی'),
    fine: l3(), active: true,
    groups: [
      { id: 'g1', label: l3('Sandwich', 'ساندويتش', 'ساندویچ'), pick: 1, mode: 'items', cats: [], items: SANDWICHES },
      { id: 'g2', label: l3('Drink', 'مشروب', 'خواردنەوە'), pick: 1, mode: 'cats', cats: DRINK_CATS, items: [] },
    ],
  }],
  ingredients: [],
  recipes: {},
  visits: {},
})

function load(): StaffData {
  const d = defaults()
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<StaffData> | null
    if (raw && typeof raw === 'object') return { ...d, ...raw, settings: { ...d.settings, ...raw.settings } }
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
  const offer = state.offers.find((o) => o.id === 'positive') ?? state.offers[0]
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
export function update(fn: (s: StaffData) => Partial<StaffData>) { state = { ...state, ...fn(state) }; save() }
export const uid = () => Math.random().toString(36).slice(2, 9)

/* ---- what the website asks ---- */
export const customerBranch = () => state.customerBranch
export const setCustomerBranch = (b: BranchId) => update(() => ({ customerBranch: b }))
export const settingsFor = (b: BranchId = state.customerBranch): Settings => state.settings[b] ?? NO_SETTINGS
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
export const positiveOffer = (): Offer | undefined => state.offers.find((o) => o.id === 'positive')

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
