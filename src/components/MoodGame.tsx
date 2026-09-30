import { clockNow, useClock } from '../clock'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, PointerEvent as RPointerEvent, ReactNode } from 'react'
import { useLang } from '../i18n'
import type { TKey } from '../i18n'
import type { MenuItem } from '../menu'
import { askMood, GAME_WORDS as W, gameAnswers, gameOptions, gamePick, moodSetOf, pickOne, SET_ANSWERS, sweetFor } from '../mood'
import type { Going, MoodAnswer, MoodSet, MoodSource, Sweet } from '../mood'
import { openCheckout } from '../bus'
import { iqd } from '../account'
import { sketchFrom } from '../fx'
import { MiniCup } from './MiniCup'
import { MENU } from '../menu'
import { PHOTOS } from '../photos'
import { categoryOf } from '../menuMeta'
import { useCart } from '../cart'

/*
 * "Based On Your Mood" — fill the cup with your day (owner, 2026-09-14). An empty drawn cup and, ONE STEP
 * AT A TIME, a question with its row of hand-drawn balls. Four questions (owner, 2026-09-29; docs/mood-questions.md):
 * the time of day's own first question (morning 05-12 · afternoon 12-17 · night 17-05) · Hot or cold? · Milk? ·
 * How sweet do you want it?. A ball is tapped or DRAGGED into the cup; either pours a layer and moves to the next
 * step (Back available). One ball per row: another in the same row swaps it, the same one again pours it out.
 * "Mix it" opens a 5-second "Thinking…" screen (our drink photos scrolling, Mars shapes popping, the cup swirling)
 * while the AI barista (src/mood.ts: Claude → /api/mood → on-device) picks; the reveal always stays inside the
 * answers' table and shows two drinks when it can. Sweetness: a drink sweeter than asked is made less sweet (on the
 * order line); a drink less sweet than asked comes with a bakery sweet offered instead of sugar.
 * The greeting and the slide tint follow the time of day; the AI gets the hour too.
 */
type RGB = [number, number, number]
type Group = 'going' | 'temp' | 'milk' | 'sugar'
interface Token { id: string; group: Group; label: TKey; words: string; color: RGB; icon: ReactNode }

const I = (d: string, extra?: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />{extra}
  </svg>
)
const FACE = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'
const CUBE = 'M4 9l8-4 8 4v6l-8 4-8-4V9ZM4 9l8 4 8-4M12 13v6'
/* `words` is what the barista reads (the AI prompt and the on-device table in src/mood.ts). The first question's
 * balls are the current time of day's four answers (SET_ANSWERS); the other three rows are the same all day. */
const FRIENDS = 'M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM15.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 19c.5-3 2.8-5 5.5-5s5 2 5.5 5M13.5 14.3c.6-.2 1.3-.3 2-.3 2.7 0 5 2 5.5 5'
const GOING_ICON: Record<Going, string> = {
  project: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z',
  waking: 'M3 18h18M6 18a6 6 0 0 1 12 0M12 6V3M5.5 10.5 4 9M18.5 10.5 20 9',
  easy: 'M3 11h18M5 11l1 4a2 2 0 0 0 2 1.5h1.5a2 2 0 0 0 2-1.6L12 13l.5 1.9a2 2 0 0 0 2 1.6H16a2 2 0 0 0 2-1.5l1-4',
  relaxing: 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.3 1.5A3.3 3.3 0 0 0 7 18Z',
  slump: FACE + 'M12 7v5l3 2',
  lunch: 'M3 10c0-3 4-5 9-5s9 2 9 5H3ZM3 13h18M4 16h16v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2Z',
  work: 'M5 6h14v9H5ZM3 18h18',
  friends: FRIENDS,
  winding: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
  friendsnight: FRIENDS + 'M19 2l.6 1.4L21 4l-1.4.6L19 6l-.6-1.4L17 4l1.4-.6Z',
  studying: 'M4 5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1V5ZM12 6v13',
  craving: 'M12 21a9 9 0 1 1 8.6-11.6A3 3 0 0 1 17 6a3 3 0 0 1-3-3.4A9 9 0 0 0 12 3M8 10h.01M9 15h.01M14 15h.01',
}
const GOING_LABEL: Record<Going, TKey> = {
  project: 'ansProject', waking: 'ansWaking', easy: 'ansEasy', relaxing: 'ansRelaxing', slump: 'ansSlump', lunch: 'ansLunch', work: 'ansWork',
  friends: 'ansFriends', winding: 'ansWinding', friendsnight: 'ansFriendsNight', studying: 'ansStudying', craving: 'ansCraving',
}
const GOING_TOKENS: Token[] = (Object.keys(GOING_ICON) as Going[]).map((g) => ({ id: g, group: 'going', label: GOING_LABEL[g], words: W[g], color: [0, 47, 109], icon: I(GOING_ICON[g]) }))
const TOKENS: Token[] = [
  ...GOING_TOKENS,
  { id: 'hot', group: 'temp', label: 'tempHot', words: W.hot, color: [255, 140, 80], icon: I('M7 10h10l-1.2 9.2a2 2 0 0 1-2 1.8H10.2a2 2 0 0 1-2-1.8L7 10ZM17 12h2a2 2 0 0 1 0 4h-2.5M9 4c0 1.5 1 1.5 1 3M12 4c0 1.5 1 1.5 1 3M15 4c0 1.5 1 1.5 1 3') },
  { id: 'cold', group: 'temp', label: 'tempCold', words: W.cold, color: [150, 215, 255], icon: I('M8 5h8l-1 15a2 2 0 0 1-2 1.8h-2A2 2 0 0 1 9 20L8 5ZM7.5 11h9M11 3l1.5 4M10 14l1.4 1.4 2.6-2.6') },
  { id: 'milknone', group: 'milk', label: 'milkNone', words: W.milknone, color: [110, 70, 45], icon: I('M6 8h10v6a5 5 0 0 1-10 0V8ZM16 10h2a2 2 0 0 1 0 4h-2') },
  { id: 'milkwith', group: 'milk', label: 'milkWith', words: W.milkwith, color: [248, 244, 236], icon: I('M8 3h8v3l2 3v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9l2-3V3ZM6 9h12') },
  { id: 'sweetnone', group: 'sugar', label: 'sweetNone', words: W.sweetnone, color: [225, 225, 232], icon: I(CUBE + 'M3 3l18 18') },
  { id: 'sweetlittle', group: 'sugar', label: 'sugarLittle', words: W.sweetlittle, color: [250, 205, 170], icon: I('M8 11l4-2 4 2v4l-4 2-4-2v-4ZM8 11l4 2 4-2M12 13v4') },
  { id: 'sweetyes', group: 'sugar', label: 'sweetYes', words: W.sweetyes, color: [242, 150, 190], icon: I(CUBE) },
]
const SET_QUESTION: Record<MoodSet, TKey> = { morning: 'moodQMorning', afternoon: 'moodQAfternoon', night: 'moodQNight' }
const GROUPS: { id: Group; question: TKey }[] = [
  { id: 'going', question: 'moodQMorning' }, { id: 'temp', question: 'moodQTemp' }, { id: 'milk', question: 'moodQMilk' }, { id: 'sugar', question: 'moodQSweet' },
]
const SWEET_OF: Record<string, Sweet> = { sweetnone: 0, sweetlittle: 1, sweetyes: 2 }
const DRAG_PX = 8 // less movement than this is a tap
export type Period = 'morning' | 'midday' | 'afternoon' | 'evening'
export const periodOf = (h: number): Period => (h < 11 ? 'morning' : h < 14 ? 'midday' : h < 18 ? 'afternoon' : 'evening')
const GREET: Record<Period, TKey> = { morning: 'moodGreetMorning', midday: 'moodGreetMidday', afternoon: 'moodGreetAfternoon', evening: 'moodGreetEvening' }
const MIX_MS = 5000 // the "Thinking…" loading screen (brief said 7 s; owner, 2026-09-29: 5 s), our items scrolling + our elements popping
// the items that scroll past while the barista thinks (the owner's drink photos)
const THINK_PHOTOS = [PHOTOS.lemonMint, PHOTOS.smoothie, PHOTOS.nutella, PHOTOS.shakes, PHOTOS.cap, '/assets/featured/build.jpg']
/* load + decode the strip's photos when the game opens, so they are ready before Mix it (they used to pop in mid-reel on phones) */
let thinkPreload: HTMLImageElement[] | null = null
const preloadThinkPhotos = () => {
  if (thinkPreload) return
  thinkPreload = THINK_PHOTOS.map((src) => { const im = new Image(); im.decoding = 'async'; im.src = src; im.decode?.().catch(() => {}); return im })
}
// Mars logo shapes that pop in and out around the cup (brand colours)
const POPS: { shape: 'dot' | 'diamond' | 'square' | 'pill'; x: number; y: number; c: string; d: number }[] = [
  { shape: 'dot', x: 8, y: 14, c: '#002f6d', d: 0 }, { shape: 'diamond', x: 84, y: 10, c: '#397dc9', d: 0.5 },
  { shape: 'square', x: 14, y: 58, c: '#73c3ff', d: 1.1 }, { shape: 'pill', x: 80, y: 52, c: '#002f6d', d: 1.6 },
  { shape: 'dot', x: 46, y: 4, c: '#397dc9', d: 2.1 }, { shape: 'diamond', x: 6, y: 86, c: '#73c3ff', d: 2.6 },
  { shape: 'square', x: 88, y: 82, c: '#002f6d', d: 0.8 }, { shape: 'dot', x: 60, y: 90, c: '#397dc9', d: 1.9 },
]
/* Bakery pairings after the reveal (brief: "suggest pairing items from bakery after revealing the mixed drink").
 * Picked by the drink's menu category; "no sugar" puts the savoury croissant first. Sold-out items are skipped. */
const PAIRS: Record<string, string[]> = {
  coffee: ['Croissant Nutella', 'Banana Bread', 'San Sebastian'],
  milkshake: ['Cookies Dark', 'Brownies Cup', 'Cookies Red Velvet'],
  matcha: ['Cheesecake Strawberry', 'Croissant Pistachio', 'Mango Mousse Cake'],
  fresh: ['Cookies New York', 'Cheesecake Lotus', 'Croissant Cheese'],
}
const PAIR_OF: Record<string, keyof typeof PAIRS> = { coffeeMore: 'coffee', coffeeMilk: 'coffee', coldCoffee: 'coffee', milkshake: 'milkshake', matcha: 'matcha' }
const bakery = () => MENU.find((c) => c.id === 'sweets')?.items.filter((i) => !i.soldOut) ?? []
const bakeryItem = (name: string) => bakery().find((i) => i.name === name) ?? null
function pairingsFor(drink: string | null, noSugar: boolean): MenuItem[] {
  const list = PAIRS[drink ? PAIR_OF[categoryOf(drink)] ?? 'fresh' : 'fresh']
  const names = noSugar ? ['Croissant Cheese', ...list.filter((n) => n !== 'Croissant Cheese')] : list
  const avail = bakery()
  return names.map((n) => avail.find((i) => i.name === n)).filter((x): x is MenuItem => !!x).slice(0, 2)
}
const PASTRY = I('M4 15c1-5 4-8 8-8s7 3 8 8c-2 1-4 1.5-8 1.5S6 16 4 15ZM8.5 9.5 10 15M15.5 9.5 14 15M12 7v8.5')
const rgb = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`
/* Art direction for Based On Your Mood (owner's brief, 2026-09-28): limited colour palette, sketch icons, 2D.
 * Everything is brand blue on white; the four layers are four blues, bottom (navy) to top (pale). */
const LAYER_BLUES: RGB[] = [[0, 47, 109], [57, 125, 201], [115, 195, 255], [202, 232, 255]]
const blueFor = (i: number) => rgb(LAYER_BLUES[Math.min(i, LAYER_BLUES.length - 1)])

/** The cup: up to four coloured layers, one per token, rising from the bottom in the order they were poured. */
function MoodCup({ layers, mixing, mixed, drawing }: { layers: Token[]; mixing: boolean; mixed?: RGB; drawing?: boolean }) {
  const slot = 66 / 4 // liquid area y 26..92
  return (
    // drawing: the empty cup is sketched line by line before the first question (owner, 2026-09-28)
    <svg className={'mood-cup-svg' + (mixing ? ' mixing' : '') + (drawing ? ' drawing' : '')} viewBox="0 0 90 110" width="150" height="184" aria-hidden="true">
      <defs><clipPath id="mood-cup-clip"><path d="M16 18h58l-6 78a5 5 0 0 1-5 4.5H27a5 5 0 0 1-5-4.5L16 18Z" /></clipPath></defs>
      <path className="cup-fill" d="M16 18h58l-6 78a5 5 0 0 1-5 4.5H27a5 5 0 0 1-5-4.5L16 18Z" fill="#ffffff" />
      <g clipPath="url(#mood-cup-clip)">
        {layers.map((tk, i) => (
          <rect key={tk.id} className="mood-layer" x="10" y={92 - slot * (i + 1)} width="70" height={slot + 1} fill={mixed ? rgb(mixed) : blueFor(i)} style={mixing ? { animationDelay: `${i * 0.08}s` } : undefined} />
        ))}
        {layers.length > 0 && <rect className="mood-foam" x="10" y={92 - slot * layers.length} width="70" height="3" fill="#ffffff" />}
      </g>
      {/* sketch marks on the wall (2D, hand-drawn look) */}
      <path className="cup-marks" d="M25 30l2 52M66 30l-2 30" stroke="#002f6d" strokeWidth="1" strokeLinecap="round" strokeDasharray="2 5" opacity="0.5" />
      <path className="cup-line" pathLength={1} d="M16 18h58l-6 78a5 5 0 0 1-5 4.5H27a5 5 0 0 1-5-4.5L16 18Z" fill="none" stroke="#002f6d" strokeWidth="2.2" strokeLinejoin="round" />
      <path className="cup-line cup-rim" pathLength={1} d="M12 18h66" stroke="#002f6d" strokeWidth="3" strokeLinecap="round" />
      {mixed && <path className="mood-straw" d="M56 4 50 70" stroke="#0b3fa8" strokeWidth="5" strokeLinecap="round" />}
    </svg>
  )
}

export function MoodGame({ onPick, onWords, onDone }: { onPick: (item: MenuItem) => void; onWords: () => void; onDone?: () => void }) {
  const { t, lang } = useLang()
  const clk = useClock() // follows the review time changer
  const [hour, setHour] = useState(() => clk.getHours())
  const [layers, setLayers] = useState<Token[]>([])
  const [phase, setPhase] = useState<'fill' | 'mixing' | 'reveal'>('fill')
  const [result, setResult] = useState<{ answer: MoodAnswer; source: MoodSource } | null>(null)
  const [alt, setAlt] = useState<MenuItem | null>(null) // the second pick when the answers fit more than one drink
  const [picked, setPicked] = useState<string | null>(null) // which of the two picks the customer chose (then the bakery pairing shows)
  const [step, setStep] = useState(0) // 0..3 = the row on screen, 4 = all rows done -> Mix it
  // the empty cup draws itself first; the questions come in once it is done (skipped for reduced motion)
  const [drawn, setDrawn] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => { if (drawn) return; const id = setTimeout(() => setDrawn(true), 1150); return () => clearTimeout(id) }, [drawn])
  /* the cup sketches itself (outline 0.35-0.85 s, rim 0.85-1.05 s; owner 2026-09-29: faster); the drawing hand was removed (owner, 2026-09-28) */
  useEffect(() => {
    if (drawn) return
    const wrap = cupRef.current
    const line = wrap?.querySelector<SVGPathElement>('.cup-line:not(.cup-rim)')
    const rim = wrap?.querySelector<SVGPathElement>('.cup-rim')
    if (!wrap || !line || !rim) return
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
    const START = 350, LINE = 500, RIM = 200
    const t0 = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const t = now - t0 - START
      if (t < 0) { /* wait for the sheet's first paint */ }
      else if (t < LINE) { const p = ease(t / LINE); line.style.strokeDashoffset = String(1 - p) }
      else if (t < LINE + RIM) { line.style.strokeDashoffset = '0'; const p = ease((t - LINE) / RIM); rim.style.strokeDashoffset = String(1 - p) }
      else { line.style.strokeDashoffset = '0'; rim.style.strokeDashoffset = '0'; return }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); line.style.strokeDashoffset = ''; rim.style.strokeDashoffset = '' }
  }, [drawn])
  const { add } = useCart()
  useEffect(preloadThinkPhotos, [])
  const [added, setAdded] = useState<string[]>([]) // bakery pairings added from the reveal card
  const [drag, setDrag] = useState<{ tk: Token; x: number; y: number; moved: boolean } | null>(null)
  const dragRef = useRef<typeof drag>(null) // the same data for the handlers (a quick tap fires up before React re-renders)
  const cupRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [bounce, setBounce] = useState(false) // the cup hops when a layer lands
  const [ball, setBall] = useState<{ key: number; color: string } | null>(null) // the ball that drops and breaks in the cup
  const abort = useRef<AbortController | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  /* Order it (owner, 2026-09-28): the drink goes straight into the order (first size, no extras) with any bakery
   * pairings already added, and the customer lands on the checkout basket (Place order) */
  const sweet: Sweet = SWEET_OF[layers.find((l) => l.group === 'sugar')?.id ?? ''] ?? 1
  const orderNow = (it: MenuItem) => {
    // a drink sweeter than asked goes on the order line as "No sugar" / "Less sweet" (owner, 2026-09-29)
    const less = sweetFor(it.name, sweet).less
    add({ name: it.name, size: it.sizes?.[0], price: typeof it.price === 'number' ? it.price : it.price[0], opts: less ? [t(less === 'none' ? 'sweetNone' : 'sweetLess')] : undefined }, 1)
    onDone?.()
    openCheckout()
  }
  void onPick // still passed in by MoodJourney; Order it now goes to checkout instead
  /* the Thinking strip spins like an arcade reel (owner, 2026-09-28) at one steady fast speed (a loop every 0.5 s) the whole
   * time: no slow-down before the result, the reveal simply replaces it (owner, 2026-09-29) */
  useEffect(() => {
    if (phase !== 'mixing' || !trackRef.current || !trackRef.current.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = trackRef.current
    const spin = el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }], { duration: 500, iterations: Infinity })
    el.classList.add('spinning')
    return () => { spin.cancel(); el.classList.remove('spinning') }
  }, [phase])
  useEffect(() => { const id = setInterval(() => setHour(clockNow().getHours()), 60000); return () => clearInterval(id) }, [])
  useEffect(() => { setHour(clk.getHours()) }, [clk.getHours()]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => abort.current?.abort(), [])
  const period = periodOf(hour)
  const moodSet = moodSetOf(hour)
  const chosen = (g: Group) => layers.find((l) => l.group === g)

  /** pour a token into the cup (tap or drop); a poured token moves the game to the next step */
  const pour = (tk: Token, from: Element | null) => {
    if (phase !== 'fill') return
    const already = layers.some((l) => l.id === tk.id)
    const layerBlue = blueFor(Math.max(0, layers.findIndex((l) => l.group === tk.group) < 0 ? layers.length : layers.findIndex((l) => l.group === tk.group)))
    sketchFrom(from ?? cupRef.current, '#002f6d', 11, 1)
    if (!already) { setBall({ key: Date.now(), color: layerBlue }); setTimeout(() => setBounce(true), 260); setTimeout(() => { setBounce(false); setBall(null) }, 760) }
    setLayers((ls) => {
      if (ls.some((l) => l.id === tk.id)) return ls.filter((l) => l.id !== tk.id) // pour it back out
      const i = ls.findIndex((l) => l.group === tk.group)
      if (i >= 0) return ls.map((l, k) => (k === i ? tk : l)) // swap within the row, same layer
      return [...ls, tk]
    })
    if (!already) setTimeout(() => setStep((s) => Math.min(4, s + 1)), 380)
  }
  // drag: the token follows the finger as a ghost; released over the cup it pours, a short press is a tap
  const setD = (d: typeof drag) => { dragRef.current = d; setDrag(d) }
  const onDown = (tk: Token) => (e: RPointerEvent<HTMLButtonElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* synthetic or lost pointer */ }
    setD({ tk, x: e.clientX, y: e.clientY, moved: false })
  }
  const onMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (d) setD({ ...d, x: e.clientX, y: e.clientY, moved: d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX })
  }
  const onUp = (tk: Token) => (e: RPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    setD(null)
    if (!d) return
    if (!d.moved) { pour(tk, e.currentTarget); return }
    const r = cupRef.current?.getBoundingClientRect()
    if (r && e.clientX >= r.left - 24 && e.clientX <= r.right + 24 && e.clientY >= r.top - 24 && e.clientY <= r.bottom + 24) pour(tk, null)
  }
  const mix = async (e: MouseEvent<HTMLButtonElement>) => {
    if (layers.length < 1) return
    sketchFrom(e.currentTarget, '#002f6d', 16, 1.3)
    setPhase('mixing')
    const text = `It is ${period} (${hour}:00). ${layers.map((l) => l.words).join('. ')}.`
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    const [res] = await Promise.all([askMood(text, lang, ac.signal, (h) => gamePick(gameAnswers(text), lang, h)), new Promise((r) => setTimeout(r, MIX_MS))])
    if (ac.signal.aborted) return
    // keep the reveal inside the outcomes table: the AI's pick stays when it is one of the fitting drinks, otherwise a
    // fitting drink replaces it; when the answers fit more than one drink a second one is shown next to it (owner, 2026-09-26)
    const opts = gameOptions(gameAnswers(text), lang, hour)
    let first = res
    let second: MenuItem | null = null
    if (opts) {
      const fits = res.answer.kind === 'menu' && opts.items.some((i) => i.name === (res.answer as { item: MenuItem }).item.name)
      if (!fits) first = { answer: { kind: 'menu', item: pickOne(opts.items), reason: opts.reason }, source: 'local' }
      const firstName = first.answer.kind === 'menu' ? first.answer.item.name : ''
      const others = opts.items.filter((i) => i.name !== firstName)
      // the second pick comes from another menu category when the draw has one (owner, 2026-09-29), e.g. an iced latte + a milkshake
      const otherCat = others.filter((i) => categoryOf(i.name) !== categoryOf(firstName))
      if (others.length) { second = pickOne(otherCat.length ? otherCat : others); first = { ...first, answer: { ...first.answer, reason: opts.reason } } }
    }
    setResult(first)
    setAlt(second)
    setPicked(null)
    setPhase('reveal')
  }
  // the reveal card splashes when it lands
  useEffect(() => { if (phase === 'reveal') sketchFrom(cardRef.current, '#002f6d', 18, 2.4) }, [phase])
  const empty = () => { abort.current?.abort(); setResult(null); setAlt(null); setPicked(null); setLayers([]); setStep(0); setAdded([]); setPhase('fill') }

  if (phase === 'reveal' && result) {
    const a = result.answer
    const price = a.kind === 'menu' ? (typeof a.item.price === 'number' ? a.item.price : a.item.price[0]) : null
    const noSugar = sweet === 0
    // two picks: no bakery pairing until the customer chooses one, then the pairing for that drink (owner, 2026-09-26)
    const drink = alt ? picked : a.kind === 'menu' ? a.item.name : null
    const sw = drink ? sweetFor(drink, sweet) : {}
    // asked for more sweetness than the drink has: a sweet from the bakery instead of sugar (owner, 2026-09-29)
    const side = sw.side ? bakeryItem(sw.side) : null
    const pairs = side ? [side] : alt ? (picked ? pairingsFor(picked, noSugar) : []) : pairingsFor(drink, noSugar)
    const lessNote = sw.less ? <p className="reveal-sweet">{t(sw.less === 'none' ? 'moodMadeNoSugar' : 'moodMadeLessSweet')}</p> : null
    return (
      <div className="mood-game reveal">
        <div className={'reveal-card' + (alt ? ' two' : '')} ref={cardRef}>
          {alt && a.kind === 'menu' ? (
            <>
              <p className="eyebrow">{picked ? t('moodPickedForYou') : t('moodTwoPicks')}</p>
              {/* after a choice only the chosen drink stays (owner, 2026-09-26) */}
              <div className={'reveal-two' + (picked ? ' one' : '')}>
                {[a.item, alt].filter((it) => !picked || it.name === picked).map((it, k) => {
                  const pr = typeof it.price === 'number' ? it.price : it.price[0]
                  const on = picked === it.name
                  // the whole card is the choice (owner, 2026-09-28: no "Choose this" button); chosen, it shows Order it
                  const choose = (el: Element) => { setPicked(it.name); sketchFrom(el, '#002f6d', 12, 1.3) }
                  const tap = on ? {} : {
                    role: 'button', tabIndex: 0, 'aria-label': `${t('moodChoose')}: ${it.name}`,
                    onClick: (e: MouseEvent<HTMLDivElement>) => choose(e.currentTarget),
                    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(e.currentTarget) } },
                  }
                  return (
                    <div className={'reveal-option' + (on ? ' chosen' : ' pickable')} key={it.name} style={{ animationDelay: `${0.1 + k * 0.15}s` }} {...tap}>
                      <MiniCup color={LAYER_BLUES[1]} ice={chosen('temp')?.id === 'cold' ? 1 : 0} size={52} />
                      <h3 className="reveal-name">{it.name}</h3>
                      <p className="reveal-meta" dir="ltr">{iqd(pr)} IQD</p>
                      {on && lessNote}
                      {on && <button type="button" className="pill solid small" onClick={() => orderNow(it)}>{t('orderIt')}</button>}
                    </div>
                  )
                })}
              </div>
              <p className="reveal-reason">{a.reason}</p>
              <small className="mood-source">{result.source === 'local' ? t('moodByMars') : t('moodByAI')}</small>
              <div className="reveal-actions">
                <button type="button" className="pill outline small" onClick={empty}>{t('emptyCup')}</button>
              </div>
            </>
          ) : (<>
          <div className="reveal-cup"><MiniCup color={LAYER_BLUES[1]} ice={chosen('temp')?.id === 'cold' ? 1 : 0} size={64} /></div>
          <p className="eyebrow">{t('moodPickedForYou')}</p>
          <h3 className="reveal-name">{a.item.name}</h3>
          <p className="reveal-meta">{t('moodMenuTag')}{price ? <> · <span dir="ltr">{iqd(price)} IQD</span></> : null}</p>
          {lessNote}
          <p className="reveal-reason">{a.reason}</p>
          <small className="mood-source">{result.source === 'local' ? t('moodByMars') : t('moodByAI')}</small>
          <div className="reveal-actions">
            <button type="button" className="pill solid" onClick={() => orderNow(a.item)}>{t('orderIt')}</button>
            <button type="button" className="pill outline small" onClick={empty}>{t('emptyCup')}</button>
          </div>
          </>)}
          {pairs.length > 0 && (
            <div className="mood-pairs">
              <p className="mood-pairs-title">{t(side ? 'moodSweetSide' : 'moodPairTitle')}</p>
              {pairs.map((p, k) => {
                const on = added.includes(p.name)
                const pr = typeof p.price === 'number' ? p.price : p.price[0]
                return (
                  <div className="mood-pair" key={p.name} style={{ animationDelay: `${0.35 + k * 0.12}s` }}>
                    <span className="mood-pair-icon">{PASTRY}</span>
                    <span className="mood-pair-name">{p.name}<small dir="ltr">{iqd(pr)} IQD</small></span>
                    <button type="button" className={'pill small ' + (on ? 'soft' : 'solid')} disabled={on}
                      onClick={(e) => { add({ name: p.name, price: pr }, 1); setAdded((xs) => [...xs, p.name]); sketchFrom(e.currentTarget, '#002f6d', 10, 1) }}>
                      {on ? t('shopAdded') : t('shopAdd')}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  const mixing = phase === 'mixing'
  const n = layers.length
  const group = step < GROUPS.length ? GROUPS[step] : null
  const question = group?.id === 'going' ? SET_QUESTION[moodSet] : group?.question
  const copy = mixing ? t('moodThinking').replace(/[.…]+$/, '') : question ? t(question) : n ? t('moodReady') : t('moodFillEmpty')
  return (
    <div className={'mood-game fill' + (mixing ? ' pouring' : '') + (drag ? ' dragging' : '')}>
      <h2 className="slide-title mood-greet">{t(GREET[period])}</h2>
      {!mixing && (
        <ol className={'mood-steps' + (drawn ? '' : ' pre')} aria-label={`${step + 1} / ${GROUPS.length}`}>
          {GROUPS.map((g, i) => <li key={g.id} className={i < step ? 'done' : i === step ? 'now' : ''} />)}
        </ol>
      )}
      {/* each step slides in fresh (key = step) */}
      <div className={'mood-step' + (drawn ? '' : ' pre')} key={mixing ? 'mix' : drawn ? step : 'pre'} aria-hidden={!drawn}>
      <p className={'mood-copy' + (mixing ? ' thinking' : '')} role="status" aria-live="polite">{copy}{mixing && <span className="think-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>}</p>
      {mixing && (
        <div className="think-strip" aria-hidden="true">
          <div className="think-track" ref={trackRef}>
            {[...THINK_PHOTOS, ...THINK_PHOTOS].map((src, k) => <img key={k} src={src} alt="" draggable={false} />)}
          </div>
        </div>
      )}
      {!mixing && (
        <>
          {group ? (
            <div className="mood-tokens" role="group" aria-label={question ? t(question) : undefined}>
              {TOKENS.filter((tk) => tk.group === group.id && (group.id !== 'going' || SET_ANSWERS[moodSet].includes(tk.id as Going) || layers.some((l) => l.id === tk.id))).map((tk) => {
                const on = layers.some((l) => l.id === tk.id)
                return (
                  <button key={tk.id} type="button" className={'mood-token ball' + (on ? ' on' : '') + (drag?.tk.id === tk.id ? ' lifting' : '')} aria-pressed={on}
                    onPointerDown={onDown(tk)} onPointerMove={onMove} onPointerUp={onUp(tk)} onPointerCancel={() => setD(null)}>
                    <span className="ball-face">{tk.icon}</span>
                    <span className="ball-label">{t(tk.label)}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
          {group && n === 0 && !drag && (
            <p className="drag-hint" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v14M6 12l6 6 6-6" /></svg>
              {t('moodDragHint')}
            </p>
          )}
        </>
      )}
      </div>
      {/* the cup sits under the steps: tokens are dragged down into it */}
      <div className={'mood-cup-wrap' + (drag?.moved ? ' target' : '') + (bounce ? ' bounce' : '')} ref={cupRef}>
        <MoodCup layers={layers} mixing={mixing} drawing={!drawn} />
        {ball && <span key={ball.key} className="mood-ball" style={{ background: ball.color }} aria-hidden="true" />}
        {mixing && POPS.map((p, k) => (
          <span key={k} className={'think-pop ' + p.shape} style={{ left: `${p.x}%`, top: `${p.y}%`, background: p.c, animationDelay: `${p.d}s` }} aria-hidden="true" />
        ))}
        {mixing && layers.map((l, k) => (
          <span key={l.id} className="think-pop icon" style={{ left: `${[22, 70, 30, 64][k % 4]}%`, top: `${[30, 26, 74, 70][k % 4]}%`, animationDelay: `${0.3 + k * 0.7}s` }} aria-hidden="true">{l.icon}</span>
        ))}
      </div>
      {!mixing && (
        <>
          <div className={'mood-actions-row' + (drawn ? '' : ' pre')}>
            {group ? (
              <>
                {/* no Skip (owner, 2026-09-28): every question is answered; Back stays */}
                {step > 0 && <button type="button" className="pill outline small" onClick={() => setStep((s) => s - 1)}>{t('back')}</button>}
              </>
            ) : (
              <>
                <button type="button" className="pill solid mix-btn" disabled={n < 1} onClick={mix}>{t('mixIt')}</button>
                <button type="button" className="pill outline small" onClick={() => setStep(GROUPS.length - 1)}>{t('back')}</button>
                {n > 0 && <button type="button" className="pill outline small" onClick={empty}>{t('emptyCup')}</button>}
              </>
            )}
            <button type="button" className="pill outline small mood-words" onClick={onWords}>{t('moodWords')}</button>
          </div>
        </>
      )}
      {drag?.moved && (
        <div className="mood-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">{drag.tk.icon}</div>
      )}
    </div>
  )
}
