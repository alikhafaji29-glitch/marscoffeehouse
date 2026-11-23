import type { Order } from '../account'
import { countAt } from '../orders'
import { startOf } from './stats'

/*
 * Smart report (owner, 2026-11-23: "a smart report whose filter values I set myself from the website: who drinks
 * Spanish Latte every day, who has not come for a week or a month"). One row per customer (a phone number), counted
 * for a period by the database (`customer_report`, managers only); the thresholds below are applied here, so changing
 * one does not ask the database again. The demo build has no database: `customersFromOrders` counts this device's orders
 * the same way.
 */
export interface Customer {
  phone: string; name: string; branch: string
  orders: number; spent: number; cancelled: number; delivery: number; pickup: number; offers: number // the period
  morning: number; afternoon: number; evening: number // the period: before 12:00, 12:00 to 17:00, after
  itemOrders: number; catOrders: number; fav: string // the period: orders with a chosen item / an item of the chosen category; most bought item
  ever: number; firstAt?: number; lastAt?: number // all time
}
export type Period = '7' | '30' | '90' | 'all' | 'custom'
export const PERIODS: Period[] = ['7', '30', '90', 'all', 'custom']
export type TimeOfDay = 'morning' | 'afternoon' | 'evening'
export interface Filters {
  items: string[]; itemMin: string; cat: string
  minOrders: string; maxOrders: string; lastOver: string; lastWithin: string; firstWithin: string; minSpent: string
  how: '' | 'delivery' | 'pickup'; time: '' | TimeOfDay; offer: boolean; cancelled: boolean
}
export const NO_FILTERS: Filters = { items: [], itemMin: '', cat: '', minOrders: '', maxOrders: '', lastOver: '', lastWithin: '', firstWithin: '', minSpent: '', how: '', time: '', offer: false, cancelled: false }
const DAY = 86400000

/** a typed number, or undefined when the box is empty or not a number */
export const num = (v: string): number | undefined => { const x = Number(v.trim()); return v.trim() !== '' && isFinite(x) && x >= 0 ? x : undefined }
/** whole days from a moment's day to today (0 = today) */
export const daysAgo = (t: number | undefined, now: number) => (t === undefined ? Infinity : Math.round((startOf(now) - startOf(t)) / DAY))
/** the part of the day most of the customer's orders fall in */
export const usualTime = (c: Customer): TimeOfDay | '' => (!c.orders ? '' : c.morning >= c.afternoon && c.morning >= c.evening ? 'morning' : c.afternoon >= c.evening ? 'afternoon' : 'evening')

/** the customers that pass every filter that is set. With nothing set: everyone who ordered in the period. "Last order
 *  more than N days ago" looks at every customer, since the ones it asks for have often no order in the period. */
export function applyFilters(rows: Customer[], f: Filters, now: number): Customer[] {
  const minOrders = num(f.minOrders), maxOrders = num(f.maxOrders), lastOver = num(f.lastOver), lastWithin = num(f.lastWithin), firstWithin = num(f.firstWithin), minSpent = num(f.minSpent)
  const itemMin = Math.max(1, num(f.itemMin) ?? 1)
  return rows.filter((c) => {
    if (lastOver !== undefined ? c.ever === 0 : c.orders === 0 && !(f.cancelled && c.cancelled > 0)) return false
    if (f.items.length && c.itemOrders < itemMin) return false
    if (f.cat && c.catOrders < 1) return false
    if (minOrders !== undefined && c.orders < minOrders) return false
    if (maxOrders !== undefined && c.orders > maxOrders) return false
    if (lastOver !== undefined && !(daysAgo(c.lastAt, now) > lastOver && c.lastAt !== undefined)) return false
    if (lastWithin !== undefined && daysAgo(c.lastAt, now) > lastWithin) return false
    if (firstWithin !== undefined && daysAgo(c.firstAt, now) > firstWithin) return false
    if (minSpent !== undefined && c.spent < minSpent) return false
    if (f.how && c[f.how] < 1) return false
    if (f.time && usualTime(c) !== f.time) return false
    if (f.offer && c.offers < 1) return false
    if (f.cancelled && c.cancelled < 1) return false
    return true
  })
}

/** "Iced Spanish Latte (14oz) · Oat milk ×2" → ['Iced Spanish Latte', 2] */
const lineOf = (line: string): [string, number] => {
  const m = /\s*×(\d+)\s*$/.exec(line)
  return [(m ? line.slice(0, m.index) : line).split(' · ')[0].replace(/\s*\([^)]*\)\s*$/, '').trim(), m ? Number(m[1]) : 1]
}
/** the demo build: the same counting as the database's `customer_report`, over this device's orders */
export function customersFromOrders(orders: Order[], branch: string | null, from: number, to: number, items: string[], catItems: string[], now: number): Customer[] {
  const by = new Map<string, { c: Customer; units: Map<string, number>; nameAt: number; branchAt: number }>()
  for (const o of orders) {
    const k = (o.delivery?.phone || o.customer?.phone || '').replace(/\D/g, '').slice(-10)
    const t = countAt(o)
    if (k.length !== 10 || t > now || o.replenish || (branch && (o.branch ?? 'erbil') !== branch)) continue
    if ([o.customer?.name, o.note, o.cancelReason].some((x) => /test/i.test(x ?? ''))) continue
    let e = by.get(k)
    if (!e) by.set(k, e = { c: { phone: '0' + k, name: '', branch: o.branch ?? 'erbil', orders: 0, spent: 0, cancelled: 0, delivery: 0, pickup: 0, offers: 0, morning: 0, afternoon: 0, evening: 0, itemOrders: 0, catOrders: 0, fav: '', ever: 0 }, units: new Map(), nameAt: 0, branchAt: 0 })
    const c = e.c
    if (o.customer?.name && t >= e.nameAt) { c.name = o.customer.name; e.nameAt = t }
    if (t >= e.branchAt) { c.branch = o.branch ?? 'erbil'; e.branchAt = t }
    const cancelled = o.status === 'cancelled'
    if (!cancelled) { c.ever++; c.firstAt = Math.min(c.firstAt ?? t, t); c.lastAt = Math.max(c.lastAt ?? t, t) }
    if (t < from || t >= to) continue
    if (cancelled) { c.cancelled++; continue }
    c.orders++; c.spent += o.total
    if (o.fulfil === 'delivery') c.delivery++; else c.pickup++
    if (o.offer) c.offers++
    const h = new Date(t).getHours()
    if (h < 12) c.morning++; else if (h < 17) c.afternoon++; else c.evening++
    const names = o.items.map(lineOf)
    for (const [n, q] of names) e.units.set(n, (e.units.get(n) ?? 0) + q)
    if (names.some(([n]) => items.includes(n))) c.itemOrders++
    if (names.some(([n]) => catItems.includes(n))) c.catOrders++
  }
  return [...by.values()].map(({ c, units }) => ({ ...c, fav: [...units].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '' }))
}

export type SortKey = 'name' | 'orders' | 'spent' | 'avg' | 'ever' | 'firstAt' | 'lastAt' | 'fav'
const sortValue = (c: Customer, k: SortKey): number | string => (k === 'avg' ? (c.orders ? c.spent / c.orders : 0) : k === 'firstAt' || k === 'lastAt' ? c[k] ?? 0 : c[k])
export function sortRows(rows: Customer[], key: SortKey, desc: boolean): Customer[] {
  const out = rows.slice().sort((a, b) => {
    const x = sortValue(a, key), y = sortValue(b, key)
    return typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y
  })
  return desc ? out.reverse() : out
}

const dateOf = (t?: number) => { if (t === undefined) return ''; const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
/** the list as CSV (a BOM so Excel reads Arabic names; the phone as ="…" so it keeps its leading 0) */
export function smartCsv(rows: Customer[], now: number, branchName: (id: string) => string): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const head = ['name', 'phone', 'branch', 'orders_in_period', 'spent_iqd', 'average_iqd', 'orders_all_time', 'first_order', 'last_order', 'days_since_last', 'favourite_item', 'delivery', 'pickup', 'offers', 'cancelled']
  const lines = rows.map((c) => [q(c.name), `"=""${c.phone}"""`, q(branchName(c.branch)), c.orders, c.spent, c.orders ? Math.round(c.spent / c.orders) : 0, c.ever, dateOf(c.firstAt), dateOf(c.lastAt), c.lastAt === undefined ? '' : daysAgo(c.lastAt, now), q(c.fav), c.delivery, c.pickup, c.offers, c.cancelled].join(','))
  return '﻿' + [head.join(','), ...lines].join('\n')
}
