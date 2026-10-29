// Mars CoffeeHouse — the owner's daily report on WhatsApp (owner, 2026-10-29: "can we send daily reports to the owner?";
// WhatsApp, next morning about 9 am, separate per branch, English; contents: orders and revenue, speed, best sellers,
// gifts / discounts / delivery companies; HANDOFF decision 232).
//
// Called by pg_cron at 06:00 UTC (09:00 Iraq) through pg_net with the header x-report-key; the database checks the key and
// gives the owner's number (vault, public.daily_report_config). One message per branch, the template mars_daily_summary
// (2026-10-29: Meta filed the first wording, mars_daily_report, under MARKETING; reworded as an account summary):
//   {{1}} "Erbil · Wed 28 Oct"  {{2}} orders  {{3}} revenue  {{4}} cancelled  {{5}} speed  {{6}} best sellers
//   {{7}} gifts and discounts  {{8}} delivery companies
// ?dry=1 works the report out and returns it without sending; ?day=YYYY-MM-DD picks another day (default: yesterday in Iraq).
// Test orders are left out (named / noted / cancelled "test"), as in Analytics. Each send goes into the WhatsApp log.
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const GRAPH = Deno.env.get('WA_GRAPH_VERSION') ?? 'v23.0'
const IRAQ = 3 * 3600 * 1000 // UTC+3 all year
type Row = {
  code: string; status: string; fulfil: string; total: number; items: string[]; created_at: string; customer_name: string | null
  note: string | null; cancel_reason: string | null; history: { stage: string; at: number }[] | null; courier: string | null
  replenish: unknown | null; discount: { amount?: number } | null; offer: { fee?: number } | null
}
type Share = { kind: 'fixed' | 'pct' | 'fee' | 'both'; value: number; pct?: number }
type Driver = { name?: string; phone?: string; share?: Share }

const iqd = (n: number) => Math.round(n).toLocaleString('en-US')
const flat = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 900) || '-'
const REASON: Record<string, string> = { customer: 'customer asked', stock: 'out of stock', unreachable: 'no answer', area: 'outside the area', closed: 'branch closed', paused: 'orders paused' }
const BRANCH: Record<string, string> = { erbil: 'Erbil', kirkuk: 'Kirkuk' }
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
/** "Caesar Sandwich (12oz) · No sugar ×2" → ["Caesar Sandwich", 2] */
const lineOf = (line: string): [string, number] => {
  const m = /\s*×(\d+)\s*$/.exec(line)
  const qty = m ? Number(m[1]) : 1
  const name = (m ? line.slice(0, m.index) : line).split(' · ')[0].replace(/\s*\([^)]*\)\s*$/, '').trim()
  return [name, qty]
}
const isTest = (o: Row) => [o.customer_name, o.note, o.cancel_reason].some((x) => /test/i.test(x ?? ''))
const shareOf = (o: Row, s?: Share) => (!s ? 0 : s.kind === 'fixed' ? s.value : s.kind === 'pct' ? Math.round((o.total * s.value) / 100) : s.kind === 'both' ? s.value + Math.round((o.total * (s.pct ?? 0)) / 100) : o.offer?.fee ?? 0)

function report(branch: string, day: Date, rows: Row[], drivers: Driver[]): string[] {
  const label = `${BRANCH[branch] ?? branch} · ${day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}`
  const all = rows.filter((o) => !isTest(o))
  const cancelled = all.filter((o) => o.status === 'cancelled')
  const live = all.filter((o) => o.status !== 'cancelled')
  const sold = live.filter((o) => !o.replenish)
  const revenue = sold.reduce((n, o) => n + o.total, 0)
  const deliv = sold.filter((o) => o.fulfil === 'delivery').length
  const orders = sold.length ? `${sold.length} (delivery ${deliv}, pickup ${sold.length - deliv}), average ${iqd(revenue / sold.length)} IQD` : '0'
  // cancellations by reason
  const why = new Map<string, number>()
  for (const o of cancelled) { const r = (o.cancel_reason ?? '').startsWith('r:') ? REASON[o.cancel_reason!.slice(2)] ?? 'other' : 'other'; why.set(r, (why.get(r) ?? 0) + 1) }
  const cancel = cancelled.length ? `${cancelled.length} (${[...why].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(', ')})` : '0'
  // speed, from the time of each stage; over 3 hours is not real (staff tapping late) and left out
  const gap = (o: Row, a: string, b: string) => { const h = o.history ?? []; const x = h.find((s) => s.stage === a)?.at; const y = h.find((s) => s.stage === b)?.at; return x && y && y > x && y - x < 3 * 3600e3 ? (y - x) / 60000 : null }
  const span = (a: string, b: string) => median(live.map((o) => gap(o, a, b)).filter((x): x is number => x !== null))
  const min = (x: number | null) => (x === null ? '-' : `${Math.max(1, Math.round(x))} min`)
  const speed = `waiting ${min(span('received', 'preparing'))} · preparing ${min(span('preparing', 'done'))} · on the road ${min(span('onway', 'delivered'))}`
  // best sellers (gifts are not sales)
  const counts = new Map<string, number>()
  for (const o of sold) for (const l of o.items ?? []) { const [n, q] = lineOf(l); counts.set(n, (counts.get(n) ?? 0) + q) }
  const best = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, q]) => `${n} ${q}`).join(' · ') || '-'
  // gifts and discounts
  const gifts = live.filter((o) => o.replenish).length
  const disc = live.filter((o) => o.discount?.amount)
  const off = disc.reduce((n, o) => n + (o.discount!.amount ?? 0), 0)
  const giftsLine = `${gifts} gift${gifts === 1 ? '' : 's'} · ${disc.length ? `${iqd(off)} IQD off on ${disc.length} order${disc.length === 1 ? '' : 's'}` : 'no discounts'}`
  // delivery companies: delivered orders, what each collected minus its share (Tools → Delivery drivers)
  const delivered = live.filter((o) => o.fulfil === 'delivery' && o.status === 'delivered')
  const by = new Map<string, Row[]>()
  for (const o of delivered) by.set(o.courier ?? '', [...(by.get(o.courier ?? '') ?? []), o])
  const companies = [...by].filter(([c]) => c).sort((a, b) => b[1].length - a[1].length).map(([c, os]) => {
    const d = drivers.find((x) => (x.name || x.phone) === c)
    const owes = os.reduce((n, o) => n + o.total - shareOf(o, d?.share), 0)
    return `${c} ${os.length} order${os.length === 1 ? '' : 's'}, owes ${iqd(owes)} IQD`
  })
  const unset = by.get('')?.length ?? 0
  const courierLine = [...companies, ...(unset ? [`not set ${unset}`] : [])].join(' · ') || 'none delivered'
  return [label, orders, `${iqd(revenue)} IQD`, cancel, speed, best, giftsLine, courierLine].map(flat)
}

Deno.serve(async (req: Request) => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body, null, 1), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  const url = new URL(req.url)
  const db: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: to } = await db.rpc('daily_report_config', { p_key: req.headers.get('x-report-key') ?? '' })
  if (!to) return json(403, { ok: false })
  // the day: yesterday in Iraq, unless one is asked for
  const asked = url.searchParams.get('day')
  const today = new Date(Date.now() + IRAQ)
  const day = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? new Date(asked + 'T00:00:00Z') : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1))
  const from = new Date(day.getTime() - IRAQ).toISOString()
  const until = new Date(day.getTime() + 24 * 3600e3 - IRAQ).toISOString()
  const dry = url.searchParams.get('dry') === '1'
  const out: Record<string, unknown> = {}
  const { data: cfgs } = await db.from('branch_config').select('branch,settings')
  for (const branch of ['erbil', 'kirkuk']) {
    const { data, error } = await db.from('orders')
      .select('code,status,fulfil,total,items,created_at,customer_name,note,cancel_reason,history,courier,replenish,discount,offer')
      .eq('branch', branch).gte('created_at', from).lt('created_at', until).limit(5000)
    if (error) { out[branch] = { error: error.message }; continue }
    const drivers = ((cfgs ?? []).find((c) => c.branch === branch)?.settings as { drivers?: Driver[] } | null)?.drivers ?? []
    const values = report(branch, day, (data ?? []) as Row[], drivers)
    if (dry) { out[branch] = values; continue }
    out[branch] = await send(db, branch, String(to), values)
  }
  return json(200, { ok: true, day: day.toISOString().slice(0, 10), dry, out })
})

/** one branch's report to the owner: the template, logged like the other WhatsApp messages */
async function send(db: SupabaseClient, branch: string, to: string, values: string[]) {
  const token = Deno.env.get('WA_TOKEN')
  const phoneId = Deno.env.get('WA_PHONE_ID')
  if (!token || !phoneId) return { ok: false, reason: 'not_configured' }
  let n = to.replace(/\D/g, '')
  if (n.startsWith('00')) n = n.slice(2)
  if (n.startsWith('0')) n = '964' + n.slice(1)
  const r = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: n, type: 'template', template: { name: 'mars_daily_summary', language: { code: 'en' }, components: [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }] } }),
  })
  const res: { messages?: { id: string }[]; error?: { message?: string } } = await r.json().catch(() => ({}))
  const ok = r.ok && !!res.messages?.length
  await db.from('wa_messages').insert({
    wamid: ok ? res.messages![0].id : null, order_code: 'daily report', branch, to_number: n, driver: 'owner',
    template: 'mars_daily_summary/en', status: ok ? 'sent' : 'failed',
    ...(!ok && { error: (res.error?.message ?? `HTTP ${r.status}`).slice(0, 500), failed_at: new Date().toISOString() }),
  })
  return ok ? { ok: true } : { ok: false, reason: res.error?.message ?? `HTTP ${r.status}` }
}
