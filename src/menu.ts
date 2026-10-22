// The catalogue: every item Mars sells in either branch, by category, in the order the site shows them.
// It was brought in line with the live menus (marscoffeehouse.com/erbil and /kirkuk) on 2026-10-13: Kakaw Crunch and
// Honey Mustard Chicken Sandwich added, 22 items neither branch sells removed, four food prices corrected.
// What differs per branch (price per size, stock, tag, whether the branch sells it at all, description, flavours,
// nutrition) is NOT decided here: src/menuAdmin.ts writes it onto these items from src/menuData.json (the live
// menus as read) and, with the backend on, from the database's menu_items table. The prices below are Erbil's and
// only a last resort.
export type Badge = 'top' | 'premium' | 'signature'

/** a fixed price for an item's smallest size, from a Home slide such as Coffee of the day; `label` goes on the order line */
export type Deal = { price: number; label: string }
export interface MenuItem {
  name: string
  price: number | number[] // one price, or one per size (up to three)
  sizes?: string[]
  badge?: Badge
  soldOut?: boolean // set by staff (menuAdmin.ts)
  hidden?: boolean // this branch does not sell it (menuAdmin.ts): left out of the menu, the picks and the combos
  flavorExtra?: Record<string, number> // what a flavour adds to the price, when it adds anything (menuAdmin.ts)
  flavors?: string[] // e.g. Vanilla, Hazelnut… for Latte with Flavor; Plain, Medium, Sweet for Turkish Coffee (menuAdmin.ts)
}

export interface MenuCategory {
  id: string
  items: MenuItem[]
}

const oz8_12 = ['8oz', '12oz']
const oz12_16 = ['12oz', '16oz']

export const MENU: MenuCategory[] = [
  {
    id: 'coffeeMore',
    items: [
      { name: 'Americano', price: [3500, 4500], sizes: oz8_12, badge: 'top' },
      { name: 'Espresso', price: 3000, badge: 'premium' },
      { name: 'Espresso Doppio', price: 4000 },
      { name: 'Turkish Coffee', price: 3500 },
      { name: 'Turkish Coffee Double', price: 5000 },
      { name: 'Filter Coffee', price: [3500, 4500], sizes: oz8_12 },
      { name: 'Karak Chai', price: [5000, 6000], sizes: oz8_12, badge: 'top' },
      { name: 'Hot Lotus', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Hot Pistachio', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Hot Chocolate', price: [5000, 6000], sizes: oz8_12 },
      { name: 'Cold Brew', price: 5500 },
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
    id: 'extra',
    items: [
      { name: 'Espresso Shot', price: 1000 },
      { name: 'Add Flavors', price: 1000 },
      { name: 'Whipped Cream', price: 2000 },
      { name: 'Skimmed Milk', price: 0 },
      { name: 'Free Lactose', price: 1000 },
      { name: 'Cold Foam', price: 1000 },
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
    id: 'autumn',
    items: [
      { name: 'Kakaw Crunch', price: 5000, badge: 'signature' },
      { name: 'Pink +', price: 5000 }, // added 2026-10-22 (owner's campaign photo); also in the database for both branches
    ],
  },
  {
    id: 'sweets',
    items: [
      { name: 'Banana Bread', price: 3500 },
      { name: 'Cheesecake Lotus', price: 5500 },
      { name: 'Cheesecake Pistachio', price: 5500 },
      { name: 'Cheesecake Nutella', price: 5500 },
      { name: 'San Sebastian', price: 6000 },
      { name: 'Chocolate Lava Cookie', price: 3500 },
      { name: 'Lotus Lava Cookie', price: 3500 },
      { name: 'Cookies Dark', price: 3500 },
      { name: 'Cookies Brown', price: 3500 },
      { name: 'Cookies Red Velvet', price: 3500 },
      { name: 'Cookies New York', price: 3500 },
      { name: 'Croissant Nutella', price: 5500 },
      { name: 'Croissant Pistachio', price: 5500 },
      { name: 'Croissant Cheese', price: 5500 },
      { name: 'Coffee Mousse Cake', price: 6000 },
      { name: 'Mango Mousse Cake', price: 6500 },
      { name: 'Orange Cream Cake', price: 7500 },
      { name: 'Red Velvet Cake', price: 6500 },
      { name: 'Carrot Cake', price: 6000 }, // added 2026-10-22 for New this season (owner); price a placeholder, also in the database
      { name: 'Chocolate Danish', price: 6500 },
      { name: 'Molten Cake', price: 3500 }, // Kirkuk only
      { name: 'Brownies Cup', price: 5500 },
    ],
  },
  {
    id: 'savory',
    items: [
      { name: 'Turkey Sandwich (Lightly Spiced)', price: 3500 },
      { name: 'Halloumi Sandwich', price: 3500 },
      { name: 'Caesar Sandwich', price: 3500 },
      { name: 'Honey Mustard Chicken Sandwich', price: 3500, badge: 'premium' },
      { name: 'Caesar Salad', price: 7000 },
      { name: 'Strawberry Granola Yogurt', price: 3500 },
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
export const SEASON_PICKS = ['Pink +', 'Kakaw Crunch', 'Carrot Cake'] // 2026-10-22 (owner); was the mojito, smoothie and Nutella milkshake
/** every item of the menu. A live list: menuAdmin.ts rewrites it in place when staff add items, so read it when needed, do not copy it */
export const ALL_ITEMS = MENU.flatMap((c) => c.items)
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
