import { MENU } from './menu'
import { PHOTOS } from './photos'
import type { TKey } from './i18n'

/* Per-item presentation shared by the Order screen cards and the full-screen item page. */

// item photos where the owner's Instagram shots exist; everything else gets a drawn cup tinted by category
export const PHOTO: Record<string, string> = {
  'Lemon-Mint Mojito': PHOTOS.lemonMint, 'Mango with Orange Smoothie': PHOTOS.smoothie, 'Nutella Milkshake': PHOTOS.nutella,
  'Strawberry Milkshake': PHOTOS.shakes, 'Pistachio Milkshake': PHOTOS.shakes, 'Lotus Milkshake': PHOTOS.cap,
}
export const DESC: Record<string, TKey> = {
  'Lemon-Mint Mojito': 'descLemonMint', 'Mango with Orange Smoothie': 'descSmoothie', 'Nutella Milkshake': 'descNutella',
  'Strawberry Milkshake': 'descStrawberry', 'Pistachio Milkshake': 'descPistachio', 'Lotus Milkshake': 'descLotus',
}
export const TINT: Record<string, [number, number, number]> = {
  positive: [255, 190, 90],
  coffeeMore: [118, 78, 48], coffeeMilk: [196, 154, 112], coldCoffee: [104, 66, 38], refreshers: [255, 168, 64],
  milkshake: [244, 200, 214], mojito: [196, 236, 186], smoothie: [255, 148, 84], matcha: [128, 178, 92],
  extra: [204, 204, 204], sweets: [222, 170, 120], savory: [230, 204, 150],
}
export const categoryOf = (name: string): string => MENU.find((c) => c.items.some((i) => i.name === name))?.id ?? 'extra'
export const isIced = (cat: string) => cat === 'coldCoffee' || cat === 'refreshers' || cat === 'mojito'
