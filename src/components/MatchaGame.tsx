import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as RKeyboardEvent, PointerEvent as RPointerEvent, ReactNode } from 'react'
import { useLang } from '../i18n'
import type { TKey } from '../i18n'
import { Bottle, C, Carton, EXTRA, GameFrame, Hand, INK, OUT, PumpOver, ServePanel, SHINE, THIN, findItem, g, priceAt, useHold, useUid } from './BaristaKit'

/*
 * Build Your Drink → Matcha (owner, 2026-09-30: "lets do the matcha"), the same barista mini-game style as the other
 * categories, following the matcha ritual: two scoops of matcha from the tin into the bowl → the kettle pours hot
 * water → whisk it (drag the bamboo whisk side to side, 8 strokes, it turns frothy) → the style: Classic / Berry /
 * Mid-Night (the three menu matchas; a syrup pump for the last two) → the milk (regular / skimmed / lactose-free
 * +1,000) → hold to pour the whisked matcha over the milk (layers in the glass) → matcha dust on top or nothing →
 * the REAL menu matcha at its size price (8 / 12oz).
 */
type Style = 'classic' | 'berry' | 'midnight'
type Milk = 'regular' | 'skimmed' | 'lactose'
type Step = 'sift' | 'water' | 'whisk' | 'style' | 'milk' | 'pour' | 'dust' | 'serve'
const STAGE: Record<Step, number> = { sift: 0, water: 1, whisk: 2, style: 3, milk: 4, pour: 5, dust: 6, serve: 7 }
const STAGES = 8
const STROKES = 8
const ITEM: Record<Style, string> = { classic: 'Classic Matcha', berry: 'Berry Matcha', midnight: 'Mid-Night Matcha' }
const SYRUP: Record<Exclude<Style, 'classic'>, string> = { berry: '#c2185b', midnight: '#26306e' }
const STYLE_KEY: Record<Exclude<Style, 'classic'>, TKey> = { berry: 'mtBerry', midnight: 'mtMidnight' }
const MILK_COLOR: Record<Milk, string> = { regular: '#002f6d', skimmed: '#73c3ff', lactose: '#db863a' }
const MILK_KEY: Record<Milk, TKey> = { regular: 'lgMilkRegular', skimmed: 'lgMilkSkimmed', lactose: 'lgMilkLactose' }
const POWDER = '#7aa33a', TEA = '#4f7a26', FROTH = '#9cc860', FOAM = '#c6e09a', BAMBOO = '#e5cdb5', BAMBOO_DARK = '#bb7833'

/** the matcha tin */
function Tin({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g transform={g(x, y)}>
      <rect x="0" y="10" width="74" height="96" rx="8" fill={POWDER} {...INK} />
      <path d="M54 12h18v92H54Z" fill="#00244c" opacity="0.14" />
      <rect x="0" y="40" width="74" height="36" fill={C.counter} {...THIN} />
      <path d="M14 58c6-8 14-8 20 0s14 8 20 0" stroke={POWDER} strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="-3" y="0" width="80" height="16" rx="4" fill={C.dark} {...INK} />
      <path d="M8 22v12M8 82v16" {...SHINE} />
      <text x="37" y="130" textAnchor="middle" className="lg-label">{label}</text>
    </g>
  )
}

/** the chawan: the bowl the matcha is whisked in */
function Bowl({ x, y, s = 1, powder = 0, water = false, froth = 0 }: { x: number; y: number; s?: number; powder?: number; water?: boolean; froth?: number }) {
  return (
    <g transform={g(x, y, s)}>
      <path d="M38 58h44v10H38Z" fill="#dbc6b6" {...THIN} />
      <path d="M0 0h120c0 42-26 62-60 62S0 42 0 0Z" fill={C.counter} {...INK} />
      <path d="M1 2h118c-1 6-2 10-3 14-18 6-36-4-56 2s-38 4-56-2c-1-4-2-8-3-14Z" fill={C.body} />
      <path d="M86 8c10 20 4 40-14 50" stroke="#00244c" strokeWidth="10" opacity="0.07" fill="none" strokeLinecap="round" />
      <ellipse cx="60" cy="0" rx="60" ry="8" fill="#ffffff" {...INK} />
      {water && <ellipse cx="60" cy="1" rx="54" ry="6" fill={TEA} />}
      {water && froth > 0 && <ellipse cx="60" cy="1" rx="54" ry="6" fill={FROTH} opacity={froth} />}
      {water && froth > 0.3 && Array.from({ length: Math.round(froth * 12) }, (_, i) => <circle key={i} cx={14 + ((i * 29) % 92)} cy={-2 + ((i * 7) % 6)} r={1.2 + (i % 3) * 0.6} fill="#e3f1c8" />)}
      {!water && powder > 0 && <path className="lg-settle" d={powder > 1 ? 'M34 2c6-12 46-12 52 0Z' : 'M44 2c4-8 28-8 32 0Z'} fill={POWDER} {...THIN} />}
    </g>
  )
}

/** the bamboo scoop with matcha, flying from the tin to the bowl */
function ScoopOver({ k }: { k: number }) {
  return (
    <g key={k}>
      <g transform="translate(196 236)"><g className="mk-spooning">
        <path d="M24 30 90 -8" stroke={OUT} strokeWidth="8" strokeLinecap="round" />
        <path d="M24 30 90 -8" stroke={BAMBOO} strokeWidth="4.5" strokeLinecap="round" />
        <path d="M14 26c4-8 14-10 18-4-4 8-14 10-18 4Z" fill={POWDER} {...THIN} />
      </g></g>
      {[0, 1, 2].map((i) => <circle key={i} className="mk-drop" style={{ ['--dy' as string]: '40px', animationDelay: `${0.62 + i * 0.06}s` }} cx={222 + i * 5} cy={262} r="3.5" fill={POWDER} />)}
    </g>
  )
}

function Kettle({ tilt = 0 }: { tilt?: number }) {
  return (
    <g transform={`rotate(${tilt} 40 50)`}>
      <path d="M36 18a20 20 0 0 1 28 0" fill="none" stroke={OUT} strokeWidth="8" strokeLinecap="round" />
      <path d="M36 18a20 20 0 0 1 28 0" fill="none" stroke={C.dark} strokeWidth="4" strokeLinecap="round" />
      <path d="M14 44 -14 26" stroke={OUT} strokeWidth="11" strokeLinecap="round" />
      <path d="M14 44 -14 26" stroke={C.steel} strokeWidth="6" strokeLinecap="round" />
      <path d="M12 30h76l6 50a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8Z" fill={C.steel} {...INK} />
      <path d="M70 32h16l6 46a8 8 0 0 1-8 8h-8Z" fill="#00244c" opacity="0.12" />
      <rect x="30" y="22" width="40" height="10" rx="4" fill={C.steelDark} {...THIN} />
      <path d="M18 40l4 38" {...SHINE} />
    </g>
  )
}

/** the chasen: the bamboo whisk */
function Whisk() {
  return (
    <g>
      <rect x="-8" y="-96" width="16" height="64" rx="5" fill={BAMBOO} {...INK} />
      <path d="M-8 -70h16" stroke={BAMBOO_DARK} strokeWidth="2.5" />
      <path d="M-8 -32-24 2h48L8-32Z" fill={BAMBOO} {...INK} />
      {[-16, -8, 0, 8, 16].map((tx) => <path key={tx} d={`M${tx / 3} -30 ${tx} 0`} stroke={BAMBOO_DARK} strokeWidth="1.5" />)}
    </g>
  )
}

/** the glass cup: syrup at the bottom, the milk, the matcha layer, foam, dust */
function MatchaCup({ x, y, s = 1, syrup, milk = 0, matcha = 0, dust = false }: { x: number; y: number; s?: number; syrup?: string; milk?: number; matcha?: number; dust?: boolean }) {
  const id = useUid()
  const body = 'M0 0h64l-5 74a8 8 0 0 1-8 7H13a8 8 0 0 1-8-7Z'
  const bot = 81, sy = syrup ? 12 : 0
  const milkTop = bot - sy - 44 * milk
  const matchaTop = milkTop - 24 * matcha
  const full = milk > 0 && matcha >= 1
  return (
    <g transform={g(x, y, s)}>
      <defs><clipPath id={`mc${id}`}><path d={body} /></clipPath></defs>
      <path d="M62 14h8a12 12 0 0 1 0 24h-10" fill="none" stroke={OUT} strokeWidth="9" strokeLinecap="round" />
      <path d="M62 14h8a12 12 0 0 1 0 24h-10" fill="none" stroke="#eaf6ff" strokeWidth="4.5" strokeLinecap="round" />
      <path d={body} fill="#eaf6ff" fillOpacity="0.8" />
      <g clipPath={`url(#mc${id})`}>
        {syrup && <path className="lg-settle" d={`M-2 ${bot - sy}c10-3 22 3 34 0s22-3 34 0V${bot + 4}H-2Z`} fill={syrup} />}
        {milk > 0 && <rect x="-2" y={milkTop} width="70" height={bot - sy - milkTop + 2} fill={C.milk} />}
        {milk > 0 && syrup && <rect x="-2" y={bot - sy - 8} width="70" height="10" fill={syrup} opacity="0.35" />}
        {matcha > 0 && <path d={`M-2 ${matchaTop}h70V${milkTop + 6}c-12 3-22-3-34 0s-24 3-36 0Z`} fill={FROTH} />}
        {matcha > 0 && <rect x="-2" y={milkTop - 2} width="70" height="8" fill={TEA} opacity="0.35" />}
        {full && <rect x="-2" y={matchaTop - 1} width="70" height="6" fill={FOAM} />}
        <path d="M44 0h26v84H40Z" fill="#00244c" opacity="0.06" />
      </g>
      <path d={body} fill="none" {...INK} />
      <ellipse cx="32" cy="0" rx="32" ry="4" fill="none" {...THIN} />
      <path d="M8 10l4 56" {...SHINE} />
      {dust && full && <g className="lg-heart">{Array.from({ length: 22 }, (_, i) => <circle key={i} cx={8 + ((i * 23) % 50)} cy={matchaTop + 1 + (i % 3)} r="1.5" fill={POWDER} />)}</g>}
    </g>
  )
}

/** the milk carton over the cup: tip, pour */
function CartonOver({ color, k }: { color: string; k: number }) {
  return (
    <g key={k}>
      <g transform="translate(212 150)"><g className="lg-cartoning">
        <path d="M12 -6h40v8H12Z" fill="#ffffff" {...INK} />
        <path d="M0 18 12 2h40l12 16Z" fill="#ffffff" {...INK} />
        <path d="M0 18h64v74a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6Z" fill="#ffffff" {...INK} />
        <rect x="0" y="40" width="64" height="30" fill={color} {...THIN} />
        <path d="M32 46c-5 7-7 10-7 13a7 7 0 0 0 14 0c0-3-2-6-7-13Z" fill="#ffffff" />
      </g></g>
      <path className="lg-milkstream" pathLength={1} d="M292 218q2 50 0 100" stroke={OUT} strokeWidth="9" strokeLinecap="round" fill="none" />
      <path className="lg-milkstream" pathLength={1} d="M292 218q2 50 0 100" stroke={C.milk} strokeWidth="6" strokeLinecap="round" fill="none" />
    </g>
  )
}

export function MatchaGame({ onDone }: { onDone: () => void }) {
  const { t } = useLang()
  const [step, setStep] = useState<Step>('sift')
  const [powder, setPowder] = useState(0)
  const [scooping, setScooping] = useState<number | null>(null)
  const [water, setWater] = useState(false)
  const [kettling, setKettling] = useState(false)
  const [strokes, setStrokes] = useState(0)
  const [wx, setWx] = useState(0)
  const [style, setStyle] = useState<Style>('classic')
  const [pumping, setPumping] = useState<{ f: Exclude<Style, 'classic'>; k: number } | null>(null)
  const [milk, setMilk] = useState<Milk>('regular')
  const [milkIn, setMilkIn] = useState(0)
  const [carting, setCarting] = useState<number | null>(null)
  const [pour, setPour] = useState(0)
  const [dust, setDust] = useState(false)
  const [size, setSize] = useState(0)
  const [busy, setBusy] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const wd = useRef<{ last: number; dir: number; acc: number; moved: boolean } | null>(null)
  const go = (s: Step, ms = 350) => { setBusy(true); setTimeout(() => { setBusy(false); setStep(s) }, ms) }

  // 1. two scoops of matcha
  const scoop = () => {
    if (busy || powder >= 2) return
    setBusy(true); setScooping(Date.now())
    setTimeout(() => setPowder((n) => n + 1), 1050)
    setTimeout(() => { setScooping(null); if (powder + 1 >= 2) go('water', 500); else setBusy(false) }, 1400)
  }
  // 2. the kettle pours the hot water
  const pourWater = () => {
    if (busy || water) return
    setBusy(true); setKettling(true)
    setTimeout(() => setWater(true), 700)
    setTimeout(() => { setKettling(false); go('whisk', 300) }, 1500)
  }
  // 3. whisk: every change of direction (or a tap) is a stroke
  const toSvgX = (cx: number) => { const s = svgRef.current, m = s?.getScreenCTM(); if (!s || !m) return 0; const p = s.createSVGPoint(); p.x = cx; return p.matrixTransform(m.inverse()).x }
  const stroke = () => setStrokes((n) => { const k = Math.min(STROKES, n + 1); if (k >= STROKES && n < STROKES) go('style', 700); return k })
  const whiskProps = {
    role: 'button', tabIndex: 0, style: { cursor: 'grab', touchAction: 'none' } as const,
    onPointerDown: (e: RPointerEvent<SVGGElement>) => { if (busy || strokes >= STROKES) return; e.currentTarget.setPointerCapture?.(e.pointerId); wd.current = { last: toSvgX(e.clientX), dir: 0, acc: 0, moved: false } },
    onPointerMove: (e: RPointerEvent<SVGGElement>) => {
      const d = wd.current
      if (!d) return
      const x = toSvgX(e.clientX), dx = x - d.last
      d.last = x
      if (!dx) return
      setWx((v) => Math.max(-52, Math.min(52, v + dx)))
      const dir = Math.sign(dx)
      if (dir !== d.dir && d.acc > 22) { stroke(); d.acc = 0; d.moved = true }
      if (dir !== d.dir) d.dir = dir
      d.acc += Math.abs(dx)
      if (d.acc > 6) d.moved = true
    },
    onPointerUp: () => { const d = wd.current; wd.current = null; if (d && !d.moved) { setWx((v) => (v > 0 ? -34 : 34)); stroke() } },
    onKeyDown: (e: RKeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setWx((v) => (v > 0 ? -34 : 34)); stroke() } },
  }
  // 4. the style: one syrup pump for Berry / Mid-Night
  const pickStyle = (f: Exclude<Style, 'classic'>) => {
    if (busy) return
    setBusy(true); setPumping({ f, k: Date.now() })
    setTimeout(() => setStyle(f), 850)
    setTimeout(() => { setPumping(null); go('milk', 300) }, 1350)
  }
  // 5. the milk pours once
  const pourMilk = (m: Milk) => {
    if (busy || milkIn) return
    setBusy(true); setMilk(m); setCarting(Date.now())
    setTimeout(() => setMilkIn(1), 900)
    setTimeout(() => { setCarting(null); go('pour', 300) }, 1500)
  }
  // 6. hold to pour the matcha over the milk
  const pourHold = useHold(1800, useCallback((d: number) => setPour((v) => { const n = Math.min(1, v + d); if (n >= 1 && v < 1) go('dust', 500); return n }), []), step === 'pour') // eslint-disable-line react-hooks/exhaustive-deps

  const item = findItem(ITEM[style])
  const total = item ? priceAt(item, size) + (milk === 'lactose' ? EXTRA.lactose : 0) : 0
  const opts = [milk === 'skimmed' ? t('lgOptSkimmed') : milk === 'lactose' ? t('lgOptLactose') : '', dust ? t('mtDustOpt') : ''].filter(Boolean)
  const again = () => { setStep('sift'); setPowder(0); setWater(false); setStrokes(0); setWx(0); setStyle('classic'); setMilk('regular'); setMilkIn(0); setPour(0); setDust(false); setSize(0) }
  const syrup = style === 'classic' ? undefined : SYRUP[style]
  const froth = strokes / STROKES
  const cup = (x: number, y: number, s: number) => <MatchaCup x={x} y={y} s={s} syrup={syrup} milk={milkIn} matcha={pour} dust={(step === 'dust' || step === 'serve') && dust} />

  const tip: Record<Step, TKey> = { sift: 'mtSift', water: 'mtWater', whisk: 'mtWhisk', style: 'mtStyle', milk: 'mtMilk', pour: 'mtPour', dust: 'mtDust', serve: 'mtServe' }
  let scene: ReactNode = null
  let hand: ReactNode = null
  if (step === 'sift') {
    scene = (
      <g>
        <g transform="translate(34 206)">
          <g className={'lg-pick' + (powder >= 2 ? ' lg-blocked' : '')} role="button" tabIndex={0} aria-label={t('mtTin')} onClick={scoop} onKeyDown={(e) => e.key === 'Enter' && scoop()}>
            <Tin x={0} y={0} label={t('mtTin')} />
          </g>
        </g>
        <Bowl x={170} y={300} powder={powder} />
        {scooping !== null && <ScoopOver k={scooping} />}
      </g>
    )
    hand = busy ? null : <Hand from={[66, 260]} kind="tap" />
  } else if (step === 'water') {
    scene = (
      <g>
        <Bowl x={120} y={300} s={1.2} powder={powder} water={water} />
        <g transform={kettling ? 'translate(214 150)' : 'translate(236 196)'}>
          <g className="lg-pick" role="button" tabIndex={0} aria-label={t('mtKettle')} onClick={pourWater} onKeyDown={(e) => e.key === 'Enter' && pourWater()}>
            <Kettle tilt={kettling ? -32 : 0} />
          </g>
        </g>
        {kettling && <path className="lg-milkstream" pathLength={1} d="M192 212q-6 40 -12 84" stroke="#cfe9ff" strokeWidth="6" strokeLinecap="round" fill="none" />}
        {kettling && <g className="lg-steam"><path d="M150 286c-6-10 6-14 0-24M170 282c-6-10 6-14 0-24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" /></g>}
      </g>
    )
    hand = busy || water ? null : <Hand from={[286, 250]} kind="tap" />
  } else if (step === 'whisk') {
    scene = (
      <g>
        <Bowl x={90} y={268} s={1.5} water froth={froth} />
        <g {...whiskProps} transform={`translate(${180 + wx} 270)`}><rect x="-40" y="-110" width="80" height="120" fill="transparent" /><Whisk /></g>
        {strokes > 0 && strokes < STROKES && <g className="lg-steam"><circle cx={150 + (strokes * 17) % 60} cy="262" r="3" fill="#e3f1c8" /><circle cx={190 - (strokes * 11) % 40} cy="258" r="2.4" fill="#e3f1c8" /></g>}
      </g>
    )
    hand = strokes ? null : <Hand from={[150, 196]} to={[214, 196]} kind="drag" />
  } else if (step === 'style') {
    const SY: Exclude<Style, 'classic'>[] = ['berry', 'midnight']
    scene = (
      <g>
        <rect x="24" y="210" width="312" height="12" rx="4" fill="#dbc6b6" {...INK} />
        {SY.map((f, i) => (
          <g key={f} className={'lg-pick' + (pumping?.f === f ? ' lg-away' : pumping ? ' lg-blocked' : '')} role="button" tabIndex={0} aria-label={t(STYLE_KEY[f])} onClick={() => pickStyle(f)} onKeyDown={(e) => e.key === 'Enter' && pickStyle(f)}>
            <Bottle x={i ? 262 : 48} y={114} color={SYRUP[f]} label={t(STYLE_KEY[f])} />
          </g>
        ))}
        {cup(151, 296, 1)}
        {pumping && <PumpOver color={SYRUP[pumping.f]} tin={false} k={pumping.k} />}
      </g>
    )
    hand = busy ? null : <Hand from={[76, 170]} kind="tap" />
  } else if (step === 'milk') {
    const MILKS: Milk[] = ['regular', 'skimmed', 'lactose']
    scene = (
      <g>
        {MILKS.map((m, i) => (
          <g key={m} className={'lg-pick' + (carting !== null && m !== milk ? ' lg-blocked' : '') + (carting && m === milk ? ' lg-away' : '')} role="button" tabIndex={0} aria-label={t(MILK_KEY[m])} onClick={() => pourMilk(m)} onKeyDown={(e) => e.key === 'Enter' && pourMilk(m)}>
            <g transform={`translate(${6 + i * 80} 262) scale(0.9)`}><Carton x={0} y={0} color={MILK_COLOR[m]} label={t(MILK_KEY[m]).split(' (')[0]} /></g>
          </g>
        ))}
        <text x="195" y="396" textAnchor="middle" className="lg-label small">+1,000</text>
        {cup(262, 300, 1)}
        {carting !== null && <CartonOver color={MILK_COLOR[milk]} k={carting} />}
      </g>
    )
    hand = busy || milkIn ? null : <Hand from={[44, 300]} kind="tap" />
  } else if (step === 'pour') {
    const pouring = pour > 0 && pour < 1
    scene = (
      <g>
        {cup(96, 214, 1.9)}
        <g transform={pouring ? 'translate(250 70) rotate(-58 60 30) scale(0.9)' : 'translate(214 70) rotate(-12 60 30) scale(0.9)'}><Bowl x={0} y={0} water froth={1} /></g>
        {pouring && <path className="lg-stream" d="M204 150q-20 60 -44 110" stroke={FROTH} strokeWidth="9" strokeLinecap="round" fill="none" />}
        {pouring && <path d="M204 150q-20 60 -44 110" stroke={OUT} strokeWidth="1.5" fill="none" opacity="0.35" />}
      </g>
    )
  } else if (step === 'dust' || step === 'serve') {
    scene = <g>{cup(92, 176, 2.3)}</g>
  }

  return (
    <GameFrame step={step} stage={STAGE[step]} stages={STAGES} tip={t(tip[step])} svgRef={svgRef} scene={scene} hand={hand} actions={<>
        {step === 'whisk' && <p className="lg-pumpcount" aria-live="polite"><b>{t('mtStrokes')}: {strokes} / {STROKES}</b></p>}
        {step === 'style' && <button type="button" className="pill outline" onClick={() => { setStyle('classic'); go('milk', 300) }} disabled={busy}>{t('mtClassic')}</button>}
        {step === 'pour' && <button type="button" className="lg-hold" {...pourHold} disabled={busy}>{t('lgHold')}</button>}
        {step === 'dust' && (
          <>
            <button type="button" className="pill solid" onClick={() => { setDust(true); go('serve', 700) }}>{t('mtDustYes')}</button>
            <button type="button" className="pill outline" onClick={() => { setDust(false); go('serve', 300) }}>{t('lgNothing')}</button>
          </>
        )}
        {step === 'serve' && item && <ServePanel item={item} opts={opts} size={size} setSize={setSize} price={total} onDone={onDone} onAgain={again} />}
    </>} />
  )
}
