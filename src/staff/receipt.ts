import { iqd } from '../account'
import type { Order } from '../account'
import { groupLines } from '../orders'

/*
 * The order receipt for the counter's receipt printer (owner, 2026-10-23: "print the receipt of the order as soon as
 * the order arrives"). Laid out for 80 mm paper (it also prints fine on A4): logo, branch, number and time, how the
 * order is fulfilled, the customer, the lines (combos grouped), the note, the address, the total and how it is paid.
 * It is printed from a hidden frame so the dashboard itself never changes. A browser shows its print window each
 * time; to print without it, the counter's Chrome is started with --kiosk-printing (see HANDOFF).
 */
export interface ReceiptText {
  branch: string
  dir: 'ltr' | 'rtl'
  when: string // date and time the order was placed
  how: string // Delivery / Pickup
  scheduled?: string // "Scheduled for …" / "Arriving at …"
  customer: string
  combo: (n: number) => string
  note: string
  deliverTo: string
  location: string
  pay: string
  fee?: string
  thanks: string
}

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function receiptHtml(o: Order, L: ReceiptText): string {
  const phone = o.delivery?.phone ?? o.customer?.phone ?? ''
  const lines = groupLines(o.items).map((g) => `${g.combo ? `<p class="combo">${esc(L.combo(g.combo))}</p>` : ''}<ul>${g.lines.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')
  return `<!doctype html><html dir="${L.dir}"><head><meta charset="utf-8"><title>#${esc(o.id)}</title><style>
@page { size: 80mm auto; margin: 4mm; }
* { box-sizing: border-box; }
body { margin: 0; width: 72mm; font: 13px/1.35 'Crimson Text', 'Cairo', 'Vazirmatn', Georgia, serif; color: #000; }
.c { text-align: center; } img { display: block; width: 46mm; margin: 0 auto 2mm; }
h1 { font-size: 22px; margin: 2mm 0 0; letter-spacing: 0.5px; } .big { font-size: 15px; font-weight: 700; }
hr { border: 0; border-top: 1px dashed #000; margin: 2.5mm 0; }
p { margin: 0.6mm 0; } ul { margin: 0.5mm 0 1.5mm; padding-inline-start: 4mm; } li { margin: 0.4mm 0; }
.combo { font-weight: 700; margin-top: 1.5mm; } .note { border: 1px solid #000; padding: 1.5mm 2mm; margin-top: 2mm; }
.total { font-size: 17px; font-weight: 700; } .ltr { direction: ltr; unicode-bidi: embed; }
</style></head><body>
<div class="c"><img src="${location.origin}/assets/logo.png" alt=""><p>${esc(L.branch)}</p>
<h1 class="ltr">#${esc(o.id)}</h1><p>${esc(L.when)}</p></div>
<hr><p class="big">${esc(L.how)}</p>${L.scheduled ? `<p class="big">${esc(L.scheduled)}</p>` : ''}
${o.customer ? `<p>${esc(L.customer)}: <b>${esc(o.customer.name)}</b></p>` : ''}${phone ? `<p class="ltr">${esc(phone)}</p>` : ''}
<hr>${lines}${o.note ? `<p class="note"><b>${esc(L.note)}:</b> ${esc(o.note)}</p>` : ''}
${o.delivery?.address || o.delivery?.location ? `<hr><p><b>${esc(L.deliverTo)}:</b></p>${o.delivery.address ? `<p>${esc(o.delivery.address)}</p>` : ''}${o.delivery.location ? `<p>${esc(L.location)}</p>` : ''}` : ''}
<hr><p class="total"><span class="ltr">${iqd(o.total)} IQD</span></p><p>${esc(L.pay)}${L.fee ? ` · ${esc(L.fee)}` : ''}</p>
<hr><p class="c">${esc(L.thanks)}</p>
</body></html>`
}

// one print window at a time: several orders arriving together print one after the other
let queue: Promise<void> = Promise.resolve()

export function printReceipt(o: Order, L: ReceiptText): Promise<void> {
  queue = queue.then(() => new Promise<void>((done) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(frame)
    const finish = () => { setTimeout(() => { frame.remove(); done() }, 500) }
    const doc = frame.contentDocument!
    doc.open(); doc.write(receiptHtml(o, L)); doc.close()
    const go = () => {
      const w = frame.contentWindow!
      w.addEventListener('afterprint', finish, { once: true })
      w.focus(); w.print()
      setTimeout(finish, 60000) // in case afterprint never comes
    }
    // print once the logo (and fonts) have loaded, so it is on the paper
    const img = doc.querySelector('img')
    if (img && !img.complete) { img.addEventListener('load', go, { once: true }); img.addEventListener('error', go, { once: true }) } else go()
  }))
  return queue
}
