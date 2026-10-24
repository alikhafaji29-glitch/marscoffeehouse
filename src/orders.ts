import { useEffect, useState } from 'react'
import type { Order } from './account'
import type { TKey } from './i18n'

/*
 * Order tracking. The stage of an order is its stored `status`, which the staff
 * dashboard (#staff) moves along: request received → preparing → done → on the
 * way → order received. DEMO: orders live in this browser's localStorage, so the
 * dashboard sees the orders placed on this device (other tabs update live via
 * the storage event). The real version keeps the same stages on an `orders`
 * table with realtime, so every phone's orders reach the counter.
 */
export const STAGES = ['received', 'preparing', 'done', 'onway', 'delivered'] as const
export type Stage = (typeof STAGES)[number]
/** an order's status: one of the stages, or cancelled by the staff (with a reason, owner 2026-10-19) */
export type Status = Stage | 'cancelled'
export const isCancelled = (order: Order) => order.status === 'cancelled'
const cancelledAt = (order: Order) => order.history?.find((h) => h.stage === 'cancelled')?.at ?? order.at
/** cancelled in the last 3 hours: the customer still sees it in the Track order bar and window */
export const recentlyCancelled = (order: Order, now = Date.now()) => isCancelled(order) && now - cancelledAt(order) < 3 * 3600_000 && !seenCancel().includes(order.uid ?? order.id)
/* the customer tapped OK on a cancellation: it leaves the Track order bar and window on this device (owner, 2026-10-19) */
const SEEN = 'mars-seen-cancel'
function seenCancel(): string[] { try { return JSON.parse(localStorage.getItem(SEEN) || '[]') as string[] } catch { return [] } }
export function markCancelSeen(order: Order) {
  const keep = [...seenCancel(), order.uid ?? order.id].slice(-30) // only recent ones matter (3 hours)
  try { localStorage.setItem(SEEN, JSON.stringify(keep)) } catch { /* ignore */ }
}
/** the ready-made reasons; anything else is the staff's own words */
export const CANCEL_REASONS = ['customer', 'stock', 'unreachable', 'area', 'closed'] as const
/** a combo order's lines under "Combo 1", "Combo 2", … (the line's "· Combo n" moves into the heading); other orders as they are */
export function groupLines(items: string[]): { combo?: number; lines: string[] }[] {
  const out: { combo?: number; lines: string[] }[] = []
  for (const line of items) {
    const m = / · Combo (\d+)( ×\d+)$/.exec(line)
    const combo = m ? Number(m[1]) : undefined
    const text = m ? line.slice(0, m.index) + m[2] : line
    const last = out[out.length - 1]
    if (last && last.combo === combo) last.lines.push(text)
    else out.push({ combo, lines: [text] })
  }
  return out
}
/** one order line for the customer: the item (with its size), its choices, how many: "Turkish Coffee · Plain ×1" */
export function splitLine(line: string): { name: string; extra: string; qty: number } {
  const m = /\s*×(\d+)\s*$/.exec(line)
  const qty = m ? Number(m[1]) : 1
  const [name, ...rest] = (m ? line.slice(0, m.index) : line).split(' · ')
  return { name, extra: rest.join(', '), qty }
}
/** a chosen time in the reader's language: "Wed 08:30" */
/* times in 12-hour form (owner, 2026-10-22: "don't use the 24H format, use 12H"): "10:05 AM", "10:05 ص", "10:05 پ.ن" */
const PERIOD: Record<string, [string, string]> = { en: ['AM', 'PM'], ar: ['ص', 'م'], ku: ['پ.ن', 'د.ن'] }
/** the 12-hour clock of hour h (0-23): 12, 1, … 11 */
export const hour12 = (h: number) => h % 12 || 12
/** AM or PM of hour h, in the reader's language */
export const periodOf = (h: number, lang = 'en') => (PERIOD[lang] ?? PERIOD.en)[h < 12 ? 0 : 1]
/** "7:30 AM" from an "HH:MM" (the dashboard's hours) */
export const hmText = (hm: string, lang = 'en') => { const [h, m] = hm.split(':').map(Number); return `${hour12(h || 0)}:${String(m || 0).padStart(2, '0')} ${periodOf(h || 0, lang)}` }
export const whenText = (at: number, lang: string) => { const d = new Date(at); return `${new Intl.DateTimeFormat(lang === 'ku' ? 'ckb' : lang, { weekday: 'short' }).format(d)} ${timeText(at, lang)}` }
/** a time of day, "14:30" (an arrival is always within the next hours) */
export const timeText = (at: number, lang = 'en') => { const d = new Date(at); return `${hour12(d.getHours())}:${String(d.getMinutes()).padStart(2, '0')} ${periodOf(d.getHours(), lang)}` }
/** the times a pickup customer can say they will arrive (owner, 2026-10-22): every 5 minutes from 10 minutes on, to
 *  the end of the hour two hours ahead (whole hours, so the hour wheel never ends on an hour with one minute), and not
 *  after `until` (a Positive Hours order: the offer's end; right before the end, the end itself) */
export function arrivalSlots(now: number, until?: number): number[] {
  const step = 5 * 60_000
  const first = Math.ceil((now + 10 * 60_000) / step) * step
  const last = new Date(now + 2 * 3600_000)
  last.setMinutes(55, 0, 0)
  const out: number[] = []
  for (let at = first; at <= last.getTime() && (!until || at <= until); at += step) out.push(at)
  // an offer ending on the hour (10:00) would leave that hour with one minute: it goes, unless it is all there is
  if (out.length > 1 && new Date(out[out.length - 1]).getHours() !== new Date(out[out.length - 2]).getHours()) out.pop()
  if (!out.length && until && until > now) out.push(until)
  return out
}
/** when the customer wants the order: a pickup's arrival or a pre-order's chosen time (ms), else undefined */
export const dueOf = (o: Order): number | undefined => o.arriveAt ?? o.offer?.wantAt
export const LEAD_MIN = 20 // default: a timed order moves from Later to Active this many minutes before its time
/** waiting in Later (owner, 2026-10-22): not started yet and its time more than `lead` minutes away; once staff start
 *  it, or its time comes within `lead`, it is an active order like any other */
export const isLater = (o: Order, now: number, lead = LEAD_MIN) => {
  const due = dueOf(o)
  return !!due && isActive(o) && (o.status ?? 'received') === 'received' && due - now > lead * 60_000
}
/** "1 h 20 min" / "35 min" until a time, in the reader's units */
export const untilText = (at: number, now: number, h: string, min: string) => {
  const m = Math.max(0, Math.round((at - now) / 60_000))
  return m >= 60 ? `${Math.floor(m / 60)} ${h}${m % 60 ? ` ${m % 60} ${min}` : ''}` : `${m} ${min}`
}
/** a cancellation reason in the reader's language: a ready-made one ('r:stock') is translated, the staff's own words as typed */
/** staff merged this order into another of the same customer's (owner, 2026-10-24): that order's code, else null */
export const mergedInto = (order: Order): string | null => (order.cancelReason?.startsWith('merged:') ? order.cancelReason.slice(7) : null)
export const reasonText = (r: string | undefined, t: (k: TKey) => string) => (r?.startsWith('r:') ? t(('cr_' + r.slice(2)) as TKey) : r?.startsWith('merged:') ? t('mergedReason').replace('{code}', r.slice(7)) : r ?? '')

const PICKUP_STAGES: readonly Stage[] = ['received', 'preparing', 'done', 'delivered']
/** The stages this order goes through: delivery has "On the way", pickup does not. */
export const stagesFor = (order: Order): readonly Stage[] => (order.fulfil === 'delivery' ? STAGES : PICKUP_STAGES)
export const stageIndex = (order: Order, _now?: number): number => Math.max(0, stagesFor(order).indexOf((order.status ?? 'received') as Stage))
export const stageOf = (order: Order, now?: number): Stage => stagesFor(order)[stageIndex(order, now)]
export const isActive = (order: Order, now?: number) => !order.gone && !isCancelled(order) && stageIndex(order, now) < stagesFor(order).length - 1
export const nextStage = (order: Order): Stage | null => (isActive(order) ? stagesFor(order)[stageIndex(order) + 1] : null)

/** re-renders every `ms` (for "3 min ago" style times) */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
