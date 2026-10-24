import type { SupabaseClient } from '@supabase/supabase-js'
import { applyRemoteStatus, dropClerk, importOrders, markGone, markHeld, markSynced, myOrders, setOrderPlacedHook } from './account'
import type { Order } from './account'
import { backendOn, clerkUserId, ensureUser, getClerkClient, getClient } from './backend'
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
  offer: NonNullable<Order['offer']> | null; points: number; note: string | null; arrive_at: string | null
}
export const toRow = (o: Order) => ({
  uid: o.uid!, code: o.id, branch: o.branch ?? 'erbil', total: o.total, items: o.items, pay: o.pay ?? 'pickup', fulfil: o.fulfil ?? 'pickup',
  customer_name: o.customer?.name ?? null, customer_phone: o.customer?.phone ?? null,
  delivery_phone: o.delivery?.phone ?? null, address: o.delivery?.address ?? null, location: o.delivery?.location ?? null,
  gift_to: o.giftTo ?? null, offer: o.offer ?? null, points: o.points, note: o.note ?? null,
  arrive_at: o.arriveAt ? new Date(o.arriveAt).toISOString() : null,
})
export const fromRow = (r: OrderRow): Order => ({
  id: r.code, uid: r.uid, synced: true, at: Date.parse(r.created_at), total: r.total, items: r.items, points: r.points, pay: r.pay,
  status: r.status, history: r.history ?? [], cancelReason: r.cancel_reason ?? undefined,
  customer: r.customer_name || r.customer_phone ? { name: r.customer_name ?? '', phone: r.customer_phone ?? '' } : undefined,
  fulfil: r.fulfil,
  delivery: r.fulfil === 'delivery' ? { phone: r.delivery_phone ?? r.customer_phone ?? '', address: r.address ?? '', location: r.location ?? undefined } : undefined,
  giftTo: r.gift_to ?? undefined, branch: r.branch, offer: r.offer ?? undefined, note: r.note ?? undefined,
  arriveAt: r.arrive_at ? Date.parse(r.arrive_at) : undefined,
})

let listening = false
let timer = 0

async function push(sb: SupabaseClient, o: Order) {
  const { error } = await sb.from('orders').insert(toRow(o))
  // 23505: this order is already there (sent, but the page closed before it heard back)
  if (!error || error.code === '23505') markSynced(o.uid!)
  else if (o.clerk && /jwt|token|auth|PGRST30/i.test(`${error.code} ${error.message}`)) {
    // a Clerk order the database will not take with Clerk's session (Supabase → Third-party auth → Clerk not set up,
    // or the session expired): never leave it stuck, it goes as this device's own order, as before Clerk
    dropClerk(o.uid!)
    console.warn('[backend] Clerk session not accepted, order sent as a guest order:', error.message)
  } else {
    // P0001: the database's limit of 10 orders an hour from one device; the customer is told, and it is tried again
    if (error.code === 'P0001') markHeld(o.uid!, 'limit')
    console.warn('[backend] order not sent yet:', error.message)
  }
}

/** the stages of this device's orders, as the database has them now */
async function pull(sb: SupabaseClient, clerkId: string | null) {
  // the ones on their way, and a recent cancellation whose reason this device has not heard yet; each read by the
  // identity it belongs to (a Clerk order by that Clerk session, the others by this device's Supabase identity)
  const uids = myOrders().filter((o) => o.uid && o.synced && (o.clerk ?? null) === clerkId && (isActive(o) || (recentlyCancelled(o) && !o.cancelReason))).map((o) => o.uid!)
  if (!uids.length) return
  const { data, error } = await sb.from('orders').select('uid,status,history,cancel_reason,items,total,offer,note').in('uid', uids)
  if (error) { console.warn('[backend] could not read order stages:', error.message); return }
  const rows = data as Pick<OrderRow, 'uid' | 'status' | 'history' | 'cancel_reason' | 'items' | 'total' | 'offer' | 'note'>[]
  for (const r of rows) applyRemoteStatus(r.uid, r.status, r.history, r.cancel_reason, r)
  // an order the database no longer has was deleted there (owner, 2026-10-22: test orders cleared but still tracked on
  // the phone): stop following it. (The read is as this device's identity, the one that placed it; staff signed in on
  // the same browser read their branch's orders, so only another branch's would be missed there.)
  const found = new Set(rows.map((r) => r.uid))
  for (const uid of uids) if (!found.has(uid)) markGone(uid)
}

/** a customer signed in with Clerk: their orders from the last day placed on other devices come to this one */
async function bringClerkOrders(sb: SupabaseClient, clerkId: string) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data, error } = await sb.from('orders').select('*').eq('clerk_id', clerkId).gte('created_at', since).limit(50)
  if (error) { console.warn('[backend] could not read the account\'s orders:', error.message); return }
  importOrders((data as OrderRow[]).map((r) => ({ ...fromRow(r), clerk: clerkId })))
}

let clerkSeen: string | null = null
let clerkListening = false
async function run() {
  const clerkId = clerkUserId()
  const mine = myOrders().filter((o) => o.uid)
  // the Clerk account's own orders, through a client signed with its session
  if (clerkId) {
    const cb = await getClerkClient()
    if (cb) {
      if (clerkSeen !== clerkId) { clerkSeen = clerkId; await bringClerkOrders(cb, clerkId) }
      for (const o of mine.filter((x) => !x.synced && x.clerk === clerkId)) await push(cb, o)
      await pull(cb, clerkId)
      if (!clerkListening) {
        clerkListening = true
        cb.channel('my-clerk-orders')
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (p) => {
            const r = p.new as OrderRow
            applyRemoteStatus(r.uid, r.status, r.history, r.cancel_reason, r)
          })
          .subscribe()
      }
    }
  }
  // the rest: this device's Supabase identity (guests), as before. A Clerk order waits for its account to sign in again
  const own = mine.filter((o) => !o.clerk)
  const waiting = own.filter((o) => !o.synced)
  const active = own.filter((o) => o.synced && (isActive(o) || (recentlyCancelled(o) && !o.cancelReason)))
  if (!waiting.length && !active.length) { startTimer(); return }
  const sb = await getClient()
  if (!sb || !(await ensureUser(sb))) return
  for (const o of waiting) await push(sb, o)
  await pull(sb, null)
  if (!listening) {
    listening = true
    // the row rules let a customer hear only their own orders
    sb.channel('my-orders')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (p) => {
        const r = p.new as OrderRow
        applyRemoteStatus(r.uid, r.status, r.history, r.cancel_reason, r)
      })
      .subscribe()
  }
  startTimer()
}
// a slow check behind the live channels, while something is still on its way (and to notice a Clerk sign-in)
function startTimer() { if (!timer) timer = window.setInterval(() => { if (!document.hidden) void run() }, 20000) }

/** called once at start-up (main.tsx) */
export function startSync() {
  if (!backendOn) return
  setOrderPlacedHook(() => void run())
  void run()
  // Clerk loads after the page: once it knows the customer, their orders follow
  const waitClerk = window.setInterval(() => { const c = (globalThis as { Clerk?: { loaded?: boolean } }).Clerk; if (c?.loaded) { window.clearInterval(waitClerk); void run() } }, 500)
  window.setTimeout(() => window.clearInterval(waitClerk), 15000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void run() })
  window.addEventListener('online', () => void run())
}
