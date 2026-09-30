import { useEffect, useState } from 'react'
import { pushNotice } from './notify'
import type { Stage } from './orders'

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
  status?: Stage // set by the staff dashboard; missing = 'received'
  history?: { stage: Stage; at: number }[]
  customer?: { name: string; phone: string }
  fulfil?: 'pickup' | 'delivery'
  delivery?: Delivery // phone to call + address, delivery orders only
  giftTo?: string // a drink sent to a friend: their number (delivery goes to them, the sender paid)
}
export interface Delivery { phone: string; address: string }
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
export function payFromWallet(total: number, items: string[], delivery?: Delivery): PayResult {
  if (!account || account.balance < total) return { ok: false, points: 0, reward: false, orderId: '' }
  return placeOrder(total, items, 'wallet', delivery)
}
/** Place the order and pay in cash — at the counter on pickup, or at the door on delivery (DEMO: nothing is charged; points still earned). */
export function payAtPickup(total: number, items: string[], delivery?: Delivery): PayResult {
  if (!account || total <= 0) return { ok: false, points: 0, reward: false, orderId: '' }
  return placeOrder(total, items, 'pickup', delivery)
}
function placeOrder(total: number, items: string[], pay: 'wallet' | 'pickup', delivery?: Delivery, giftTo?: string): PayResult {
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
    a.orders.unshift({ id: orderId, at: Date.now(), total, items, points, pay, status: 'received', history: [{ stage: 'received', at: Date.now() }], customer: { name: a.name, phone: a.phone }, fulfil: delivery ? 'delivery' : 'pickup', delivery, giftTo })
    if (delivery && !giftTo) a.address = delivery.address
    if (pay === 'wallet') a.txns.unshift({ id: uid(), kind: 'order', amount: -total, note: `order ${orderId}`, at: Date.now() })
  })
  return { ok: true, points, reward, orderId }
}
/** Staff dashboard: move an order to a stage. Works whether or not the customer is signed in on this device. */
export function setOrderStatus(id: string, stage: Stage) {
  if (!account) return
  const o = account.orders.find((x) => x.id === id)
  if (!o || o.status === stage) return
  o.status = stage
  o.history = [...(o.history ?? []), { stage, at: Date.now() }]
  account = { ...account }
  save()
}
/** Every order stored on this device (DEMO: the one account's orders), newest first. */
export function useAllOrders(): Order[] {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return account?.orders ?? []
}
// another tab (the staff dashboard, or the customer) changed the store: reload it and re-render
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      try { account = JSON.parse(e.newValue || 'null') as Account | null } catch { /* ignore */ }
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

