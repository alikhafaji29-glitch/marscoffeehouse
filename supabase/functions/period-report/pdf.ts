// The weekly / monthly report as a PDF, one per branch (HANDOFF decision 244). Figures come worked out from index.ts; no customer names.
import { PDFDocument, rgb } from 'npm:pdf-lib@1.17.1'
import type { PDFFont, PDFPage } from 'npm:pdf-lib@1.17.1'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'

export type Compare = { label: string; perDay: boolean; sales: [string, number, number][]; up: [string, number, number][]; down: [string, number, number][] } | null
export type Figures = {
  kind: 'weekly' | 'monthly'; branch: string; period: string; footer: string; phone: string; made: string
  sold: number; revenue: number; delivery: number; pickup: number; combos: { n: number; rev: number }
  days: [string, number, number][]; hours: [number, number][]; top: [string, number][]; low: [string, number][]
  weeks: [string, number, number, number][]
  cancel: { n: number; lost: number }; reasons: [string, number][]; gifts: number; disc: { n: number; amt: number }
  companies: [string, number, number, number][]; customers: { all: number; twice: number }
  wait: number | null; prep: number | null; over10: number; timed: number; compare: Compare
}

const iqd = (n: number) => Math.round(n).toLocaleString('en-US')
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-')
const change = (a: number, b: number) => (a ? `${b >= a ? '+' : ''}${Math.round(((b - a) / a) * 100)}%` : '-')
const REASON: Record<string, string> = { customer: 'Customer asked', other: 'Other (typed by staff)', area: 'Outside the area', unreachable: 'No answer', closed: 'Branch closed', stock: 'Out of stock', paused: 'Orders paused' }
const hour = (h: number) => `${String(h).padStart(2, '0')}:00`
const dayLabel = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export async function buildReport(d: Figures, fonts: [Uint8Array, Uint8Array]) {
  const NAVY = rgb(0.13, 0.19, 0.42), INK = rgb(0.12, 0.12, 0.18), MUTED = rgb(0.42, 0.44, 0.5), LINE = rgb(0.86, 0.87, 0.9), SOFT = rgb(0.95, 0.96, 0.98), ORANGE = rgb(0.91, 0.51, 0.23), WHITE = rgb(1, 1, 1), PALE = rgb(0.85, 0.88, 0.96), RED = rgb(0.7, 0.16, 0.12)
  const RTL = /[֐-ࣿﭐ-﷿ﹰ-﻿]/
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const reg = await doc.embedFont(fonts[0], { subset: true })
  const bold = await doc.embedFont(fonts[1], { subset: true })
  const W = 595, H = 842, M = 36, CW = W - 2 * M
  let page!: PDFPage, y = 0
  type Opt = { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' | 'center' }
  // one line; Arabic / Kurdish is shaped by fontkit, number and Latin runs inside it are laid out right to left
  const text = (raw: string | number, x: number, yy: number, { size = 9, f = reg, color = INK, align = 'left' }: Opt = {}) => {
    const t = String(raw).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0))
    const w = f.widthOfTextAtSize(t, size)
    let at = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
    if (!RTL.test(t)) return page.drawText(t, { x: at, y: yy, size, font: f, color })
    for (const run of t.split(/([0-9A-Za-z+][0-9A-Za-z.,:/+-]*)/).filter(Boolean).reverse()) { page.drawText(run, { x: at, y: yy, size, font: f, color }); at += f.widthOfTextAtSize(run, size) }
  }
  const newPage = () => {
    page = doc.addPage([W, H]); y = H - M
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: NAVY })
    text(d.footer, W - M, 18, { size: 7.5, color: MUTED, align: 'right' })
    text(`Page ${doc.getPageCount()}`, M, 18, { size: 7.5, color: MUTED })
  }
  const need = (h: number) => { if (y - h < M + 16) newPage() }
  const section = (t: string, room = 46) => { need(room); y -= 6; text(t, M, y - 11, { size: 11.5, f: bold, color: NAVY }); y -= 17; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: LINE }); y -= 12 }
  type Col = [number, boolean]
  const rows = (lines: string[][], cols: Col[]) => {
    lines.forEach((cells, i) => {
      need(16)
      if (i % 2) page.drawRectangle({ x: M, y: y - 4, width: CW, height: 15, color: SOFT })
      cols.forEach(([x, right], c) => text(cells[c], x, y, { size: 8.5, align: right ? 'right' : 'left' }))
      y -= 15
    })
    y -= 4
  }
  const head = (labels: string[], cols: Col[]) => { need(32); cols.forEach(([x, right], c) => text(labels[c], x, y, { size: 7.5, f: bold, color: MUTED, align: right ? 'right' : 'left' })); y -= 14 }
  const bars = (items: [string, number, string][]) => {
    const max = Math.max(...items.map((i) => i[1]), 1)
    for (const [lab, v, val] of items) {
      need(16)
      text(lab, M, y, { size: 8.5 })
      page.drawRectangle({ x: M + 92, y: y - 1.5, width: Math.max(1.5, (v / max) * (CW - 190)), height: 9, color: v === max ? ORANGE : NAVY })
      text(val, W - M, y, { size: 8.5, align: 'right' })
      y -= 15
    }
    y -= 4
  }
  newPage()

  text('Mars CoffeeHouse', M, y - 14, { size: 18, f: bold, color: NAVY })
  text(d.kind === 'weekly' ? 'Weekly report' : 'Monthly report', M, y - 33, { size: 12 })
  text(d.branch, W - M, y - 14, { size: 18, f: bold, color: ORANGE, align: 'right' })
  text(d.period, W - M, y - 33, { size: 10, align: 'right' })
  y -= 54

  const boxes = [['Orders', `${d.sold}`, `delivery ${d.delivery}, pickup ${d.pickup}`], ['Revenue', iqd(d.revenue), 'IQD, gifts not counted'], ['Average order', d.sold ? iqd(d.revenue / d.sold) : '-', 'IQD'], ['Cancelled', `${d.cancel.n}`, `${pct(d.cancel.n, d.sold + d.cancel.n)} of orders placed`]]
  const bw = (CW - 24) / 4
  boxes.forEach(([k, v, sub], i) => {
    const x = M + i * (bw + 8), last = i === 3
    page.drawRectangle({ x, y: y - 56, width: bw, height: 56, color: last ? NAVY : SOFT, borderColor: last ? NAVY : LINE, borderWidth: 0.8 })
    text(k, x + 9, y - 15, { size: 8, color: last ? PALE : MUTED })
    text(v, x + 9, y - 34, { size: 14, f: bold, color: last ? WHITE : INK })
    text(sub, x + 9, y - 47, { size: 6.8, color: last ? PALE : MUTED })
  })
  y -= 68

  const cG: Col[] = [[M + 4, false], [M + 290, true], [M + 400, true], [W - M - 4, true]]
  section('Sales growth')
  if (d.compare) {
    text(`Compared with ${d.compare.label}${d.compare.perDay ? ', average per day because that period was shorter' : ''}.`, M, y, { size: 7.8, color: MUTED })
    y -= 14
    head(['', 'Before', 'Now', 'Change'], cG)
    rows(d.compare.sales.map(([k, a, b]) => [k, iqd(a), iqd(b), change(a, b)]), cG)
    section('Items growing', 110)
    if (d.compare.up.length) { head(['Item', 'Before', 'Now', 'Change'], cG); rows(d.compare.up.map(([k, a, b]) => [k, iqd(a), iqd(b), change(a, b)]), cG) } else { text('No main item grew.', M, y, { size: 9 }); y -= 18 }
    section('Items dropping', 60)
    if (d.compare.down.length) { head(['Item', 'Before', 'Now', 'Change'], cG); rows(d.compare.down.map(([k, a, b]) => [k, iqd(a), iqd(b), change(a, b)]), cG) } else { text('No main item dropped.', M, y, { size: 9 }); y -= 18 }
  } else { text('No earlier period to compare with.', M, y, { size: 9 }); y -= 18 }

  if (d.kind === 'monthly') {
    section('Revenue each day', 170)
    const chartH = 110, base = y - chartH, gap = CW / d.days.length, max = Math.max(...d.days.map((x) => x[2]), 1)
    d.days.forEach(([day, , r], i) => {
      const x = M + i * gap + gap * 0.14, w = gap * 0.72, h = (r / max) * (chartH - 18)
      page.drawRectangle({ x, y: base, width: w, height: Math.max(1, h), color: r === max ? ORANGE : NAVY })
      if (d.days.length <= 12) text(`${Math.round(r / 1000)}k`, x + w / 2, base + h + 4, { size: 7.5, align: 'center' })
      text(Number(day.slice(8)), x + w / 2, base - 11, { size: 6.5, color: MUTED, align: 'center' })
    })
    page.drawLine({ start: { x: M, y: base }, end: { x: W - M, y: base }, thickness: 0.6, color: LINE })
    y = base - 24
    const cW: Col[] = [[M + 4, false], [M + 225, true], [M + 325, true], [M + 415, true], [W - M - 4, true]]
    section('Each week', 110)
    head(['Week (Saturday to Friday)', 'Orders', 'Revenue IQD', 'Average', 'Cancelled'], cW)
    rows(d.weeks.map(([lab, n, r, c]) => [lab, String(n), iqd(r), n ? iqd(r / n) : '-', `${c} (${pct(c, n + c)})`]), cW)
  } else {
    section('Each day', 150)
    bars(d.days.map(([day, n, r]) => [dayLabel(day), r, `${iqd(r)} IQD · ${n} orders`]))
  }
  const sorted = [...d.days].sort((a, b) => b[2] - a[2])
  if (sorted.length) {
    need(16)
    text(`Best day: ${dayLabel(sorted[0][0])}, ${iqd(sorted[0][2])} IQD.  Quietest day: ${dayLabel(sorted[sorted.length - 1][0])}, ${iqd(sorted[sorted.length - 1][2])} IQD.`, M, y, { size: 8.5, f: bold })
    y -= 14
  }

  section('Busiest hours', 100)
  bars(d.hours.filter(([, n]) => n >= (d.kind === 'weekly' ? 5 : 15)).map(([h, n]) => [`${hour(h)} to ${hour(h + 1)}`, n, `${n} orders`]))

  const cA: Col[] = [[M + 4, false], [M + 300, true]]
  section('Best sellers', 190)
  head(['Item', 'Sold'], cA)
  rows(d.top.map(([n, q]) => [n, iqd(q)]), cA)
  section('Lowest sellers', 100)
  rows(d.low.map(([n, q]) => [n, iqd(q)]), cA)

  section('Combos and offers')
  text(`Combos were ${d.combos.n} of ${d.sold} orders (${pct(d.combos.n, d.sold)}), ${iqd(d.combos.rev)} IQD, ${pct(d.combos.rev, d.revenue)} of revenue.`, M, y, { size: 9 })
  y -= 18

  section('Cancellations', 120)
  text(`${d.cancel.n} orders, ${iqd(d.cancel.lost)} IQD of orders not completed.`, M, y, { size: 9, f: bold, color: RED })
  y -= 15
  const cB: Col[] = [[M + 4, false], [M + 300, true], [W - M - 4, true]]
  if (d.reasons.length) { head(['Reason', 'Orders', 'Share'], cB); rows(d.reasons.map(([r, n]) => [REASON[r] ?? r, String(n), pct(n, d.cancel.n)]), cB) }

  section('Gifts and discounts')
  text(`${d.gifts} free gifts · ${d.disc.n} discounts, ${iqd(d.disc.amt)} IQD off.`, M, y, { size: 9 })
  y -= 18

  section('Delivery companies', 100)
  const cC: Col[] = [[M + 4, false], [M + 210, true], [M + 330, true], [W - M - 4, true]]
  head(['Company', 'Orders', 'Collected IQD', 'To Mars IQD'], cC)
  rows(d.companies.map(([c, n, col, mars]) => [c || 'No company set', String(n), iqd(col), iqd(mars)]), cC)

  section('Customers')
  text(`${d.customers.all} different customers. ${d.customers.twice} of them (${pct(d.customers.twice, d.customers.all)}) ordered more than once.`, M, y, { size: 9 })
  y -= 18

  section('Service speed', 80)
  const cD: Col[] = [[M + 4, false], [W - M - 4, true]]
  rows([['Waiting: received to preparing, middle order', d.wait === null ? '-' : `${d.wait} min`], ['Preparing: preparing to done, middle order', d.prep === null ? '-' : `${d.prep} min`], ['Orders that waited over 10 minutes', `${d.over10} of ${d.timed} (${pct(d.over10, d.timed)})`]], cD)
  text('Road time is left out: staff mark orders delivered in batches, so it would not be true.', M, y, { size: 7.8, color: MUTED })
  y -= 18

  need(14)
  text(`Test orders left out. Questions: Mars CoffeeHouse ${d.branch}${d.phone ? `, ${d.phone}` : ''}. Made automatically on ${d.made}.`, M, Math.max(y, M + 14), { size: 7.5, color: MUTED })
  return await doc.save()
}
