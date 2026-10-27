import { customerBranch } from './staff/store'
import { clerkUserId, saveClerkContact } from './backend'
import { backendOn, newUid } from './backend'
import { useEffect, useState } from 'react'
import { pushNotice } from './notify'
import type { Status } from './orders'

/*
 * Customer account — DEMO. Everything lives in localStorage on this device:
 * sign-in (phone + demo code), profile, loyalty points, a wallet with demo
 * money, gift links and gift cards encoded into share URLs. (Saved soda creations went with the soda builder,
 * 2026-09-30.)
 * The real version moves this to Supabase Auth + tables and a payment
 * provider for top-ups; the shapes here are meant to survive that move.
 */

export const DEMO_CODE = '123456'
export const POINTS_PER_1000 = 1
export const REWARD_AT = 100 // points → one free drink
export const GIFT_CARD_AMOUNTS = [10000, 25000, 50000]
export const TOPUP_AMOUNTS = [5000, 10000, 25000]

export interface Reward { id: string; code: string; createdAt: number; used: boolean }
export interface Txn { id: string; kind: 'topup' | 'order' | 'card-buy' | 'card-redeem' | 'gift-claim' | 'gift-send'; amount: number; note: string; at: number }
export interface GiftCard { id: string; code: string; amount: number; createdAt: number; sentTo?: string; sentAt?: number }
export interface Order {
  id: string
  at: number
  total: number
  items: string[]
  points: number
  pay?: 'wallet' | 'pickup'
  status?: Status // set by the staff dashboard; missing = 'received'
  history?: { stage: Status; at: number }[]
  arriveAt?: number // a pickup: when the customer said they will arrive (ms; owner, 2026-10-22)
  note?: string // the customer's note for the café ("less ice", "call when you arrive"), shown to staff
  cancelReason?: string // when cancelled: 'r:<code>' for a ready-made reason (CANCEL_REASONS), else the staff's words
  customer?: { name: string; phone: string }
  fulfil?: 'pickup' | 'delivery'
  delivery?: Delivery // phone to call + address, delivery orders only
  locationFrom?: string // the pin was taken from this earlier order of the same customer, after staff checked with them (2026-10-27)
  giftTo?: string // a drink sent to a friend: their number (delivery goes to them, the sender paid)
  branch?: string // the branch picked on the Order screen (staff/store.ts); missing = the first branch
  offer?: { name: string; price: number; count?: number; fee?: number; pre?: boolean; wantAt?: number } // a combo from the dashboard's Offers (Positive Hours); count = how many combos (1 when missing); pre = placed outside its hours; wantAt = the time the customer chose for a pre-order (ms)
  uid?: string // the order's identity in the shared backend (src/sync.ts); `id` is the short code people see
  synced?: boolean // the backend has it
  clerk?: string // the Clerk user it was placed under (sent with that session, seen on any device signed in to it)
  gone?: boolean // this device only: the database no longer has it (deleted by the café or the owner): not followed, not shown
  held?: 'limit' // this device only: the backend refused it for now (10 orders an hour from one device); retried
}
export interface GeoPoint { lat: number; lng: number; acc?: number } // acc: the phone's own accuracy estimate, metres
export interface Delivery { phone: string; address: string; location?: GeoPoint } // location: the pin from "Share my location"
export interface Account {
  phone: string
  name: string
  passHash?: string // demo hash of the chosen password
  since: number
  points: number
  lifetime: number // points ever earned
  balance: number
  rewards: Reward[]
  txns: Txn[]
  giftCards: GiftCard[]
  orders: Order[]
  sent?: SentGift[] // gifts this customer sent to friends' numbers
  address?: string // last delivery address, prefilled next time
}

const KEY = 'mars-account'
const SESSION = 'mars-session' // the account stays on the phone after sign-out; this says whether it is signed in
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const code = () => Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 5).toUpperCase()).join('-')

let account: Account | null = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') as Account | null } catch { return null }
})()
let session = (() => { try { return localStorage.getItem(SESSION) === '1' } catch { return false } })()
const setSession = (on: boolean) => { session = on; try { localStorage.setItem(SESSION, on ? '1' : '0') } catch { /* ignore */ } }

export const normPhone = (p: string) => p.replace(/\D/g, '')
// demo password hash (pure JS so it also works over plain http on the LAN)
export function hashPassword(phone: string, pw: string): string {
  const s = normPhone(phone) + ':' + pw
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}
const listeners = new Set<() => void>()
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(account)) } catch { /* private mode */ }
  listeners.forEach((l) => l())
}
const mutate = (fn: (a: Account) => void) => {
  if (!account || !session) return
  fn(account)
  account = { ...account }
  save()
}

export function useAccount() {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return session ? account : null
}
export const getAccount = () => (session ? account : null)
/** The account already on this phone for that number, if any (for the password step). */
export const storedFor = (phone: string): Account | null => (account && normPhone(account.phone) === normPhone(phone) ? account : null)

export function signInStored(phone: string, password: string): boolean {
  const a = storedFor(phone)
  if (!a || !a.passHash || a.passHash !== hashPassword(phone, password)) return false
  setSession(true)
  listeners.forEach((l) => l())
  return true
}
/** A verified code on a known number signs the stored account in without the password. */
export function signInWithCode(phone: string): boolean {
  const a = storedFor(phone)
  if (!a) return false
  setSession(true)
  listeners.forEach((l) => l())
  return true
}
export function setPassword(password: string) { mutate((a) => { a.passHash = hashPassword(a.phone, password) }) }

export function signIn(phone: string, name: string, password?: string) {
  account = {
    phone,
    name,
    passHash: password ? hashPassword(phone, password) : undefined,
    since: Date.now(),
    points: 0,
    lifetime: 0,
    balance: 0,
    rewards: [],
    txns: [],
    giftCards: [],
    orders: [],
  }
  setSession(true)
  save()
}
export function signOut() {
  setSession(false) // the account stays on this phone; the password (or a code) signs it back in
  listeners.forEach((l) => l())
}
export function topUp(amount: number) {
  mutate((a) => {
    a.balance += amount
    a.txns.unshift({ id: uid(), kind: 'topup', amount, note: 'demo top-up', at: Date.now() })
  })
}

export type PayResult = { ok: boolean; points: number; reward: boolean; orderId: string }
/** Pay an order from the wallet; earns points and turns every REWARD_AT points into a free-drink reward. */
export function payFromWallet(total: number, items: string[], delivery?: Delivery, note?: string, arriveAt?: number): PayResult {
  if (!account || account.balance < total) return { ok: false, points: 0, reward: false, orderId: '' }
  return placeOrder(total, items, 'wallet', delivery, undefined, { ...(note && { note }), ...(arriveAt && { arriveAt }) })
}
/** Place the order and pay in cash — at the counter on pickup, or at the door on delivery (DEMO: nothing is charged; points still earned). */
export function payAtPickup(total: number, items: string[], delivery?: Delivery, note?: string, arriveAt?: number): PayResult {
  if (!account || total <= 0) return { ok: false, points: 0, reward: false, orderId: '' }
  return placeOrder(total, items, 'pickup', delivery, undefined, { ...(note && { note }), ...(arriveAt && { arriveAt }) })
}
function placeOrder(total: number, items: string[], pay: 'wallet' | 'pickup', delivery?: Delivery, giftTo?: string, extra?: Partial<Order>): PayResult {
  const points = Math.floor(total / 1000) * POINTS_PER_1000
  let reward = false
  const orderId = 'M' + Date.now().toString().slice(-6)
  mutate((a) => {
    if (pay === 'wallet') a.balance -= total
    a.points += points
    a.lifetime += points
    while (a.points >= REWARD_AT) {
      a.points -= REWARD_AT
      a.rewards.unshift({ id: uid(), code: code(), createdAt: Date.now(), used: false })
      reward = true
    }
    a.orders.unshift({ id: orderId, at: Date.now(), total, items, points, pay, status: 'received', history: [{ stage: 'received', at: Date.now() }], customer: { name: a.name, phone: a.phone }, fulfil: delivery ? 'delivery' : 'pickup', delivery, giftTo, branch: customerBranch(), uid: newUid(), ...extra })
    if (delivery && !giftTo) a.address = delivery.address
    if (pay === 'wallet') a.txns.unshift({ id: uid(), kind: 'order', amount: -total, note: `order ${orderId}`, at: Date.now() })
  })
  onPlaced?.()
  return { ok: true, points, reward, orderId }
}
/** DEMO (no backend): the same customer's earlier pins at this order's branch, newest first, 5 at most (2026-10-27) */
const last9 = (p?: string) => (p ?? '').replace(/\D/g, '').slice(-9)
export function localPreviousPins(o: Order): { code: string; at: number; address?: string; location: GeoPoint }[] {
  const ph = last9(o.delivery?.phone ?? o.customer?.phone)
  if (ph.length < 9) return []
  return [...(account?.orders ?? []), ...guest]
    .filter((p) => p.id !== o.id && (p.branch ?? 'erbil') === (o.branch ?? 'erbil') && p.delivery?.location && last9(p.delivery.phone ?? p.customer?.phone) === ph)
    .sort((a, b) => b.at - a.at).slice(0, 5)
    .map((p) => ({ code: p.id, at: p.at, address: p.delivery?.address || undefined, location: p.delivery!.location! }))
}
/** DEMO: put that pin on the order */
export function setOrderPinLocal(id: string, location: GeoPoint, from: string) {
  const mine = account?.orders.find((x) => x.id === id)
  const o = mine ?? guest.find((x) => x.id === id)
  if (!o?.delivery) return
  o.delivery = { ...o.delivery, location }
  o.locationFrom = from
  if (mine) { account = { ...account! }; save() } else { guest = [...guest]; saveGuest() }
}
/** Staff dashboard: move an order to a stage. Works whether or not the customer is signed in on this device. */
export function setOrderStatus(id: string, stage: Status, reason?: string) {
  const mine = account?.orders.find((x) => x.id === id)
  const o = mine ?? guest.find((x) => x.id === id)
  if (!o || o.status === stage) return
  o.status = stage
  if (stage === 'cancelled') o.cancelReason = reason
  o.history = [...(o.history ?? []), { stage, at: Date.now() }]
  if (mine) { account = { ...account! }; save() } else { guest = [...guest]; saveGuest() }
}

/*
 * Orders placed without signing in (the Positive Hours combo asks only for a name, a number and an address).
 * DEMO: kept on this device (`mars-guest-orders`) beside the account's orders; the staff dashboard sees both and the
 * Track order bar follows them. The real version is an order row with the customer's phone and no account.
 */
const GUEST = 'mars-guest-orders'
let guest: Order[] = (() => { try { return JSON.parse(localStorage.getItem(GUEST) || '[]') as Order[] } catch { return [] } })()
const saveGuest = () => {
  try { localStorage.setItem(GUEST, JSON.stringify(guest)) } catch { /* private mode */ }
  listeners.forEach((l) => l())
}
/** A combo order, or the cart's order from a customer who is not signed in (owner, 2026-10-22): on the signed-in account when
 *  there is one (points are earned), otherwise as a guest order (name + phone). Cash on delivery / at pickup. */
export function placeOfferOrder(o: { total: number; items: string[]; name: string; phone: string; address?: string; location?: GeoPoint; offer?: NonNullable<Order['offer']>; note?: string; arriveAt?: number }): PayResult {
  // address undefined = pickup; a delivery may carry a typed address, a shared pin, or both
  const delivery: Delivery | undefined = o.address !== undefined ? { phone: o.phone, address: o.address, location: o.location } : undefined
  const customer = { name: o.name, phone: o.phone }
  if (account && session) return placeOrder(o.total, o.items, 'pickup', delivery, undefined, { ...(o.offer && { offer: o.offer }), customer, ...(o.note && { note: o.note }), ...(o.arriveAt && { arriveAt: o.arriveAt }) })
  const orderId = 'M' + Date.now().toString().slice(-6)
  guest = [{ id: orderId, at: Date.now(), total: o.total, items: o.items, points: 0, pay: 'pickup', status: 'received', history: [{ stage: 'received', at: Date.now() }], customer, fulfil: delivery ? 'delivery' : 'pickup', delivery, branch: customerBranch(), ...(o.offer && { offer: o.offer }), ...(clerkUserId() && { clerk: clerkUserId()! }), uid: newUid(), ...(o.note && { note: o.note }), ...(o.arriveAt && { arriveAt: o.arriveAt }) }, ...guest]
  saveGuest()
  onPlaced?.()
  return { ok: true, points: 0, reward: false, orderId }
}
const CONTACT = 'mars-guest' // the name / number / address typed last time, for the next order (combo or cart)
export const savedContact = (): { name?: string; phone?: string; address?: string } => { try { return JSON.parse(localStorage.getItem(CONTACT) || '{}') } catch { return {} } }
export const saveContact = (c: { name?: string; phone?: string; address?: string }) => {
  try { localStorage.setItem(CONTACT, JSON.stringify({ ...savedContact(), ...c })) } catch { /* private mode */ }
  saveClerkContact(c) // signed in with Clerk: the account keeps them too, for the customer's other devices
}
/* ---- the shared backend (src/sync.ts): it is told when an order is placed, and it brings the stages back ---- */
let onPlaced: (() => void) | null = null
export const setOrderPlacedHook = (fn: () => void) => { onPlaced = fn }
/** this device's orders, the account's and the guest ones (not a hook) */
export const myOrders = (): Order[] => [...(account?.orders ?? []), ...guest]
const findByUid = (uid: string) => {
  const mine = account?.orders.find((x) => x.uid === uid)
  return { mine, o: mine ?? guest.find((x) => x.uid === uid) }
}
const commit = (mine: Order | undefined) => { if (mine) { account = { ...account! }; save() } else { guest = [...guest]; saveGuest() } }
export function markSynced(uid: string) {
  const { mine, o } = findByUid(uid)
  if (!o || o.synced) return
  o.synced = true
  delete o.held
  commit(mine)
}
/** the database no longer has this order (it was deleted there): this device stops following and showing it */
export function markGone(uid: string) {
  const { mine, o } = findByUid(uid)
  if (!o || o.gone) return
  o.gone = true
  commit(mine)
}
/** the database does not take this Clerk session (Supabase's Clerk connection is off): send it as this device's own */
export function dropClerk(uid: string) {
  const { mine, o } = findByUid(uid)
  if (!o || !o.clerk || o.synced) return
  delete o.clerk
  commit(mine)
}
/** orders of this Clerk account placed on another device: kept here as guest orders, already in the database */
export function importOrders(list: Order[]) {
  const have = new Set(myOrders().map((o) => o.uid))
  const fresh = list.filter((o) => o.uid && !have.has(o.uid))
  if (!fresh.length) return
  guest = [...fresh, ...guest].sort((x, y) => y.at - x.at)
  saveGuest()
}
/** the branch had paused orders when this one reached the database (a page that had not heard yet): it is shown as
 *  cancelled with that reason and never sent again (owner, 2026-10-26) */
export function markRefused(uid: string) {
  const { mine, o } = findByUid(uid)
  if (!o || o.synced) return
  o.synced = true // nothing to send or follow any more
  o.status = 'cancelled'
  o.cancelReason = 'r:paused'
  o.history = [...(o.history ?? []), { stage: 'cancelled', at: Date.now() }]
  delete o.held
  commit(mine)
}
/** the backend refused the order for now (the hourly limit); it is sent again on the next check */
export function markHeld(uid: string, why: NonNullable<Order['held']>) {
  const { mine, o } = findByUid(uid)
  if (!o || o.synced || o.held === why) return
  o.held = why
  commit(mine)
}
/** the stage staff moved the order to, as the backend has it */
export function applyRemoteStatus(uid: string, status: Status, history?: Order['history'], reason?: string | null, content?: { items?: string[]; total?: number; offer?: Order['offer'] | null; note?: string | null }) {
  const { mine, o } = findByUid(uid)
  // staff merged another order into this one (2026-10-24): its lines, total, offer and note changed
  const grown = !!o && !!content?.items && (content.items.length !== o.items.length || content.total !== o.total)
  if (!o || (!grown && o.status === status && (history?.length ?? 0) <= (o.history?.length ?? 0) && (status !== 'cancelled' || !reason || o.cancelReason === reason))) return
  if (grown) { o.items = content!.items!; o.total = content!.total ?? o.total; o.offer = content!.offer ?? undefined; o.note = content!.note ?? undefined }
  o.status = status
  if (status === 'cancelled') o.cancelReason = reason ?? undefined
  if (history?.length) o.history = history
  commit(mine)
}
/** The orders this customer can follow on this device: the signed-in account's and the guest orders, newest first. */
export function useMyOrders(): Order[] {
  const a = useAccount()
  // with the shared backend on, an order with no `uid` is a leftover from before it (placed before 2026-10-13, kept only
  // on this device): it can never reach the café nor move, so it is not followed (it stuck at "Request received")
  return [...(a?.orders ?? []), ...guest].filter((o) => (!backendOn || !!o.uid) && !o.gone).sort((x, y) => y.at - x.at)
}
/** Every order stored on this device (DEMO: the one account's orders and the guest orders), newest first. */
export function useAllOrders(): Order[] {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return [...(account?.orders ?? []), ...guest].sort((x, y) => y.at - x.at)
}
// another tab (the staff dashboard, or the customer) changed the store: reload it and re-render
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      try { account = JSON.parse(e.newValue || 'null') as Account | null } catch { /* ignore */ }
      listeners.forEach((l) => l())
    } else if (e.key === GUEST) {
      try { guest = JSON.parse(e.newValue || '[]') as Order[] } catch { /* ignore */ }
      listeners.forEach((l) => l())
    } else if (e.key === SESSION) {
      session = e.newValue === '1'
      listeners.forEach((l) => l())
    }
  })
}
export function useReward(id: string) { mutate((a) => { const r = a.rewards.find((x) => x.id === id); if (r) r.used = true }) }

/** Send a drink to a friend: paid from the sender's wallet, placed as a delivery order to the friend's
 * number + address (so it reaches the staff dashboard and the sender's tracker), and put in the friend's inbox. */
export function sendDrinkGift(to: string, address: string, item: { name: string; size?: string; price: number; items?: string[] }): boolean {
  if (!account || !session || account.balance < item.price) return false
  const toN = normPhone(to)
  if (toN.length < 10) return false
  const payload: GiftPayload = { t: 'item', from: account.name, name: item.name, size: item.size, price: item.price, paid: item.price, address }
  if (!sendGift(to, payload)) return false
  placeOrder(item.price, item.items ?? [`${item.name}${item.size ? ` (${item.size})` : ''} ×1`], 'wallet', { phone: toN, address }, toN)
  return true
}
/** Pay for a gift (a menu item sent to a friend) from the wallet. */
export function spendFromWallet(amount: number, note: string): boolean {
  if (!account || !session || account.balance < amount) return false
  mutate((a) => {
    a.balance -= amount
    a.txns.unshift({ id: uid(), kind: 'gift-send', amount: -amount, note, at: Date.now() })
  })
  return true
}
export function buyGiftCard(amount: number): GiftCard | null {
  if (!account || account.balance < amount) return null
  const card: GiftCard = { id: uid(), code: code(), amount, createdAt: Date.now() }
  mutate((a) => {
    a.balance -= amount
    a.giftCards.unshift(card)
    a.txns.unshift({ id: uid(), kind: 'card-buy', amount: -amount, note: `gift card ${card.code}`, at: Date.now() })
  })
  return card
}

/* ---- share links: everything the friend needs is inside the URL (demo: no server) ---- */
export type GiftPayload =
  | { t: 'card'; from: string; amount: number; code: string }
  | { t: 'item'; from: string; name: string; size?: string; price: number; paid: number; address?: string } // a menu item, prepaid by the sender; with an address it is already on its way

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))

export const giftLink = (p: GiftPayload) => `${location.origin}${location.pathname}?g=${b64(JSON.stringify(p))}`
export function readGiftFromUrl(): GiftPayload | null {
  try {
    const g = new URLSearchParams(location.search).get('g')
    const p = g ? (JSON.parse(unb64(g)) as GiftPayload) : null
    return p && (p.t === 'card' || p.t === 'item') ? p : null // old custom-soda links (t: 'drink') are ignored
  } catch { return null }
}
export const clearGiftFromUrl = () => history.replaceState(null, '', location.pathname + location.hash)

/** A paid drink or a gift card lands in the wallet as balance. */
export function claimToWallet(amount: number, note: string, kind: 'gift-claim' | 'card-redeem') {
  mutate((a) => {
    a.balance += amount
    a.txns.unshift({ id: uid(), kind, amount, note, at: Date.now() })
  })
}

export const iqd = (n: number) => n.toLocaleString('en-US')

/* ---- send to a friend's number (demo: an inbox on this device keyed by phone) ----
 * Real version: the server stores the gift against the friend's number and sends an SMS /
 * push; the friend sees it under "Gifts for you" after signing in with that number. */
export interface SentGift { id: string; to: string; at: number; payload: GiftPayload }
export interface InboxGift { id: string; to: string; from: string; at: number; payload: GiftPayload }
const INBOX = 'mars-inbox'
let inbox: InboxGift[] = (() => {
  try { return (JSON.parse(localStorage.getItem(INBOX) || '[]') as InboxGift[]).filter((g) => g.payload.t === 'card' || g.payload.t === 'item') } catch { return [] }
})()
const saveInbox = () => {
  try { localStorage.setItem(INBOX, JSON.stringify(inbox)) } catch { /* private mode */ }
  listeners.forEach((l) => l())
}
/** Iraqi numbers for wa.me links: 0750… → 964750… */
export const waNumber = (p: string) => {
  let d = normPhone(p)
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '964' + d.slice(1)
  return d
}
export function sendGift(to: string, payload: GiftPayload, cardId?: string): boolean {
  if (!account || !session) return false
  const toN = normPhone(to)
  if (toN.length < 10) return false
  const g: InboxGift = { id: uid(), to: toN, from: account.name, at: Date.now(), payload }
  inbox = [g, ...inbox].slice(0, 50)
  mutate((a) => {
    a.sent = [{ id: g.id, to: toN, at: g.at, payload }, ...(a.sent || [])].slice(0, 30)
    if (cardId) { const c = a.giftCards.find((x) => x.id === cardId); if (c) { c.sentTo = toN; c.sentAt = g.at } }
  })
  saveInbox()
  pushNotice(toN, { kind: 'gift', from: account.name, title: payload.t === 'item' ? payload.name : `${iqd(payload.amount)} IQD` })
  return true
}
/** Gifts addressed to the signed-in number. */
export function useInbox(): InboxGift[] {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  if (!account || !session) return []
  const me = normPhone(account.phone)
  return inbox.filter((g) => g.to === me)
}
export function takeInbox(id: string) { inbox = inbox.filter((g) => g.id !== id); saveInbox() }

