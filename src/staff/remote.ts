import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { setOrderStatus } from '../account'
import type { Order } from '../account'
import { backendOn, getClient } from '../backend'
import type { Stage } from '../orders'
import { fromRow } from '../sync'
import { seedConfig } from './store'
import type { Feedback } from '../feedback'
import type { OrderRow } from '../sync'

/*
 * The staff dashboard's side of the shared backend. With the backend on, staff sign in with an email and password
 * (a sign-in the owner listed in the `staff` table for a branch), the Orders page reads every order of that branch
 * from the database and hears new ones live, and a stage change is written there so the customer's phone follows.
 * Without the backend the dashboard keeps its PIN and this browser's own orders.
 */
export interface Remote {
  ready: boolean // the first check of who is signed in has finished
  staff: { branch: string | null; name: string; email: string; role: 'barista' | 'manager' } | null // barista: the orders only (owner, 2026-10-22)
  orders: Order[]
  feedback: Feedback[] // the branch's customer feedback, newest first (owner, 2026-10-22)
  error: '' | 'load' | 'move'
}
let state: Remote = { ready: !backendOn, staff: null, orders: [], feedback: [], error: '' }
const listeners = new Set<() => void>()
const set = (patch: Partial<Remote>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()) }
export function useRemote(): Remote {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => state)
}

const upsert = (o: Order) => set({ orders: [o, ...state.orders.filter((x) => x.uid !== o.uid)].sort((a, b) => b.at - a.at) })
let channel: ReturnType<SupabaseClient['channel']> | null = null

async function load(sb: SupabaseClient) {
  const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(300)
  if (error) { console.warn('[backend] could not load orders:', error.message); set({ error: 'load' }); return }
  set({ orders: (data as OrderRow[]).map(fromRow), error: '' })
  // the customers' feedback with the order's number and customer (the rules show staff their branch's only)
  const fb = await sb.from('order_feedback').select('order_uid,branch,kind,rating,tags,comment,created_at,orders(code,customer_name,customer_phone,delivery_phone)').order('created_at', { ascending: false }).limit(60)
  if (!fb.error) {
    type Row = { order_uid: string; branch: string; kind: Feedback['kind']; rating: number | null; tags: string[]; comment: string | null; created_at: string; orders: { code: string; customer_name: string | null; customer_phone: string | null; delivery_phone: string | null } | null }
    set({ feedback: (fb.data as unknown as Row[]).map((r) => ({ order: r.order_uid, code: r.orders?.code ?? '', branch: r.branch, kind: r.kind, rating: r.rating ?? undefined, tags: r.tags ?? [], comment: r.comment ?? undefined, at: Date.parse(r.created_at), name: r.orders?.customer_name || undefined, phone: r.orders?.delivery_phone || r.orders?.customer_phone || undefined })) })
  }
}

/** who is signed in, and are they staff? then the orders and the live channel */
async function enter(sb: SupabaseClient): Promise<'ok' | 'notstaff' | 'error'> {
  const { data: u } = await sb.auth.getUser()
  const user = u.user
  if (!user || user.is_anonymous) { set({ ready: true, staff: null }); return 'notstaff' }
  const { data, error } = await sb.from('staff').select('branch,name,role').eq('user_id', user.id).maybeSingle()
  if (error) { console.warn('[backend] could not check staff:', error.message); set({ ready: true, staff: null }); return 'error' }
  if (!data) { set({ ready: true, staff: null }); return 'notstaff' }
  const role = data.role === 'barista' ? 'barista' : 'manager'
  set({ ready: true, staff: { branch: data.branch, name: data.name ?? '', email: user.email ?? '', role } })
  if (role === 'manager') void seedConfig(data.branch) // the first manager sign-in puts this device's branch settings and offers in the database
  await load(sb)
  channel?.unsubscribe()
  channel = sb.channel('staff-orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (p) => { if (p.new && 'uid' in p.new) upsert(fromRow(p.new as OrderRow)) })
    .subscribe()
  return 'ok'
}

const wake = () => void getClient().then(async (sb) => { if (sb) await enter(sb); else set({ ready: true }) })
if (backendOn && typeof window !== 'undefined' && location.hash === '#staff') wake()
let waking = typeof window !== 'undefined' && location.hash === '#staff'
/** the dashboard was opened later in the visit (the hash changed to #staff) */
export function wakeRemote() {
  if (!backendOn || state.ready || waking) return
  waking = true
  wake()
}
// back on the tab after a while: anything the live channel missed
if (backendOn && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.staff) void getClient().then((sb) => sb && load(sb)) })
}

/** a sign-in name without @ is a username: "demo" signs in as demo@marscoffeehouse.com (owner, 2026-10-19) */
const STAFF_DOMAIN = 'marscoffeehouse.com'
export const staffEmailOf = (name: string) => { const n = name.trim().toLowerCase(); return n.includes('@') ? n : `${n}@${STAFF_DOMAIN}` }
export async function staffSignIn(email: string, password: string): Promise<'ok' | 'bad' | 'notstaff' | 'error'> {
  const sb = await getClient()
  if (!sb) return 'error'
  const { error } = await sb.auth.signInWithPassword({ email: staffEmailOf(email), password })
  if (error) return error.status === 400 ? 'bad' : 'error'
  const res = await enter(sb)
  if (res === 'notstaff') await sb.auth.signOut() // a real sign-in, but not one the owner listed as staff
  return res
}
export async function staffSignOut() {
  channel?.unsubscribe()
  channel = null
  set({ staff: null, orders: [], feedback: [] })
  const sb = await getClient()
  await sb?.auth.signOut()
}

/** move an order to a stage: in the database when it lives there (the customer's phone follows), else on this device */
/** cancel an order, with the reason the customer will read (owner, 2026-10-19) */
export function cancelOrder(o: Order, reason: string) {
  if (!backendOn || !state.staff || !o.uid) { setOrderStatus(o.id, 'cancelled', reason); return }
  if (o.status === 'cancelled') return
  const before = state.orders
  upsert({ ...o, status: 'cancelled', cancelReason: reason, history: [...(o.history ?? []), { stage: 'cancelled', at: Date.now() }] })
  void getClient().then(async (sb) => {
    if (!sb) return
    const { error } = await sb.from('orders').update({ status: 'cancelled', cancel_reason: reason }).eq('uid', o.uid!)
    if (error) { console.warn('[backend] could not cancel the order:', error.message); set({ orders: before, error: 'move' }) }
    else if (state.error === 'move') set({ error: '' })
  })
}
export function moveOrder(o: Order, stage: Stage) {
  if (!backendOn || !state.staff || !o.uid) { setOrderStatus(o.id, stage); return }
  if (o.status === stage) return
  const before = state.orders
  upsert({ ...o, status: stage, history: [...(o.history ?? []), { stage, at: Date.now() }] }) // at once on screen; the live channel confirms
  void getClient().then(async (sb) => {
    if (!sb) return
    const { error } = await sb.from('orders').update({ status: stage }).eq('uid', o.uid!)
    if (error) { console.warn('[backend] could not move the order:', error.message); set({ orders: before, error: 'move' }) }
    else if (state.error === 'move') set({ error: '' })
  })
}

/** send a delivery order to a driver through the WhatsApp Cloud API (supabase/functions/send-whatsapp). `ok: false`
 *  with a reason when it cannot: no backend, the function not there yet ('unreachable'), not set up ('not_configured'),
 *  or Meta refused ('meta', with Meta's message); the caller then opens WhatsApp instead */
export type WaResult = { ok: boolean; reason?: string; message?: string }
export async function sendWhatsApp(orderUid: string, to: string, text: string, lang: string, driver = ''): Promise<WaResult> {
  const sb = backendOn ? await getClient() : null
  if (!sb) return { ok: false, reason: 'no_backend' }
  const { data, error } = await sb.functions.invoke('send-whatsapp', { body: { order_uid: orderUid, to, text, lang, driver } })
  if (error) return { ok: false, reason: 'unreachable', message: error.message }
  return (data as WaResult) ?? { ok: false, reason: 'unreachable' }
}

/** merge `absorb` into `keep` (same customer, both open; database function merge_orders, 2026-10-24); null when done,
 *  else the database's reason. The live channel brings both changed orders to every dashboard. */
export async function mergeOrders(keep: Order, absorb: Order): Promise<string | null> {
  const sb = backendOn ? await getClient() : null
  if (!sb || !keep.uid || !absorb.uid) return 'no backend'
  const { error } = await sb.rpc('merge_orders', { keep_uid: keep.uid, absorb_uid: absorb.uid })
  if (error) { console.warn('[backend] could not merge the orders:', error.message); return error.message }
  return null
}

/** the WhatsApp log (decision 205): the branch's messages to drivers on one day, newest first, with what Meta
 *  reported for each (sent / delivered / read / failed). Null when there is no backend or it cannot be read. */
export type WaLogRow = {
  id: number; code: string; driver: string; to: string; template: string; status: 'sent' | 'delivered' | 'read' | 'failed'
  error?: string; at: number; deliveredAt?: number; readAt?: number; failedAt?: number
}
export async function readWaLog(branch: string, day: Date): Promise<WaLogRow[] | null> {
  const sb = backendOn ? await getClient() : null
  if (!sb) return null
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const to = new Date(from.getTime() + 86400000)
  const { data, error } = await sb.from('wa_messages')
    .select('id,order_code,driver,to_number,template,status,error,created_at,delivered_at,read_at,failed_at')
    .eq('branch', branch).gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
    .order('created_at', { ascending: false }).limit(300)
  if (error) { console.warn('[backend] whatsapp log not read:', error.message); return null }
  const ms = (t: string | null) => (t ? Date.parse(t) : undefined)
  type Row = { id: number; order_code: string; driver: string; to_number: string; template: string; status: WaLogRow['status']; error: string | null; created_at: string; delivered_at: string | null; read_at: string | null; failed_at: string | null }
  return (data as Row[]).map((r) => ({
    id: r.id, code: r.order_code, driver: r.driver, to: r.to_number, template: r.template, status: r.status,
    error: r.error ?? undefined, at: Date.parse(r.created_at), deliveredAt: ms(r.delivered_at), readAt: ms(r.read_at), failedAt: ms(r.failed_at),
  }))
}
