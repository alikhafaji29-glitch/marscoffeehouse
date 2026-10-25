// Mars CoffeeHouse — Meta's WhatsApp webhook (owner, 2026-10-25: "i need wa msgs log to see what's delivered, what's
// read, what's failed"; HANDOFF decision 205). Meta calls it for every message the business number sent; it moves the
// message's row in public.wa_messages (written by send-whatsapp) on: sent → delivered → read, or failed with the reason.
//
// Set up in the Meta app (developers.facebook.com → Mars Staff → WhatsApp → Configuration): Callback URL = this
// function's address, Verify token = the WA_VERIFY_TOKEN secret, then subscribe to the "messages" field.
// Secrets (Supabase → Edge Functions → Secrets, set by the owner):
//   WA_VERIFY_TOKEN   any word, typed the same in Meta's Verify token box (only used when Meta checks the address)
//   WA_APP_SECRET     the app's App secret (App settings → Basic): every call must carry Meta's signature made with
//                     it, so nobody else can change the log. Without it, calls are refused.
// Deployed with verify_jwt off: Meta sends no Supabase sign-in; the signature is the check.
import { createClient } from 'npm:@supabase/supabase-js@2'

type Status = {
  id: string; status: 'sent' | 'delivered' | 'read' | 'failed'; timestamp?: string
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[]
}

const enc = new TextEncoder()
async function signedByMeta(raw: string, header: string | null, secret: string): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(raw)))
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
  const got = header.slice(7)
  if (got.length !== hex.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i)
  return diff === 0
}

const reason = (s: Status) => {
  const e = s.errors?.[0]
  if (!e) return 'failed'
  return [e.title || e.message, e.error_data?.details, e.code && `(${e.code})`].filter(Boolean).join(' · ').slice(0, 500)
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  // Meta checks the address once, when it is saved in the app
  if (req.method === 'GET') {
    const want = Deno.env.get('WA_VERIFY_TOKEN')
    if (want && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === want) {
      return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 })
    }
    return new Response('no', { status: 403 })
  }
  if (req.method !== 'POST') return new Response('no', { status: 405 })

  const secret = Deno.env.get('WA_APP_SECRET')
  if (!secret) return new Response('not set up', { status: 503 })
  const raw = await req.text()
  if (!(await signedByMeta(raw, req.headers.get('x-hub-signature-256'), secret))) return new Response('no', { status: 401 })

  let body: { entry?: { changes?: { value?: { statuses?: Status[] } }[] }[] }
  try { body = JSON.parse(raw) } catch { return new Response('ok') }
  const statuses = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.statuses ?? []))
  if (!statuses.length) return new Response('ok') // incoming messages etc.: not logged

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const s of statuses) {
    const at = new Date(s.timestamp ? Number(s.timestamp) * 1000 : Date.now()).toISOString()
    // the row is written right after Meta accepts the message; a report can come a moment before it: look twice
    let row = (await db.from('wa_messages').select('id,status,delivered_at').eq('wamid', s.id).maybeSingle()).data
    if (!row) { await new Promise((r) => setTimeout(r, 2000)); row = (await db.from('wa_messages').select('id,status,delivered_at').eq('wamid', s.id).maybeSingle()).data }
    if (!row) continue // not one of the drivers' messages
    // reports may arrive out of order: never step back (read stays read; failed stays failed)
    let patch: Record<string, unknown> | null = null
    if (s.status === 'failed') patch = { status: 'failed', error: reason(s), failed_at: at }
    else if (s.status === 'read' && row.status !== 'failed') patch = { status: 'read', read_at: at, ...(!row.delivered_at && { delivered_at: at }) }
    else if (s.status === 'delivered' && row.status === 'sent') patch = { status: 'delivered', delivered_at: at }
    if (patch) {
      const { error } = await db.from('wa_messages').update(patch).eq('id', row.id)
      if (error) console.warn('[wa-webhook] not saved:', error.message)
    }
  }
  return new Response('ok')
})
