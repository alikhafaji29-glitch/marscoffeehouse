// Mars CoffeeHouse — sends a delivery order to a driver through the WhatsApp Cloud API (owner, 2026-10-24: "link wa
// button to cloud api"). The dashboard's driver buttons call it; staff no longer press Send in WhatsApp. When it cannot
// send (not set up yet, Meta refuses), the dashboard falls back to opening WhatsApp with the message, as before.
//
// Who may call: signed-in staff only, for an order of their own branch (the owner: any branch). It checks this itself
// with the caller's own session (deployed with verify_jwt off, like the mood function), so customers' anonymous
// sessions are refused.
//
// Secrets (Supabase → Edge Functions → Secrets, never in the code or the site):
//   WA_TOKEN           the permanent access token (a System User token of Mars' Meta Business account)
//   WA_PHONE_ID        the Phone number ID of the number that sends (WhatsApp Manager → API Setup)
//   WA_TEMPLATE        optional: the approved template's name. A driver who has not written to the number in the last
//                      24 hours can only be sent a template (Meta's rule); without one, plain text is sent.
//   (the template's language follows the dashboard's: English → en, Arabic → ar, Kurdish → ar, since WhatsApp has no
//   Kurdish templates; owner, 2026-10-24: "arabic")
//   WA_GRAPH_VERSION   optional: Graph API version (default v23.0)
//   ALLOWED_ORIGINS    optional: comma-separated site addresses allowed to call it
//
// The template mars_delivery_order (approved wording in HANDOFF decision 193) has 7 variables, in this order:
//   {{1}} order number  {{2}} branch  {{3}} customer + phone  {{4}} address  {{5}} map link  {{6}} items  {{7}} collect
import { createClient } from 'npm:@supabase/supabase-js@2'

const GRAPH = Deno.env.get('WA_GRAPH_VERSION') ?? 'v23.0'
const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const originOk = (o: string | null) => !allowed.length || (o !== null && allowed.includes(o))
const cors = (o: string | null) => ({
  'access-control-allow-origin': o && originOk(o) ? o : allowed[0] ?? '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  vary: 'origin',
})

type OrderRow = {
  code: string; branch: string; customer_name: string | null; customer_phone: string | null; delivery_phone: string | null
  address: string | null; location: { lat: number; lng: number } | null; items: string[]; total: number; pay: string | null
}

/** Iraqi numbers as WhatsApp wants them: 0750 123 4567 → 9647501234567 */
function waNumber(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '964' + d.slice(1)
  return d
}
/** a template variable may not hold line breaks, tabs or long runs of spaces (Meta's rule) */
const flat = (s: string, max = 900) => s.replace(/\s+/g, ' ').trim().slice(0, max) || '-'
const iqd = (n: number) => n.toLocaleString('en-US')
const BRANCH: Record<string, Record<string, string>> = {
  en: { erbil: 'Erbil', kirkuk: 'Kirkuk' },
  ar: { erbil: 'أربيل', kirkuk: 'كركوك' },
}
/** the template language for the dashboard's language: WhatsApp has no Kurdish templates, Kurdish gets Arabic */
const templateLang = (lang?: string) => (lang === 'ar' || lang === 'ku' ? 'ar' : 'en')

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'content-type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json(405, { ok: false, reason: 'post_only' })
  if (!originOk(origin)) return json(403, { ok: false, reason: 'origin' })

  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json(401, { ok: false, reason: 'not_signed_in' })
  let body: { order_uid?: string; to?: string; text?: string; lang?: string }
  try { body = await req.json() } catch { return json(400, { ok: false, reason: 'bad_request' }) }
  if (!body.order_uid || !body.to) return json(400, { ok: false, reason: 'bad_request' })

  // everything below is read as the caller, so the database's row rules apply
  // the project's public key: the one the platform provides, else the publishable key the site sent with the call
  const apikey = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, apikey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: u } = await sb.auth.getUser()
  if (!u?.user || u.user.is_anonymous) return json(403, { ok: false, reason: 'not_staff' })
  const { data: staff } = await sb.from('staff').select('branch').eq('user_id', u.user.id).maybeSingle()
  if (!staff) return json(403, { ok: false, reason: 'not_staff' })
  const { data: o } = await sb.from('orders')
    .select('code,branch,customer_name,customer_phone,delivery_phone,address,location,items,total,pay')
    .eq('uid', body.order_uid).maybeSingle<OrderRow>()
  if (!o || (staff.branch && staff.branch !== o.branch)) return json(404, { ok: false, reason: 'no_order' })

  const token = Deno.env.get('WA_TOKEN')
  const phoneId = Deno.env.get('WA_PHONE_ID')
  if (!token || !phoneId) return json(200, { ok: false, reason: 'not_configured' })
  const to = waNumber(body.to)
  if (to.length < 10 || to.length > 15) return json(400, { ok: false, reason: 'bad_number' })

  const template = Deno.env.get('WA_TEMPLATE')
  const tl = templateLang(body.lang)
  const phone = o.delivery_phone || o.customer_phone || ''
  const message = template
    ? {
      type: 'template',
      template: {
        name: template,
        language: { code: tl },
        components: [{
          type: 'body',
          parameters: [
            o.code,
            BRANCH[tl][o.branch] ?? o.branch,
            [o.customer_name, phone].filter(Boolean).join(' · '),
            o.address ?? '',
            o.location ? `https://www.google.com/maps?q=${o.location.lat},${o.location.lng}` : '',
            (o.items ?? []).join(' · '),
            o.pay === 'wallet' ? (tl === 'ar' ? 'مدفوع بالمحفظة' : 'Paid by wallet') : `${iqd(o.total)} ${tl === 'ar' ? 'دينار' : 'IQD'}`,
          ].map((t) => ({ type: 'text', text: flat(t) })),
        }],
      },
    }
    : { type: 'text', text: { body: (body.text ?? '').slice(0, 4000) || `Mars order #${o.code}`, preview_url: true } }

  const r = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message }),
  })
  const res = await r.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { code?: number; message?: string } }
  if (!r.ok || !res.messages?.length) {
    console.warn('[send-whatsapp] Meta refused:', r.status, res.error?.code, res.error?.message)
    return json(200, { ok: false, reason: 'meta', code: res.error?.code, message: res.error?.message ?? `HTTP ${r.status}` })
  }
  return json(200, { ok: true, id: res.messages[0].id, template: !!template })
})
