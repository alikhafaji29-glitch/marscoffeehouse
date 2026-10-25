import { useSyncExternalStore } from 'react'
import { ALL_ITEMS, CURATED, MENU, ORDER_MENU } from './menu'
import type { Badge, MenuCategory, MenuItem } from './menu'
import seed from './menuData.json'
import { backendKey, backendOn, backendUrl, getClient } from './backend'
import { PHOTO } from './menuMeta'
import { BRANCHES, applyRemoteConfig, refreshSeason, setBranches, staffData, subscribeStaff } from './staff/store'
import type { Branch, BranchId, L3, Nutrition } from './staff/store'
import type { Lang } from './i18n'

/*
 * The menu per branch (owner, 2026-10-13: "the real menu is in this website"). The catalogue (src/menu.ts) says which
 * items exist; this module says, for the branch being looked at, whether the branch sells an item, its stock, price
 * per size, tag, description, flavours and nutrition per size and flavour, and writes the first four onto the MENU
 * items so every screen that reads an item shows the branch's values without its own lookup. It also holds each item's
 * name in English, Arabic and Kurdish as that branch writes it (`nameOf`), its place in its category (the items of a
 * category are put in the branch's order) and the branch's category names (`categoryName`), all as on the live menu.
 *
 * Staff can also ADD to the menu from the dashboard (owner, 2026-10-14): a new item in any category, and a new
 * category. Both belong to the branch they were added in. They are put into MENU, ORDER_MENU and ALL_ITEMS here
 * (`sync`), so every screen shows them like the catalogue's own; a new item's English name is its key from then on.
 *
 * Where the values come from, later ones winning:
 *   1. src/menuData.json: the two live menus as read on 2026-10-13 (scripts/build-menu-data.py).
 *   2. demo mode (no backend): what staff changed and added on this device (`mars-menu-admin`, `mars-menu-added`,
 *      `mars-menu-cats`).
 *   3. backend on: the database's `menu_items` and `menu_categories` rows. They replace 1 entirely; the last answer is
 *      kept on the device (`mars-menu-cache`, `mars-menu-cats-cache`) so the next visit starts from it. Read with a
 *      plain request (the menu is public, no sign-in), again whenever the page comes back into view and once a minute.
 *      Staff changes are written to the rows.
 *
 * "The branch being looked at" is the staff dashboard's branch on #staff and the customer's chosen branch elsewhere.
 */
export type NutritionEntry = Nutrition & { size: string; flavor: string } // '' = the only size / no flavour
export interface ItemState {
  cat?: string // its category on this branch (staff can move an item); the catalogue's when missing or unknown
  photo?: string // staff's photo: its path in the `menu` storage bucket (demo: the picture itself, as a data: address)
  photoX?: number // the photo moved left (−) or right (+) in its frame, % of its width (owner, 2026-10-25); missing = centred
  photoY?: number // moved up (−) or down (+), % of its height; missing = centred
  photoZoom?: number // its size in %, 50–200; missing = 100
  available: boolean // the branch sells it
  names: L3 // the item's name as this branch writes it; the catalogue's name stays the key
  sort: number // its place on the branch's menu
  inStock: boolean
  prices: number[] // one per size
  sizes: string[] // [] for one size
  tag: Badge | ''
  desc: L3
  flavors: string[]
  flavorExtra?: Record<string, number> // IQD a flavour adds to every size's price; a flavour not named adds nothing
  nutrition: NutritionEntry[]
  gone?: boolean // demo only: staff deleted it on this device
}
export type CatKind = 'drink' | 'food'
/** a category staff added, or what staff changed about one of the catalogue's (its names, its place) */
export interface CatState { names: L3; kind: CatKind; sort: number }
type Branches<T> = Record<BranchId, T> // read a branch's part with at(): a new branch may have none yet
type SeedRow = { c: string; s: number; nm: Partial<L3>; p: number[]; z: string[]; t: string | null; o: number; d: string; f: string[]; n: [string, string, Nutrition][] }
interface DbRow {
  branch: BranchId; name: string; category: string; names: Partial<L3> | null; sort: number | null; available: boolean; in_stock: boolean; prices: number[]; sizes: string[]; tag: Badge | null
  description: Partial<L3> | null; flavors: string[] | null; nutrition: NutritionEntry[] | null; photo?: string | null; photo_x?: number | null; photo_y?: number | null; photo_zoom?: number | null; flavor_extras?: Record<string, number> | null
}
interface DbBranch { id: string; names: Partial<L3> | null; active: boolean; sort: number | null }
interface DbCat { branch: BranchId; id: string; kind: CatKind; names: Partial<L3> | null; sort: number | null }

const STATIC = [...MENU] // the catalogue's own categories, in its order
const BUILT_IN = new Set(STATIC.map((c) => c.id))
const FOOD = new Set(['sweets', 'savory'])
const CATALOGUE = new Map(ALL_ITEMS.map((i, k) => [i.name, k])) // the catalogue's own items and order, to break ties
const HOME = new Map(STATIC.flatMap((c) => c.items.map((i) => [i.name, c.id] as const))) // a catalogue item's category
const BUILT_SORT = new Map(STATIC.map((c, i) => [c.id, (i + 1) * 10])) // a catalogue category's place until staff move it
const OWN = new Map(ALL_ITEMS.map((i) => [i.name, i])) // the catalogue's item objects
const l3 = (d?: Partial<L3> | null): L3 => ({ en: d?.en ?? '', ar: d?.ar ?? '', ku: d?.ku ?? '' })
const fromSeed = (r: SeedRow): ItemState => ({
  cat: r.c, names: l3(r.nm), sort: r.s, available: true, inStock: !r.o, prices: r.p, sizes: r.z, tag: (r.t as Badge | null) ?? '', desc: l3({ en: r.d }), flavors: r.f,
  nutrition: r.n.map(([size, flavor, facts]) => ({ size, flavor, ...facts })),
})
const fromDb = (r: DbRow): ItemState => ({
  cat: r.category, names: l3(r.names), sort: r.sort ?? 0, available: r.available, inStock: r.in_stock, prices: r.prices, sizes: r.sizes ?? [], tag: r.tag ?? '', desc: l3(r.description),
  flavors: r.flavors ?? [], nutrition: r.nutrition ?? [], ...(r.photo && { photo: r.photo }), ...(r.photo_x && { photoX: r.photo_x }), ...(r.photo_y && { photoY: r.photo_y }), ...(r.photo_zoom && r.photo_zoom !== 100 && { photoZoom: r.photo_zoom }),
  ...(r.flavor_extras && Object.keys(r.flavor_extras).length > 0 && { flavorExtra: r.flavor_extras }),
})
const toBranch = (r: DbBranch): Branch => ({ id: r.id, name: r.names?.en || r.id, names: l3(r.names), active: r.active, sort: r.sort ?? 0 })
const BASE: Branches<Record<string, ItemState>> = { // the two branches the live menus were read for; a branch added later has none
  erbil: Object.fromEntries(Object.entries(seed.erbil as unknown as Record<string, SeedRow>).map(([n, r]) => [n, fromSeed(r)])),
  kirkuk: Object.fromEntries(Object.entries(seed.kirkuk as unknown as Record<string, SeedRow>).map(([n, r]) => [n, fromSeed(r)])),
}

const LOCAL = 'mars-menu-admin' // demo: this device's changes, per branch and item
const ADDED = 'mars-menu-added' // demo: the items added on this device, per branch
const CATS = 'mars-menu-cats' // demo: the categories added on this device, per branch
const CACHE = 'mars-menu-cache' // backend: the rows as last read
const CATS_CACHE = 'mars-menu-cats-cache' // backend: the added categories as last read
const read = <T,>(k: string, fallback: T): T => { try { return (JSON.parse(localStorage.getItem(k) ?? 'null') as T) ?? fallback } catch { return fallback } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }
const BRANCH_LIST = 'mars-branches' // demo: the branches as this device has them
const BRANCH_CACHE = 'mars-branches-cache' // backend: the branches as last read
const BRANCH_KEY = backendOn ? BRANCH_CACHE : BRANCH_LIST
const okBranches = (v: unknown): Branch[] | null => (Array.isArray(v) && v.length > 0 && v.every((b) => b && typeof b.id === 'string' && typeof b.name === 'string' && b.names && typeof b.active === 'boolean') ? (v as Branch[]) : null)
{ const kept = okBranches(read<unknown>(BRANCH_KEY, null)); if (kept) setBranches(kept) }
/** one branch's part of a per-branch store; a branch that has nothing yet has an empty part */
const at = <T,>(store: Branches<T>, branch: BranchId): T => store[branch] ?? ({} as T)
const blank = <T,>(): Branches<Record<string, T>> => Object.fromEntries(BRANCHES.map((b) => [b.id, {}]))
function loadBranches<T>(key: string): Branches<Record<string, T>> {
  const raw = read<Record<string, unknown> | null>(key, null)
  return raw && typeof raw === 'object' && !('prices' in raw) && !('out' in raw) ? { ...blank<T>(), ...(raw as Branches<Record<string, T>>) } : blank() // the older shape ({prices, out}) is dropped
}
let local = loadBranches<Partial<ItemState>>(LOCAL)
let added = loadBranches<ItemState>(ADDED)
let localCats = loadBranches<CatState>(CATS)
let remote: Branches<Record<string, ItemState>> | null = backendOn ? read<Branches<Record<string, ItemState>> | null>(CACHE, null) : null
let remoteCats: Branches<Record<string, CatState>> = backendOn ? loadBranches<CatState>(CATS_CACHE) : blank()
let version = 0
let failed = false // the last write to the database did not go through
const listeners = new Set<() => void>()

export const activeBranch = (): BranchId => (typeof location !== 'undefined' && location.hash === '#staff' ? staffData().branch : staffData().customerBranch)
/** an item's values for a branch; undefined = the branch does not have it on its menu at all */
export function itemState(name: string, branch: BranchId = activeBranch()): ItemState | undefined {
  if (remote) return at(remote, branch)[name]
  const base = at(added, branch)[name] ?? at(BASE, branch)[name]
  return base && !at(local, branch)[name]?.gone ? { ...base, ...at(local, branch)[name] } : undefined
}
const catsOf = (branch: BranchId): Record<string, CatState> => (backendOn ? at(remoteCats, branch) : at(localCats, branch))
/** drinks or food: what the branch chose for it, else the catalogue's word (sweets and savory are food) */
export const catKind = (id: string, branch: BranchId = staffData().branch): CatKind => catsOf(branch)[id]?.kind ?? (FOOD.has(id) ? 'food' : 'drink')
const catSort = (id: string, branch: BranchId) => catsOf(branch)[id]?.sort ?? BUILT_SORT.get(id) ?? 100000
/** every row a branch has, by item name */
function rowsOf(branch: BranchId): Record<string, ItemState> {
  if (remote) return at(remote, branch)
  const out: Record<string, ItemState> = {}
  for (const n of Object.keys({ ...at(BASE, branch), ...at(added, branch) })) { const st = itemState(n, branch); if (st) out[n] = st }
  return out
}

/** an item's name in the customer's language, as the branch being looked at writes it (English when it has no translation) */
export function nameOf(name: string, lang: Lang, branch: BranchId = activeBranch()): string {
  const n = itemState(name, branch)?.names
  return n?.[lang] || n?.en || name
}
/** a category's name on the branch's menu, in the customer's language; undefined for the sections that are ours alone */
export function categoryName(id: string, lang: Lang, branch: BranchId = activeBranch()): string | undefined {
  const own = catsOf(branch)[id]?.names
  return own?.[lang] || own?.en || (seed.cats as unknown as Record<BranchId, Record<string, Partial<L3>>>)[branch]?.[id]?.[lang] || undefined
}

/* ---- what staff added, put into the menu's own lists ---- */
const madeItems = new Map<string, MenuItem>() // one object per added item for good: a screen holding it sees its changes
const madeCats = new Map<string, MenuCategory>()
let madeNames = ''
function sync(branch: BranchId) {
  const order = [...BRANCHES.map((b) => b.id).filter((b) => b !== branch), branch] // the branch being looked at last: its word wins
  const cats = new Map<string, CatState>()
  const names = new Set(CATALOGUE.keys()) // the catalogue's items first, then the ones staff added
  for (const b of order) {
    for (const [id, c] of Object.entries(catsOf(b))) if (!BUILT_IN.has(id)) cats.set(id, c)
    for (const name of Object.keys(rowsOf(b))) names.add(name)
  }
  for (const id of cats.keys()) if (!madeCats.has(id)) madeCats.set(id, { id, items: [] })
  // the branch's own order: its drinks, then its food; a category only the other branch has goes last in its group
  const place = (id: string) => (BUILT_IN.has(id) || catsOf(branch)[id] ? catSort(id, branch) : 100000 + (cats.get(id)?.sort ?? 0))
  const isFood = (id: string) => (BUILT_IN.has(id) || catsOf(branch)[id] ? catKind(id, branch) : cats.get(id)?.kind) === 'food'
  const ordered = [...STATIC, ...[...cats.keys()].map((id) => madeCats.get(id)!)].sort((a, b) => place(a.id) - place(b.id) || a.id.localeCompare(b.id))
  const all = [...ordered.filter((c) => !isFood(c.id)), ...ordered.filter((c) => isFood(c.id))]
  const byId = new Map(all.map((c) => [c.id, c]))
  for (const c of all) c.items = []
  // each item into the category its branch keeps it in (staff can move one); the catalogue's when the branch says nothing
  for (const name of names) {
    let id: string | undefined
    for (const b of order) { const c = itemState(name, b)?.cat; if (c && byId.has(c)) id = c }
    const it = OWN.get(name) ?? madeItems.get(name) ?? { name, price: 0 }
    if (!OWN.has(name)) madeItems.set(name, it)
    byId.get(id ?? HOME.get(name) ?? 'extra')!.items.push(it)
  }
  MENU.splice(0, MENU.length, ...all)
  ORDER_MENU.splice(CURATED.length, ORDER_MENU.length, ...all)
  ALL_ITEMS.splice(0, ALL_ITEMS.length, ...all.flatMap((c) => c.items))
}

/** writes the branch's values onto the MENU items */
function apply() {
  const branch = activeBranch()
  sync(branch)
  for (const it of ALL_ITEMS) {
    const st = itemState(it.name, branch)
    if (!st || !st.available) { it.hidden = true; it.soldOut = true; continue }
    it.hidden = false
    it.soldOut = !st.inStock
    it.price = st.prices.length > 1 ? [...st.prices] : st.prices[0]
    it.sizes = st.sizes.length > 1 ? [...st.sizes] : undefined
    it.badge = st.tag || undefined
    it.flavors = st.flavors
    it.flavorExtra = st.flavorExtra
  }
  // each category in the branch's own order (an item the branch does not sell goes last; it is not shown anyway)
  const place = (i: MenuItem) => (i.hidden ? 100000 : itemState(i.name, branch)?.sort ?? 50000) + (CATALOGUE.get(i.name) ?? 0) / 1000
  for (const c of MENU) c.items.sort((a, b) => place(a) - place(b))
  // the Signature section follows the branch's tags
  const sig = ORDER_MENU.find((c) => c.id === 'signature')
  if (sig) sig.items = ALL_ITEMS.filter((i) => i.badge === 'signature' && !i.hidden)
  // an event may name an item staff added: the New Season section looks its items up again when that list changes
  const names = [...madeItems.keys()].filter((n) => ALL_ITEMS.some((i) => i.name === n)).join('|')
  if (names !== madeNames) { madeNames = names; refreshSeason() }
  version++
  listeners.forEach((fn) => fn())
}

/** re-renders the caller whenever the menu changes (a price, the stock, the branch) */
export function useMenuVersion(): number {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => version)
}

/* ---- reading the database ---- */
async function pull(): Promise<boolean> {
  if (!backendOn) return false
  try {
    const get = (path: string) => fetch(`${backendUrl}/rest/v1/${path}`, { headers: { apikey: backendKey! } })
    const [res, cres, bres, gres] = await Promise.all([
      get('menu_items?select=branch,name,category,names,sort,available,in_stock,prices,sizes,tag,description,flavors,nutrition,photo,photo_x,photo_y,photo_zoom,flavor_extras'),
      get('menu_categories?select=branch,id,kind,names,sort').catch(() => null),
      get('branches?select=id,names,active,sort&order=sort.asc,id.asc').catch(() => null),
      get('branch_config?select=branch,settings,offers').catch(() => null), // each branch's settings and offers
    ])
    if (!res.ok) throw new Error(String(res.status))
    const rows = (await res.json()) as DbRow[]
    if (!rows.length) return false // an empty table is a set-up mistake, not a menu: keep what we have
    const next = blank<ItemState>()
    for (const r of rows) (next[r.branch] ??= {})[r.name] = fromDb(r)
    let nextCats = remoteCats // the categories could not be read: keep the ones we have
    if (cres?.ok) {
      nextCats = blank<CatState>()
      for (const c of (await cres.json()) as DbCat[]) (nextCats[c.branch] ??= {})[c.id] = { names: l3(c.names), kind: c.kind, sort: c.sort ?? 0 }
    }
    let sameBranches = true
    if (bres?.ok) {
      const list = ((await bres.json()) as DbBranch[]).map(toBranch)
      if (list.length && JSON.stringify(list) !== JSON.stringify(BRANCHES)) { sameBranches = false; write(BRANCH_CACHE, list); setBranches(list) }
    }
    if (gres?.ok) applyRemoteConfig(await gres.json())
    const same = sameBranches && JSON.stringify(next) === JSON.stringify(remote) && JSON.stringify(nextCats) === JSON.stringify(remoteCats)
    remote = next
    remoteCats = nextCats
    write(CACHE, next)
    write(CATS_CACHE, nextCats)
    if (!same) apply()
    return true
  } catch (e) { console.warn('[backend] could not read the menu:', e); return false }
}
/* The menu is read again only when it changed (owner, 2026-10-22): each minute a page reads the database's one-row
 * "last changed" mark (menu_version, a few hundred bytes) and reads the whole menu (about 44 kB) only when that mark
 * moved since this device last read it, or when this device has no copy yet. If the mark cannot be read, the menu is
 * read as before. */
const VERSION = 'mars-menu-version-2' // -2: read once more on every device when the branch settings joined (2026-10-22)
let checking = false
async function check() {
  if (!backendOn || checking) return
  checking = true
  try {
    let mark = ''
    try {
      const res = await fetch(`${backendUrl}/rest/v1/menu_version?select=changed_at`, { headers: { apikey: backendKey! } })
      if (res.ok) mark = ((await res.json()) as { changed_at: string }[])[0]?.changed_at ?? ''
    } catch { /* offline, or no mark: read the menu itself */ }
    const have = read<unknown>(CACHE, null) !== null
    if (mark && have && mark === read<string>(VERSION, '')) return
    if ((await pull()) && mark) write(VERSION, mark)
  } finally { checking = false }
}

/* ---- staff changes ---- */
const toDb = (p: Partial<ItemState>) => ({
  ...(p.available !== undefined && { available: p.available }), ...(p.inStock !== undefined && { in_stock: p.inStock }),
  ...(p.prices && { prices: p.prices }), ...(p.tag !== undefined && { tag: p.tag || null }), ...(p.desc && { description: p.desc }),
  ...(p.flavors && { flavors: p.flavors }), ...(p.flavorExtra && { flavor_extras: p.flavorExtra }), ...(p.nutrition && { nutrition: p.nutrition }), ...(p.names && { names: p.names }),
  ...(p.sizes && { sizes: p.sizes }), ...(p.sort !== undefined && { sort: p.sort }), ...(p.cat !== undefined && { category: p.cat }), ...(p.photo !== undefined && { photo: p.photo || null }),
  ...(p.photoX !== undefined && { photo_x: p.photoX || null }), ...(p.photoY !== undefined && { photo_y: p.photoY || null }),
  ...(p.photoZoom !== undefined && { photo_zoom: p.photoZoom && p.photoZoom !== 100 ? p.photoZoom : null }),
})
const setFailed = (bad: boolean) => { if (failed !== bad || bad) { failed = bad; apply() } }
/** change an item for the dashboard's branch: in the database when the backend is on, otherwise on this device */
export function saveItem(name: string, patch: Partial<ItemState>) {
  const branch = staffData().branch
  if (backendOn) {
    const before = remote?.[branch]?.[name]
    if (!remote || !before) return // the branch has no row for it: nothing to change
    remote = { ...remote, [branch]: { ...at(remote, branch), [name]: { ...before, ...patch } } } // at once on screen
    apply()
    void getClient().then(async (sb) => {
      const res = sb ? await sb.from('menu_items').update(toDb(patch)).eq('branch', branch).eq('name', name).select('name') : null
      const ok = !!res && !res.error && (res.data?.length ?? 0) > 0 // no row back = the row rules refused it
      if (!ok) { console.warn('[backend] menu change not saved:', res?.error?.message ?? 'not allowed'); remote = { ...remote!, [branch]: { ...at(remote!, branch), [name]: before } } }
      else write(CACHE, remote)
      setFailed(!ok)
    })
    return
  }
  if (!itemState(name, branch)) return
  local = { ...local, [branch]: { ...at(local, branch), [name]: { ...at(local, branch)[name], ...patch } } }
  write(LOCAL, local)
  apply()
}
export const menuSaveFailed = () => failed

type Price = MenuItem['price']
export const setPrice = (name: string, price: Price) => saveItem(name, { prices: Array.isArray(price) ? [...price] : [price] })
export const setOut = (name: string, out: boolean) => saveItem(name, { inStock: !out })
export const outCount = () => ALL_ITEMS.filter((i) => !i.hidden && i.soldOut).length

/* ---- staff additions (owner, 2026-10-14) ---- */
/** the categories of the dashboard's branch, drinks or food, in the branch's order: the catalogue's and the ones staff added there */
export function branchCats(kind: CatKind, branch: BranchId = staffData().branch): string[] {
  const ids = [...STATIC.map((c) => c.id), ...Object.keys(catsOf(branch)).filter((id) => !BUILT_IN.has(id))]
  return ids.filter((id) => catKind(id, branch) === kind).sort((a, b) => catSort(a, branch) - catSort(b, branch) || a.localeCompare(b))
}
/** change a category of the dashboard's branch: its names or its place. One of the catalogue's gets its own row the first time */
function saveCat(id: string, patch: Partial<CatState>) {
  const branch = staffData().branch
  const mine = catsOf(branch)
  const before = mine[id] as CatState | undefined
  if (!before && !BUILT_IN.has(id)) return
  const next: CatState = { ...(before ?? { names: l3(), kind: catKind(id, branch), sort: catSort(id, branch) }), ...patch }
  if (!backendOn) {
    localCats = { ...localCats, [branch]: { ...mine, [id]: next } }
    write(CATS, localCats)
    apply()
    return
  }
  remoteCats = { ...remoteCats, [branch]: { ...mine, [id]: next } } // at once on screen
  apply()
  void getClient().then(async (sb) => {
    const res = !sb ? null
      : before ? await sb.from('menu_categories').update({ names: next.names, sort: next.sort, kind: next.kind }).eq('branch', branch).eq('id', id).select('id')
        : await sb.from('menu_categories').insert({ branch, id, kind: next.kind, names: next.names, sort: next.sort }).select('id')
    const ok = !!res && !res.error && (res.data?.length ?? 0) > 0
    if (!ok) {
      console.warn('[backend] category change not saved:', res?.error?.message ?? 'not allowed')
      const { [id]: _drop, ...rest } = at(remoteCats, branch)
      void _drop
      remoteCats = { ...remoteCats, [branch]: before ? { ...rest, [id]: before } : rest }
    } else write(CATS_CACHE, remoteCats)
    setFailed(!ok)
  })
}
/** move a category one place up (-1) or down (1) among the branch's drinks, or its food */
export function moveCategory(id: string, dir: -1 | 1) {
  const branch = staffData().branch
  const list = branchCats(catKind(id, branch), branch)
  const other = list[list.indexOf(id) + dir]
  if (!list.includes(id) || !other) return
  const [a, b] = [catSort(id, branch), catSort(other, branch)]
  saveCat(id, { sort: b })
  saveCat(other, { sort: a })
}
/** a category's names on the dashboard's branch, and whether it sits with the drinks or the food (moved, it goes last there) */
export function editCategory(id: string, names: L3, kind: CatKind) {
  const branch = staffData().branch
  if (kind === catKind(id, branch)) { saveCat(id, { names }); return }
  saveCat(id, { names, kind, sort: Math.max(0, ...branchCats(kind, branch).map((x) => catSort(x, branch))) + 10 })
}
export interface NewItem { name: string; cat: string; names: L3; prices: number[]; sizes: string[]; tag: Badge | ''; desc: L3 }
export type AddResult = 'ok' | 'exists' | 'offline'
/** a new item on the dashboard's branch. Its English name is its key from now on (orders, reports), so it cannot repeat one the branch has */
export function addItem(n: NewItem): AddResult {
  const branch = staffData().branch
  if (backendOn && !remote) return 'offline' // the menu has not been read yet
  const twin = ALL_ITEMS.find((i) => i.name.toLowerCase() === n.name.toLowerCase())?.name // the other branch, or the catalogue, may know it already
  const name = twin ?? n.name
  const rows = rowsOf(branch)
  if (rows[name] || Object.values(rows).some((r) => r.names.en.toLowerCase() === n.name.toLowerCase())) return 'exists'
  const st: ItemState = {
    cat: HOME.get(name) ?? n.cat, available: true, names: { ...n.names, en: n.names.en || name }, sort: Math.max(0, ...Object.values(rows).map((r) => r.sort)) + 1,
    inStock: true, prices: n.prices, sizes: n.sizes, tag: n.tag, desc: n.desc, flavors: [], nutrition: [],
  }
  if (!backendOn) {
    added = { ...added, [branch]: { ...at(added, branch), [name]: st } }
    const { [name]: _old, ...kept } = at(local, branch) // it may have been deleted here before
    void _old
    local = { ...local, [branch]: kept }
    write(ADDED, added)
    write(LOCAL, local)
    apply()
    return 'ok'
  }
  remote = { ...remote!, [branch]: { ...at(remote!, branch), [name]: st } } // at once on screen
  apply()
  void getClient().then(async (sb) => {
    const res = sb ? await sb.from('menu_items').insert({ branch, name, ...toDb(st) }).select('name') : null
    const ok = !!res && !res.error && (res.data?.length ?? 0) > 0
    if (!ok) {
      console.warn('[backend] new item not saved:', res?.error?.message ?? 'not allowed')
      const { [name]: _drop, ...rest } = at(remote!, branch)
      void _drop
      remote = { ...remote!, [branch]: rest }
    } else write(CACHE, remote)
    setFailed(!ok)
  })
  return 'ok'
}
/** a new category on the dashboard's branch; it shows on the menu once it holds an item. Answers its id */
export function addCategory(names: L3, kind: CatKind): { id: string } | 'exists' | 'offline' {
  const branch = staffData().branch
  if (backendOn && !remote) return 'offline'
  const slug = names.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  const id = 'c-' + (slug || Math.random().toString(36).slice(2, 9))
  const mine = catsOf(branch)
  if (mine[id]) return 'exists'
  const cat: CatState = { names, kind, sort: Math.max(0, ...[...branchCats('drink', branch), ...branchCats('food', branch)].map((x) => catSort(x, branch))) + 10 }
  if (!backendOn) {
    localCats = { ...localCats, [branch]: { ...mine, [id]: cat } }
    write(CATS, localCats)
    apply()
    return { id }
  }
  remoteCats = { ...remoteCats, [branch]: { ...mine, [id]: cat } }
  apply()
  void getClient().then(async (sb) => {
    const res = sb ? await sb.from('menu_categories').insert({ branch, id, kind, names, sort: cat.sort }).select('id') : null
    const ok = !!res && !res.error && (res.data?.length ?? 0) > 0
    if (!ok) {
      console.warn('[backend] new category not saved:', res?.error?.message ?? 'not allowed')
      const { [id]: _drop, ...rest } = at(remoteCats, branch)
      void _drop
      remoteCats = { ...remoteCats, [branch]: rest }
    } else write(CATS_CACHE, remoteCats)
    setFailed(!ok)
  })
  return { id }
}

/* ---- branches (owner, 2026-10-14): only the owner's sign-in may change them; the database's rules say so ---- */
/** change a branch: its names, or whether customers can choose it */
export function saveBranch(id: string, patch: { names?: L3; active?: boolean }) {
  const before = BRANCHES.find((b) => b.id === id)
  if (!before) return
  const put = (b: Branch) => { const list = BRANCHES.map((x) => (x.id === id ? b : x)); write(BRANCH_KEY, list); setBranches(list); apply() }
  put({ ...before, ...patch, name: patch.names?.en || before.name })
  if (!backendOn) return
  void getClient().then(async (sb) => {
    const res = sb ? await sb.from('branches').update(patch).eq('id', id).select('id') : null
    const ok = !!res && !res.error && (res.data?.length ?? 0) > 0
    if (!ok) { console.warn('[backend] branch not saved:', res?.error?.message ?? 'not allowed'); put(before) }
    setFailed(!ok)
  })
}
/** a new branch: hidden from customers to start with, its menu a copy of `copyFrom`'s (items, prices, names, categories; no photos, they belong to a branch) */
export async function addBranch(names: L3, copyFrom: BranchId): Promise<'ok' | 'exists' | 'failed' | 'offline'> {
  const slug = names.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28)
  const id = /^[a-z][a-z0-9-]+$/.test(slug) ? slug : 'b-' + (slug || Math.random().toString(36).slice(2, 8))
  if (BRANCHES.some((b) => b.id === id || b.name.toLowerCase() === names.en.toLowerCase())) return 'exists'
  const branch: Branch = { id, name: names.en, names, active: false, sort: Math.max(0, ...BRANCHES.map((b) => b.sort)) + 1 }
  // the source's categories as rows of the new branch: its names and order, the catalogue's categories included
  const cats: Record<string, CatState> = Object.fromEntries([...branchCats('drink', copyFrom), ...branchCats('food', copyFrom)].map((c) => [c, {
    names: l3({ en: categoryName(c, 'en', copyFrom), ar: categoryName(c, 'ar', copyFrom), ku: categoryName(c, 'ku', copyFrom) }), kind: catKind(c, copyFrom), sort: catSort(c, copyFrom),
  }]))
  if (!backendOn) {
    added = { ...added, [id]: JSON.parse(JSON.stringify(rowsOf(copyFrom))) as Record<string, ItemState> }
    localCats = { ...localCats, [id]: cats }
    write(ADDED, added)
    write(CATS, localCats)
    const list = [...BRANCHES, branch]
    write(BRANCH_LIST, list)
    setBranches(list)
    apply()
    return 'ok'
  }
  const sb = await getClient()
  if (!sb || !remote) return 'offline'
  const made = await sb.from('branches').insert({ id, names, active: false, sort: branch.sort }).select('id')
  if (made.error || !made.data?.length) { console.warn('[backend] branch not added:', made.error?.message ?? 'not allowed'); return made.error?.code === '23505' ? 'exists' : 'failed' }
  const catRows = Object.entries(cats).map(([c, v]) => ({ branch: id, id: c, kind: v.kind, names: v.names, sort: v.sort }))
  const itemRows = Object.entries(at(remote, copyFrom)).map(([name, st]) => { const { photo: _photo, ...rest } = st; void _photo; return { branch: id, name, ...toDb(rest) } })
  const c = catRows.length ? await sb.from('menu_categories').insert(catRows) : { error: null }
  const i = !c.error && itemRows.length ? await sb.from('menu_items').insert(itemRows) : { error: null }
  if (c.error || i.error) { // nothing half-made is left behind
    console.warn('[backend] branch menu not copied:', (c.error ?? i.error)?.message)
    await sb.from('menu_items').delete().eq('branch', id)
    await sb.from('menu_categories').delete().eq('branch', id)
    await sb.from('branches').delete().eq('id', id)
    return 'failed'
  }
  await pull()
  return 'ok'
}

/* ---- order, category, photo (owner, 2026-10-14) ---- */
const nextSort = (branch: BranchId) => Math.max(0, ...Object.values(rowsOf(branch)).map((r) => r.sort)) + 1
/** move an item one place up (-1) or down (1) among the items its branch sells in its category */
export function moveItem(name: string, dir: -1 | 1) {
  const branch = staffData().branch
  const list = MENU.find((c) => c.items.some((i) => i.name === name))?.items.filter((i) => !i.hidden).map((i) => i.name) ?? []
  const at = list.indexOf(name)
  const to = at + dir
  if (at < 0 || to < 0 || to >= list.length) return
  const first = Math.min(...list.map((n) => itemState(n, branch)?.sort ?? 0))
  ;[list[at], list[to]] = [list[to], list[at]]
  // the category's items numbered in their new order; usually only the two that swapped change
  list.forEach((n, i) => { if (itemState(n, branch)?.sort !== first + i) saveItem(n, { sort: first + i }) })
}
/** put an item into another category of its branch, at the end */
export function moveToCategory(name: string, cat: string) {
  const branch = staffData().branch
  saveItem(name, { cat, sort: nextSort(branch) })
}
/** the picture to show for an item: staff's photo for the branch being looked at, else the one that came with the site */
export function photoOf(name: string, branch: BranchId = activeBranch()): string | undefined {
  const p = itemState(name, branch)?.photo
  return p ? (p.startsWith('data:') ? p : `${backendUrl}/storage/v1/object/public/menu/${p}`) : PHOTO[name]
}
/** an item photo's own place in its frame (moved and zoomed by staff), as a style for its <img> */
export type PhotoFit = { x?: number; y?: number; zoom?: number }
export function fitStyle({ x = 0, y = 0, zoom = 100 }: PhotoFit): { transform: string } | undefined {
  if (!x && !y && zoom === 100) return undefined
  return { transform: `translate(${x}%, ${y}%)${zoom !== 100 ? ` scale(${zoom / 100})` : ''}` }
}
export function photoStyle(name: string, branch: BranchId = activeBranch()): { transform: string } | undefined {
  const st = itemState(name, branch)
  return st ? fitStyle({ x: st.photoX, y: st.photoY, zoom: st.photoZoom }) : undefined
}
/** a photo made small enough for a menu: the longer side at most `max` pixels */
async function shrink(file: File, max: number, quality: number, type: string): Promise<{ blob: Blob; url: string } | null> {
  try {
    const img = await createImageBitmap(file)
    const k = Math.min(1, max / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * k)
    canvas.height = Math.round(img.height * k)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, type, quality))
    return blob ? { blob, url: canvas.toDataURL('image/jpeg', quality) } : null
  } catch { return null } // not a picture the browser can read
}
/** staff's photo for an item of the dashboard's branch: made small, stored, and written on the item */
export async function uploadPhoto(name: string, file: File): Promise<'ok' | 'bad' | 'failed'> {
  const branch = staffData().branch
  const before = itemState(name, branch)
  if (!before) return 'failed'
  if (!backendOn) {
    const small = await shrink(file, 480, 0.72, 'image/jpeg') // kept on this device, so kept small
    if (!small) return 'bad'
    saveItem(name, { photo: small.url, photoX: 0, photoY: 0, photoZoom: 100 })
    return 'ok'
  }
  const small = await shrink(file, 1000, 0.82, 'image/webp')
  if (!small) return 'bad'
  const ext = small.blob.type === 'image/webp' ? 'webp' : 'jpg' // a browser that cannot write WebP answers with something else
  const blob = ext === 'webp' ? small.blob : (await shrink(file, 1000, 0.82, 'image/jpeg'))?.blob
  if (!blob || blob.type !== (ext === 'webp' ? 'image/webp' : 'image/jpeg')) return 'bad'
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'item'
  const path = `${branch}/${slug}-${Date.now().toString(36)}.${ext}` // a new name each time: browsers may keep a photo for good
  const sb = await getClient()
  const up = sb ? await sb.storage.from('menu').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' }) : null
  if (!up || up.error) { console.warn('[backend] photo not stored:', up?.error?.message ?? 'no connection'); return 'failed' }
  saveItem(name, { photo: path, photoX: 0, photoY: 0, photoZoom: 100 }) // a new photo starts centred, as it is
  if (before.photo && !before.photo.startsWith('data:')) void sb!.storage.from('menu').remove([before.photo]) // the old file is not needed any more
  return 'ok'
}
/** back to the picture that came with the site (or the drawn cup) */
export function removePhoto(name: string) {
  const old = itemState(name, staffData().branch)?.photo
  if (!old) return
  saveItem(name, { photo: '', photoX: 0, photoY: 0, photoZoom: 100 })
  if (backendOn && !old.startsWith('data:')) void getClient().then((sb) => sb?.storage.from('menu').remove([old]))
}

/* ---- staff deletions (owner, 2026-10-14) ---- */
/** staff added this item (the catalogue does not know it): deleted, it is gone from every list */
export const isAddedItem = (name: string) => !CATALOGUE.has(name)
/** staff added this category: it can be deleted, the catalogue's cannot */
export const isAddedCat = (id: string) => !BUILT_IN.has(id)
/** take an item off the dashboard's branch for good: its row, with its prices, description and nutrition */
export function removeItem(name: string) {
  const branch = staffData().branch
  if (!backendOn) {
    if (!itemState(name, branch)) return
    const { [name]: mine, ...rest } = at(added, branch)
    if (mine) { added = { ...added, [branch]: rest }; write(ADDED, added) }
    const { [name]: _old, ...kept } = at(local, branch)
    void _old
    local = { ...local, [branch]: at(BASE, branch)[name] ? { ...kept, [name]: { gone: true } } : kept }
    write(LOCAL, local)
    apply()
    return
  }
  const before = remote?.[branch]?.[name]
  if (!remote || !before) return
  const { [name]: _drop, ...rest } = at(remote, branch)
  void _drop
  remote = { ...remote, [branch]: rest } // at once on screen
  apply()
  void getClient().then(async (sb) => {
    const res = sb ? await sb.from('menu_items').delete().eq('branch', branch).eq('name', name).select('name') : null
    const ok = !!res && !res.error && (res.data?.length ?? 0) > 0
    if (!ok) { console.warn('[backend] item not deleted:', res?.error?.message ?? 'not allowed'); remote = { ...remote!, [branch]: { ...at(remote!, branch), [name]: before } } }
    else write(CACHE, remote)
    setFailed(!ok)
  })
}
/** delete a category staff added, once the branch has no item left in it */
export function removeCategory(id: string): 'ok' | 'notEmpty' {
  const branch = staffData().branch
  const mine = catsOf(branch)
  if (BUILT_IN.has(id) || !mine[id]) return 'ok'
  if (Object.values(rowsOf(branch)).some((r) => r.cat === id)) return 'notEmpty'
  const { [id]: before, ...rest } = mine
  if (!backendOn) {
    localCats = { ...localCats, [branch]: rest }
    write(CATS, localCats)
    apply()
    return 'ok'
  }
  remoteCats = { ...remoteCats, [branch]: rest }
  apply()
  void getClient().then(async (sb) => {
    const res = sb ? await sb.from('menu_categories').delete().eq('branch', branch).eq('id', id).select('id') : null
    const ok = !!res && !res.error && (res.data?.length ?? 0) > 0
    if (!ok) { console.warn('[backend] category not deleted:', res?.error?.message ?? 'not allowed'); remoteCats = { ...remoteCats, [branch]: { ...at(remoteCats, branch), [id]: before } } }
    else write(CATS_CACHE, remoteCats)
    setFailed(!ok)
  })
  return 'ok'
}

/* demo only: the price the live menu had, and going back to it (with the backend on the database IS the menu) */
export const canReset = !backendOn
export function basePrice(name: string): Price | undefined {
  const p = at(BASE, staffData().branch)[name]?.prices
  return p ? (p.length > 1 ? [...p] : p[0]) : undefined
}
export const isChanged = (name: string) => canReset && !!at(BASE, staffData().branch)[name] && !!at(local, staffData().branch)[name]?.prices
export function resetPrice(name: string) {
  const b = staffData().branch
  const { prices: _drop, ...rest } = at(local, b)[name] ?? {}
  void _drop
  local = { ...local, [b]: { ...at(local, b), [name]: rest } }
  write(LOCAL, local)
  apply()
}
/** demo: everything this device changed or added for the dashboard's branch goes back to the live menu */
export function resetMenu() {
  const b = staffData().branch
  local = { ...local, [b]: {} }
  added = { ...added, [b]: {} }
  localCats = { ...localCats, [b]: {} }
  write(LOCAL, local)
  write(ADDED, added)
  write(CATS, localCats)
  apply()
}

apply()
subscribeStaff(apply) // the branch may have changed
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', apply) // the dashboard and the site may look at different branches
  window.addEventListener('storage', (e) => {
    if (e.key === BRANCH_KEY) { const list = okBranches(read<unknown>(BRANCH_KEY, null)); if (list) { setBranches(list); apply() } }
    if (e.key === LOCAL || e.key === ADDED || e.key === CATS || e.key === null) { local = loadBranches(LOCAL); added = loadBranches(ADDED); localCats = loadBranches(CATS); apply() }
    if ((e.key === CACHE || e.key === CATS_CACHE) && backendOn) { remote = read(CACHE, remote); remoteCats = loadBranches(CATS_CACHE); apply() }
  })
  if (backendOn) {
    void check()
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void check() })
    window.setInterval(() => { if (!document.hidden) void check() }, 60000)
  }
}
