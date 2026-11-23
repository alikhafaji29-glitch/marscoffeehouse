import type { Order } from '../account'
import { categoryOf } from '../menuMeta'
import type { StaffData } from './store'

/*
 * The numbers behind Analytics: the orders this screen holds and the visits it counted. (The "Sample data" switch
 * and its made-up rows were removed on the owner's word, 2026-11-23: the site has been live for a month.)
 */
export interface Row { at: number; total: number; items: { name: string; qty: number }[]; delivery: boolean; done: boolean; wallet: boolean; combo?: boolean }
export type Range = 'today' | '7' | '30' | '90' | 'all'
export const RANGES: Range[] = ['today', '7', '30', '90', 'all']
const DAY = 86400000
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const startOf = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

/** "Latte Caramel (8oz) · Oat milk ×2" → { name: 'Latte Caramel', qty: 2 } */
function parseLine(line: string) {
  const qty = Number(/×(\d+)\s*$/.exec(line)?.[1] ?? 1)
  const name = line.replace(/\s*×\d+\s*$/, '').split(' · ')[0].replace(/\s*\((8|12|16)oz\)$/, '').trim()
  return { name, qty }
}
export const rowsFromOrders = (orders: Order[]): Row[] => orders.filter((o) => o.status !== 'cancelled').map((o) => ({ // a cancelled order is not a sale
  at: o.at, total: o.total, items: o.items.map(parseLine), delivery: o.fulfil === 'delivery', done: (o.status ?? 'received') === 'delivered', wallet: o.pay === 'wallet', combo: !!o.offer,
}))

/** the first day the range covers (for "all": the first row's day, at least the last 7 days) */
export function rangeStart(range: Range, now: number, firstAt?: number): number {
  const today = startOf(now)
  if (range === 'today') return today
  if (range === 'all') return Math.min(today - 6 * DAY, firstAt ? startOf(firstAt) : today)
  return today - (Number(range) - 1) * DAY
}

export interface Summary {
  orders: number; done: number; pending: number; revenue: number; avg: number; units: number; delivery: number; pickup: number; combos: number
  perDay: { day: number; orders: number; revenue: number }[]
  perHour: number[]
  top: { label: string; value: number }[]
  cats: { id: string; value: number }[]
}
export function summarize(rows: Row[], range: Range, now: number): Summary {
  const from = rangeStart(range, now, rows.length ? Math.min(...rows.map((r) => r.at)) : undefined)
  const inRange = rows.filter((r) => r.at >= from && r.at <= now)
  const days = Math.round((startOf(now) - from) / DAY) + 1
  const perDay = Array.from({ length: days }, (_, i) => ({ day: from + i * DAY, orders: 0, revenue: 0 }))
  const perHour = Array<number>(24).fill(0)
  const units = new Map<string, number>()
  const cats = new Map<string, number>()
  let revenue = 0, done = 0, delivery = 0, count = 0
  for (const r of inRange) {
    const d = perDay[Math.round((startOf(r.at) - from) / DAY)]
    if (d) { d.orders++; d.revenue += r.total }
    perHour[new Date(r.at).getHours()]++
    revenue += r.total
    if (r.done) done++
    if (r.delivery) delivery++
    for (const it of r.items) {
      units.set(it.name, (units.get(it.name) ?? 0) + it.qty)
      const c = categoryOf(it.name)
      cats.set(c, (cats.get(c) ?? 0) + it.qty)
      count += it.qty
    }
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])
  return {
    orders: inRange.length, done, pending: inRange.length - done, revenue, avg: inRange.length ? Math.round(revenue / inRange.length) : 0, units: count,
    delivery, pickup: inRange.length - delivery, combos: inRange.filter((r) => r.combo).length, perDay, perHour,
    top: sorted(units).slice(0, 8).map(([label, value]) => ({ label, value })),
    cats: sorted(cats).slice(0, 6).map(([id, value]) => ({ id, value })),
  }
}

export interface Traffic { total: number; avg: number; best: { day: string; n: number } | null; sources: { label: string; value: number; share: number }[]; perDay: { day: number; n: number }[] }
export function traffic(visits: StaffData['visits'], range: Range, now: number): Traffic {
  const keys = Object.keys(visits).sort()
  const from = rangeStart(range, now, keys.length ? new Date(keys[0] + 'T00:00').getTime() : undefined)
  const days = Math.round((startOf(now) - from) / DAY) + 1
  const perDay = Array.from({ length: days }, (_, i) => ({ day: from + i * DAY, n: 0 }))
  const src = new Map<string, number>()
  let total = 0
  let best: Traffic['best'] = null
  for (const d of perDay) {
    const v = visits[dayKey(d.day)]
    if (!v) continue
    for (const [s, n] of Object.entries(v)) { d.n += n; src.set(s, (src.get(s) ?? 0) + n) }
    total += d.n
    if (!best || d.n > best.n) best = { day: dayKey(d.day), n: d.n }
  }
  return {
    total, avg: Math.round((total / days) * 10) / 10, best, perDay,
    sources: [...src.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, share: total ? Math.round((value / total) * 100) : 0 })),
  }
}

/** the range as CSV: one line per day, then the top sellers */
export function toCsv(s: Summary): string {
  const lines = ['Day,Orders,Revenue (IQD)', ...s.perDay.map((d) => `${dayKey(d.day)},${d.orders},${d.revenue}`), '', 'Item,Units', ...s.top.map((t) => `"${t.label.replace(/"/g, '""')}",${t.value}`)]
  return lines.join('\n')
}

/* ---- the time each step takes (owner, 2026-11-23: "order recieved at 8:00, praparing at 8:03, done at 8:10, on the way
 * at 8:15 … show analytics of time spent through every step"). An order's `history` already holds the moment of every
 * status change. A step = from the first time the order reached one status to the first time it reached the next
 * (delivered: the last time). A step longer than 12 hours is left out (an order forgotten open), and so is "on the way"
 * shorter than a minute: staff often tap On the way and Delivered together, which says nothing about the road. ---- */
export type StepKey = 'accept' | 'prepare' | 'wait' | 'out' | 'road' | 'handover' | 'total'
export interface StepTime { key: StepKey; n: number; avg: number; median: number; slow: number } // minutes; slow = 9 in 10 were faster
const STEPS: { key: StepKey; from: Order['status']; to: Order['status']; how: 'delivery' | 'pickup' | 'both' }[] = [
  { key: 'accept', from: 'received', to: 'preparing', how: 'both' },
  { key: 'prepare', from: 'preparing', to: 'done', how: 'both' },
  { key: 'wait', from: 'done', to: 'onway', how: 'delivery' },
  // received → on the way: what the shop itself controls; the road and the Delivered tap come after it. The live data
  // (2026-11-23) shows why it is the figure to trust: Erbil leaves orders On the way for hours and marks them Delivered
  // in one go, Kirkuk taps On the way and Delivered together
  { key: 'out', from: 'received', to: 'onway', how: 'delivery' },
  { key: 'road', from: 'onway', to: 'delivered', how: 'delivery' },
  { key: 'handover', from: 'done', to: 'delivered', how: 'pickup' },
  { key: 'total', from: 'received', to: 'delivered', how: 'both' },
]
/** when an order reached a status: the first time, or for delivered the last */
export function stageAt(o: Order, stage: Order['status']): number | undefined {
  const hits = (o.history ?? []).filter((h) => h.stage === stage).map((h) => h.at)
  if (stage === 'received' && !hits.length) return o.at
  return hits.length ? (stage === 'delivered' ? Math.max(...hits) : Math.min(...hits)) : undefined
}
export function stepTimes(orders: Order[], how: 'delivery' | 'pickup', from: number, to: number): { steps: StepTime[]; orders: number; skippedRoad: number } {
  const mine = orders.filter((o) => o.at >= from && o.at <= to && o.status === 'delivered' && (o.fulfil === 'delivery') === (how === 'delivery'))
  let skippedRoad = 0
  const steps = STEPS.filter((st) => st.how === 'both' || st.how === how).map((st) => {
    const mins: number[] = []
    for (const o of mine) {
      const a = stageAt(o, st.from), b = stageAt(o, st.to)
      if (a === undefined || b === undefined || b < a) continue
      const m = (b - a) / 60000
      if (m > 12 * 60) continue
      if (st.key === 'road' && m < 1) { skippedRoad++; continue }
      mins.push(m)
    }
    mins.sort((x, y) => x - y)
    const pick = (q: number) => (mins.length ? mins[Math.min(mins.length - 1, Math.floor(q * mins.length))] : 0)
    return { key: st.key, n: mins.length, avg: mins.length ? mins.reduce((x, y) => x + y, 0) / mins.length : 0, median: pick(0.5), slow: pick(0.9) }
  })
  return { steps, orders: mine.length, skippedRoad }
}
