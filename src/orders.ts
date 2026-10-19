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
/** a cancellation reason in the reader's language: a ready-made one ('r:stock') is translated, the staff's own words as typed */
export const reasonText = (r: string | undefined, t: (k: TKey) => string) => (r?.startsWith('r:') ? t(('cr_' + r.slice(2)) as TKey) : r ?? '')

const PICKUP_STAGES: readonly Stage[] = ['received', 'preparing', 'done', 'delivered']
/** The stages this order goes through: delivery has "On the way", pickup does not. */
export const stagesFor = (order: Order): readonly Stage[] => (order.fulfil === 'delivery' ? STAGES : PICKUP_STAGES)
export const stageIndex = (order: Order, _now?: number): number => Math.max(0, stagesFor(order).indexOf((order.status ?? 'received') as Stage))
export const stageOf = (order: Order, now?: number): Stage => stagesFor(order)[stageIndex(order, now)]
export const isActive = (order: Order, now?: number) => !isCancelled(order) && stageIndex(order, now) < stagesFor(order).length - 1
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
