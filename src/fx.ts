// Liquid effects: gravity-driven drops that fly up, arc, and fall.
const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function drops(x: number, y: number, color: string, count = 14, spread = 1) {
  if (reducedMotion()) return
  const wrap = document.createElement('div')
  wrap.className = 'fx-drops'
  wrap.style.left = `${x}px`
  wrap.style.top = `${y}px`

  for (let i = 0; i < count; i++) {
    const d = document.createElement('i')
    const dx = (Math.random() - 0.5) * 170 * spread
    const h = 26 + Math.random() * 74
    const s = 5 + Math.random() * 8
    d.style.setProperty('--dx', `${dx}px`)
    d.style.setProperty('--h', `${h}px`)
    d.style.setProperty('--s', `${s}px`)
    d.style.background = `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.85), ${color} 62%)`
    d.style.animationDelay = `${Math.random() * 90}ms`
    d.style.animationDuration = `${0.8 + Math.random() * 0.35}s`
    wrap.appendChild(d)
  }

  document.body.appendChild(wrap)
  setTimeout(() => wrap.remove(), 1400)
}

export function dropsFrom(el: Element | null, color: string, count?: number, spread?: number) {
  if (!el) return
  const r = el.getBoundingClientRect()
  drops(r.left + r.width / 2, r.top + r.height / 2, color, count, spread)
}

/* Sketch pop for the mood game (owner, 2026-09-28: "replace the bubbles with something sketch art like"):
 * short marker strokes burst outward like comic action lines, with a few tiny sparkles, rings, squiggles and
 * plus signs — navy / brand blue line art, no fills. */
const SKETCH_SHAPES: Record<string, string> = {
  dash: 'M0 -8V8',
  spark: 'M0 -7c0 4 3 7 7 7-4 0-7 3-7 7 0-4-3-7-7-7 4 0 7-3 7-7Z',
  ring: 'M0 -4a4 4 0 1 1 0 8a4 4 0 1 1 0-8Z',
  squiggle: 'M-7 1c2-4 4 4 7 0s5-4 7 0',
  plus: 'M0 -5v10M-5 0h10',
}
const EXTRAS = ['spark', 'ring', 'squiggle', 'plus']
export function sketchBurst(x: number, y: number, color = '#002f6d', count = 12, spread = 1) {
  if (reducedMotion()) return
  const wrap = document.createElement('div')
  wrap.className = 'fx-sketch'
  wrap.style.left = `${x}px`
  wrap.style.top = `${y}px`
  const lines = Math.ceil(count * 0.55)
  for (let i = 0; i < count; i++) {
    const isLine = i < lines
    const kind = isLine ? 'dash' : EXTRAS[Math.floor(Math.random() * EXTRAS.length)]
    const angle = isLine ? (i / lines) * Math.PI * 2 + (Math.random() - 0.5) * 0.35 : Math.random() * Math.PI * 2
    const dist = (isLine ? 38 + Math.random() * 18 : 46 + Math.random() * 44) * spread
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist
    const rot = isLine ? (angle * 180) / Math.PI + 90 : Math.random() * 60 - 30
    const size = isLine ? 28 : 22 + Math.random() * 10
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '-12 -12 24 24')
    svg.setAttribute('width', String(size))
    svg.setAttribute('height', String(size))
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('d', SKETCH_SHAPES[kind])
    p.setAttribute('fill', 'none')
    p.setAttribute('stroke', i % 3 === 2 ? '#397dc9' : color)
    p.setAttribute('stroke-width', isLine ? '3' : '2.2')
    p.setAttribute('stroke-linecap', 'round')
    p.setAttribute('stroke-linejoin', 'round')
    if (document.getElementById('sk-wobble')) p.setAttribute('filter', 'url(#sk-wobble)') // same marker wobble as the doodles
    svg.appendChild(p)
    wrap.appendChild(svg)
    const start = `translate(-50%, -50%) translate(${dx * 0.35}px, ${dy * 0.35}px) rotate(${rot}deg) scale(0.3)`
    const mid = `translate(-50%, -50%) translate(${dx * 0.8}px, ${dy * 0.8}px) rotate(${rot}deg) scale(1)`
    const end = `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${rot + (isLine ? 0 : 25)}deg) scale(${isLine ? 0.6 : 0.85})`
    svg.animate([{ transform: start, opacity: 0 }, { transform: mid, opacity: 1, offset: 0.35 }, { transform: end, opacity: 0 }],
      { duration: 620 + Math.random() * 260, delay: Math.random() * 60, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' })
  }
  document.body.appendChild(wrap)
  setTimeout(() => wrap.remove(), 1100)
}
export function sketchFrom(el: Element | null, color?: string, count?: number, spread?: number) {
  if (!el) return
  const r = el.getBoundingClientRect()
  sketchBurst(r.left + r.width / 2, r.top + r.height / 2, color, count, spread)
}
