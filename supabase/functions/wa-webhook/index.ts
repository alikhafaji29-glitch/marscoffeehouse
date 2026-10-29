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
//
// Messages FROM customers (owner, 2026-10-26: "when the customer shares it, it will be added on his order card"; HANDOFF
// decision 223). Only from a number staff asked for a location (send-whatsapp kind location_request sets orders.wa.asked_at
// in the last 2 days, matched on the phone's last 9 digits); anything else is ignored. The newest such order that is
// still open gets it:
//   a location  → orders.location (location_from 'wa'; a pin the customer gave when ordering is kept, the new one is
//                 listed on the card instead); reply "location received for order #…"
//   anything else (text, voice, photo…) → listed on the card (orders.wa.replies); once per order the reply "this chat
//                 only accepts your location … call {branch phone}"
//   only closed orders (delivered / cancelled) → once per order "this order is already closed …"
// The replies are free text: allowed because the customer has just written (Meta's 24-hour window). They use WA_TOKEN and
// WA_PHONE_ID like send-whatsapp, in the language the request went in (orders.wa.lang, chosen by staff; else the one
// the customer ordered in), and go into the WhatsApp log too.
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

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

type Incoming = {
  from: string; id: string; timestamp?: string; type: string
  text?: { body?: string }; location?: { latitude: number; longitude: number; name?: string; address?: string }
  button?: { text?: string }; interactive?: { button_reply?: { title?: string } }
}
type OrderRow = {
  uid: string; code: string; branch: string; status: string; lang: string | null; customer_phone: string | null; delivery_phone: string | null
  location: { lat: number; lng: number } | null; location_from: string | null
  wa: { asked_at?: string; lang?: string; reminded?: boolean; closed_replied?: boolean; replies?: Reply[]; seen?: string[] } | null
}
type Reply = { kind: string; text?: string; lat?: number; lng?: number; at: string }

const GRAPH = Deno.env.get('WA_GRAPH_VERSION') ?? 'v23.0'
const last9 = (p: string | null) => (p ?? '').replace(/\D/g, '').slice(-9)
const closed = (o: OrderRow) => o.status === 'delivered' || o.status === 'cancelled'
// the replies agreed with the owner (2026-10-26), in the customer's language
const SAY = {
  got: { en: 'Automated reply: location received for order {order}. Thank you.', ar: 'ردّ تلقائي: تم استلام الموقع للطلب {order}. شكراً لك.', ku: 'وەڵامی ئۆتۆماتیکی: شوێن بۆ داواکاری {order} وەرگیرا. سوپاس.' },
  // no paper clip in any language (owner, 2026-10-29)
  only: { en: 'Automated reply: this chat only accepts your location. Choose Location, then Send your current location. To talk to us, call {phone}.', ar: 'ردّ تلقائي: هذه المحادثة تستقبل موقعك فقط. اختر «الموقع» ثم «إرسال موقعك الحالي». للتحدث معنا، اتصل على {phone}.', ku: 'وەڵامی ئۆتۆماتیکی: ئەم چاتە تەنها شوێنەکەت وەردەگرێت. «شوێن» هەڵبژێرە، پاشان «ناردنی شوێنی ئێستات». بۆ قسەکردن لەگەڵمان، پەیوەندی بکە بە {phone}.' },
  closed: { en: 'Automated reply: this order is already closed. For a new order: www.marscoffeehouse.com', ar: 'ردّ تلقائي: هذا الطلب مُغلق. لطلب جديد: www.marscoffeehouse.com', ku: 'وەڵامی ئۆتۆماتیکی: ئەم داواکارییە داخراوە. بۆ داواکاریی نوێ: www.marscoffeehouse.com' },
}
const say = (k: keyof typeof SAY, lang: string | null, vars: Record<string, string>) =>
  SAY[k][lang === 'ar' || lang === 'ku' ? lang : 'en'].replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '')

/** a free-text reply to a customer who has just written, logged like the other messages */
async function reply(db: SupabaseClient, o: OrderRow, to: string, body: string, what: string) {
  const token = Deno.env.get('WA_TOKEN')
  const phoneId = Deno.env.get('WA_PHONE_ID')
  if (!token || !phoneId) return
  const r = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body } }),
  })
  const res: { messages?: { id: string }[]; error?: { message?: string } } = await r.json().catch(() => ({}))
  const ok = r.ok && !!res.messages?.length
  await db.from('wa_messages').insert({
    wamid: ok ? res.messages![0].id : null, order_uid: o.uid, order_code: o.code, branch: o.branch, to_number: to,
    driver: 'customer', template: what, status: ok ? 'sent' : 'failed',
    ...(!ok && { error: (res.error?.message ?? `HTTP ${r.status}`).slice(0, 500), failed_at: new Date().toISOString() }),
  })
}

/** one message a customer sent to the business number */
async function incoming(db: SupabaseClient, m: Incoming) {
  const who = last9(m.from)
  if (who.length < 9) return
  const since = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
  const { data } = await db.from('orders')
    .select('uid,code,branch,status,lang,customer_phone,delivery_phone,location,location_from,wa')
    .gte('created_at', since).not('wa->>asked_at', 'is', null)
    .order('created_at', { ascending: false }).limit(50)
  const mine = ((data ?? []) as OrderRow[]).filter((o) => last9(o.delivery_phone || o.customer_phone) === who)
  if (!mine.length) return // nobody asked this number for a location: not ours to answer
  const o = mine.find((x) => !closed(x)) ?? mine[0]
  const wa = { ...(o.wa ?? {}) }
  if ((wa.seen ?? []).includes(m.id)) return // Meta sent this one again
  wa.seen = [...(wa.seen ?? []), m.id].slice(-20)
  const at = new Date(m.timestamp ? Number(m.timestamp) * 1000 : Date.now()).toISOString()
  const patch: Record<string, unknown> = {}
  let answer: [keyof typeof SAY, string] | null = null

  if (closed(o)) {
    if (!wa.closed_replied) { wa.closed_replied = true; answer = ['closed', 'auto: closed'] }
  } else if (m.type === 'location' && m.location) {
    const pin = { lat: m.location.latitude, lng: m.location.longitude }
    if (!o.location || o.location_from === 'wa') { patch.location = pin; patch.location_from = 'wa' }
    else wa.replies = [...(wa.replies ?? []), { kind: 'location', ...pin, at }].slice(-20) // the card keeps the pin it had
    answer = ['got', 'auto: location received']
  } else {
    const text = (m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? '').slice(0, 500)
    wa.replies = [...(wa.replies ?? []), { kind: m.type, ...(text && { text }), at }].slice(-20)
    if (!wa.reminded) { wa.reminded = true; answer = ['only', 'auto: location only'] }
  }
  const { error } = await db.from('orders').update({ ...patch, wa }).eq('uid', o.uid)
  if (error) { console.warn('[wa-webhook] order not updated:', error.message); return }
  if (answer) {
    const { data: cfg } = await db.from('branch_config').select('settings').eq('branch', o.branch).maybeSingle()
    const phone = String((cfg?.settings as { phone?: string } | null)?.phone ?? '')
    await reply(db, o, m.from, say(answer[0], wa.lang ?? o.lang, { order: `#${o.code}`, phone }), answer[1])
  }
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

  let body: { entry?: { changes?: { value?: { statuses?: Status[]; messages?: Incoming[] } }[] }[] }
  try { body = JSON.parse(raw) } catch { return new Response('ok') }
  const values = (body.entry ?? []).flatMap((e) => (e.changes ?? []).map((c) => c.value ?? {}))
  const statuses = values.flatMap((v) => v.statuses ?? [])
  const messages = values.flatMap((v) => v.messages ?? [])
  if (!statuses.length && !messages.length) return new Response('ok')

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const m of messages) {
    try { await incoming(db, m) } catch (e) { console.warn('[wa-webhook] message not handled:', (e as Error).message) }
  }
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
