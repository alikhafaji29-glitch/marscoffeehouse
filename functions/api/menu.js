// Mars CoffeeHouse — the public menu from Cloudflare's cache (owner, 2026-10-27: "menu cache on Cloudflare"; HANDOFF
// decision 239). About 70 % of the requests Supabase gets are the same public data: each open page asks for the "last
// changed" mark every minute, and the whole menu when it moved. Here the mark is kept 20 seconds and the menu once per
// mark, so all customers together cost Supabase about 3 small reads a minute and one menu read per change.
//   GET /api/menu?mark=1   [{ changed_at }]  (the same answer as Supabase's menu_version)
//   GET /api/menu          { changed_at, items, categories, branches, config }
// Only customer pages on www / pages.dev call it; staff read Supabase directly. Any failure answers 502 and the page goes
// to Supabase itself (src/menuAdmin.ts). The public key comes with the call, as with Supabase; only these fixed public
// reads can be made, nothing from the request reaches the database. The cache key ignores the query, so a page cannot
// force extra reads.
const BACKEND = 'https://tmvvcejuvypzhybmygmc.supabase.co/rest/v1/'
const ITEMS = 'menu_items?select=branch,name,category,names,sort,available,in_stock,prices,sizes,tag,description,flavors,nutrition,photo,photo_x,photo_y,photo_zoom,opts,flavor_extras'
const CATEGORIES = 'menu_categories?select=branch,id,kind,names,sort'
const BRANCHES = 'branches?select=id,names,active,sort&order=sort.asc,id.asc'
const CONFIG = 'branch_config?select=branch,settings,offers'
const MARK = 'menu_version?select=changed_at'
const MARK_SECONDS = 20
const MENU_SECONDS = 86400

export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url)
  const apikey = request.headers.get('apikey')
  const answer = (body, cache) => new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-menu-cache': cache } })
  if (!apikey) return answer('{"error":"no key"}', 'none')
  const read = async (path) => {
    const res = await fetch(BACKEND + path, { headers: { apikey } })
    if (!res.ok) throw new Error(`${path.split('?')[0]} ${res.status}`)
    return res.json()
  }
  const cache = caches.default
  // one stored copy per name; the name never comes from the request
  const kept = async (name, seconds, make) => {
    const key = new Request(`${url.origin}/__menu_cache/${encodeURIComponent(name)}`)
    const hit = await cache.match(key)
    if (hit) return { body: await hit.text(), state: 'hit' }
    const body = JSON.stringify(await make())
    waitUntil(cache.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${seconds}` } })))
    return { body, state: 'miss' }
  }
  try {
    const mark = await kept('mark', MARK_SECONDS, () => read(MARK))
    if (url.searchParams.has('mark')) return answer(mark.body, mark.state)
    const changed_at = JSON.parse(mark.body)[0]?.changed_at ?? ''
    const menu = await kept(`menu-${changed_at}`, MENU_SECONDS, async () => {
      const [items, categories, branches, config] = await Promise.all([read(ITEMS), read(CATEGORIES), read(BRANCHES), read(CONFIG)])
      if (!items.length) throw new Error('empty menu')
      return { changed_at, items, categories, branches, config }
    })
    return answer(menu.body, menu.state)
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  }
}
