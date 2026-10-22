import { MENU } from './menu'
import type { TKey } from './i18n'

/* Per-item presentation shared by the Order screen cards and the full-screen item page. */

// item photos, both branches (owner's product shots, `items images/`, 2026-10-22): cropped to the item on a white square
// in public/assets/menu/; art on top = the 45 degree shot, art in front = the front shot; variants share the base
// drink's photo until they have their own. A staff photo for a branch (dashboard) wins; no photo = a drawn cup.
export const PHOTO: Record<string, string> = {
  'Classic Cappuccino': '/assets/menu/classic-cappuccino.webp',
  'Cortado': '/assets/menu/cortado.webp',
  'Flat White': '/assets/menu/flat-white.webp',
  'Latte Classic': '/assets/menu/latte-classic.webp',
  'Hot Chocolate': '/assets/menu/hot-chocolate.webp',
  'Hot Lotus': '/assets/menu/hot-lotus.webp',
  'Hot Pistachio': '/assets/menu/hot-pistachio.webp',
  'Karak Chai': '/assets/menu/karak-chai.webp',
  'Americano': '/assets/menu/americano.webp',
  'Filter Coffee': '/assets/menu/filter-coffee.webp',
  'Espresso': '/assets/menu/espresso.webp',
  'Espresso Doppio': '/assets/menu/espresso-doppio.webp',
  'Turkish Coffee': '/assets/menu/turkish-coffee.webp',
  'Cold Brew': '/assets/menu/cold-brew.webp',
  'Iced Americano': '/assets/menu/iced-americano.webp',
  'Iced Classic Latte': '/assets/menu/iced-classic-latte.webp',
  'Iced Latte with Flavor': '/assets/menu/iced-latte-with-flavor.webp',
  'Iced Spanish Latte': '/assets/menu/iced-spanish-latte.webp',
  'Iced White Chocolate Mocha': '/assets/menu/iced-white-chocolate-mocha.webp',
  'Iced Mango Tea': '/assets/menu/iced-mango-tea.webp',
  'Iced Peach Tea': '/assets/menu/iced-peach-tea.webp',
  'Lotus Milkshake': '/assets/menu/lotus-milkshake.webp',
  'Nutella Milkshake': '/assets/menu/nutella-milkshake.webp',
  'Pistachio Milkshake': '/assets/menu/pistachio-milkshake.webp',
  'Rashi Milkshake': '/assets/menu/rashi-milkshake.webp',
  'Strawberry Milkshake': '/assets/menu/strawberry-milkshake.webp',
  'Pink +': '/assets/menu/pink-plus.webp',
  'Kakaw Crunch': '/assets/menu/kakaw-crunch.webp',
  'Lemon-Mint Mojito': '/assets/menu/lemon-mint-mojito.webp',
  'Watermelon Mojito': '/assets/menu/watermelon-mojito.webp',
  'Pomegranate Mojito': '/assets/menu/pomegranate-mojito.webp',
  'Strawberry Mojito': '/assets/menu/strawberry-mojito.webp',
  'Fresh Orange Juice': '/assets/menu/fresh-orange-juice.webp',
  'Mango with Orange Smoothie': '/assets/menu/mango-with-orange-smoothie.webp',
  'Passion Fruit Smoothie': '/assets/menu/passion-fruit-smoothie.webp',
  'Strawberry Smoothie': '/assets/menu/strawberry-smoothie.webp',
  'Caesar Sandwich': '/assets/menu/caesar-sandwich.webp',
  'Halloumi Sandwich': '/assets/menu/halloumi-sandwich.webp',
  'Honey Mustard Chicken Sandwich': '/assets/menu/honey-mustard-chicken-sandwich.webp',
  'Turkey Sandwich (Lightly Spiced)': '/assets/menu/turkey-sandwich-lightly-spiced.webp',
  'Cookies Dark': '/assets/menu/cookies-dark.webp',
  'Cookies New York': '/assets/menu/cookies-new-york.webp',
  'Cookies Brown': '/assets/menu/cookies-brown.webp',
  'Cappuccino Caramel': '/assets/menu/classic-cappuccino.webp',
  'Cappuccino with Flavors': '/assets/menu/classic-cappuccino.webp',
  'Latte Caramel': '/assets/menu/latte-classic.webp',
  'Latte with Flavor': '/assets/menu/latte-classic.webp',
  'Hot Spanish Latte': '/assets/menu/latte-classic.webp',
  'Turkish Coffee Double': '/assets/menu/turkish-coffee.webp',
  'Ice Latte Caramel': '/assets/menu/iced-classic-latte.webp',
}
export const DESC: Record<string, TKey> = {
  'Lemon-Mint Mojito': 'descLemonMint', 'Mango with Orange Smoothie': 'descSmoothie', 'Nutella Milkshake': 'descNutella',
  'Strawberry Milkshake': 'descStrawberry', 'Pistachio Milkshake': 'descPistachio', 'Lotus Milkshake': 'descLotus',
}
export const TINT: Record<string, [number, number, number]> = {
  positive: [255, 190, 90],
  coffeeMore: [118, 78, 48], coffeeMilk: [196, 154, 112], coldCoffee: [104, 66, 38], refreshers: [255, 168, 64],
  milkshake: [244, 200, 214], mojito: [196, 236, 186], smoothie: [255, 148, 84], matcha: [128, 178, 92], autumn: [150, 92, 52],
  extra: [204, 204, 204], sweets: [222, 170, 120], savory: [230, 204, 150],
}
export const categoryOf = (name: string): string => MENU.find((c) => c.items.some((i) => i.name === name))?.id ?? 'extra'
export const isIced = (cat: string) => cat === 'coldCoffee' || cat === 'refreshers' || cat === 'mojito'
