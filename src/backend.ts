import type { SupabaseClient } from '@supabase/supabase-js'

/*
 * The shared backend (Mars' Supabase project): step 1 = orders and live tracking (supabase/migrations).
 * It is on when the build knows the project (VITE_SUPABASE_URL + VITE_SUPABASE_KEY in .env.local: the project URL and
 * the PUBLISHABLE key, both safe in a browser; what a visitor may read or write is decided by the database's row
 * rules, never by this key). Without them (the `demo` mode: the shared artifact links, the headless tests) everything
 * stays on the device as before, and nothing here is loaded.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (import.meta.env.VITE_SUPABASE_KEY as string | undefined)?.trim()
export const backendOn = !!(url && key)
export const backendUrl = url?.replace(/\/$/, '')
export const backendKey = key

let client: Promise<SupabaseClient | null> | null = null
/** the Supabase client, loaded on first use (its library stays out of the first page load); null when there is no backend */
export function getClient(): Promise<SupabaseClient | null> {
  if (!backendOn) return Promise.resolve(null)
  client ??= import('@supabase/supabase-js')
    .then(({ createClient }) => createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mars-auth' } }))
    .catch((e) => { console.warn('[backend] could not load', e); client = null; return null })
  return client
}

/** a customer needs an identity before the database lets them place or read an order: an anonymous sign-in, one per browser */
export async function ensureUser(sb: SupabaseClient): Promise<boolean> {
  const { data } = await sb.auth.getSession()
  if (data.session) return true
  const { error } = await sb.auth.signInAnonymously()
  if (error) console.warn('[backend] anonymous sign-in failed:', error.message)
  return !error
}

/* A customer signed in with Clerk (owner, 2026-10-22) talks to the database with Clerk's session token instead of a
 * Supabase session: Supabase → Authentication → Third-party auth → Clerk accepts it, and the row rules know the order
 * by its `clerk_id` (migration 20261022000400). Guests and staff keep the client above. */
export type Contact = { name?: string; phone?: string; address?: string }
type ClerkUser = { id: string; unsafeMetadata?: Record<string, unknown>; update: (p: { unsafeMetadata: Record<string, unknown> }) => Promise<unknown> }
type ClerkLike = { user?: ClerkUser | null; session?: { getToken: () => Promise<string | null> } | null }
const clerk = (): ClerkLike | undefined => (globalThis as { Clerk?: ClerkLike }).Clerk
/** the Clerk user signed in on this page, if any */
export const clerkUserId = (): string | null => clerk()?.user?.id ?? null
/* The checkout details of a customer signed in with Clerk (owner, 2026-10-22: "do they have to type their number
 * again?"): kept on the Clerk account as profile data (`unsafeMetadata.contact`: the customer's own, writable from
 * the page; never used to sign in, Clerk has no Iraqi numbers), so any device they sign in on fills the checkout */
export const clerkContact = (): Contact | null => (clerk()?.user?.unsafeMetadata?.contact as Contact | undefined) ?? null
export function saveClerkContact(c: Contact) {
  const u = clerk()?.user
  if (!u) return
  const next = { ...clerkContact(), ...Object.fromEntries(Object.entries(c).filter(([, v]) => v)) }
  if (JSON.stringify(next) === JSON.stringify(clerkContact() ?? {})) return
  u.update({ unsafeMetadata: { ...u.unsafeMetadata, contact: next } }).catch((e) => console.warn('[clerk] details not saved to the account:', e))
}
let clerkClient: Promise<SupabaseClient | null> | null = null
export function getClerkClient(): Promise<SupabaseClient | null> {
  if (!backendOn) return Promise.resolve(null)
  clerkClient ??= import('@supabase/supabase-js')
    .then(({ createClient }) => createClient(url!, key!, { accessToken: async () => (await clerk()?.session?.getToken()) ?? null }))
    .catch((e) => { console.warn('[backend] could not load', e); clerkClient = null; return null })
  return clerkClient
}

/** a v4 id made on the device; crypto.randomUUID only exists on secure pages, so plain http gets the long form */
export function newUid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`
}
