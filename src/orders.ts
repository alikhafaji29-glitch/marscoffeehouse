import { useEffect, useState } from 'react'
import type { Order } from './account'

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

const PICKUP_STAGES: readonly Stage[] = ['received', 'preparing', 'done', 'delivered']
/** The stages this order goes through: delivery has "On the way", pickup does not. */
export const stagesFor = (order: Order): readonly Stage[] => (order.fulfil === 'delivery' ? STAGES : PICKUP_STAGES)
export const stageIndex = (order: Order, _now?: number): number => Math.max(0, stagesFor(order).indexOf(order.status ?? 'received'))
export const stageOf = (order: Order, now?: number): Stage => stagesFor(order)[stageIndex(order, now)]
export const isActive = (order: Order, now?: number) => stageIndex(order, now) < stagesFor(order).length - 1
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
