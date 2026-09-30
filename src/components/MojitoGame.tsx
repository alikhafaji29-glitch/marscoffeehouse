import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as RKeyboardEvent, PointerEvent as RPointerEvent, ReactNode } from 'react'
import { useLang } from '../i18n'
import type { TKey } from '../i18n'
import { Bottle, C, EXTRA, GameFrame, Hand, ICE_KEYS, IceBar, IceBin, INK, MAX_PUMPS, MAX_SYRUPS, OUT, PumpOver, ScoopOver, ServePanel, SHINE, THIN, findItem, g, priceAt, useHold, useUid } from './BaristaKit'

/*
 * Build Your Drink → Mojito (owner, 2026-09-30: "lets do the mojito"), the same barista mini-game style and
 * mechanics as the Latte: lime + mint into the glass → muddle (drag the muddler down) → syrup pumps (Strawberry /
 * Watermelon / Pomegranate, extra pumps, mix two; none = the classic Lemon-Mint) → ice scoops (no / light / regular /
 * extra) → hold to pour the soda → garnish → the result, ordered as the REAL menu mojito (Lemon-Mint / Strawberry /
 * Watermelon / Pomegranate Mojito) at the menu's size prices; each pump after the first +1,000 (the menu's "Add Flavors").
 */
type Syrup = 'strawberry' | 'watermelon' | 'pomegranate'
type Step = 'fruit' | 'muddle' | 'syrup' | 'ice' | 'soda' | 'garnish' | 'serve'
type Garnish = 'both' | 'mint' | 'none'
const STAGE: Record<Step, number> = { fruit: 0, muddle: 1, syrup: 2, ice: 3, soda: 4, garnish: 5, serve: 6 }
const STAGES = 7
const ITEM: Record<Syrup | 'none', string> = { none: 'Lemon-Mint Mojito', strawberry: 'Strawberry Mojito', watermelon: 'Watermelon Mojito', pomegranate: 'Pomegranate Mojito' }
const SYRUP_COLOR: Record<Syrup, string> = { strawberry: '#e0475b', watermelon: '#f27b8f', pomegranate: '#a3203f' }
const SYRUP_KEY: Record<Syrup, TKey> = { strawberry: 'mjStrawberry', watermelon: 'mjWatermelon', pomegranate: 'mjPomegranate' }
const LIME = '#8cc63f', LIME_DARK = '#5e9a2c', MINT = '#4caf50', MINT_DARK = '#2e7d32', SODA = '#eaf7df'

/** the tall mojito glass: muddled lime + mint at the bottom, syrup, soda with bubbles, ice, garnish, straw */
function MojitoGlass({ x, y, s = 1, lime = 0, mint = false, crushed = false, syrups = [], ice = 0, soda = 0, garnish = 'none', straw = false }: {
  x: number; y: number; s?: number; lime?: number; mint?: boolean; crushed?: boolean; syrups?: string[]; ice?: number; soda?: number; garnish?: Garnish; straw?: boolean
}) {
  const id = useUid()
  const body = 'M0 0h56l-4 92a6 6 0 0 1-6 5H10a6 6 0 0 1-6-5Z'
  const bot = 90, h = 90
  const tint = syrups[0] ?? LIME
  return (
    <g transform={g(x, y, s)}>
      <defs><clipPath id={`mj${id}`}><path d={body} /></clipPath></defs>
      {straw && <><path d="M38 -34 30 78" stroke={OUT} strokeWidth="9" strokeLinecap="round" /><path d="M38 -34 30 78" stroke="#397dc9" strokeWidth="5" strokeLinecap="round" /></>}
      <path d={body} fill="#eaf6ff" fillOpacity="0.8" />
      <g clipPath={`url(#mj${id})`}>
        {soda > 0 && (
          <g>
            <rect className="lg-settle" x="-2" y={bot - h * 0.92 * soda} width="60" height={h * 0.92 * soda + 8} fill={SODA} />
            <rect x="-2" y={bot - h * 0.92 * soda} width="60" height={h * 0.92 * soda + 8} fill={tint} opacity={syrups.length ? 0.45 : 0.18} />
            {[8, 20, 33, 45, 14, 40].map((bx, i) => <circle key={i} className="mj-bubble" style={{ animationDelay: `${i * 0.35}s` }} cx={bx} cy={bot - 6 - (i % 3) * 18} r={1.8 + (i % 2)} fill="#ffffff" opacity="0.9" />)}
          </g>
        )}
        {syrups.map((c, i) => <path key={i} className="lg-settle" d={`M-2 ${bot + 2 - 6 * (i + 1)}c10-3 20 3 30 0s18-3 30 0v6H-2Z`} fill={c} />)}
        {/* muddled lime wedges + mint at the bottom */}
        {Array.from({ length: lime }, (_, i) => crushed
          ? <path key={i} d={`M${8 + i * 14} ${bot - 4}l8-7 6 7Z`} fill={LIME} stroke={LIME_DARK} strokeWidth="1.2" />
          : <path key={i} className="lg-cube" d={`M${6 + i * 16} ${bot - 2}a10 10 0 0 1 20 0Z`} fill={LIME} stroke={OUT} strokeWidth="1.6" />)}
        {mint && (crushed
          ? [10, 22, 34, 44].map((mx, i) => <path key={i} d={`M${mx} ${bot - 10 - (i % 2) * 4}c3-4 7-4 8 0-3 3-6 3-8 0Z`} fill={MINT} stroke={MINT_DARK} strokeWidth="1" />)
          : [12, 28, 40].map((mx, i) => <path key={i} className="lg-cube" d={`M${mx} ${bot - 14 - (i % 2) * 5}c4-7 12-7 14 0-4 5-10 5-14 0Z`} fill={MINT} stroke={OUT} strokeWidth="1.4" />))}
        {Array.from({ length: ice * 3 }, (_, i) => {
          const cx = 6 + (i % 3) * 15, cy = bot - 38 - Math.floor(i / 3) * 17 - (i % 2) * 5
          return (
            <g key={`i${i}`} className="lg-cube" transform={`rotate(${(i * 23) % 30 - 12} ${cx + 7} ${cy + 6})`}>
              <rect x={cx} y={cy} width="15" height="14" rx="3.5" fill="#e3f3ff" fillOpacity="0.85" stroke="#73c3ff" strokeWidth="1.6" />
              <path d={`M${cx + 3} ${cy + 3}h5`} stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </g>
          )
        })}
        <path d="M40 0h22v100H36Z" fill="#00244c" opacity="0.06" />
      </g>
      <path d={body} fill="none" {...INK} />
      <ellipse cx="28" cy="0" rx="28" ry="4" fill="none" {...THIN} />
      <path d="M8 10l3 66" {...SHINE} />
      {/* garnish on the rim */}
      {garnish !== 'none' && (
        <g className="lg-heart">
          <path d="M14 -2c-2-12 6-18 12-16 0 8-6 14-12 16ZM26 -4c4-10 14-12 18-6-4 6-12 8-18 6Z" fill={MINT} stroke={OUT} strokeWidth="1.6" />
          {garnish === 'both' && <g><circle cx="48" cy="-2" r="11" fill={LIME} {...THIN} /><circle cx="48" cy="-2" r="7" fill="#d8f0a8" /><path d="M48 -9v14M41 -2h14M43 -7l10 10M53 -7 43 3" stroke={LIME} strokeWidth="1.4" /></g>}
        </g>
      )}
    </g>
  )
}

function Muddler({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={g(x, y, s)}>
      <rect x="-8" y="-110" width="16" height="92" rx="7" fill={C.wood} {...INK} />
      <path d="M-3 -104v76" stroke="#bb7833" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M-13 -20h26l-2 16h-22Z" fill="#7a4518" {...INK} />
      <path d="M-10 -4h20" stroke={OUT} strokeWidth="2" strokeDasharray="3 3" />
    </g>
  )
}

function SodaBottle({ x, y, tilt }: { x: number; y: number; tilt: number }) {
  return (
    <g transform={`${g(x, y)} rotate(${tilt} 20 60)`}>
      <path d="M14 0h12v16l8 14v70a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V30l8-14Z" fill="#bfe6c9" fillOpacity="0.9" {...INK} />
      <rect x="12" y="-6" width="16" height="8" rx="2" fill={C.caramel} {...THIN} />
      <rect x="6" y="52" width="28" height="26" fill="#ffffff" {...THIN} />
      <circle cx="14" cy="60" r="2" fill="#73c3ff" /><circle cx="22" cy="68" r="2.4" fill="#73c3ff" /><circle cx="27" cy="58" r="1.6" fill="#73c3ff" />
      <path d="M11 34v50" {...SHINE} />
    </g>
  )
}

export function MojitoGame({ onDone }: { onDone: () => void }) {
  const { t } = useLang()
  const [step, setStep] = useState<Step>('fruit')
  const [lime, setLime] = useState(0)
  const [mint, setMint] = useState(false)
  const [crushed, setCrushed] = useState(false)
  const [pumps, setPumps] = useState<Syrup[]>([])
  const [pumping, setPumping] = useState<{ f: Syrup; k: number } | null>(null)
  const [ice, setIce] = useState(0)
  const [scooping, setScooping] = useState<number | null>(null)
  const [soda, setSoda] = useState(0)
  const [garnish, setGarnish] = useState<Garnish>('none')
  const [size, setSize] = useState(0)
  const [note, setNote] = useState<TKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [muddleY, setMuddleY] = useState(0)
  const drag = useRef<{ y0: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const go = (s: Step, ms = 350) => { setBusy(true); setTimeout(() => { setBusy(false); setNote(null); setStep(s) }, ms) }

  // 1. lime + mint (both needed)
  const addLime = () => { if (busy || lime) return; setLime(3); if (mint) go('muddle', 700) }
  const addMint = () => { if (busy || mint) return; setMint(true); if (lime) go('muddle', 700) }
  // 2. muddle: drag the muddler down (a tap also works)
  const toSvgY = (cy: number) => { const s = svgRef.current, m = s?.getScreenCTM(); if (!s || !m) return 0; const p = s.createSVGPoint(); p.y = cy; return p.matrixTransform(m.inverse()).y }
  const muddleDone = () => { setMuddleY(1); setCrushed(true); go('syrup', 700) }
  const muddleProps = {
    role: 'button', tabIndex: 0, style: { cursor: 'grab', touchAction: 'none' } as const,
    onPointerDown: (e: RPointerEvent<SVGGElement>) => { if (busy || crushed) return; e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { y0: toSvgY(e.clientY) } },
    onPointerMove: (e: RPointerEvent<SVGGElement>) => { if (drag.current) setMuddleY(Math.max(0, Math.min(1, (toSvgY(e.clientY) - drag.current.y0) / 90))) },
    onPointerUp: () => { if (!drag.current) return; drag.current = null; if (muddleY > 0.75 || muddleY < 0.05) muddleDone(); else setMuddleY(0) },
    onKeyDown: (e: RKeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); muddleDone() } },
  }
  // 3. syrup pumps (same rules as the Latte)
  const kinds = [...new Set(pumps)]
  const pump = (f: Syrup) => {
    if (busy) return
    if (pumps.length >= MAX_PUMPS) { setNote('lgMaxPumps'); return }
    if (!kinds.includes(f) && kinds.length >= MAX_SYRUPS) { setNote('lgMaxFlavors'); return }
    setNote(null); setBusy(true); setPumping({ f, k: Date.now() })
    setTimeout(() => setPumps((ps) => [...ps, f]), 850)
    setTimeout(() => { setPumping(null); setBusy(false) }, 1350)
  }
  // 4. ice scoops
  const scoop = () => {
    if (busy) return
    if (ice >= 3) { setNote('lgIceMax'); return }
    setNote(null); setBusy(true); setScooping(Date.now())
    setTimeout(() => setIce((n) => n + 1), 780)
    setTimeout(() => { setScooping(null); setBusy(false) }, 1200)
  }
  // 5. soda: hold to pour until the glass is full
  const sodaHold = useHold(2000, useCallback((d: number) => setSoda((v) => { const n = Math.min(1, v + d); if (n >= 1 && v < 1) go('garnish', 500); return n }), []), step === 'soda') // eslint-disable-line react-hooks/exhaustive-deps

  const base: Syrup | 'none' = pumps[0] ?? 'none'
  const item = findItem(ITEM[base])
  const extras = Math.max(0, pumps.length - 1) * EXTRA.pump
  const total = item ? priceAt(item, size) + extras : 0
  const opts = [
    ...kinds.map((f) => { const n = pumps.filter((x) => x === f).length; return f === base && n === 1 ? '' : t(SYRUP_KEY[f]) + (n > 1 ? ` ×${n}` : '') }),
    ice !== 2 ? t(ICE_KEYS[ice]) : '',
    garnish === 'none' ? t('mjNoGarnish') : garnish === 'mint' ? t('mjMintOnly') : '',
  ].filter(Boolean)
  const again = () => { setStep('fruit'); setLime(0); setMint(false); setCrushed(false); setPumps([]); setIce(0); setSoda(0); setGarnish('none'); setSize(0); setMuddleY(0); setNote(null) }
  const glass = (x: number, y: number, s = 1) => <MojitoGlass x={x} y={y} s={s} lime={lime} mint={mint} crushed={crushed} syrups={pumps.map((f) => SYRUP_COLOR[f])} ice={ice} soda={soda} garnish={step === 'garnish' || step === 'serve' ? garnish : 'none'} straw={step === 'serve'} />

  const tip: Record<Step, TKey> = { fruit: 'mjFruit', muddle: 'mjMuddle', syrup: 'mjSyrup', ice: 'lgIce', soda: 'mjSoda', garnish: 'mjGarnish', serve: 'mjServe' }
  let scene: ReactNode = null
  let hand: ReactNode = null
  if (step === 'fruit') {
    scene = (
      <g>
        {/* lime bowl */}
        <g className={'lg-pick' + (lime ? ' lg-blocked' : '')} role="button" tabIndex={0} aria-label={t('mjLime')} onClick={addLime} onKeyDown={(e) => e.key === 'Enter' && addLime()}>
          <path d="M20 300h110l-10 44a10 10 0 0 1-10 8H40a10 10 0 0 1-10-8Z" fill="#ffffff" {...INK} />
          {[40, 64, 88, 52, 76].map((lx, i) => <g key={i}><circle cx={lx} cy={i < 3 ? 296 : 284} r="13" fill={LIME} {...THIN} /><circle cx={lx} cy={i < 3 ? 296 : 284} r="8" fill="#d8f0a8" /></g>)}
          <path d="M28 306h94" stroke={C.body} strokeWidth="5" />
          <text x="75" y="374" textAnchor="middle" className="lg-label">{t('mjLime')}</text>
        </g>
        {/* mint pot */}
        <g className={'lg-pick' + (mint ? ' lg-blocked' : '')} role="button" tabIndex={0} aria-label={t('mjMint')} onClick={addMint} onKeyDown={(e) => e.key === 'Enter' && addMint()}>
          <path d="M246 300h72l-8 46a8 8 0 0 1-8 6h-40a8 8 0 0 1-8-6Z" fill={C.caramel} {...INK} />
          {[[262, 280], [282, 268], [300, 282], [272, 290], [292, 292], [282, 250]].map(([mx, my], i) => <path key={i} d={`M${mx} ${my}c6-12 20-12 22 0-6 8-16 8-22 0Z`} transform={`rotate(${i * 40 - 60} ${mx + 11} ${my})`} fill={MINT} stroke={OUT} strokeWidth="1.8" />)}
          <path d="M252 310h60" stroke="#ffffff" strokeWidth="3" opacity="0.6" />
          <text x="282" y="374" textAnchor="middle" className="lg-label">{t('mjMint')}</text>
        </g>
        {glass(152, 250, 1.2)}
      </g>
    )
    hand = busy ? null : <Hand from={lime ? [276, 262] : [66, 286]} kind="tap" />
  } else if (step === 'muddle') {
    scene = (
      <g>
        <rect x="40" y="60" width="280" height="330" rx="26" fill="#ffffff" {...INK} />
        {glass(124, 190, 2)}
        <g {...muddleProps} transform={`translate(0 ${muddleY * 96})`}><Muddler x={180} y={186} s={1.1} /></g>
      </g>
    )
    hand = muddleY > 0 || crushed ? null : <Hand from={[196, 96]} to={[196, 186]} kind="drag" />
  } else if (step === 'syrup') {
    const SY: Syrup[] = ['strawberry', 'watermelon', 'pomegranate']
    scene = (
      <g>
        <rect x="24" y="210" width="312" height="12" rx="4" fill="#dbc6b6" {...INK} />
        <rect x="0" y="222" width="360" height="30" fill={C.counter} />
        {SY.map((f, i) => {
          const n = pumps.filter((x) => x === f).length
          const blocked = pumps.length >= MAX_PUMPS || (!kinds.includes(f) && kinds.length >= MAX_SYRUPS)
          return (
            <g key={f} className={'lg-pick' + (blocked ? ' lg-blocked' : '') + (pumping?.f === f ? ' lg-away' : '')} role="button" tabIndex={0} aria-label={`${t(SYRUP_KEY[f])}${n ? ` ×${n}` : ''}`} onClick={() => pump(f)} onKeyDown={(e) => e.key === 'Enter' && pump(f)}>
              <Bottle x={50 + i * 105} y={114} color={SYRUP_COLOR[f]} label={t(SYRUP_KEY[f])} />
              {n > 0 && <g className="lg-count"><circle cx={75 + i * 105} cy={100} r="12" fill={C.caramel} {...THIN} /><text x={75 + i * 105} y={104.5} textAnchor="middle" className="lg-count-t">×{n}</text></g>}
            </g>
          )
        })}
        {glass(151, 296, 1)}
        {pumping && <PumpOver color={SYRUP_COLOR[pumping.f]} tin={false} k={pumping.k} />}
      </g>
    )
    hand = pumps.length || pumping ? null : <Hand from={[78, 170]} kind="tap" />
  } else if (step === 'ice') {
    scene = (
      <g>
        <IceBin scooping={scooping !== null} busy={busy} full={ice >= 3} label={t('lgIce').replace(/\*/g, '')} onScoop={scoop} />
        {glass(248, 262, 1.1)}
        {scooping !== null && <ScoopOver k={scooping} />}
      </g>
    )
    hand = busy || ice > 0 ? null : <Hand from={[176, 196]} kind="tap" />
  } else if (step === 'soda') {
    const pouring = soda > 0 && soda < 1
    scene = (
      <g>
        {glass(128, 210, 1.9)}
        <SodaBottle x={210} y={70} tilt={pouring ? -118 : -20} />
        {pouring && <path className="lg-stream" d="M190 128q-4 40 -8 90" stroke="#bfe6c9" strokeWidth="6" strokeLinecap="round" fill="none" />}
        {pouring && [0, 1, 2].map((i) => <circle key={i} className="mj-bubble" style={{ animationDelay: `${i * 0.2}s` }} cx={180 + i * 6} cy={240} r="3" fill="#ffffff" stroke="#73c3ff" strokeWidth="1" />)}
      </g>
    )
  } else if (step === 'garnish' || step === 'serve') {
    scene = <g>{glass(120, 150, 2.1)}</g>
  }

  return (
    <GameFrame step={step} stage={STAGE[step]} stages={STAGES} tip={note ? t(note) : t(tip[step])} svgRef={svgRef} scene={scene} hand={hand} actions={<>
        {step === 'syrup' && (
          <div className="lg-pumpbar">
            <p className="lg-pumpcount" aria-live="polite"><b>{t('lgPumps')}: {pumps.length} / {MAX_PUMPS}</b><small>{t('lgPumpPrice')}</small></p>
            <div className="lg-pumpbtns">
              {pumps.length > 0 && <button type="button" className="pill outline small" onClick={() => { setPumps((ps) => ps.slice(0, -1)); setNote(null) }} disabled={busy}>{t('lgUndo')}</button>}
              <button type="button" className={'pill ' + (pumps.length ? 'solid' : 'outline')} onClick={() => go('ice', 300)} disabled={busy}>{pumps.length ? t('lgDone') : t('mjClassic')}</button>
            </div>
          </div>
        )}
        {step === 'ice' && <IceBar ice={ice} busy={busy} onUndo={() => { setIce((n) => n - 1); setNote(null) }} onDone={() => go('soda', 300)} />}
        {step === 'soda' && <button type="button" className="lg-hold" {...sodaHold} disabled={busy}>{t('lgHold')}</button>}
        {step === 'garnish' && (
          <>
            <button type="button" className="pill solid" onClick={() => { setGarnish('both'); go('serve', 500) }}>{t('mjBoth')}</button>
            <button type="button" className="pill outline" onClick={() => { setGarnish('mint'); go('serve', 500) }}>{t('mjMintOnly')}</button>
            <button type="button" className="pill outline" onClick={() => { setGarnish('none'); go('serve', 300) }}>{t('lgNothing')}</button>
          </>
        )}
        {step === 'serve' && item && <ServePanel item={item} opts={opts} size={size} setSize={setSize} price={total} onDone={onDone} onAgain={again} />}
    </>} />
  )
}
