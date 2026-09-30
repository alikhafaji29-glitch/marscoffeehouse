import { useEffect, useState } from 'react'

/*
 * Notifications — DEMO. Notices are stored on this device against the phone number
 * they are for (same pattern as the gift inbox), so a friend who signs in on this
 * phone sees theirs. Real version: a notifications table + push/SMS.
 */
export type NoticeKind = 'gift' | 'like' | 'comment'
export interface Notice { id: string; to: string; kind: NoticeKind; from: string; title: string; ref?: string; at: number; read: boolean }

const KEY = 'mars-notices'
let notices: Notice[] = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as Notice[] } catch { return [] }
})()
const listeners = new Set<() => void>()
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(notices)) } catch { /* private mode */ }
  listeners.forEach((l) => l())
}

export function pushNotice(to: string, n: { kind: NoticeKind; from: string; title: string; ref?: string }) {
  const toN = to.replace(/\D/g, '')
  if (!toN) return
  notices = [{ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), to: toN, at: Date.now(), read: false, ...n }, ...notices].slice(0, 100)
  save()
}
export function markRead(id: string) { notices = notices.map((n) => (n.id === id ? { ...n, read: true } : n)); save() }
export function markAllRead(phone: string) {
  const p = phone.replace(/\D/g, '')
  notices = notices.map((n) => (n.to === p ? { ...n, read: true } : n))
  save()
}
/** Notices for a phone number (null when signed out → none). */
export function useNotices(phone: string | null): Notice[] {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  if (!phone) return []
  const p = phone.replace(/\D/g, '')
  return notices.filter((n) => n.to === p)
}
