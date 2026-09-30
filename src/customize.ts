import type { TKey } from './i18n'

/*
 * Item customization — DEMO placeholders (owner, 2026-09-14: "the customization is later to be
 * decided, now just build it as a demo"). Same three groups on every item, Blank Street style:
 * a milk choice, a flavour toggle, a paid strength add-on. Swap this list for the real one.
 */
export interface CustOption { id: string; label: TKey; note?: TKey; price?: number }
export interface CustGroup {
  id: string
  title: TKey
  kind: 'choice' | 'toggle' // choice = one of the cards; toggle = on/off switches
  hint?: TKey
  optional?: boolean // a choice that can be left empty (tap again to clear)
  always?: boolean // name the choice on the order line even when it is the default (e.g. the flavour)
  defaultId?: string
  options: CustOption[]
}
export const GROUPS: CustGroup[] = [
  { id: 'milk', title: 'custMilk', kind: 'choice', defaultId: 'oat', options: [
    { id: 'whole', label: 'optWhole' }, { id: 'oat', label: 'optOat' }, { id: 'almond', label: 'optAlmond', note: 'noteNuts' }, { id: 'skim', label: 'optSkim' },
  ] },
  { id: 'flavor', title: 'custFlavor', kind: 'toggle', hint: 'custFlavorHint', options: [{ id: 'halfSweet', label: 'optHalfSweet' }] },
  { id: 'strength', title: 'custStrength', kind: 'choice', optional: true, options: [{ id: 'extraShot', label: 'optExtraShot', price: 1000 }] },
]
/* Real per-drink choices from the owner, shown above the demo groups. */
// Latte with Flavor — the owner's flavour list (2026-09-26): Vanilla, Hazelnut, Cookies, Sugar-free Caramel, Brownie
const LATTE_FLAVORS: CustGroup = { id: 'latteFlavor', title: 'custSelectFlavor', kind: 'choice', defaultId: 'vanilla', always: true, options: [
  { id: 'vanilla', label: 'flavVanilla' }, { id: 'hazelnut', label: 'flavHazelnut' }, { id: 'cookies', label: 'flavCookies' },
  { id: 'caramelSF', label: 'flavCaramelSF' }, { id: 'brownie', label: 'flavBrownie' },
] }
const ITEM_GROUPS: Record<string, CustGroup[]> = {
  'Latte with Flavor': [LATTE_FLAVORS],
}
/** the choices shown on an item's page: its own groups first, then the shared demo groups */
export const groupsFor = (itemName: string): CustGroup[] => [...(ITEM_GROUPS[itemName] ?? []), ...GROUPS]

export type Picks = Record<string, string[]> // group id -> chosen option ids
export const defaultPicks = (groups: CustGroup[] = GROUPS): Picks => Object.fromEntries(groups.map((g) => [g.id, g.defaultId ? [g.defaultId] : []]))
/** extra cost of the chosen options */
export const extras = (p: Picks, groups: CustGroup[] = GROUPS) => groups.reduce((n, g) => n + g.options.filter((o) => p[g.id]?.includes(o.id)).reduce((m, o) => m + (o.price || 0), 0), 0)
/** the non-default choices (plus the "always" ones), as words for the order line ("Vanilla, Almond milk, Half sweet") */
export const summary = (p: Picks, t: (k: TKey) => string, groups: CustGroup[] = GROUPS): string[] =>
  groups.flatMap((g) => g.options.filter((o) => p[g.id]?.includes(o.id) && (g.always || o.id !== g.defaultId)).map((o) => t(o.label)))
