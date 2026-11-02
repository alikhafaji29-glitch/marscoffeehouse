// Mars CoffeeHouse — nightly PDF statement for each delivery company (owner, 2026-10-29: "build daily pdfs for delivery
// companies revenues to be collected thats zhin and wadi app"; "the owner reciecves it, include number, english, 12:00
// midnight"; HANDOFF decision 234). One PDF per company per branch for the day that just ended (Iraq time), sent to the
// owner's number (vault daily_report_to) with the template mars_delivery_statement (DOCUMENT header):
//   "Delivery statement for {{1}}, {{2}}. Orders delivered: {{3}}. Amount to collect for Mars: {{4}} IQD. …"
// Money as in the Deliveries report: what the company collected = each delivered order's total (after discount; a gift is
// 0), minus its share (Tools → Delivery drivers). Delivery orders with no company get their own "No company set" PDF per
// branch (owner, 2026-10-30: "send the not set pdf too"). An order still On the way at midnight is counted, with a note
// (owner, 2026-11-02: "from positive hours, they mark it as on the way and stays like this till mid night"; Erbil taps
// about 7 a night just after 00:00, and orders are picked by the day they were placed, so no later PDF would have them).
// Called by pg_cron with the header x-report-key (same vault key as daily-report). ?dry=1 makes the PDFs and returns the
// figures without sending; ?day=YYYY-MM-DD picks another day (default: yesterday in Iraq — the cron runs at 00:00 Iraq); ?to=07… sends to
// that number instead of the owner's (tests; the key is still needed). Arabic / Kurdish text is shaped by fontkit with
// the Vazirmatn font (fetched from jsDelivr: only the font file, no order data leaves).
// Staff, from Deliveries (owner, 2026-11-03: "exports same form of the sent pdf, so if they want to adjust it and resend it or
// download it they can"): POST with their session, { branch, from, to, company, send }. One company ('' = no company) for
// those days, built from the orders as they are now, with today's shares; staff of that branch only. Returns the PDF, or
// with send: true sends it: to `to`, an Iraqi mobile typed by staff (owner, 2026-11-03: "send button, put a phone number
// field"), else to the owner's number, which never reaches the site.
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, rgb } from 'npm:pdf-lib@1.17.1'
import type { PDFFont, PDFPage } from 'npm:pdf-lib@1.17.1'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'

const GRAPH = Deno.env.get('WA_GRAPH_VERSION') ?? 'v23.0'
const IRAQ = 3 * 3600 * 1000
const FONT = 'https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/ttf/Vazirmatn-'
const BRANCH: Record<string, string> = { erbil: 'Erbil', kirkuk: 'Kirkuk' }
type Share = { kind: 'fixed' | 'pct' | 'fee' | 'both'; value: number; pct?: number }
type Driver = { name?: string; phone?: string; share?: Share }
type Row = {
  code: string; status: string; total: number; created_at: string; customer_name: string | null; customer_phone: string | null
  delivery_phone: string | null; address: string | null; note: string | null; cancel_reason: string | null; courier: string | null
  replenish: unknown | null; discount: { kind?: string; value?: number } | null; offer: { fee?: number } | null
}
type Line = { time: string; code: string; name: string; phone: string; address: string; total: number; share: number; note: string; gift: boolean; onway: boolean }

const iqd = (n: number) => Math.round(n).toLocaleString('en-US')
const isTest = (o: Row) => [o.customer_name, o.note, o.cancel_reason].some((x) => /test/i.test(x ?? ''))
const shareOf = (o: Row, s?: Share) => (!s ? 0 : s.kind === 'fixed' ? s.value : s.kind === 'pct' ? Math.round((o.total * s.value) / 100) : s.kind === 'both' ? s.value + Math.round((o.total * (s.pct ?? 0)) / 100) : o.offer?.fee ?? 0)
const ruleOf = (s?: Share) => !s ? 'share not set in Tools' : s.kind === 'fixed' ? `${iqd(s.value)} IQD per order` : s.kind === 'pct' ? `${s.value}% of each order` : s.kind === 'both' ? `${iqd(s.value)} IQD + ${s.pct ?? 0}% of each order` : 'the delivery fee of each order'
const hhmm = (iso: string) => new Date(new Date(iso).getTime() + IRAQ).toISOString().slice(11, 16)
const intl = (to: string) => { let n = to.replace(/\D/g, ''); if (n.startsWith('00')) n = n.slice(2); if (n.startsWith('0')) n = '964' + n.slice(1); return n }
const line = (o: Row, d?: Driver, onwayNote = 'On the way at 00:00'): Line => ({
  time: hhmm(o.created_at), code: o.code, name: o.customer_name ?? '', phone: o.delivery_phone || o.customer_phone || '', address: o.address ?? '',
  total: o.total, share: shareOf(o, d?.share), gift: !!o.replenish, onway: o.status === 'onway',
  note: [o.status === 'onway' ? onwayNote : '', o.replenish ? 'Free gift' : o.discount?.kind === 'pct' ? `Discount ${o.discount.value}%` : o.discount?.kind === 'fixed' ? `Discount ${iqd(o.discount.value ?? 0)} IQD` : ''].filter(Boolean).join(' · '),
})

let fonts: [Uint8Array, Uint8Array] | null = null
const loadFonts = async () => fonts ??= await Promise.all(['Regular', 'Bold'].map(async (w) => new Uint8Array(await (await fetch(`${FONT}${w}.ttf`)).arrayBuffer()))) as [Uint8Array, Uint8Array]

async function statement(p: { company: string; branch: string; dayLabel: string; shareRule: string; lines: Line[]; branchPhone: string; made: string; live?: boolean }) {
  const NAVY = rgb(0.13, 0.19, 0.42), INK = rgb(0.12, 0.12, 0.18), MUTED = rgb(0.42, 0.44, 0.5), LINE = rgb(0.86, 0.87, 0.9), SOFT = rgb(0.95, 0.96, 0.98), ORANGE = rgb(0.91, 0.51, 0.23), WHITE = rgb(1, 1, 1), PALE = rgb(0.85, 0.88, 0.96)
  const RTL = /[\u0590-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
  const latin = (s: string) => s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const [r, b] = await loadFonts()
  const reg = await doc.embedFont(r, { subset: true })
  const bold = await doc.embedFont(b, { subset: true })
  const W = 842, H = 595, M = 36
  let page!: PDFPage, y = 0
  const width = (t: string, size: number, f: PDFFont = reg) => f.widthOfTextAtSize(t, size)
  const fit = (s: string, max: number, size: number, f: PDFFont = reg) => { let t = latin(String(s ?? '')).replace(/\s+/g, ' ').trim(); if (width(t, size, f) <= max) return t; while (t && width(t + '…', size, f) > max) t = t.slice(0, -1); return t + '…' }
  // one line; Arabic / Kurdish is shaped by fontkit, number and Latin runs inside it are laid out right to left
  const text = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; align?: 'left' | 'right'; max?: number } = {}) => {
    const { size = 9, f = reg, color = INK, align = 'left', max } = o
    const t = max ? fit(s, max, size, f) : latin(String(s))
    if (align === 'right') x -= width(t, size, f)
    if (!RTL.test(t)) return page.drawText(t, { x, y: yy, size, font: f, color })
    for (const run of t.split(/([0-9A-Za-z+][0-9A-Za-z.,:/+-]*)/).filter(Boolean).reverse()) { page.drawText(run, { x, y: yy, size, font: f, color }); x += width(run, size, f) }
  }
  const newPage = () => {
    page = doc.addPage([W, H]); y = H - M
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: NAVY })
    text(`Mars CoffeeHouse · ${p.branch} · ${p.company} · ${p.dayLabel}`, W - M, 18, { size: 7.5, color: MUTED, align: 'right' })
    text(`Page ${doc.getPageCount()}`, M, 18, { size: 7.5, color: MUTED })
  }
  newPage()
  text('Mars CoffeeHouse', M, y - 14, { size: 18, f: bold, color: NAVY })
  text('Delivery statement', M, y - 34, { size: 12 })
  text(p.company, W - M, y - 14, { size: 18, f: bold, color: ORANGE, align: 'right' })
  text(`${p.branch} branch · ${p.dayLabel}${p.live ? '' : ' (00:00 to 24:00, Iraq time)'}`, W - M, y - 34, { size: 10, align: 'right' })
  y -= 56
  const gifts = p.lines.filter((l) => l.gift).length
  const onway = p.lines.filter((l) => l.onway).length
  const collected = p.lines.reduce((n, l) => n + l.total, 0)
  const shareSum = p.lines.reduce((n, l) => n + l.share, 0)
  const boxes = [
    ['Delivered orders', `${p.lines.length}`, [gifts ? `${gifts} free gift${gifts === 1 ? '' : 's'}` : 'no free gifts', onway ? `${onway} on the way${p.live ? '' : ' at midnight'}` : ''].filter(Boolean).join(' · ')],
    ['Collected from customers', `${iqd(collected)} IQD`, 'order totals after discounts'],
    [p.company === 'No company set' ? 'Company share' : `${p.company}'s share`, `${iqd(shareSum)} IQD`, p.shareRule],
    ['To pay Mars', `${iqd(collected - shareSum)} IQD`, 'collected minus the share'],
  ]
  const bw = (W - 2 * M - 30) / 4
  boxes.forEach(([k, v, sub], i) => {
    const x = M + i * (bw + 10), last = i === 3
    page.drawRectangle({ x, y: y - 58, width: bw, height: 58, color: last ? NAVY : SOFT, borderColor: last ? NAVY : LINE, borderWidth: 0.8 })
    text(k, x + 10, y - 16, { size: 8.5, color: last ? PALE : MUTED, max: bw - 20 })
    text(v, x + 10, y - 36, { size: 15, f: bold, color: last ? WHITE : INK })
    text(sub, x + 10, y - 50, { size: 7.5, color: last ? PALE : MUTED, max: bw - 20 })
  })
  y -= 80
  // [title, width, right-aligned, gap before]
  const cols: [string, number, boolean, number][] = [['Time', 34, false, 0], ['Order', 52, false, 0], ['Customer', 110, false, 0], ['Phone', 78, false, 0], ['Area / address', 212, false, 0], ['Collected', 62, true, 0], ['Share', 52, true, 0], ['To Mars', 62, true, 0], ['Note', 108, false, 10]]
  const row = (cells: string[], size: number, f: (c: number) => PDFFont, color = INK) => {
    let x = M + 6
    cols.forEach(([, w, right, gap], c) => { if (cells[c]) text(cells[c], right ? x + w - 6 : x + gap, y, { size, f: f(c), color, align: right ? 'right' : 'left', max: w - 10 - gap }); x += w })
  }
  const head = () => {
    page.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 18, color: NAVY })
    y -= 11; row(cols.map((c) => c[0]), 8, () => bold, WHITE); y -= 7
  }
  head()
  p.lines.forEach((l, i) => {
    if (y < M + 40) { newPage(); head() }
    if (i % 2) page.drawRectangle({ x: M, y: y - 15, width: W - 2 * M, height: 16, color: SOFT })
    y -= 10.5
    row([l.time, `#${l.code}`, l.name || '-', l.phone || '-', l.address || '-', iqd(l.total), iqd(l.share), iqd(l.total - l.share), l.note], 8.5, (c) => (c === 7 ? bold : reg))
    y -= 5.5
  })
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: NAVY })
  y -= 14
  row(['', '', `${p.lines.length} order${p.lines.length === 1 ? '' : 's'}`, '', '', iqd(collected), iqd(shareSum), iqd(collected - shareSum), ''], 9, () => bold)
  y -= 26
  if (onway) {
    if (y < M + 30) newPage()
    text(`Includes ${onway} order${onway === 1 ? '' : 's'} still marked On the way${p.live ? '' : ' at midnight'} (see Note).`, M, y, { size: 8.5, color: ORANGE })
    y -= 16
  }
  text(`Questions about this statement: Mars CoffeeHouse ${p.branch}${p.branchPhone ? `, ${p.branchPhone}` : ''}. Made automatically on ${p.made}.`, M, Math.max(y, M + 14), { size: 7.5, color: MUTED })
  return await doc.save()
}

const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const originOk = (o: string | null) => !allowed.length || (o !== null && allowed.includes(o))
const cors = (o: string | null) => ({
  'access-control-allow-origin': o && originOk(o) ? o : allowed[0] ?? '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  vary: 'origin',
})
const base64 = (b: Uint8Array) => { let t = ''; for (let i = 0; i < b.length; i += 8192) t += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(t) }
const DAY = /^\d{4}-\d{2}-\d{2}$/
const label = (iso: string, year = true) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(year && { year: 'numeric' }), timeZone: 'UTC' })

/** staff, from Deliveries: one company's statement for the days shown, downloaded or sent to the owner */
async function byStaff(req: Request, db: SupabaseClient) {
  const origin = req.headers.get('origin')
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'content-type': 'application/json' } })
  if (!originOk(origin)) return json(403, { ok: false, reason: 'origin' })
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json(401, { ok: false, reason: 'not_signed_in' })
  let body: { branch?: string; from?: string; to?: string; company?: string; send?: boolean; phone?: string }
  try { body = await req.json() } catch { return json(400, { ok: false, reason: 'bad_request' }) }
  const { branch = '', from = '', to = '', company = '', send: sendIt, phone = '' } = body
  let typed = intl(phone)
  if (typed.length === 10 && typed.startsWith('7')) typed = '964' + typed
  if (phone.trim() && !/^9647[3-9]\d{8}$/.test(typed)) return json(400, { ok: false, reason: 'bad_number' })
  if (!BRANCH[branch] || !DAY.test(from) || !DAY.test(to) || from > to || company.length > 60) return json(400, { ok: false, reason: 'bad_request' })
  // read as the caller, so the database's row rules apply
  const apikey = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, apikey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: u } = await sb.auth.getUser()
  if (!u?.user || u.user.is_anonymous) return json(403, { ok: false, reason: 'not_staff' })
  const { data: staff } = await sb.from('staff').select('branch').eq('user_id', u.user.id).maybeSingle()
  if (!staff || (staff.branch && staff.branch !== branch)) return json(403, { ok: false, reason: 'not_staff' })
  const since = new Date(new Date(from + 'T00:00:00Z').getTime() - IRAQ).toISOString()
  const until = new Date(new Date(to + 'T00:00:00Z').getTime() + 24 * 3600e3 - IRAQ).toISOString()
  const query = db.from('orders')
    .select('code,status,total,created_at,customer_name,customer_phone,delivery_phone,address,note,cancel_reason,courier,replenish,discount,offer')
    .eq('branch', branch).eq('fulfil', 'delivery').in('status', ['delivered', 'onway']).gte('created_at', since).lt('created_at', until).order('created_at').limit(5000)
  const { data, error } = await (company ? query.eq('courier', company) : query.is('courier', null))
  if (error) return json(200, { ok: false, reason: 'read' })
  const rows = ((data ?? []) as Row[]).filter((o) => !isTest(o))
  if (!rows.length) return json(200, { ok: false, reason: 'no_orders' })
  const { data: cfg } = await db.from('branch_config').select('settings').eq('branch', branch).maybeSingle()
  const settings = (cfg?.settings ?? {}) as { drivers?: Driver[]; phone?: string }
  const d = company ? (settings.drivers ?? []).find((x) => (x.name || x.phone) === company) : undefined
  const lines = rows.map((o) => line(o, d, 'On the way'))
  const now = new Date(Date.now() + IRAQ)
  const made = now.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  const name = company || 'No company set'
  const pdf = await statement({ company: name, branch: BRANCH[branch], dayLabel: from === to ? label(from) : `${label(from)} to ${label(to)}`, shareRule: company ? ruleOf(d?.share) : 'no delivery company picked', lines, branchPhone: settings.phone ?? '', made, live: true })
  const file = `${name.replace(/[^\w\u0600-\u06FF -]/g, '').trim() || 'company'} ${BRANCH[branch]} ${from === to ? from : `${from} to ${to}`}.pdf`
  if (!sendIt) return json(200, { ok: true, file, pdf: base64(pdf) })
  const { data: owner } = phone.trim() ? { data: null } : await db.rpc('daily_report_owner')
  if (!phone.trim() && !owner) return json(200, { ok: false, reason: 'no_owner' })
  const owes = lines.reduce((n, l) => n + l.total - l.share, 0)
  const values = [`${company || 'orders with no delivery company'} · ${BRANCH[branch]}`, from === to ? label(from, false) : `${label(from, false)} to ${label(to, false)}`, String(lines.length), iqd(owes)]
  const res = await send(db, branch, phone.trim() ? typed : intl(String(owner)), pdf, file, values, phone.trim() ? 'statement' : 'owner')
  return json(200, res.ok ? { ok: true, sent: true } : { ok: false, reason: 'meta', message: res.reason })
}

Deno.serve(async (req: Request) => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body, null, 1), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  const url = new URL(req.url)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req.headers.get('origin')) })
  const db: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  if (req.method === 'POST') return await byStaff(req, db)
  const { data: owner } = await db.rpc('daily_report_config', { p_key: req.headers.get('x-report-key') ?? '' })
  if (!owner) return json(403, { ok: false })
  const test = url.searchParams.get('to')
  const to = intl(test && /^[\d+ ]{8,20}$/.test(test) ? test : String(owner))
  const asked = url.searchParams.get('day')
  const now = new Date(Date.now() + IRAQ)
  const day = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? new Date(asked + 'T00:00:00Z') : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const from = new Date(day.getTime() - IRAQ).toISOString()
  const until = new Date(day.getTime() + 24 * 3600e3 - IRAQ).toISOString()
  const dayLabel = day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const made = now.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  const dry = url.searchParams.get('dry') === '1'
  const out: unknown[] = []
  const { data: cfgs } = await db.from('branch_config').select('branch,settings')
  for (const branch of ['erbil', 'kirkuk']) {
    const settings = ((cfgs ?? []).find((c) => c.branch === branch)?.settings ?? {}) as { drivers?: Driver[]; phone?: string }
    const { data, error } = await db.from('orders')
      .select('code,status,total,created_at,customer_name,customer_phone,delivery_phone,address,note,cancel_reason,courier,replenish,discount,offer')
      .eq('branch', branch).eq('fulfil', 'delivery').in('status', ['delivered', 'onway'])
      .gte('created_at', from).lt('created_at', until).order('created_at').limit(5000)
    if (error) { out.push({ branch, error: error.message }); continue }
    const rows = ((data ?? []) as Row[]).filter((o) => !isTest(o))
    // the companies by name, then the orders with none ('')
    for (const c of [...new Set(rows.map((o) => o.courier ?? ''))].sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b)))) {
      const company = c || 'No company set'
      const d = c ? (settings.drivers ?? []).find((x) => (x.name || x.phone) === c) : undefined
      const lines = rows.filter((o) => (o.courier ?? '') === c).map((o) => line(o, d))
      const owes = lines.reduce((n, l) => n + l.total - l.share, 0)
      const sum = { branch, company, delivered: lines.length, onway: lines.filter((l) => l.onway).length, toMars: owes }
      const pdf = await statement({ company, branch: BRANCH[branch] ?? branch, dayLabel, shareRule: c ? ruleOf(d?.share) : 'no delivery company picked', lines, branchPhone: settings.phone ?? '', made })
      if (dry) { out.push({ ...sum, pdf_bytes: pdf.length }); continue }
      const file = `${company.replace(/[^\w\u0600-\u06FF -]/g, '').trim() || 'company'} ${BRANCH[branch] ?? branch} ${day.toISOString().slice(0, 10)}.pdf`
      const values = [`${c || 'orders with no delivery company'} · ${BRANCH[branch] ?? branch}`, day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }), String(lines.length), iqd(owes)]
      out.push({ ...sum, ...(await send(db, branch, to, pdf, file, values)) })
    }
  }
  return json(200, { ok: true, day: day.toISOString().slice(0, 10), dry, test: !!test, out })
})

/** upload the PDF to WhatsApp, send it with the template, log it like the other WhatsApp messages */
async function send(db: SupabaseClient, branch: string, n: string, pdf: Uint8Array, filename: string, values: string[], driver = 'owner') {
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
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: n, type: 'template', template: { name: 'mars_delivery_statement', language: { code: 'en' }, components: [
        { type: 'header', parameters: [{ type: 'document', document: { id: media.id, filename } }] },
        { type: 'body', parameters: values.map((text) => ({ type: 'text', text })) },
      ] } }),
    })
    res = await r.json().catch(() => ({}))
    status = r.status
    ok = r.ok && !!res.messages?.length
  }
  await db.from('wa_messages').insert({
    wamid: ok ? res.messages![0].id : null, order_code: 'statement', branch, to_number: n, driver,
    template: 'mars_delivery_statement/en', status: ok ? 'sent' : 'failed',
    ...(!ok && { error: (res.error?.message ?? `HTTP ${status}`).slice(0, 500), failed_at: new Date().toISOString() }),
  })
  return ok ? { ok: true } : { ok: false, reason: res.error?.message ?? `HTTP ${status}` }
}
