import type { Order } from './account'
import { backendOn, ensureUser, getClerkClient, getClient } from './backend'

/*
 * Customers' feedback (owner, 2026-10-22): after an order reaches its last stage ("received"), and after staff cancel one
 * ("cancelled"). Ready-made options to tap, an optional comment, a rating for a received order. Sent with the identity
 * that placed the order (its Clerk account, or this device's guest identity); the database keeps one per order and kind
 * (table order_feedback) and shows it to the branch's staff. This device remembers which it answered or skipped, so
 * nobody is asked twice. Without the backend (the demo build) the answers stay on this device for the demo dashboard.
 */
export type FeedbackKind = 'received' | 'cancelled'
export interface Feedback { order: string; code: string; branch: string; kind: FeedbackKind; rating?: number; tags: string[]; comment?: string; at: number; name?: string; phone?: string } // name / phone: the order's customer, for staff

/** the options to tap, by kind: an id (what is stored) per option; the words are in strings.ts as fb_<id> */
export const FEEDBACK_TAGS: Record<FeedbackKind, string[]> = {
  received: ['tasty', 'quick', 'friendly', 'packed', 'slow', 'temp', 'missing', 'wrong'],
  cancelled: ['ok', 'sad', 'sooner', 'alt', 'call'],
}

const DONE = 'mars-feedback-done' // "uid:kind" answered or skipped on this device
const LOCAL = 'mars-feedback-local' // the demo build's answers
const read = <T,>(k: string, d: T): T => { try { return (JSON.parse(localStorage.getItem(k) || 'null') as T) ?? d } catch { return d } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } }
const key = (o: Order, kind: FeedbackKind) => `${o.uid ?? o.id}:${kind}`
export const feedbackDone = (o: Order, kind: FeedbackKind) => read<string[]>(DONE, []).includes(key(o, kind))
export const markFeedbackDone = (o: Order, kind: FeedbackKind) => write(DONE, [...read<string[]>(DONE, []), key(o, kind)].slice(-200))

/** send it; true when stored (or kept locally without a backend) */
export async function sendFeedback(o: Order, kind: FeedbackKind, f: { rating?: number; tags: string[]; comment?: string }): Promise<boolean> {
  markFeedbackDone(o, kind)
  const comment = f.comment?.trim().slice(0, 500) || undefined
  if (!backendOn || !o.uid) {
    write(LOCAL, [{ order: o.uid ?? o.id, code: o.id, branch: o.branch ?? '', kind, rating: f.rating, tags: f.tags, comment, at: Date.now(), name: o.customer?.name || undefined, phone: o.delivery?.phone || o.customer?.phone || undefined }, ...localFeedback()].slice(0, 100))
    return true
  }
  const sb = o.clerk ? await getClerkClient() : await getClient()
  if (!sb || (!o.clerk && !(await ensureUser(sb)))) return false
  const { error } = await sb.from('order_feedback').insert({ order_uid: o.uid, kind, rating: f.rating ?? null, tags: f.tags, comment: comment ?? null })
  if (error && error.code !== '23505') { console.warn('[backend] feedback not sent:', error.message); return false }
  return true
}
/** the demo build's answers, newest first */
export const localFeedback = (): Feedback[] => read<Feedback[]>(LOCAL, [])
