import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { localPreviousPins, replenishLocal, setOrderCourierLocal, setOrderDiscountLocal, setOrderPinLocal, setOrderStatus } from '../account'
import type { GeoPoint, Order, ReplenishReason } from '../account'
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
/** older orders read on demand join the list (the live ones already there win: they may be newer) */
const addOlder = (rows: OrderRow[]) => {
  const have = new Set(state.orders.map((o) => o.uid))
  const fresh = rows.map(fromRow).filter((o) => o.uid && !have.has(o.uid))
  if (fresh.length) set({ orders: [...state.orders, ...fresh].sort((a, b) => b.at - a.at) })
}
/* The dashboard keeps only the latest 300 orders (both branches: about 2–3 days), so a date before that, or a search
 * over all dates, found nothing (owner, 2026-11-10: "when they search for orders from 3, 2, 1 of nov, there is no
 * result"; HANDOFF decision 255). A picked day is read from the database (placed that day, or scheduled for it), once
 * per day; an all-dates search asks the database too. The rules still show staff their own branch only. */
const daysRead = new Set<string>()
export async function readDay(day: string): Promise<void> {
  if (!backendOn || !/^\d{4}-\d{2}-\d{2}$/.test(day) || daysRead.has(day)) return
  const sb = await getClient()
  if (!sb) return
  const [y, m, d] = day.split('-').map(Number)
  const from = new Date(y, m - 1, d).toISOString()
  const to = new Date(y, m - 1, d + 1).toISOString()
  const { data, error } = await sb.from('orders').select('*')
    .or(`and(created_at.gte.${from},created_at.lt.${to}),and(arrive_at.gte.${from},arrive_at.lt.${to})`)
    .order('created_at', { ascending: false }).limit(1000)
  if (error) { console.warn('[backend] could not read that day:', error.message); return }
  daysRead.add(day)
  addOlder(data as OrderRow[])
}
/** a search over all dates: the database's orders whose number, customer, phone, address or note has the text */
export async function searchOrders(text: string): Promise<void> {
  const q = text.trim().replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!backendOn || q.length < 3) return
  const sb = await getClient()
  if (!sb) return
  const digits = q.replace(/\D/g, '').replace(/^(00964|964|0)/, '')
  const like = `%${q}%`
  const ors = ['code', 'customer_name', 'address', 'note', 'cancel_reason'].map((c) => `${c}.ilike.${like}`)
  if (digits.length >= 4) ors.push(`customer_phone.ilike.%${digits}%`, `delivery_phone.ilike.%${digits}%`)
  const { data, error } = await sb.from('orders').select('*').or(ors.join(',')).order('created_at', { ascending: false }).limit(200)
  if (error) { console.warn('[backend] search not read:', error.message); return }
  addOlder(data as OrderRow[])
}
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
/** the delivery company that took an order (order_set_courier; 2026-10-28); '' = none */
export function setCourier(o: Order, courier: string) {
  if ((o.courier ?? '') === courier) return
  if (!backendOn || !o.uid) { setOrderCourierLocal(o.id, courier); return }
  upsert({ ...o, courier: courier || undefined }) // at once; the live channel confirms
  void getClient().then(async (sb) => {
    if (!sb) return
    const { error } = await sb.rpc('order_set_courier', { p_uid: o.uid, p_courier: courier })
    if (error) console.warn('[backend] delivery company not saved:', error.message)
  })
}
/** delivered delivery orders of a branch placed between two times, for the Deliveries report (2026-10-28): straight from
 *  the database, since the dashboard itself keeps only the latest orders; null = could not read */
export async function deliveredOrders(branch: string, from: number, to: number): Promise<Order[] | null> {
  const sb = await getClient()
  if (!sb) return null
  const { data, error } = await sb.from('orders').select('*').eq('branch', branch).eq('fulfil', 'delivery').in('status', ['delivered', 'onway'])
    .gte('created_at', new Date(from).toISOString()).lt('created_at', new Date(to).toISOString()).order('created_at').limit(3000)
  if (error) { console.warn('[backend] deliveries not read:', error.message); return null }
  return (data as OrderRow[]).map(fromRow)
}
/** a discount on an active order (order_set_discount; 2026-10-28): '' when saved, else why not */
export async function setDiscount(o: Order, kind: 'pct' | 'fixed' | 'none', value = 0): Promise<string> {
  if (!backendOn || !o.uid) return setOrderDiscountLocal(o.id, kind, value) ? '' : 'invalid'
  const sb = await getClient()
  if (!sb) return 'offline'
  const { data, error } = await sb.rpc('order_set_discount', { p_uid: o.uid, p_kind: kind, p_value: value })
  if (error) return error.message
  const before = o.discount?.before ?? o.total
  upsert({ ...o, total: data as number, discount: kind === 'none' ? undefined : { kind, value, amount: before - (data as number), before } }) // at once; the live channel confirms
  return ''
}
/** a free replenishment for this order's customer (order_replenish; 2026-10-28): the new order's code, or why not */
export async function replenishOrder(o: Order, items: string[], reason: ReplenishReason, note: string): Promise<{ code?: string; error?: string }> {
  if (!backendOn || !o.uid) return { code: replenishLocal(o, items, reason, note.trim() || undefined) }
  const sb = await getClient()
  if (!sb) return { error: 'offline' }
  const { data, error } = await sb.rpc('order_replenish', { p_uid: o.uid, p_items: items, p_reason: reason, p_note: note.trim() || null })
  if (error) return { error: error.message }
  return { code: data as string } // the new order arrives through the live channel
}
/** "Ask for location": the approved template to the customer's own number, in the language staff chose */
export async function askLocation(o: Order, lang: 'en' | 'ar' | 'ku'): Promise<WaResult> {
  const sb = backendOn && o.uid ? await getClient() : null
  if (!sb) return { ok: false, reason: 'no_backend' }
  const { data, error } = await sb.functions.invoke('send-whatsapp', { body: { order_uid: o.uid, kind: 'location_request', lang } })
  if (error) return { ok: false, reason: 'unreachable', message: error.message }
  const r = (data as WaResult) ?? { ok: false, reason: 'unreachable' }
  if (r.ok) upsert({ ...o, wa: { ...o.wa, askedAt: Date.now() } }) // at once on screen; the live channel confirms
  return r
}
export async function sendWhatsApp(orderUid: string, to: string, text: string, lang: string, driver = '', links?: string): Promise<WaResult> {
  const sb = backendOn ? await getClient() : null
  if (!sb) return { ok: false, reason: 'no_backend' }
  const { data, error } = await sb.functions.invoke('send-whatsapp', { body: { order_uid: orderUid, to, text, lang, driver, ...(links && { links }) } })
  if (error) return { ok: false, reason: 'unreachable', message: error.message }
  return (data as WaResult) ?? { ok: false, reason: 'unreachable' }
}

/** one company's statement from the server, the same PDF as the midnight one ('' = no company; 2026-11-03): the file, or sent to the owner */
export type StatementResult = { ok: boolean; file?: string; pdf?: string; sent?: boolean; reason?: string; message?: string }
export async function companyStatement(branch: string, from: string, to: string, company: string, send: boolean, phone = ''): Promise<StatementResult> {
  const sb = backendOn ? await getClient() : null
  if (!sb) return { ok: false, reason: 'no_backend' }
  const { data, error } = await sb.functions.invoke('delivery-statement', { body: { branch, from, to, company, send, phone } })
  if (error) return { ok: false, reason: 'unreachable', message: error.message }
  return (data as StatementResult) ?? { ok: false, reason: 'unreachable' }
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

/* A delivery order without a pin can take the pin of the same customer's earlier order at this branch, once staff
 * have confirmed with the customer that it is the same place (owner, 2026-10-27). The database checks it is the same
 * customer and branch (order_previous_pins / order_use_pin); the demo looks in this browser's orders. */
export type PrevPin = { code: string; at: number; address?: string; location: GeoPoint }
/* Each order's answer is kept 2 seconds, and a lookup already on its way is shared (owner, 2026-11-02): on 2 Nov one computer
 * rebuilt its order cards and sent this 48,747 times in 20 minutes. The first lookup of an order still goes at once. */
const PIN_KEEP_MS = 2000
const pinLookups = new Map<string, { at: number; answer: Promise<PrevPin[] | null> }>() // at: when it came back, Infinity on the way
export function previousPins(o: Order): Promise<PrevPin[] | null> {
  if (!backendOn) return Promise.resolve(localPreviousPins(o))
  if (!o.uid) return Promise.resolve(null)
  const uid = o.uid
  const kept = pinLookups.get(uid)
  if (kept && (kept.at === Infinity || Date.now() - kept.at < PIN_KEEP_MS)) return kept.answer
  if (pinLookups.size > 200) pinLookups.clear()
  const entry = { at: Infinity, answer: readPreviousPins(uid) }
  pinLookups.set(uid, entry)
  void entry.answer.finally(() => { entry.at = Date.now() })
  return entry.answer
}
async function readPreviousPins(uid: string): Promise<PrevPin[] | null> {
  const sb = await getClient()
  if (!sb) return null
  const { data, error } = await sb.rpc('order_previous_pins', { p_uid: uid })
  if (error) { console.warn('[backend] previous pins not read:', error.message); return null }
  type Row = { code: string; created_at: string; address: string | null; location: GeoPoint }
  return (data as Row[]).map((r) => ({ code: r.code, at: Date.parse(r.created_at), address: r.address || undefined, location: r.location }))
}
export async function applyPreviousPin(o: Order, pin: PrevPin): Promise<boolean> {
  if (!backendOn) { setOrderPinLocal(o.id, pin.location, pin.code); return true }
  const sb = await getClient()
  if (!sb || !o.uid || !o.delivery) return false
  const { error } = await sb.rpc('order_use_pin', { p_uid: o.uid, p_from: pin.code })
  if (error) { console.warn('[backend] pin not added:', error.message); return false }
  upsert({ ...o, delivery: { ...o.delivery, location: pin.location }, locationFrom: pin.code }) // at once on screen; the live channel confirms
  return true
}
