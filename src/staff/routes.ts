/*
 * Delivery routes (owner, 2026-10-27: "select what's ready to be delivered, then select the number of drivers ready,
 * then the site suggests the best routes for the number of drivers"; the drivers are delivery companies, so only how
 * many, staff assign each route). Worked out here, in the browser: no customer location leaves the dashboard.
 *
 * Straight-line distances. The ready orders are sorted by their direction from the shop and cut into as many
 * neighbouring slices as there are drivers, of any size (a close cluster stays with one driver); every way of placing
 * the cuts is weighed (route length plus a little for each handover): the heaviest route plus all of them together, lowest wins. Each route's stops go nearest-first from the shop, then a 2-opt pass
 * removes crossings. Good for 2-6 drivers and a few dozen orders, not a perfect optimiser.
 */
export type Pt = { lat: number; lng: number }

const R = 6371 // km
const rad = (d: number) => (d * Math.PI) / 180
/** straight-line distance in km */
export function km(a: Pt, b: Pt): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
const bearing = (from: Pt, to: Pt) => Math.atan2(rad(to.lng - from.lng) * Math.cos(rad(from.lat)), rad(to.lat - from.lat))

/** length of a route that starts at the shop and ends at its last stop (the driver does not come back for it) */
export function pathKm(start: Pt, stops: Pt[]): number {
  let total = 0
  let at = start
  for (const p of stops) { total += km(at, p); at = p }
  return total
}

/** the stops in driving order: nearest first, then a 2-opt pass that undoes crossings */
export function orderStops<T extends { pt: Pt }>(start: Pt, items: T[]): T[] {
  const left = [...items]
  const out: T[] = []
  let at = start
  while (left.length) {
    let best = 0
    for (let i = 1; i < left.length; i++) if (km(at, left[i].pt) < km(at, left[best].pt)) best = i
    const [next] = left.splice(best, 1)
    out.push(next)
    at = next.pt
  }
  let better = true
  while (better && out.length > 2) {
    better = false
    for (let i = 0; i < out.length - 1; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const tried = [...out.slice(0, i), ...out.slice(i, j + 1).reverse(), ...out.slice(j + 1)]
        if (pathKm(start, tried.map((x) => x.pt)) + 1e-9 < pathKm(start, out.map((x) => x.pt))) { out.splice(0, out.length, ...tried); better = true }
      }
    }
  }
  return out
}

const STOP_KM = 0.8 // a handover (park, call, hand over) costs about as much time as driving this far
/** the orders split into `drivers` routes, each in driving order (a route can be empty when there are fewer orders) */
export function planRoutes<T extends { pt: Pt }>(start: Pt, items: T[], drivers: number): T[][] {
  const k = Math.max(1, drivers)
  const n = items.length
  if (!n) return Array.from({ length: k }, () => [])
  if (k >= n) return Array.from({ length: k }, (_, i) => (items[i] ? [items[i]] : []))
  const around = [...items].sort((a, b) => bearing(start, a.pt) - bearing(start, b.pt))
  // a route's weight: its length plus its handovers; quick nearest-first order here, the 2-opt only for the winner
  const nearest = (pts: Pt[]) => { const left = [...pts]; let at = start, total = 0; while (left.length) { let b = 0; for (let i = 1; i < left.length; i++) if (km(at, left[i]) < km(at, left[b])) b = i; total += km(at, left[b]); at = left.splice(b, 1)[0] } return total }
  let best: T[][] = []
  let bestCost = Infinity
  for (let r = 0; r < n; r++) {
    const ring = [...around.slice(r), ...around.slice(0, r)]
    const w: number[][] = Array.from({ length: n + 1 }, () => [])
    for (let i = 0; i < n; i++) for (let j = i + 1; j <= n; j++) w[i][j] = nearest(ring.slice(i, j).map((x) => x.pt)) + (j - i) * STOP_KM
    // cut the ring into k neighbouring slices of any size. Score: the heaviest route (when the last order arrives) plus
    // all routes together (no driver crossing town for one stop); each cell keeps its options that no other one beats
    type Cell = { max: number; sum: number; cut: number; from: number }
    const dp: Cell[][][] = Array.from({ length: k + 1 }, () => Array.from({ length: n + 1 }, () => []))
    dp[0][0] = [{ max: 0, sum: 0, cut: -1, from: -1 }]
    for (let c = 1; c <= k; c++) {
      for (let j = c; j <= n - (k - c); j++) {
        const opts: Cell[] = []
        for (let i = c - 1; i < j; i++) dp[c - 1][i].forEach((p, f) => opts.push({ max: Math.max(p.max, w[i][j]), sum: p.sum + w[i][j], cut: i, from: f }))
        opts.sort((x, y) => x.max - y.max || x.sum - y.sum)
        let low = Infinity
        dp[c][j] = opts.filter((o) => (o.sum < low - 1e-9 ? ((low = o.sum), true) : false))
      }
    }
    for (const [f, end] of dp[k][n].entries()) {
      const cost = end.max + end.sum
      if (cost >= bestCost) continue
      bestCost = cost
      const routes: T[][] = []
      let j = n
      let at = f
      for (let c = k; c > 0; c--) { const cell = dp[c][j][at]; routes.unshift(ring.slice(cell.cut, j)); j = cell.cut; at = cell.from }
      best = routes
    }
  }
  return best.map((rt) => orderStops(start, rt))
}

/** a Google Maps directions link through the stops in order (opened by staff or the rider; nothing is sent until then) */
export function routeLink(start: Pt, stops: Pt[]): string {
  if (!stops.length) return ''
  const f = (p: Pt) => `${p.lat},${p.lng}`
  const last = stops[stops.length - 1]
  const mid = stops.slice(0, -1).map(f).join('|')
  return `https://www.google.com/maps/dir/?api=1&origin=${f(start)}&destination=${f(last)}${mid ? `&waypoints=${encodeURIComponent(mid)}` : ''}&travelmode=driving`
}

/** a place typed or pasted by staff: "36.2035, 43.9669", or a Google Maps link (…!3d36.2!4d43.9…, …@36.2,43.9…, …q=36.2,43.9) */
export function parsePlace(text: string): Pt | null {
  const t = text.trim()
  const pick = (a: string, b: string) => { const lat = Number(a), lng = Number(b); return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null }
  const m = t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ?? t.match(/[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ?? t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? t.match(/^(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)$/)
  return m ? pick(m[1], m[2]) : null
}
