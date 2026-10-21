import type { SupabaseClient } from '@supabase/supabase-js'
import { applyRemoteStatus, markSynced, myOrders, setOrderPlacedHook } from './account'
import type { Order } from './account'
import { backendOn, ensureUser, getClient } from './backend'
import { isActive, recentlyCancelled } from './orders'
import type { Status } from './orders'

/*
 * The customer's side of the shared backend: an order placed on this device is also written to the database (so the
 * staff dashboard on another device sees it), and the stages staff move it through come back to this device's tracker.
 * The device's own copy stays the thing the screens read: with no connection the order is still placed and shown here,
 * and it is sent as soon as the page can reach the server again.
 */
export interface OrderRow {
  uid: string; code: string; created_at: string; branch: string; status: Status; history: { stage: Status; at: number }[]; cancel_reason: string | null
  total: number; items: string[]; pay: 'wallet' | 'pickup'; fulfil: 'pickup' | 'delivery'
  customer_name: string | null; customer_phone: string | null; delivery_phone: string | null; address: string | null
  location: { lat: number; lng: number; acc?: number } | null; gift_to: string | null
  offer: NonNullable<Order['offer']> | null; points: number; note: string | null
}
export const toRow = (o: Order) => ({
  uid: o.uid!, code: o.id, branch: o.branch ?? 'erbil', total: o.total, items: o.items, pay: o.pay ?? 'pickup', fulfil: o.fulfil ?? 'pickup',
  customer_name: o.customer?.name ?? null, customer_phone: o.customer?.phone ?? null,
  delivery_phone: o.delivery?.phone ?? null, address: o.delivery?.address ?? null, location: o.delivery?.location ?? null,
  gift_to: o.giftTo ?? null, offer: o.offer ?? null, points: o.points, note: o.note ?? null,
})
export const fromRow = (r: OrderRow): Order => ({
  id: r.code, uid: r.uid, synced: true, at: Date.parse(r.created_at), total: r.total, items: r.items, points: r.points, pay: r.pay,
  status: r.status, history: r.history ?? [], cancelReason: r.cancel_reason ?? undefined,
  customer: r.customer_name || r.customer_phone ? { name: r.customer_name ?? '', phone: r.customer_phone ?? '' } : undefined,
  fulfil: r.fulfil,
  delivery: r.fulfil === 'delivery' ? { phone: r.delivery_phone ?? r.customer_phone ?? '', address: r.address ?? '', location: r.location ?? undefined } : undefined,
  giftTo: r.gift_to ?? undefined, branch: r.branch, offer: r.offer ?? undefined, note: r.note ?? undefined,
})

let listening = false
let timer = 0

async function push(sb: SupabaseClient, o: Order) {
  const { error } = await sb.from('orders').insert(toRow(o))
  // 23505: this order is already there (sent, but the page closed before it heard back)
  if (!error || error.code === '23505') markSynced(o.uid!)
  else console.warn('[backend] order not sent yet:', error.message)
}

/** the stages of this device's orders, as the database has them now */
async function pull(sb: SupabaseClient) {
  // the ones on their way, and a recent cancellation whose reason this device has not heard yet
  const uids = myOrders().filter((o) => o.uid && o.synced && (isActive(o) || (recentlyCancelled(o) && !o.cancelReason))).map((o) => o.uid!)
  if (!uids.length) return
  const { data, error } = await sb.from('orders').select('uid,status,history,cancel_reason').in('uid', uids)
  if (error) { console.warn('[backend] could not read order stages:', error.message); return }
  for (const r of data as Pick<OrderRow, 'uid' | 'status' | 'history' | 'cancel_reason'>[]) applyRemoteStatus(r.uid, r.status, r.history, r.cancel_reason)
}

async function run() {
  const mine = myOrders().filter((o) => o.uid)
  const waiting = mine.filter((o) => !o.synced)
  const active = mine.filter((o) => o.synced && (isActive(o) || (recentlyCancelled(o) && !o.cancelReason)))
  if (!waiting.length && !active.length) return // nothing of this device's is in flight: no connection is opened
  const sb = await getClient()
  if (!sb || !(await ensureUser(sb))) return
  for (const o of waiting) await push(sb, o)
  await pull(sb)
  if (!listening) {
    listening = true
    // the row rules let a customer hear only their own orders
    sb.channel('my-orders')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (p) => {
        const r = p.new as Pick<OrderRow, 'uid' | 'status' | 'history' | 'cancel_reason'>
        applyRemoteStatus(r.uid, r.status, r.history, r.cancel_reason)
      })
      .subscribe()
  }
  // a slow check behind the live channel, while something is still on its way
  if (!timer) timer = window.setInterval(() => { if (!document.hidden) void run() }, 20000)
}

/** called once at start-up (main.tsx) */
export function startSync() {
  if (!backendOn) return
  setOrderPlacedHook(() => void run())
  void run()
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void run() })
  window.addEventListener('online', () => void run())
}
