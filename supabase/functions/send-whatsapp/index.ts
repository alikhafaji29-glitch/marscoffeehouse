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
//   WA_GRAPH_VERSION   optional: Graph API version (default v23.0)
//   ALLOWED_ORIGINS    optional: comma-separated site addresses allowed to call it
//
// A driver who has not written to the number in the last 24 hours can only be sent a template (Meta's rule). The template's
// language follows the dashboard's: English → en, Arabic → ar, Kurdish → fa: WhatsApp has no Kurdish, so the Kurdish
// wording is filed under Persian (owner, 2026-10-24: "i said kurdish template"); if fa fails it is sent again in Arabic.
// Order with a pin: mars_order_loc (owner, 2026-10-25: "too many useless words"; HANDOFF decision 204), the pin as a real
// WhatsApp location in a LOCATION header. No pin, or that one refused: mars_order_text, the same wording without the
// header. Both have 5 variables: {{1}} "#code · branch"  {{2}} customer + phone  {{3}} address  {{4}} items  {{5}} collect.
// If Meta refuses them, the plain text and the pin go instead (these reach drivers who wrote in the last 24 hours). The
// long mars_delivery_order was deleted at Meta (owner, 2026-11-02: "delete").
//
// Every send is written to public.wa_messages (owner, 2026-10-25: "wa msgs log"; HANDOFF decision 205) with Meta's
// message id, or as failed with Meta's reason; wa-webhook then marks it delivered / read / failed.
//
// kind "location_request" (owner, 2026-10-26; template approved 2026-10-28; HANDOFF decision 223): the dashboard's "Ask
// for location" on a delivery order without a pin. Goes to the CUSTOMER (the order's own phone, never a number from the
// browser) as the template mars_location_short ({{1}} "#code"; owner, 2026-10-29: the first wording "too long and not easy
// to understand"), in the language staff chose when sending (owner, 2026-10-28), else the one the customer ordered in
// (orders.lang). Kurdish: mars_location_short_ku (fa, "your order {{1}} needs your delivery location"; Meta filed
// mars_location_short fa under MARKETING), then mars_location_short in Arabic. The long mars_location_request was deleted
// at Meta (owner, 2026-11-02: "delete").
// orders.wa.asked_at is set, so wa-webhook knows which order a location that comes back belongs to, and orders.wa.lang,
// so its automatic replies use the same language.
import { createClient } from 'npm:@supabase/supabase-js@2'

const GRAPH = Deno.env.get('WA_GRAPH_VERSION') ?? 'v23.0'
const SHORT = 'mars_order_loc'
// the same short wording without the map, for orders with no pin (owner, 2026-10-29: "submit")
const SHORT_TEXT = 'mars_order_text'
// links instead of the pin, for a company that forwards the message to its own drivers (owner, 2026-11-06: a template with
// "no pin, instead put google maps pin + waze link", "control if we want to put google maps and waze or one of them"; HANDOFF
// decision 250): mars_order_text's wording plus "Location: {{6}}", {{6}} = the links chosen for that driver in Tools
const LINKS = 'mars_order_links'
const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const originOk = (o: string | null) => !allowed.length || (o !== null && allowed.includes(o))
const cors = (o: string | null) => ({
  'access-control-allow-origin': o && originOk(o) ? o : allowed[0] ?? '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  vary: 'origin',
})

type OrderRow = {
  uid: string; code: string; branch: string; customer_name: string | null; customer_phone: string | null; delivery_phone: string | null
  address: string | null; location: { lat: number; lng: number } | null; items: string[]; total: number; pay: string | null
  fulfil: string; status: string; gift_to: string | null; lang: string | null; wa: Record<string, unknown> | null
  replenish: { of_code?: string } | null
}

/** Iraqi numbers as WhatsApp wants them: 0750 123 4567 or 750 123 4567 → 9647501234567 */
function waNumber(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '964' + d.slice(1)
  if (d.length === 10 && d.startsWith('7')) d = '964' + d
  return d
}
/** a template variable may not hold line breaks, tabs or long runs of spaces (Meta's rule) */
const flat = (s: string, max = 900) => s.replace(/\s+/g, ' ').trim().slice(0, max) || '-'
const iqd = (n: number) => n.toLocaleString('en-US')
const BRANCH: Record<string, Record<string, string>> = {
  en: { erbil: 'Erbil', kirkuk: 'Kirkuk' },
  ar: { erbil: 'أربيل', kirkuk: 'كركوك' },
  fa: { erbil: 'هەولێر', kirkuk: 'کەرکووک' },
}
/** the template language for the dashboard's language: Kurdish is filed under Persian (WhatsApp has no Kurdish) */
const templateLang = (lang?: string) => (lang === 'ku' ? 'fa' : lang === 'ar' ? 'ar' : 'en')
// a gift (a replenishment: a free order sent to make up for another, 2026-10-28): the driver collects nothing
const COLLECT: Record<string, { wallet: string; cur: string; free: string }> = {
  en: { wallet: 'Paid by wallet', cur: 'IQD', free: 'Free gift: collect nothing' },
  ar: { wallet: 'مدفوع بالمحفظة', cur: 'دينار', free: 'هدية مجانية: لا تستلم أي مبلغ' },
  fa: { wallet: 'بە جزدان پارەی دراوە', cur: 'دینار', free: 'دیاری بێبەرامبەر: هیچ پارەیەک وەرمەگرە' },
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'content-type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json(405, { ok: false, reason: 'post_only' })
  if (!originOk(origin)) return json(403, { ok: false, reason: 'origin' })

  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json(401, { ok: false, reason: 'not_signed_in' })
  let body: { order_uid?: string; to?: string; text?: string; lang?: string; driver?: string; kind?: string; links?: string }
  try { body = await req.json() } catch { return json(400, { ok: false, reason: 'bad_request' }) }
  const askLoc = body.kind === 'location_request'
  if (!body.order_uid || (!body.to && !askLoc)) return json(400, { ok: false, reason: 'bad_request' })

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
    .select('uid,code,branch,customer_name,customer_phone,delivery_phone,address,location,items,total,pay,fulfil,status,gift_to,lang,wa,replenish')
    .eq('uid', body.order_uid).maybeSingle<OrderRow>()
  if (!o || (staff.branch && staff.branch !== o.branch)) return json(404, { ok: false, reason: 'no_order' })

  const token = Deno.env.get('WA_TOKEN')
  const phoneId = Deno.env.get('WA_PHONE_ID')
  if (!token || !phoneId) return json(200, { ok: false, reason: 'not_configured' })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  if (askLoc) {
    if (o.fulfil !== 'delivery' || o.gift_to) return json(400, { ok: false, reason: 'not_delivery' })
    if (o.location) return json(400, { ok: false, reason: 'has_location' })
    if (o.status === 'delivered' || o.status === 'cancelled') return json(400, { ok: false, reason: 'closed' })
  }
  const to = waNumber(askLoc ? (o.delivery_phone || o.customer_phone || '') : body.to!)
  if (to.length < 10 || to.length > 15) return json(400, { ok: false, reason: 'bad_number' })

  const tl = templateLang(body.lang)
  const phone = o.delivery_phone || o.customer_phone || ''
  const pin = o.location ? { latitude: o.location.lat, longitude: o.location.lng, name: flat(o.customer_name || `#${o.code}`, 100), address: flat(o.address || `#${o.code}`, 200) } : null
  const params = (tl: string) => [
    `#${o.code} · ${BRANCH[tl][o.branch] ?? o.branch}`,
    [o.customer_name, phone].filter(Boolean).join(' · '),
    o.address ?? '',
    (o.items ?? []).join(' · '),
    o.replenish ? COLLECT[tl].free : o.pay === 'wallet' ? COLLECT[tl].wallet : `${iqd(o.total)} ${COLLECT[tl].cur}`,
  ].map((t) => ({ type: 'text', text: flat(t) }))
  // the links for {{6}}: Google Maps, Waze, or both, as chosen in Tools (no pin: none, so the order goes as before)
  const ll = o.location ? `${o.location.lat},${o.location.lng}` : ''
  const want = body.links === 'google' || body.links === 'waze' || body.links === 'both' ? body.links : ''
  const links = ll && want ? [
    want !== 'waze' ? `Google Maps: https://www.google.com/maps?q=${ll}` : '',
    want !== 'google' ? `Waze: https://waze.com/ul?ll=${ll}&navigate=yes` : '',
  ].filter(Boolean).join(' | ') : ''
  type Sent = { r: Response; res: { messages?: { id: string }[]; error?: { code?: number; message?: string } } }
  const post = async (message: Record<string, unknown>): Promise<Sent> => {
    const r = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message }),
    })
    return { r, res: await r.json().catch(() => ({})) }
  }
  let sent: Sent = { r: new Response(null, { status: 500 }), res: {} }
  let used = ''
  if (askLoc) {
    const chosen = body.lang === 'ar' || body.lang === 'ku' || body.lang === 'en' ? body.lang : o.lang ?? 'en'
    const ctl = templateLang(chosen)
    const tries: [string, string][] = ctl === 'fa' ? [['mars_location_short_ku', 'fa'], ['mars_location_short', 'ar']] : [['mars_location_short', ctl]]
    const parameters = [{ type: 'text', text: flat(`#${o.code}`) }]
    for (const [name, lang] of tries) {
      sent = await post({ type: 'template', template: { name, language: { code: lang }, components: [{ type: 'body', parameters }] } })
      if (sent.res.messages?.length) { used = `${name}/${lang}`; break }
    }
    if (sent.res.messages?.length) {
      const { error } = await admin.from('orders').update({ wa: { ...(o.wa ?? {}), asked_at: new Date().toISOString(), asked_by: u.user.id, lang: chosen } }).eq('uid', o.uid)
      if (error) console.warn('[send-whatsapp] asked_at not saved:', error.message)
    }
  } else {
    // the pin version first, then the one without; Kurdish (fa) then Arabic, until Meta takes one
    // links chosen: no pin header, so the company can forward it; if Meta refuses it (not approved yet), the pin one as
    // before, so the location still arrives
    const names = links ? [LINKS, SHORT, SHORT_TEXT] : pin ? [SHORT, SHORT_TEXT] : [SHORT_TEXT]
    const langs = tl === 'fa' ? ['fa', 'ar'] : [tl]
    attempts: for (const name of names) {
      for (const lang of langs) {
        const components: unknown[] = []
        if (name.endsWith('_loc')) components.push({ type: 'header', parameters: [{ type: 'location', location: pin }] })
        components.push({ type: 'body', parameters: name === LINKS ? [...params(lang), { type: 'text', text: links }] : params(lang) })
        // the Arabic links one has its own name: Meta filed mars_order_links ar as MARKETING, so it was deleted and
        // resubmitted as mars_order_links_ar (owner, 2026-11-06: "delete it then resubmit"); the old name is blocked 30 days
        const tname = name === LINKS && lang === 'ar' ? 'mars_order_links_ar' : name
        sent = await post({ type: 'template', template: { name: tname, language: { code: lang }, components } })
        if (sent.res.messages?.length) { used = `${tname}/${lang}`; break attempts }
      }
    }
  }
  // no template accepted: the text, then the pin (not for the customer's request)
  if (!sent.res.messages?.length && !askLoc) {
    sent = await post({ type: 'text', text: { body: (body.text ?? '').slice(0, 4000) || `Mars order #${o.code}`, preview_url: true } })
    // the pin right after the text, as WhatsApp shows a shared location
    // (with links chosen the text already has the map link, and a pin would not forward)
    if (sent.res.messages?.length && pin && !links) await post({ type: 'location', location: pin })
  }
  const { r, res } = sent
  // the log, written with the service role (staff may only read it)
  const ok = r.ok && !!res.messages?.length
  const { error: logErr } = await admin.from('wa_messages').insert({
    wamid: ok ? res.messages![0].id : null, order_uid: o.uid, order_code: o.code, branch: o.branch, to_number: to,
    driver: askLoc ? 'customer' : (body.driver ?? '').slice(0, 60), template: used || 'text', status: ok ? 'sent' : 'failed', sent_by: u.user.id,
    ...(!ok && { error: (res.error?.message ?? `HTTP ${r.status}`).slice(0, 500), failed_at: new Date().toISOString() }),
  })
  if (logErr) console.warn('[send-whatsapp] log not written:', logErr.message)
  if (!ok) {
    console.warn('[send-whatsapp] Meta refused:', r.status, res.error?.code, res.error?.message)
    return json(200, { ok: false, reason: 'meta', code: res.error?.code, message: res.error?.message ?? `HTTP ${r.status}` })
  }
  return json(200, { ok: true, id: res.messages![0].id, template: used || undefined })
})
