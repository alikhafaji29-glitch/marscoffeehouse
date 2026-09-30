import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export interface CartLine {
  name: string
  size?: string
  price: number // unit price including the chosen options
  qty: number
  opts?: string[] // customization words, e.g. ["Almond milk", "Half sweet"]
}

export const lineKey = (l: { name: string; size?: string; opts?: string[] }) =>
  l.name + (l.size ? ` (${l.size})` : '') + (l.opts?.length ? ` · ${l.opts.join(', ')}` : '')

const CartContext = createContext<{
  lines: CartLine[]
  add: (line: Omit<CartLine, 'qty'>, qty: number) => void
  setQty: (key: string, qty: number) => void
  clear: () => void
  count: number
  total: number
  basket: Basket // which basket the screen is working on: the customer's own order, or a gift for a friend
}>({ lines: [], add: () => {}, setQty: () => {}, clear: () => {}, count: 0, total: 0, basket: 'order' })

export type Basket = 'order' | 'gift'
const KEYS: Record<Basket, string> = { order: 'mars-cart', gift: 'mars-gift' }
const load = (k: string): CartLine[] => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }

/* Two baskets with one API (owner 2026-09-14: the gift can hold several items, like an ordinary order):
 * `basket` = 'order' on the normal screens, 'gift' while the menu is in "Surprise your friend" mode. */
export function CartProvider({ basket = 'order', children }: { basket?: Basket; children: ReactNode }) {
  const [baskets, setBaskets] = useState<Record<Basket, CartLine[]>>(() => ({ order: load(KEYS.order), gift: load(KEYS.gift) }))
  const lines = baskets[basket]
  const setLines = (fn: (ls: CartLine[]) => CartLine[]) => setBaskets((b) => ({ ...b, [basket]: fn(b[basket]) }))

  useEffect(() => {
    localStorage.setItem(KEYS.order, JSON.stringify(baskets.order))
    localStorage.setItem(KEYS.gift, JSON.stringify(baskets.gift))
  }, [baskets])

  const add = (line: Omit<CartLine, 'qty'>, qty: number) => {
    setLines((ls) => {
      const key = lineKey(line)
      const existing = ls.find((l) => lineKey(l) === key)
      if (existing)
        return ls.map((l) => (lineKey(l) === key ? { ...l, qty: l.qty + qty } : l))
      return [...ls, { ...line, qty }]
    })
  }

  const setQty = (key: string, qty: number) => {
    setLines((ls) =>
      qty <= 0
        ? ls.filter((l) => lineKey(l) !== key)
        : ls.map((l) => (lineKey(l) === key ? { ...l, qty } : l)),
    )
  }

  const clear = () => setLines(() => [])
  const count = lines.reduce((n, l) => n + l.qty, 0)
  const total = lines.reduce((n, l) => n + l.price * l.qty, 0)

  return (
    <CartContext.Provider value={{ lines, add, setQty, clear, count, total, basket }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
