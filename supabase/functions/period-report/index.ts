// Mars CoffeeHouse — the owner's weekly and monthly reports, instead of the daily one (owner, 2026-11-03: "two new reports instead
// of the daily report"; weekly Saturday 12:01 am for Saturday to Friday, monthly on the 1st at 12:01 am; one PDF per branch;
// HANDOFF decision 244). Called by pg_cron with ?kind=weekly or ?kind=monthly and the header x-report-key (same vault key as
// the daily report; the database gives the owner's number). ?dry=1 builds the PDFs and returns the figures without sending;
// ?end=YYYY-MM-DD is the day after the period (default: today in Iraq); ?to=07… sends to that number instead (tests).
// Sales and items are compared with the period before. When that one is shorter (the site went live on 23 Oct 2026) they are
// compared per day; under 7 days there is no comparison. Test orders are left out, as in Analytics.
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { buildReport } from './pdf.ts'
import type { Compare, Figures } from './pdf.ts'

const GRAPH = Deno.env.get('WA_GRAPH_VERSION') ?? 'v23.0'
const IRAQ = 3 * 3600 * 1000
const DAY = 24 * 3600 * 1000
const LIVE = Date.parse('2026-10-22T23:52:00Z') // the switch to this site, 23 Oct 02:52 Iraq
const FONT = 'https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/ttf/Vazirmatn-'
const BRANCH: Record<string, string> = { erbil: 'Erbil', kirkuk: 'Kirkuk' }
const TEMPLATE = 'mars_period_report'
type Share = { kind: 'fixed' | 'pct' | 'fee' | 'both'; value: number; pct?: number }
type Driver = { name?: string; phone?: string; share?: Share }
type Row = {
  status: string; fulfil: string; total: number; items: string[]; created_at: string; customer_name: string | null; customer_phone: string | null
  delivery_phone: string | null; note: string | null; cancel_reason: string | null; history: { stage: string; at: number }[] | null
  courier: string | null; replenish: unknown | null; discount: { amount?: number } | null; offer: { fee?: number; name?: string } | null
}

const iqd = (n: number) => Math.round(n).toLocaleString('en-US')
const intl = (to: string) => { let n = to.replace(/\D/g, ''); if (n.startsWith('00')) n = n.slice(2); if (n.startsWith('0')) n = '964' + n.slice(1); return n }
const isTest = (o: Row) => [o.customer_name, o.note, o.cancel_reason].some((x) => /test/i.test(x ?? ''))
const shareOf = (o: Row, s?: Share) => (!s ? 0 : s.kind === 'fixed' ? s.value : s.kind === 'pct' ? Math.round((o.total * s.value) / 100) : s.kind === 'both' ? s.value + Math.round((o.total * (s.pct ?? 0)) / 100) : o.offer?.fee ?? 0)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10) // of a time already moved to Iraq
const dayOf = (o: Row) => iso(Date.parse(o.created_at) + IRAQ)
const hourOf = (o: Row) => new Date(Date.parse(o.created_at) + IRAQ).getUTCHours()
const phoneOf = (o: Row) => (o.delivery_phone || o.customer_phone || '').replace(/\D/g, '').slice(-9)
const short = (t: number, year = false) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(year && { year: 'numeric' }), timeZone: 'UTC' })
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10 }
/** "Caesar Sandwich (12oz) · No sugar ×2" → ["Caesar Sandwich", 2] */
const lineOf = (line: string): [string, number] => {
  const m = /\s*×(\d+)\s*$/.exec(line)
  return [(m ? line.slice(0, m.index) : line).split(' · ')[0].replace(/\s*\([^)]*\)\s*$/, '').trim(), m ? Number(m[1]) : 1]
}
const itemCounts = (rows: Row[]) => { const c = new Map<string, number>(); for (const o of rows) for (const l of o.items ?? []) { const [n, q] = lineOf(l); c.set(n, (c.get(n) ?? 0) + q) } return c }
const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by)

function compare(sold: Row[], before: Row[], label: string, days: number, beforeDays: number, kind: string): Compare {
  if (beforeDays < 7 || !before.length) return null
  const perDay = beforeDays < days - 3 // months differ by a few days; only a really shorter period is averaged
  const fix = (n: number, d: number) => (perDay ? n / d : n)
  const rev = (r: Row[]) => r.reduce((n, o) => n + o.total, 0)
  const a = itemCounts(before), b = itemCounts(sold)
  // only items that really sold: not "from 1 to 3 is +200%"
  const min = kind === 'weekly' ? 15 : 30
  const moves = [...new Set([...a.keys(), ...b.keys()])].filter((n) => (a.get(n) ?? 0) + (b.get(n) ?? 0) >= min && a.get(n))
    .map((n): [string, number, number] => [n, Math.round(fix(a.get(n)!, beforeDays)), Math.round(fix(b.get(n) ?? 0, days))])
  const growth = (x: [string, number, number]) => (x[2] - x[1]) / (x[1] || 1)
  return {
    label, perDay,
    sales: [['Orders', fix(before.length, beforeDays), fix(sold.length, days)], ['Revenue (IQD)', fix(rev(before), beforeDays), fix(rev(sold), days)]],
    up: moves.filter((x) => x[2] > x[1]).sort((x, y) => growth(y) - growth(x)).slice(0, 5),
    down: moves.filter((x) => x[2] < x[1]).sort((x, y) => growth(x) - growth(y)).slice(0, 5),
  }
}

function figures(kind: 'weekly' | 'monthly', branch: string, all: Row[], from: number, end: number, beforeFrom: number, period: string, beforeLabel: string, drivers: Driver[], phone: string, made: string): Figures {
  const real = (o: Row) => !isTest(o) && Date.parse(o.created_at) >= LIVE
  const rows = all.filter((o) => { const d = dayOf(o); return d >= iso(from) && d < iso(end) && real(o) })
  const earlier = all.filter((o) => { const d = dayOf(o); return d >= iso(beforeFrom) && d < iso(from) && real(o) })
  const cancelled = rows.filter((o) => o.status === 'cancelled')
  const live = rows.filter((o) => o.status !== 'cancelled')
  const sold = live.filter((o) => !o.replenish)
  const revenue = sold.reduce((n, o) => n + o.total, 0)
  const days: Figures['days'] = []
  for (let t = from; t < end; t += DAY) { const k = iso(t), ds = sold.filter((o) => dayOf(o) === k); if (t + IRAQ >= LIVE) days.push([k, ds.length, ds.reduce((n, o) => n + o.total, 0)]) }
  const hours = new Map<string, number>()
  for (const o of sold) bump(hours, String(hourOf(o)))
  const items = [...itemCounts(sold)]
  const combos = sold.filter((o) => o.offer)
  const why = new Map<string, number>()
  for (const o of cancelled) bump(why, (o.cancel_reason ?? '').startsWith('r:') ? o.cancel_reason!.slice(2) : 'other')
  const disc = live.filter((o) => o.discount?.amount)
  const by = new Map<string, Row[]>()
  for (const o of live.filter((x) => x.fulfil === 'delivery' && ['delivered', 'onway'].includes(x.status))) by.set(o.courier ?? '', [...(by.get(o.courier ?? '') ?? []), o])
  const companies = [...by].map(([c, os]): [string, number, number, number] => {
    const share = drivers.find((x) => (x.name || x.phone) === c)?.share
    const col = os.reduce((n, o) => n + o.total, 0)
    return [c, os.length, col, col - os.reduce((n, o) => n + shareOf(o, share), 0)]
  }).sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || b[1] - a[1])
  const seen = new Map<string, number>()
  for (const o of sold) if (phoneOf(o)) bump(seen, phoneOf(o))
  // the times of each stage; over 3 hours is staff tapping late, not real
  const gap = (o: Row, a: string, b: string) => { const h = o.history ?? []; const x = h.find((s) => s.stage === a)?.at; const y = h.find((s) => s.stage === b)?.at; return x && y && y > x && y - x < 3 * 3600e3 ? (y - x) / 60000 : null }
  const waits = live.map((o) => gap(o, 'received', 'preparing')).filter((x): x is number => x !== null)
  const preps = live.map((o) => gap(o, 'preparing', 'done')).filter((x): x is number => x !== null)
  // the Saturday to Friday weeks of the month
  const weeks: Figures['weeks'] = []
  if (kind === 'monthly') {
    let a = Math.max(from, LIVE + IRAQ - ((LIVE + IRAQ) % DAY))
    while (a < end) {
      const b = Math.min(end, a + ((6 - new Date(a).getUTCDay() + 7) % 7 || 7) * DAY) // up to the next Saturday
      const inWeek = (o: Row) => dayOf(o) >= iso(a) && dayOf(o) < iso(b)
      const s = sold.filter(inWeek)
      weeks.push([b - a === DAY ? short(a) : `${short(a)} to ${short(b - DAY)}`, s.length, s.reduce((n, o) => n + o.total, 0), cancelled.filter(inWeek).length])
      a = b
    }
  }
  const dayCount = (end - from) / DAY
  const beforeDays = Math.round((from - Math.max(beforeFrom, Math.floor((LIVE + IRAQ) / DAY) * DAY)) / DAY)
  const earlierSold = earlier.filter((o) => o.status !== 'cancelled' && !o.replenish)
  return {
    kind, branch: BRANCH[branch] ?? branch, period, phone, made,
    footer: `Mars CoffeeHouse · ${BRANCH[branch] ?? branch} · ${kind === 'weekly' ? 'Weekly' : 'Monthly'} report · ${period}`,
    sold: sold.length, revenue, delivery: sold.filter((o) => o.fulfil === 'delivery').length, pickup: sold.filter((o) => o.fulfil !== 'delivery').length,
    combos: { n: combos.length, rev: combos.reduce((n, o) => n + o.total, 0) },
    days, hours: [...hours].map(([h, n]): [number, number] => [Number(h), n]).sort((a, b) => a[0] - b[0]),
    top: [...items].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10),
    low: [...items].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).slice(0, 5),
    weeks, cancel: { n: cancelled.length, lost: cancelled.reduce((n, o) => n + o.total, 0) },
    reasons: [...why].sort((a, b) => b[1] - a[1]), gifts: live.filter((o) => o.replenish).length,
    disc: { n: disc.length, amt: disc.reduce((n, o) => n + (o.discount!.amount ?? 0), 0) }, companies,
    customers: { all: seen.size, twice: [...seen.values()].filter((n) => n > 1).length },
    wait: median(waits), prep: median(preps), over10: waits.filter((w) => w > 10).length, timed: waits.length,
    compare: compare(sold, earlierSold, beforeLabel, dayCount, beforeDays, kind),
  }
}

Deno.serve(async (req: Request) => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body, null, 1), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  const url = new URL(req.url)
  const db: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: owner } = await db.rpc('daily_report_config', { p_key: req.headers.get('x-report-key') ?? '' })
  if (!owner) return json(403, { ok: false })
  const kind = url.searchParams.get('kind')
  if (kind !== 'weekly' && kind !== 'monthly') return json(400, { ok: false, reason: 'kind' })
  const asked = url.searchParams.get('end')
  const nowIraq = new Date(Date.now() + IRAQ)
  const today = Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), nowIraq.getUTCDate())
  const given = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? Date.parse(asked + 'T00:00:00Z') : today
  let from: number, end: number, beforeFrom: number, period: string, beforeLabel: string, short2: string
  if (kind === 'weekly') {
    end = given; from = end - 7 * DAY; beforeFrom = from - 7 * DAY
    period = `${short(from)} to ${short(end - DAY, true)}`; beforeLabel = 'the week before'; short2 = `${short(from)} to ${short(end - DAY)}`
  } else {
    const e = new Date(given)
    end = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 1); from = Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - 1, 1); beforeFrom = Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - 2, 1)
    period = new Date(from).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); beforeLabel = 'the month before'; short2 = period
  }
  const made = nowIraq.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  const dry = url.searchParams.get('dry') === '1'
  const test = url.searchParams.get('to')
  const to = intl(test && /^[\d+ ]{8,20}$/.test(test) ? test : String(owner))
  const [reg, bold] = await Promise.all(['Regular', 'Bold'].map(async (w) => new Uint8Array(await (await fetch(`${FONT}${w}.ttf`)).arrayBuffer())))
  const { data: cfgs } = await db.from('branch_config').select('branch,settings')
  const out: unknown[] = []
  for (const branch of ['erbil', 'kirkuk']) {
    // page by page: one read returns 1,000 rows at most
    const rows: Row[] = []
    for (let page = 0; ; page++) {
      const { data, error } = await db.from('orders')
        .select('status,fulfil,total,items,created_at,customer_name,customer_phone,delivery_phone,note,cancel_reason,history,courier,replenish,discount,offer')
        .eq('branch', branch).gte('created_at', new Date(beforeFrom - IRAQ).toISOString()).lt('created_at', new Date(end - IRAQ).toISOString()).order('created_at').range(page * 1000, page * 1000 + 999)
      if (error) { out.push({ branch, error: error.message }); break }
      rows.push(...((data ?? []) as Row[]))
      if ((data ?? []).length < 1000) break
    }
    const settings = ((cfgs ?? []).find((c) => c.branch === branch)?.settings ?? {}) as { drivers?: Driver[]; phone?: string }
    const f = figures(kind, branch, rows, from, end, beforeFrom, period, beforeLabel, settings.drivers ?? [], settings.phone ?? '', made)
    const pdf = await buildReport(f, [reg, bold])
    const sum = { branch, period, orders: f.sold, revenue: f.revenue, cancelled: f.cancel.n, customers: f.customers, compare: f.compare, top: f.top.slice(0, 3), weeks: f.weeks, companies: f.companies, wait: f.wait, prep: f.prep, over10: f.over10 }
    if (dry) { out.push({ ...sum, pdf_bytes: pdf.length }); continue }
    const file = `Mars ${kind} report ${BRANCH[branch]} ${iso(from)}.pdf`
    out.push({ branch, ...(await send(db, branch, to, pdf, file, [kind === 'weekly' ? 'weekly' : 'monthly', `${BRANCH[branch]} · ${short2}`, String(f.sold), iqd(f.revenue)], `${kind} report`)) })
  }
  return json(200, { ok: true, kind, dry, test: !!test, out })
})

/** upload the PDF to WhatsApp, send it with the template, log it like the other WhatsApp messages */
async function send(db: SupabaseClient, branch: string, n: string, pdf: Uint8Array, filename: string, values: string[], code: string) {
  const token = Deno.env.get('WA_TOKEN')
  const phoneId = Deno.env.get('WA_PHONE_ID')
  if (!token || !phoneId) return { ok: false, reason: 'not_configured' }
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', 'application/pdf')
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), filename)
  const up = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/media`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form })
  const media: { id?: string; error?: { message?: string } } = await up.json().catch(() => ({}))
  let res: { messages?: { id: string }[]; error?: { message?: string } } = media
  let ok = false, status = up.status
  if (media.id) {
    const r = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: n, type: 'template', template: { name: TEMPLATE, language: { code: 'en' }, components: [
        { type: 'header', parameters: [{ type: 'document', document: { id: media.id, filename } }] },
        { type: 'body', parameters: values.map((text) => ({ type: 'text', text })) },
      ] } }),
    })
    res = await r.json().catch(() => ({}))
    status = r.status
    ok = r.ok && !!res.messages?.length
  }
  await db.from('wa_messages').insert({
    wamid: ok ? res.messages![0].id : null, order_code: code, branch, to_number: n, driver: 'owner',
    template: `${TEMPLATE}/en`, status: ok ? 'sent' : 'failed',
    ...(!ok && { error: (res.error?.message ?? `HTTP ${status}`).slice(0, 500), failed_at: new Date().toISOString() }),
  })
  return ok ? { ok: true } : { ok: false, reason: res.error?.message ?? `HTTP ${status}` }
}
