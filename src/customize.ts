import type { Lang } from './i18n'
import { ALL_ITEMS, MENU } from './menu'
import type { ItemOpts, MenuItem } from './menu'
import { categoryOf } from './menuMeta'
import { activeBranch, nameOf } from './menuAdmin'
import { settingsFor } from './staff/store'
import type { FlavourDef } from './staff/store'

/*
 * What a customer can choose on an item's page, exactly as on the live menu (marscoffeehouse.com, checked 2026-10-13):
 * the item's own flavours and nothing else. Latte with Flavor, Cappuccino with Flavors and Iced Latte with Flavor
 * offer Vanilla, Hazelnut…; Turkish Coffee offers Plain, Medium, Sweet; Add Flavors offers its six. One is always
 * chosen. On the live menu a flavour never changes the price; since 2026-10-14 staff can give one an extra (dashboard →
 * Edit Item → Pricing), shown as "+500 IQD" on its card and added to the price of every size.
 *
 * Add-ons are NOT attached to drinks (owner, 2026-10-13: "why there is flavours in karak chai? the real website
 * doesn't have it"). On the live site Espresso Shot, Whipped Cream, Cold Foam, Skimmed Milk, Free Lactose and Add
 * Flavors are ordinary items of the ADD-ONS category, added to the cart on their own; ours are the same, under Extras.
 * (An earlier version offered them on every coffee as Milk / Add a flavor / Add-ons, by assumption.)
 *
 * Milk (owner, 2026-10-21: "change milk"): a drink made with milk offers Regular / Skimmed / Lactose-free. Their
 * prices are the branch's own add-on items "Skimmed Milk" and "Free Lactose" (Extras), so a price or stock change
 * there follows; a milk the branch does not sell or has run out of is left out. No "more milk" for now.
 *
 * Add-ons and flavour pumps (owner, 2026-10-21: "add on, pumps"), also priced from the branch's own add-on items:
 * - Flavour pumps: the flavours of "Add Flavors", up to 3 pumps in all, each at its price (per pump);
 * - Add-ons: Extra espresso shot ("Espresso Shot"), Whipped cream, Cold foam, on/off.
 * Which drinks: pumps on the milk drinks and the black coffees (Americano, Iced Americano, Filter Coffee); the shot on
 * the milk coffees and the black coffees; whipped cream and cold foam on the milk drinks.
 *
 * Chosen per item since 2026-10-26 (owner: "the owner chooses which item has add ons, and which have flavours, and
 * chooses what add ons and what flavours"): Dashboard → Flavours keeps the branch's flavour list (names in three
 * languages, in / out of stock); Edit Item → Options sets the item's "choose one" flavours, its flavour pumps (which,
 * and how many at most), its add-ons (any item of the Add-ons category; prices and stock stay there) and the milk
 * choice. An item staff have not set keeps the rules above (`legacyOpts`), so nothing changed until they edit it.
 */
export interface CustOption { id: string; label: string; price?: number; line?: string } // line = the words on the order line (English, for the staff); label otherwise
export interface CustGroup {
  id: string
  title: string
  kind: 'choice' | 'toggle' | 'count' // choice = one of the cards; toggle = on/off switches; count = a number of each (pumps), `max` in all
  max?: number
  optional?: boolean // a choice that can be left empty (tap again to clear)
  always?: boolean // name the choice on the order line even when it is the default (the flavour)
  defaultId?: string
  options: CustOption[]
}
export type Picks = Record<string, string[]> // group id -> chosen option ids

// the two titles, in the live site's own words
const WORDS: Record<string, [string, string]> = { // English -> [Arabic, Kurdish]
  'Select flavor': ['اختر النكهة', 'تام هەڵبژێرە'], 'Select type': ['اختر النوع', 'جۆر هەڵبژێرە'],
  'Milk': ['الحليب', 'شیر'], 'Regular milk': ['حليب عادي', 'شیری ئاسایی'], 'Skimmed milk': ['حليب خالي الدسم', 'شیری بێ چەوری'],
  'Lactose-free milk': ['حليب خالٍ من اللاكتوز', 'شیری بێ لاکتۆز'],
  'Extra flavour pump': ['مضخة نكهة إضافية', 'پەمپی تامی زیادە'], // was "Flavour pumps" (owner, 2026-10-27: "rename it to extra flavour pump")
  'Add-ons': ['إضافات', 'زیادەکان'],
  'Extra espresso shot': ['شوت إسبريسو إضافي', 'شۆتی ئێسپرێسۆی زیادە'], 'Whipped cream': ['كريمة مخفوقة', 'کرێمی کوتراو'], 'Cold foam': ['رغوة باردة', 'کەفی سارد'],
}
const word = (s: string, lang: Lang) => (lang === 'en' ? s : WORDS[s]?.[lang === 'ar' ? 0 : 1] ?? s)

// the drinks made with milk: the milk coffees, the iced milk coffees, the matchas and the milk-based hot drinks
const MILK_CATS = ['coffeeMilk', 'coldCoffee', 'matcha']
const MILK_ALSO = ['Karak Chai', 'Hot Chocolate', 'Hot Lotus', 'Hot Pistachio']
const BLACK_COFFEE = ['Americano', 'Iced Americano', 'Filter Coffee']
const milkCoffee = (item: MenuItem) => ['coffeeMilk', 'coldCoffee'].includes(categoryOf(item.name)) && !/americano/i.test(item.name)
const madeWithMilk = (item: MenuItem) => (MILK_CATS.includes(categoryOf(item.name)) && !/americano|espresso/i.test(item.name)) || MILK_ALSO.includes(item.name)
/** a milk add-on of the branch being looked at: its price, or undefined when the branch does not sell it now */
const addOn = (name: string) => { const it = ALL_ITEMS.find((i) => i.name === name); return it && !it.hidden && !it.soldOut ? (Array.isArray(it.price) ? it.price[0] : it.price) : undefined }

const NOT_ADDONS = ['Add Flavors', 'Skimmed Milk', 'Free Lactose'] // offered as the pumps and the milk choice instead
const ADDON_WORDS: Record<string, string> = { 'Espresso Shot': 'Extra espresso shot', 'Whipped Cream': 'Whipped cream', 'Cold Foam': 'Cold foam' }
/** the Add-ons category's items that can be offered on an item (the branch's own; any new one staff add there too) */
export const addonItems = (): MenuItem[] => (MENU.find((c) => c.id === 'extra')?.items ?? []).filter((i) => !i.hidden && !NOT_ADDONS.includes(i.name))

/** the branch's flavour list: staff's (Dashboard → Flavours), or, until they edit it, every flavour the menu uses now */
export function flavourList(): FlavourDef[] {
  const own = settingsFor(activeBranch()).flavours
  if (own) return own
  const seen = new Set<string>()
  const out: FlavourDef[] = []
  const add = (f: string) => { if (!seen.has(f)) { seen.add(f); out.push({ id: f, name: { en: f, ar: f, ku: f } }) } }
  ALL_ITEMS.find((i) => i.name === 'Add Flavors')?.flavors?.forEach(add)
  for (const i of ALL_ITEMS) if (!i.hidden) i.flavors?.forEach(add)
  return out
}

/** what an item offered before staff could choose (the rules above): the starting point of Edit Item → Options */
export function legacyOpts(item: MenuItem): ItemOpts {
  const pumpsOk = madeWithMilk(item) || BLACK_COFFEE.includes(item.name)
  const addons: string[] = []
  if (milkCoffee(item) || BLACK_COFFEE.includes(item.name)) addons.push('Espresso Shot')
  if (madeWithMilk(item)) addons.push('Whipped Cream', 'Cold Foam')
  return { pumps: pumpsOk ? [...(ALL_ITEMS.find((i) => i.name === 'Add Flavors')?.flavors ?? [])] : [], pumpMax: 3, addons, milk: madeWithMilk(item) }
}
export const optsOf = (item: MenuItem): ItemOpts => item.opts ?? legacyOpts(item)

/** the choices shown on an item's page, for the branch being looked at: its flavours, and the milk for a milk drink */
export function groupsFor(item: MenuItem, lang: Lang): CustGroup[] {
  const groups: CustGroup[] = []
  const o = optsOf(item)
  const list = new Map(flavourList().map((f) => [f.id, f]))
  const inStock = (id: string) => !list.get(id)?.out
  const label = (id: string) => list.get(id)?.name[lang]?.trim() || list.get(id)?.name.en?.trim() || id
  const line = (id: string) => list.get(id)?.name.en?.trim() || id // the staff's order line, in English
  const flavors = (item.flavors ?? []).filter(inStock)
  // the live site calls Turkish Coffee's Plain / Medium / Sweet "Select Type"
  if (flavors.length) groups.push({ id: 'flavor', title: word(flavors.includes('Plain') ? 'Select type' : 'Select flavor', lang), kind: 'choice', defaultId: flavors[0], always: true, options: flavors.map((f) => ({ id: f, label: label(f), line: line(f), price: item.flavorExtra?.[f] || undefined })) })
  if (o.milk) {
    const skimmed = addOn('Skimmed Milk')
    const lactose = addOn('Free Lactose')
    const opts: CustOption[] = [{ id: 'regular', label: word('Regular milk', lang), line: 'Regular milk' }]
    if (skimmed !== undefined) opts.push({ id: 'skimmed', label: word('Skimmed milk', lang), line: 'Skimmed milk', price: skimmed || undefined })
    if (lactose !== undefined) opts.push({ id: 'lactose', label: word('Lactose-free milk', lang), line: 'Lactose-free milk', price: lactose || undefined })
    if (opts.length > 1) groups.push({ id: 'milk', title: word('Milk', lang), kind: 'choice', defaultId: 'regular', options: opts })
  }
  // flavour pumps: the item's chosen flavours, each pump at the price of the branch's "Add Flavors"
  const pumpPrice = addOn('Add Flavors')
  const pumps = o.pumps.filter(inStock)
  if (pumps.length && pumpPrice !== undefined) {
    groups.push({ id: 'pumps', title: word('Extra flavour pump', lang), kind: 'count', max: o.pumpMax ?? 3, options: pumps.map((f) => ({ id: f, label: label(f), line: `${line(f)} pump`, price: pumpPrice || undefined })) })
  }
  // add-ons, on / off: the item's chosen Add-ons items the branch sells and has in stock now
  const extrasOn: CustOption[] = []
  for (const name of o.addons) {
    const p = addOn(name)
    if (p === undefined) continue
    const en = ADDON_WORDS[name]
    extrasOn.push({ id: name, label: en ? word(en, lang) : nameOf(name, lang), line: en ?? name, price: p || undefined })
  }
  if (extrasOn.length) groups.push({ id: 'addons', title: word('Add-ons', lang), kind: 'toggle', optional: true, options: extrasOn })
  return groups
}

export const defaultPicks = (groups: CustGroup[]): Picks => Object.fromEntries(groups.map((g) => [g.id, g.defaultId ? [g.defaultId] : []]))
/** how many times an option is picked (a pump can be picked more than once: its id repeats) */
export const timesPicked = (p: Picks, g: CustGroup, id: string) => (p[g.id] ?? []).filter((x) => x === id).length
/** extra cost of the chosen options: a flavour staff gave an extra, the milk, each pump, each add-on */
export const extras = (p: Picks, groups: CustGroup[]) => groups.reduce((n, g) => n + g.options.reduce((m, o) => m + (o.price || 0) * timesPicked(p, g, o.id), 0), 0)
/** the choices as words for the order line ("Vanilla", "Caramel pump ×2", "Whipped cream") */
export const summary = (p: Picks, groups: CustGroup[]): string[] =>
  groups.flatMap((g) => g.options.filter((o) => p[g.id]?.includes(o.id) && (g.always || o.id !== g.defaultId)).map((o) => {
    const n = timesPicked(p, g, o.id)
    return (o.line ?? o.label) + (g.kind === 'count' && n > 1 ? ` ×${n}` : '')
  }))
