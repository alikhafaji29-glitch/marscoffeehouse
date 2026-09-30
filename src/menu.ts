// Menu data captured from marscoffeehouse.com (2026-08-24); checked against the live Erbil menu on 2026-09-29:
// 19 drinks Mars no longer sells were removed (51 drinks remain, all prices match).
// Prices in IQD. Stock availability is managed live on the ordering site,
// so we intentionally don't render soldOut here — it would go stale.
export type Badge = 'top' | 'premium' | 'signature'

export interface MenuItem {
  name: string
  price: number | [number, number]
  sizes?: [string, string]
  badge?: Badge
  soldOut?: boolean
}

export interface MenuCategory {
  id: string
  items: MenuItem[]
}

const oz8_12: [string, string] = ['8oz', '12oz']
const oz12_16: [string, string] = ['12oz', '16oz']

export const MENU: MenuCategory[] = [
  {
    id: 'coffeeMore',
    items: [
      { name: 'Americano', price: [3500, 4500], sizes: oz8_12, badge: 'top' },
      { name: 'Espresso', price: 3000, badge: 'premium' },
      { name: 'Espresso Doppio', price: 4000 },
      { name: 'Turkish Coffee', price: 3500 },
      { name: 'Turkish Coffee Double', price: 5000 },
      { name: 'Filter Coffee', price: [3500, 4500], sizes: oz8_12, soldOut: true },
      { name: 'Karak Chai', price: [5000, 6000], sizes: oz8_12, badge: 'top' },
      { name: 'Hot Lotus', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Hot Pistachio', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Hot Chocolate', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Cold Brew', price: 5500, soldOut: true },
    ],
  },
  {
    id: 'coffeeMilk',
    items: [
      { name: 'Latte Caramel', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Cappuccino Caramel', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Cortado', price: 5000 },
      { name: 'Latte Classic', price: [4000, 5000], sizes: oz8_12 },
      { name: 'Classic Cappuccino', price: [4000, 5000], sizes: oz8_12 },
      { name: 'Latte with Flavor', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Cappuccino with Flavors', price: [5500, 6500], sizes: oz8_12 },
      { name: 'Hot Spanish Latte', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Mocha Dark', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Mocha White', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Flat White', price: 5500 },
    ],
  },
  {
    id: 'coldCoffee',
    items: [
      { name: 'Ice Latte Caramel', price: [5000, 6000], sizes: oz12_16 },
      { name: 'Iced Americano', price: [3500, 4500], sizes: oz12_16 },
      { name: 'Mars Spanish Latte Signature', price: [5000, 6000], sizes: oz12_16, badge: 'signature' },
      { name: 'Iced Spanish Latte', price: [5000, 6000], sizes: oz12_16 },
      { name: 'Iced Classic Latte', price: [4000, 5000], sizes: oz12_16 },
      { name: 'Iced Latte with Flavor', price: [5000, 6000], sizes: oz12_16 },
      { name: 'Iced Dark Chocolate Mocha', price: [5000, 6000], sizes: oz12_16 },
      { name: 'Iced White Chocolate Mocha', price: [5000, 6000], sizes: oz12_16 },
    ],
  },
  {
    id: 'refreshers',
    items: [
      { name: 'Iced Peach Tea', price: [5000, 6000], sizes: oz12_16 },
      { name: 'Iced Mango Tea', price: [5000, 6000], sizes: oz12_16 },
      { name: 'Orange Pomegranate Fresh Juice', price: [5500, 6500], sizes: oz12_16 },
      { name: 'Energy +', price: 6500 },
      { name: 'Fresh Orange Juice', price: 5000 },
    ],
  },
  {
    id: 'milkshake',
    items: [
      { name: 'Lotus Milkshake', price: [5500, 6500], sizes: oz12_16 },
      { name: 'Pistachio Milkshake', price: [5500, 6500], sizes: oz12_16 },
      { name: 'Oreo Milkshake', price: [5500, 6500], sizes: oz12_16 },
      { name: 'Nutella Milkshake', price: [5500, 6500], sizes: oz12_16 },
      { name: 'Strawberry Milkshake', price: [5500, 6500], sizes: oz12_16 },
      { name: 'Rashi Milkshake', price: [5500, 6500], sizes: oz12_16 },
    ],
  },
  {
    id: 'mojito',
    items: [
      { name: 'Strawberry Mojito', price: [4500, 5500], sizes: oz12_16 },
      { name: 'Watermelon Mojito', price: [4500, 5500], sizes: oz12_16 },
      { name: 'Lemon-Mint Mojito', price: [4500, 5500], sizes: oz12_16, badge: 'signature' }, // 2026-09-10 Instagram poster; price assumed
      { name: 'Pomegranate Mojito', price: [5000, 6000], sizes: oz12_16 },
    ],
  },
  {
    id: 'smoothie',
    items: [
      { name: 'Strawberry Smoothie', price: 6000 },
      { name: 'Passion Fruit Smoothie', price: 6500 },
      { name: 'Mango with Orange Smoothie', price: 6500 },
    ],
  },
  {
    id: 'matcha',
    items: [
      { name: 'Classic Matcha', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Mid-Night Matcha', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Berry Matcha', price: [5000, 6000], sizes: oz8_12 },
    ],
  },
  {
    id: 'extra',
    items: [
      { name: 'Espresso Shot', price: 1000 },
      { name: 'Add Flavors', price: 1000 },
      { name: 'Whipped Cream', price: 2000 },
      { name: 'Skimmed Milk', price: 0 },
      { name: 'Free Lactose', price: 1000 },
      { name: 'Cold Foam', price: 1000 },
      { name: 'Milk Splash', price: 1000, soldOut: true },
    ],
  },
  {
    id: 'sweets',
    items: [
      { name: 'Banana Bread', price: 3500 },
      { name: 'Brownies Cup', price: 5500 },
      { name: 'Cheesecake Lotus', price: 6500 },
      { name: 'Cheesecake Strawberry', price: 6500 },
      { name: 'Cheesecake Lemon', price: 6500, soldOut: true },
      { name: 'Cheesecake Pistachio', price: 7500, soldOut: true },
      { name: 'Cheesecake Nutella', price: 6500 },
      { name: 'Cookies Dark', price: 3500 },
      { name: 'Cookies Brown', price: 3500 },
      { name: 'Cookies Red Velvet', price: 3500 },
      { name: 'Cookies Orange', price: 3500, soldOut: true },
      { name: 'Cookies New York', price: 3500 },
      { name: 'Tiramisu', price: 8500, soldOut: true },
      { name: 'Croissant Butter', price: 4500, soldOut: true },
      { name: 'Croissant Nutella', price: 5500 },
      { name: 'Croissant Pistachio', price: 5500 },
      { name: 'Croissant Cheese', price: 5500 },
      { name: 'Danish Pastry (Custard & Cherry)', price: 6500, soldOut: true },
      { name: 'Berliner', price: 3500, soldOut: true },
      { name: 'Cinnamon Roll', price: 6500, soldOut: true },
      { name: 'San Sebastian', price: 6500 },
      { name: 'Coffee Mousse Cake', price: 6000 },
      { name: 'Mango Mousse Cake', price: 6500 },
      { name: 'Orange Cream Cake', price: 7500 },
      { name: 'Blueberry Cheesecake', price: 7000, soldOut: true },
      { name: 'Red Velvet Cake', price: 6500 },
      { name: 'Éclair Praline', price: 4500, soldOut: true },
      { name: 'Almond Croissant', price: 7000, soldOut: true },
      { name: 'Pistachio & Berry Cake', price: 8000, soldOut: true },
      { name: 'Blueberry Danish', price: 6000, soldOut: true },
      { name: 'Strawberry Danish', price: 6000, soldOut: true },
      { name: 'Pastry Cream Danish', price: 6000, soldOut: true },
      { name: 'Chocolate Danish', price: 6500 },
      { name: 'Fruit Danish', price: 6000, soldOut: true },
      { name: 'Pineapple Danish', price: 6000, soldOut: true },
      { name: 'Hazelnut Pie', price: 7000, soldOut: true },
      { name: 'Chocolate Lava Cookie', price: 3500, soldOut: true },
      { name: 'Lotus Lava Cookie', price: 3500, soldOut: true },
      { name: 'Molten Cake', price: 5000 },
    ],
  },
  {
    id: 'savory',
    items: [
      { name: 'Turkey Sandwich (Lightly Spiced)', price: 3500 },
      { name: 'Halloumi Sandwich', price: 3500 },
      { name: 'Caesar Sandwich', price: 3500 },
      { name: 'Caesar Salad', price: 7000, soldOut: true },
      { name: 'Halloumi Salad', price: 7500, soldOut: true },
      { name: 'Beetroot Salad', price: 7000, soldOut: true },
      { name: 'Strawberry Granola Yogurt', price: 3500 },
      { name: 'Peanut Butter Banana Toast', price: 2500, soldOut: true },
    ],
  },
]

/* Positive Energy (owner, 2026-09-14): not a category of its own but a curated MIX picked from the others,
 * shown first on the Order screen. Edit the names here to change the mix; unknown names are skipped. */
export const POSITIVE_PICKS = [
  'Americano', 'Karak Chai', 'Mars Spanish Latte Signature', 'Iced Spanish Latte', 'Iced Peach Tea',
  'Nutella Milkshake', 'Lemon-Mint Mojito', 'Mango with Orange Smoothie', 'Classic Matcha',
  'Cheesecake Lotus', 'Turkey Sandwich (Lightly Spiced)',
]
/* New Season (owner, 2026-09-27): the same drinks as Home's "New this season" cards (three since 2026-09-28) */
export const SEASON_PICKS = ['Lemon-Mint Mojito', 'Mango with Orange Smoothie', 'Nutella Milkshake']
const ALL_ITEMS = MENU.flatMap((c) => c.items)
const pick = (names: string[]): MenuItem[] => names.map((n) => ALL_ITEMS.find((i) => i.name === n)).filter((x): x is MenuItem => !!x)
export const positiveItems = (): MenuItem[] => pick(POSITIVE_PICKS)
/* Signature (owner, 2026-09-27): every item carrying the SIGNATURE badge */
const signatureItems = (): MenuItem[] => ALL_ITEMS.filter((i) => i.badge === 'signature')
/** the curated mixes shown before the real categories; their items keep their own category (tint, photo) */
export const CURATED = ['positive', 'season', 'signature']
/** what the Order screen shows: Positive Energy, New Season and Signature first, then the menu starts (owner, 2026-09-27) */
export const ORDER_MENU: MenuCategory[] = [
  { id: 'positive', items: positiveItems() },
  { id: 'season', items: pick(SEASON_PICKS) },
  { id: 'signature', items: signatureItems() },
  ...MENU,
]
