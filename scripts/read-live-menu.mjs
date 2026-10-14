// Read the public menu of marscoffeehouse.com for one branch: every category, every item, and for each item its
// description and the price + nutrition facts of every size and flavour (as a visitor sees them in the item window).
// Out-of-stock items do not open on the live site, so they come back with the list line only.
// args: OUT_FILE branch(erbil|kirkuk)
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
const OUT = process.argv[2]; const BRANCH = process.argv[3] || 'erbil'
mkdirSync(dirname(OUT), { recursive: true })
const PORT = 9395 + (BRANCH === 'kirkuk' ? 1 : 0)
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', `--user-data-dir=${dirname(OUT)}/profile-${BRANCH}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page') } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0; const pending = new Map()
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) })
const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: `https://www.marscoffeehouse.com/${BRANCH}` }); await sleep(6000)

const SCRAPER = `(() => {
  window.__nut = { items: [], done: false, log: [], at: '', home: '' }; const N = window.__nut
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const find = (label) => [...document.querySelectorAll('button, a, [role=button], div, span, h2, h3, p')].find((e) => e.innerText && e.innerText.trim() === label && e.children.length <= 1)
  const click = (label) => { const el = find(label); if (!el) return false; (el.closest('button, a, [role=button]') || el).click(); return true }
  const setSel = (sel, v) => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, v); sel.dispatchEvent(new Event('change', { bubbles: true })) }
  const readNut = () => Object.fromEntries([...document.querySelectorAll('.modal-content .nutrition-row')].map((r) => [r.querySelector('.nutrition-label').innerText.trim(), r.querySelector('.nutrition-value').innerText.trim()]))
  const price = () => (document.querySelector('.modal-content .price-display')?.innerText || '').replace(/\\s+/g, ' ').trim()
  const waitFor = async (sel, ms) => { for (let t = 0; t < ms; t += 150) { if (document.querySelector(sel)) return true; await sleep(150) } return false }
  const waitGone = async (sel, ms) => { for (let t = 0; t < ms; t += 150) { if (!document.querySelector(sel)) return true; await sleep(150) } return false }
  ;(async () => {
    try {
      const en = [...document.querySelectorAll('button')].find((e) => e.innerText.trim() === 'English'); if (en) { en.click(); await sleep(3000) }
      N.home = document.body.innerText
      for (const group of ['Drinks', 'Food']) {
        click(group); await sleep(2200)
        const cats = document.body.innerText.split('\\n').map((x) => x.trim()).filter((x) => x && !/^(Drinks|Food|\\u2190 BACK|DIGITAL EXPERIENCE)/.test(x))
        for (const c of cats) {
          if (!click(c)) { N.log.push('cat not found ' + c); continue }
          await sleep(2200)
          const n = document.querySelectorAll('.product-item').length
          for (let i = 0; i < n; i++) {
            const card = document.querySelectorAll('.product-item')[i]; if (!card) continue
            const name = (card.querySelector('.cat-label')?.innerText || '').trim(); N.at = c + ' / ' + name
            const rec = { group, cat: c, name, out: /OUT OF STOCK/.test(card.innerText), listText: card.innerText.replace(/\\s+/g, ' ').trim(), variants: [] }
            ;(card.querySelector('.cat-label') || card).click()
            if (!(await waitFor('.modal-content', 3000))) { rec.noModal = true; N.items.push(rec); continue }
            await sleep(400)
            const m = document.querySelector('.modal-content')
            rec.title = m.querySelector('.product-title')?.innerText.trim(); rec.desc = m.querySelector('.product-description')?.innerText.trim() || ''
            rec.image = m.querySelector('.modal-product-image')?.getAttribute('src') || ''
            const sizes = [...m.querySelectorAll('.size-btn-square')].map((b) => b.innerText.trim())
            const sel = m.querySelector('select.flavor-dropdown'); const flavors = sel ? [...sel.options].map((o) => o.value) : [null]
            rec.sizes = sizes; rec.flavors = flavors.filter(Boolean)
            for (const s of (sizes.length ? sizes : [null])) {
              if (s) { const b = [...document.querySelectorAll('.modal-content .size-btn-square')].find((x) => x.innerText.trim() === s); if (b) { b.click(); await sleep(280) } }
              for (const f of flavors) {
                if (f) { const sl = document.querySelector('.modal-content select.flavor-dropdown'); if (sl) { setSel(sl, f); await sleep(280) } }
                rec.variants.push({ size: s, flavor: f, price: price(), nutrition: readNut() })
              }
            }
            document.querySelector('.modal-content .done-btn')?.click()
            if (!(await waitGone('.modal-content', 2500))) { N.log.push('window stuck at ' + name) }
            N.items.push(rec); await sleep(220)
          }
          click('\\u2190 CATEGORIES'); await sleep(1500)
        }
        click('\\u2190 BACK'); await sleep(1600)
      }
    } catch (e) { N.log.push('ERROR ' + e.message) }
    N.done = true
  })()
  return 'started'
})()`
console.log(await js(SCRAPER))
for (let i = 0; i < 240; i++) {
  await sleep(3000)
  const st = await js(`JSON.stringify({ done: window.__nut.done, n: window.__nut.items.length, at: window.__nut.at })`)
  if (i % 10 === 0) console.log(st)
  if (JSON.parse(st).done) break
}
const data = JSON.parse(await js(`JSON.stringify(window.__nut)`))
writeFileSync(OUT, JSON.stringify({ branch: BRANCH, readAt: new Date().toISOString(), home: data.home, log: data.log, items: data.items }, null, 1))
console.log('saved', OUT, 'items', data.items.length, 'log', JSON.stringify(data.log))
ws.close(); chrome.kill()
