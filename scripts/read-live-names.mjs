// Read the public menu of marscoffeehouse.com in ONE language (en | ar | ku) for one branch, by the page's structure
// rather than its words: the categories in order, and for each item its name, picture address, tag, and (when its
// window opens) its description, sizes and flavours in that language. Out-of-stock items do not open on the live site.
// Items are matched across languages by their position and their picture address (scripts/build-menu-data.py).
//   node scripts/read-live-names.mjs OUT_FILE erbil|kirkuk en|ar|ku
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
const OUT = process.argv[2]; const BRANCH = process.argv[3] || 'erbil'; const LANG = process.argv[4] || 'ar'
mkdirSync(dirname(OUT), { recursive: true })
const PORT = 9400 + ['erbil', 'kirkuk'].indexOf(BRANCH) * 3 + ['en', 'ar', 'ku'].indexOf(LANG)
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', `--user-data-dir=${dirname(OUT)}/profile-${BRANCH}-${LANG}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' })
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
// the site remembers the language here; setting it first skips the language screen
await send('Page.navigate', { url: `https://www.marscoffeehouse.com/${BRANCH}` }); await sleep(5000)
await js(`localStorage.setItem('mars_language', '${LANG}'); true`)
await send('Page.navigate', { url: `https://www.marscoffeehouse.com/${BRANCH}` }); await send('Page.reload'); await sleep(6000)

const SCRAPER = `(() => {
  window.__n = { cats: [], items: [], done: false, log: [], at: '', lang: localStorage.getItem('mars_language'), dir: document.querySelector('.app-container')?.className || '' }; const N = window.__n
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const txt = (e) => (e?.textContent || '').replace(/\\s+/g, ' ').trim()
  const waitFor = async (sel, ms) => { for (let t = 0; t < ms; t += 150) { if (document.querySelector(sel)) return true; await sleep(150) } return false }
  const waitGone = async (sel, ms) => { for (let t = 0; t < ms; t += 150) { if (!document.querySelector(sel)) return true; await sleep(150) } return false }
  ;(async () => {
    try {
      if (!(await waitFor('main.hub-main .mars-card-list', 8000))) { N.log.push('no home cards: ' + document.body.innerText.slice(0, 120)); N.done = true; return }
      for (let g = 0; g < 2; g++) { // 0 = Drinks, 1 = Food
        const cards = [...document.querySelectorAll('main.hub-main .mars-card-list:not(.order-card)')]
        if (!cards[g]) { N.log.push('no home card ' + g); continue }
        const groupName = txt(cards[g].querySelector('.card-title'))
        cards[g].click()
        if (!(await waitFor('main.category-grid .category-item', 6000))) { N.log.push('no categories for group ' + g); continue }
        await sleep(500)
        const nCats = document.querySelectorAll('main.category-grid .category-item').length
        for (let c = 0; c < nCats; c++) {
          const catEl = document.querySelectorAll('main.category-grid .category-item')[c]
          const catName = txt(catEl.querySelector('.cat-label') || catEl)
          N.cats.push({ group: g, groupName, index: c, name: catName })
          catEl.click()
          if (!(await waitFor('.product-item', 6000))) { N.log.push('no items in ' + catName); document.querySelector('.products-header .back-btn, .back-btn')?.click(); await sleep(1200); continue }
          await sleep(700)
          const n = document.querySelectorAll('.product-item').length
          for (let i = 0; i < n; i++) {
            const card = document.querySelectorAll('.product-item')[i]; if (!card) continue
            const name = txt(card.querySelector('.cat-label')); N.at = catName + ' / ' + name
            const tagEl = card.querySelector('.item-tag')
            const rec = { group: g, cat: c, index: i, name, image: card.querySelector('img.product-image')?.getAttribute('src') || '', tag: tagEl ? [...tagEl.classList].find((x) => x.startsWith('item-tag-'))?.replace('item-tag-', '') : null, prices: [...card.querySelectorAll('.order-item-prices span')].map(txt) }
            ;(card.querySelector('.cat-label') || card).click()
            if (!(await waitFor('.modal-content', 2500))) { rec.noModal = true; N.items.push(rec); continue }
            await sleep(350)
            const m = document.querySelector('.modal-content')
            rec.title = txt(m.querySelector('.product-title')); rec.desc = txt(m.querySelector('.product-description'))
            rec.sizes = [...m.querySelectorAll('.size-btn-square')].map(txt)
            const sel = m.querySelector('select.flavor-dropdown')
            rec.flavors = sel ? [...sel.options].map((o) => ({ value: o.value, text: txt(o) })) : []
            rec.labels = [...m.querySelectorAll('.selection-label')].map(txt)
            rec.nutrition = [...m.querySelectorAll('.nutrition-row .nutrition-label')].map(txt)
            document.querySelector('.modal-content .done-btn')?.click()
            if (!(await waitGone('.modal-content', 2500))) N.log.push('window stuck at ' + name)
            N.items.push(rec); await sleep(200)
          }
          document.querySelector('.products-header .back-btn, .back-btn')?.click(); await sleep(1500)
        }
        document.querySelector('.back-btn')?.click(); await sleep(1700)
      }
    } catch (e) { N.log.push('ERROR ' + e.message) }
    N.done = true
  })()
  return 'started'
})()`
console.log(BRANCH, LANG, await js(SCRAPER))
for (let i = 0; i < 260; i++) {
  await sleep(3000)
  const st = JSON.parse(await js(`JSON.stringify({ done: window.__n.done, n: window.__n.items.length, at: window.__n.at })`))
  if (st.done) break
}
const data = JSON.parse(await js(`JSON.stringify(window.__n)`))
writeFileSync(OUT, JSON.stringify({ branch: BRANCH, lang: LANG, readAt: new Date().toISOString(), pageLang: data.lang, dir: data.dir, log: data.log, cats: data.cats, items: data.items }, null, 1))
console.log('saved', BRANCH, LANG, 'cats', data.cats.length, 'items', data.items.length, 'log', JSON.stringify(data.log))
ws.close(); chrome.kill()
