// Mars CoffeeHouse — WhatsApp alert for an order nobody has started (owner, 2026-10-29: "if nobody made this order as
// preparing, we send a whatsapp msg to notify"; 10 minutes, one alert per order, English; HANDOFF decision 235).
//
// pg_cron checks every minute and calls this only when an order has waited 10 minutes (job mars-order-waiting, header
// x-report-key from the vault). public.claim_waiting_orders checks the key, records each order in order_alerts (so it is
// never alerted twice) and returns them with the branch's phone (Tools → Branch phone number, settings.phone; owner,
// 2026-10-30: "will be sent to the branch's phone"). No number for the branch → nothing is sent (status no_number). Template mars_order_waiting (en):
//   "Order {{1}} at the {{2}} branch has been waiting for {{3}} minutes and nobody has started preparing it. …"
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const GRAPH = Deno.env.get('WA_GRAPH_VERSION') ?? 'v23.0'
const BRANCH: Record<string, string> = { erbil: 'Erbil', kirkuk: 'Kirkuk' }
type Waiting = { uid: string; code: string; branch: string; customer_name: string | null; total: number; mins: number; alert_phone: string | null }

const iqd = (n: number) => Math.round(n).toLocaleString('en-US')
const flat = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 200) || '-'
const intl = (to: string) => { let n = to.replace(/\D/g, ''); if (n.startsWith('00')) n = n.slice(2); if (n.startsWith('0')) n = '964' + n.slice(1); return n }

Deno.serve(async (req: Request) => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body, null, 1), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  const db: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.rpc('claim_waiting_orders', { p_key: req.headers.get('x-report-key') ?? '' })
  if (error) return json(500, { ok: false })
  const out = []
  for (const o of (data ?? []) as Waiting[]) {
    const who = [o.customer_name?.trim(), `${iqd(o.total)} IQD`].filter(Boolean).join(', ')
    const values = [`#${o.code} (${who})`, BRANCH[o.branch] ?? o.branch, String(o.mins)].map(flat)
    const res = o.alert_phone ? await send(db, o, intl(o.alert_phone), values) : { status: 'no_number' }
    await db.from('order_alerts').update({ status: res.status, to_number: o.alert_phone ? intl(o.alert_phone) : null }).eq('order_uid', o.uid)
    out.push({ code: o.code, ...res })
  }
  return json(200, { ok: true, out })
})

/** the alert, logged like the other WhatsApp messages */
async function send(db: SupabaseClient, o: Waiting, n: string, values: string[]) {
  const token = Deno.env.get('WA_TOKEN')
  const phoneId = Deno.env.get('WA_PHONE_ID')
  if (!token || !phoneId) return { status: 'failed', reason: 'not_configured' }
  const r = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: n, type: 'template', template: { name: 'mars_order_waiting', language: { code: 'en' }, components: [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }] } }),
  })
  const res: { messages?: { id: string }[]; error?: { message?: string } } = await r.json().catch(() => ({}))
  const ok = r.ok && !!res.messages?.length
  await db.from('wa_messages').insert({
    wamid: ok ? res.messages![0].id : null, order_code: o.code, branch: o.branch, to_number: n, driver: 'staff alert',
    template: 'mars_order_waiting/en', status: ok ? 'sent' : 'failed',
    ...(!ok && { error: (res.error?.message ?? `HTTP ${r.status}`).slice(0, 500), failed_at: new Date().toISOString() }),
  })
  return ok ? { status: 'sent' } : { status: 'failed', reason: res.error?.message ?? `HTTP ${r.status}` }
}
