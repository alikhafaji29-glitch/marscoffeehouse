import { MENU } from '../menu'
import type { Order } from '../account'
import { categoryOf } from '../menuMeta'
import type { BranchId, StaffData } from './store'

/*
 * The numbers behind Analytics. Real rows come from the orders stored in this browser and the visits it counted.
 * Sample rows (the "Sample data" switch) are made up here from the menu with a fixed seed, so the charts can be
 * judged before there are real orders; they are NOT Mars sales figures.
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

// a small seeded generator (mulberry32) so the sample never changes between visits
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const SAMPLE_ITEMS = MENU.filter((c) => c.id !== 'extra').flatMap((c) => c.items)
const HOUR_WEIGHT = [0, 0, 0, 0, 0, 0, 0, 3, 8, 12, 11, 9, 6, 5, 4, 4, 5, 6, 6, 5, 4, 3, 1, 0]
const HOURS = HOUR_WEIGHT.flatMap((w, h) => Array<number>(w).fill(h))
const SOURCES: [string, number][] = [['Instagram', 46], ['Direct', 24], ['Referral', 16], ['Google', 10], ['Facebook', 4]]

export function sampleRows(branch: BranchId, now: number): Row[] {
  const r = rng(branch === 'erbil' ? 7 : 19)
  const rows: Row[] = []
  const today = startOf(now)
  // favourites sell more: the first third of a shuffled menu gets most of the picks
  const pool = [...SAMPLE_ITEMS].sort(() => r() - 0.5)
  const pickItem = () => pool[Math.floor(Math.pow(r(), 2.2) * pool.length)]
  for (let d = 89; d >= 0; d--) {
    const start = today - d * DAY
    const weekend = [5, 6].includes(new Date(start).getDay())
    const n = Math.round((branch === 'erbil' ? 14 : 9) * (weekend ? 1.35 : 1) * (0.7 + r() * 0.6) * (1 + (89 - d) / 220))
    for (let i = 0; i < n; i++) {
      const at = start + HOURS[Math.floor(r() * HOURS.length)] * 3600000 + Math.floor(r() * 3600000)
      if (at > now) continue
      const lines = 1 + Math.floor(r() * 2.4)
      const items: Row['items'] = []
      let total = 0
      for (let k = 0; k < lines; k++) {
        const it = pickItem()
        const qty = r() < 0.15 ? 2 : 1
        const p = Array.isArray(it.price) ? it.price[r() < 0.6 ? 0 : 1] : it.price
        total += p * qty
        items.push({ name: it.name, qty })
      }
      rows.push({ at, total, items, delivery: r() < 0.7, done: now - at > 3600000, wallet: r() < 0.25 })
    }
  }
  return rows
}
export function sampleVisits(branch: BranchId, now: number): StaffData['visits'] {
  const r = rng(branch === 'erbil' ? 31 : 43)
  const out: StaffData['visits'] = {}
  for (let d = 89; d >= 0; d--) {
    const n = Math.round((branch === 'erbil' ? 90 : 55) * (0.6 + r() * 0.9) * (1 + (89 - d) / 160))
    const day: Record<string, number> = {}
    for (const [src, w] of SOURCES) day[src] = Math.round((n * w) / 100 * (0.8 + r() * 0.4))
    out[dayKey(startOf(now) - d * DAY)] = day
  }
  return out
}

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
