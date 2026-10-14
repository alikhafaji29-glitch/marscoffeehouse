import type { Lang } from './i18n'
import type { MenuItem } from './menu'

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
 */
export interface CustOption { id: string; label: string; price?: number }
export interface CustGroup {
  id: string
  title: string
  kind: 'choice' | 'toggle' // choice = one of the cards; toggle = on/off switches
  optional?: boolean // a choice that can be left empty (tap again to clear)
  always?: boolean // name the choice on the order line even when it is the default (the flavour)
  defaultId?: string
  options: CustOption[]
}
export type Picks = Record<string, string[]> // group id -> chosen option ids

// the two titles, in the live site's own words
const WORDS: Record<string, [string, string]> = { // English -> [Arabic, Kurdish]
  'Select flavor': ['اختر النكهة', 'تام هەڵبژێرە'], 'Select type': ['اختر النوع', 'جۆر هەڵبژێرە'],
}
const word = (s: string, lang: Lang) => (lang === 'en' ? s : WORDS[s]?.[lang === 'ar' ? 0 : 1] ?? s)

/** the choices shown on an item's page, for the branch being looked at: its flavours, when it has any */
export function groupsFor(item: MenuItem, lang: Lang): CustGroup[] {
  const flavors = item.flavors ?? []
  if (!flavors.length) return []
  // the live site calls Turkish Coffee's Plain / Medium / Sweet "Select Type"
  const title = word(flavors.includes('Plain') ? 'Select type' : 'Select flavor', lang)
  return [{ id: 'flavor', title, kind: 'choice', defaultId: flavors[0], always: true, options: flavors.map((f) => ({ id: f, label: f, price: item.flavorExtra?.[f] || undefined })) }] // a flavour's name is the same in every language on the live menu
}

export const defaultPicks = (groups: CustGroup[]): Picks => Object.fromEntries(groups.map((g) => [g.id, g.defaultId ? [g.defaultId] : []]))
/** extra cost of the chosen options: a flavour staff gave an extra */
export const extras = (p: Picks, groups: CustGroup[]) => groups.reduce((n, g) => n + g.options.filter((o) => p[g.id]?.includes(o.id)).reduce((m, o) => m + (o.price || 0), 0), 0)
/** the choices as words for the order line ("Vanilla") */
export const summary = (p: Picks, groups: CustGroup[]): string[] =>
  groups.flatMap((g) => g.options.filter((o) => p[g.id]?.includes(o.id) && (g.always || o.id !== g.defaultId)).map((o) => o.label))
