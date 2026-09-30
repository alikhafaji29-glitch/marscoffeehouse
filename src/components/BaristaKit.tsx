import { useCallback, useEffect, useId, useRef } from 'react'
import type { KeyboardEvent as RKeyboardEvent, MouseEvent as RMouseEvent, PointerEvent as RPointerEvent, ReactNode, RefObject } from 'react'
import { useLang } from '../i18n'
import type { TKey } from '../i18n'
import { MENU } from '../menu'
import type { MenuItem } from '../menu'
import { useCart } from '../cart'
import { iqd } from '../account'
import { openCheckout } from '../bus'

/*
 * What the Be the barista games share (Latte, Mojito, Milkshake, Smoothie, Matcha, Refreshers): menu prices, the Mars
 * palette, the drawing helpers and props (backdrop, bottles, pumps, ice scoop, carton, blender, hand), and the game
 * frame (step dots, hint, scene, action row, ice buttons, result panel).
 */
export const EXTRA = { shot: 1000, lactose: 1000, whip: 2000, foam: 1000, pump: 1000 } // the menu's "extra" prices (pump = Add Flavors)
export const MAX_PUMPS = 3, MAX_SYRUPS = 2 // syrup pumps per drink, different syrups per drink
export const findItem = (name: string): MenuItem | undefined => MENU.flatMap((c) => c.items).find((i) => i.name === name)
export const priceAt = (it: MenuItem, i: number) => (Array.isArray(it.price) ? it.price[i] : it.price)

/* Mars brand palette (guideline PDF, owner 2026-09-29: "use mars colors") in the reference game's style */
export const OUT = '#00244c'
export const SW = 3
export const C = { wall: '#cae8ff', counter: '#f8f2e9', steel: '#c5d6ea', steelDark: '#8fa9c9', body: '#73c3ff', dark: '#002f6d', wood: '#935a25', coffee: '#6b3f18', crema: '#bb7833', milk: '#fbf7f1', latte: '#e5cdb5', mug: '#ffffff', glass: '#e8f5ff', ice: '#e3f3ff', green: '#db863a', caramel: '#db863a' }
export const CREAM = '#fbf1dc'
export const ICE_KEYS = ['lgIceNone', 'lgIceLight', 'lgIceRegular', 'lgIceExtra'] as TKey[] // 0..3 ice scoops

/** hint bubble text: **word** is highlighted, like the reference's orange keywords */
export function Tip({ text }: { text: string }) {
  return <p className="lg-tip" role="status" aria-live="polite">{text.split('**').map((s, i) => (i % 2 ? <b key={i}>{s}</b> : <span key={i}>{s}</span>))}</p>
}

/** hold-to-do: progress 0..1 while pressed (pointer, or Space / Enter) */
export function useHold(ms: number, onTick: (p: number) => void, active: boolean) {
  const held = useRef(false)
  const raf = useRef(0)
  const last = useRef(0)
  const stop = useCallback(() => { held.current = false; cancelAnimationFrame(raf.current) }, [])
  const start = useCallback(() => {
    if (!active || held.current) return
    held.current = true
    last.current = performance.now()
    const tick = (now: number) => {
      if (!held.current) return
      onTick((now - last.current) / ms)
      last.current = now
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }, [active, ms, onTick])
  useEffect(() => stop, [stop])
  return {
    onPointerDown: (e: RPointerEvent) => { e.preventDefault(); start() },
    onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
    onKeyDown: (e: RKeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start() } },
    onKeyUp: stop, onContextMenu: (e: RMouseEvent) => e.preventDefault(),
  }
}

/* ---------- the drawings (all in the scene's 360 × 420 units) ----------
 * Drawn like the reference game: flat fills with a darker "side" band for volume, white shine strokes, thick ink
 * outlines, small real-world details (bean hopper, pressure gauge, drip grille, spouts, pump heads). Mars colours. */
export const g = (x: number, y: number, s = 1) => `translate(${x} ${y}) scale(${s})`
export const useUid = () => useId().replace(/[^a-zA-Z0-9]/g, '')
export const INK = { stroke: OUT, strokeWidth: SW, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
export const THIN = { stroke: OUT, strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
export const SHINE = { stroke: '#ffffff', strokeWidth: 3, strokeLinecap: 'round' as const, fill: 'none', opacity: 0.85 }

/** the room: tiled light-blue wall, a shelf line, the counter with a wooden edge and a navy front */
export function Backdrop() {
  const id = useUid()
  return (
    <g>
      <defs>
        <pattern id={`tile${id}`} width="30" height="20" patternUnits="userSpaceOnUse">
          <rect width="30" height="20" fill={C.wall} />
          <path d="M0 19.5h30M29.5 0v20" stroke="#b3dcfb" strokeWidth="1.2" />
        </pattern>
        <pattern id={`dots${id}`} width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.3" fill="#c9d9ee" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="360" height="118" fill={`url(#tile${id})`} />
      <rect x="0" y="118" width="360" height="302" fill={C.counter} />
      <rect x="0" y="118" width="360" height="302" fill={`url(#dots${id})`} opacity="0.55" />
      <rect x="0" y="112" width="360" height="10" fill="#e5cdb5" />
      <path d="M0 112h360M0 122h360" {...THIN} />
      <rect x="0" y="404" width="360" height="16" fill={C.dark} />
    </g>
  )
}

export function Carton({ x, y, color, label, on }: { x: number; y: number; color: string; label: string; on?: boolean }) {
  return (
    <g transform={g(x, y)} className={on ? 'lg-picked' : undefined}>
      <path d="M12 -6h40v8H12Z" fill="#ffffff" {...INK} />
      <path d="M0 18 12 2h40l12 16Z" fill="#ffffff" {...INK} />
      <path d="M32 2v16" {...THIN} />
      <rect x="44" y="-12" width="10" height="8" rx="2" fill={color} {...THIN} />
      <path d="M0 18h64v74a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6Z" fill="#ffffff" {...INK} />
      <path d="M48 20h14v70a6 6 0 0 1-6 6h-8Z" fill="#00244c" opacity="0.07" />
      <rect x="0" y="40" width="64" height="30" fill={color} {...THIN} />
      <path d="M32 46c-5 7-7 10-7 13a7 7 0 0 0 14 0c0-3-2-6-7-13Z" fill="#ffffff" />
      <path d="M6 26h20" {...SHINE} opacity="0.6" />
      <text x="32" y="118" textAnchor="middle" className="lg-label">{label}</text>
    </g>
  )
}

export function Bottle({ x, y, color, label, tin }: { x: number; y: number; color: string; label: string; tin?: boolean }) {
  if (tin) return (
    <g transform={g(x, y)}>
      <rect x="0" y="40" width="50" height="56" rx="6" fill="#f8f2e9" {...INK} />
      <path d="M0 48h50M0 88h50" {...THIN} />
      <rect x="0" y="56" width="50" height="24" fill={C.dark} />
      <path d="M8 68c5-6 12-6 17 0s12 6 17 0" fill="none" stroke="#73c3ff" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M38 44v48" stroke="#00244c" strokeWidth="6" opacity="0.08" />
      <ellipse cx="25" cy="40" rx="25" ry="6" fill="#dbc6b6" {...INK} />
      <ellipse cx="25" cy="40" rx="8" ry="2.5" fill="none" {...THIN} />
      <path d="M6 52v30" {...SHINE} />
      <text x="25" y="122" textAnchor="middle" className="lg-label">{label}</text>
    </g>
  )
  const body = 'M16 18h18v10l8 10v52a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V38l8-10Z'
  return (
    <g transform={g(x, y)}>
      {/* pump head + nozzle */}
      <path d="M18 2h14v8H18Z" fill={C.dark} {...THIN} />
      <path d="M22 2V-6h18" fill="none" stroke={OUT} strokeWidth="5" strokeLinecap="round" />
      <path d="M22 2V-6h18" fill="none" stroke={C.dark} strokeWidth="2" strokeLinecap="round" />
      <rect x="15" y="10" width="20" height="8" rx="2" fill={C.steel} {...THIN} />
      <path d={body} fill={color} />
      <path d="M32 30l8 9v51a6 6 0 0 1-6 6h-3Z" fill="#00244c" opacity="0.14" />
      <path d={body} fill="none" {...INK} />
      <rect x="8" y="52" width="34" height="24" rx="3" fill="#ffffff" {...THIN} />
      <circle cx="25" cy="64" r="6" fill={color} {...THIN} />
      <path d="M12 42v40" {...SHINE} />
      <text x="25" y="122" textAnchor="middle" className="lg-label">{label}</text>
    </g>
  )
}

export function PumpOver({ color, tin, k }: { color: string; tin: boolean; k: number }) {
  if (tin) return (
    <g className="lg-pumping" key={k}>
      <g transform="translate(118 202) rotate(58 25 68)">
        <rect x="0" y="40" width="50" height="56" rx="6" fill="#f8f2e9" {...INK} />
        <rect x="0" y="56" width="50" height="24" fill={C.dark} />
        <ellipse cx="25" cy="40" rx="25" ry="6" fill="#dbc6b6" {...INK} />
      </g>
      <path className="lg-syrup" pathLength={1} d="M176 230q4 40 3 76" stroke={color} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path className="lg-syrup" pathLength={1} d="M176 230q4 40 3 76" stroke="#dbc6b6" strokeWidth="1.5" fill="none" />
    </g>
  )
  const body = 'M16 18h18v10l8 10v52a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V38l8-10Z'
  return (
    <g transform="translate(98 204)" key={k}><g className="lg-pumping">
      <g className="lg-pumphead">
        <path d="M22 2V-8h60v8" fill="none" stroke={OUT} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 2V-8h60v8" fill="none" stroke={C.dark} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 2h14v8H18Z" fill={C.dark} {...THIN} />
      </g>
      <rect x="15" y="10" width="20" height="8" rx="2" fill={C.steel} {...THIN} />
      <path d={body} fill={color} />
      <path d="M32 30l8 9v51a6 6 0 0 1-6 6h-3Z" fill="#00244c" opacity="0.14" />
      <path d={body} fill="none" {...INK} />
      <rect x="8" y="52" width="34" height="24" rx="3" fill="#ffffff" {...THIN} />
      <circle cx="25" cy="64" r="6" fill={color} {...THIN} />
      <path className="lg-syrup" pathLength={1} d="M82 4q1 50 -1 102" stroke={OUT} strokeWidth="8" strokeLinecap="round" fill="none" />
      <path className="lg-syrup" pathLength={1} d="M82 4q1 50 -1 102" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" />
    </g></g>
  )
}

export function ScoopOver({ k }: { k: number }) {
  return (
    <g transform="translate(236 176)" key={k}>
      <g className="lg-scooping">
        <g transform="translate(-160 -176)">
          <path d="M184 202l30 30" stroke={OUT} strokeWidth="12" strokeLinecap="round" />
          <path d="M184 202l30 30" stroke={C.dark} strokeWidth="7" strokeLinecap="round" />
          <path d="M140 150c-10 10-10 30 4 44l22 10c6 2 12-4 10-10l-10-22c-14-14-34-14-44-4Z" transform="rotate(-8 160 180)" fill={C.steel} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M146 162c-4 8-2 18 6 26" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85" />
          <rect x="170" y="186" width="16" height="12" rx="3" transform="rotate(45 178 192)" fill={C.steelDark} stroke={OUT} strokeWidth="2" />
          {[0, 1, 2].map((i) => <rect key={i} x={150 + i * 9} y={166 + (i % 2) * 6} width="12" height="11" rx="3" fill={C.ice} stroke="#73c3ff" strokeWidth="1.5" />)}
        </g>
      </g>
      {[0, 1, 2].map((i) => <rect key={i} className="lg-icedrop" style={{ animationDelay: `${0.62 + i * 0.07}s` }} x={30 + i * 11} y={34 + (i % 2) * 5} width="13" height="12" rx="3.5" fill={C.ice} stroke="#73c3ff" strokeWidth="1.6" />)}
    </g>
  )
}

/** the pointing hand of the reference, showing the move */
export function Hand({ from, to, kind }: { from: [number, number]; to?: [number, number]; kind: 'tap' | 'drag' | 'hold' }) {
  const [fx, fy] = from
  const [tx, ty] = to ?? from
  return (
    <g className={'lg-hand ' + kind} style={{ ['--fx' as string]: `${fx}px`, ['--fy' as string]: `${fy}px`, ['--tx' as string]: `${tx}px`, ['--ty' as string]: `${ty}px` }} pointerEvents="none">
      <path d="M8 2c3 0 5 2 5 5v14l6-1c3 0 6 2 7 5l3 10c1 6-3 12-9 13H10c-5 0-9-3-11-8L-6 28c-1-3 1-5 4-5 2 0 3 1 4 2l2 3V7c0-3 2-5 4-5Z" fill="#ffffff" stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M13 21v8M19 20v9" stroke={OUT} strokeWidth="1.5" strokeLinecap="round" />
    </g>
  )
}

/** the blender: jar (ice cream balls, milk, flavour, the blended shake) on its motor base */
export function Blender({ x, y, s = 1, tf, balls = 0, milk = 0, dollop, inside, mix = 0, shake = CREAM, level, lid = false, base = true, spin = false }: {
  x?: number; y?: number; s?: number; tf?: string; balls?: number; milk?: number; dollop?: string; inside?: ReactNode; mix?: number; shake?: string; level?: number; lid?: boolean; base?: boolean; spin?: boolean
}) {
  const id = useUid()
  const jar = 'M0 0h84l-8 118H8Z'
  const h = level ?? 50 + 22 * mix // the shake froths up a little as it blends
  return (
    <g transform={tf ?? g(x ?? 0, y ?? 0, s)}>
      <defs><clipPath id={`bl${id}`}><path d={jar} /></clipPath></defs>
      {/* handle */}
      <path d="M80 16h16a8 8 0 0 1 8 8v52a8 8 0 0 1-8 8H74" fill="none" stroke={OUT} strokeWidth="11" strokeLinejoin="round" />
      <path d="M80 16h16a8 8 0 0 1 8 8v52a8 8 0 0 1-8 8H74" fill="none" stroke={C.steel} strokeWidth="6" strokeLinejoin="round" />
      <path d={jar} fill="#eaf6ff" fillOpacity="0.8" />
      <g clipPath={`url(#bl${id})`}>
        {milk > 0 && <rect className="lg-settle" x="-2" y={118 - 50 * milk} width="90" height={50 * milk + 4} fill={C.milk} />}
        {mix < 1 && Array.from({ length: balls }, (_, i) => (
          <g key={i} className="lg-cube" opacity={1 - mix}>
            <circle cx={30 + i * 24} cy={100 - i * 3} r="17" fill={CREAM} {...THIN} />
            <path d={`M${20 + i * 24} ${96 - i * 3}c4-6 10-7 14-4`} stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
          </g>
        ))}
        {inside && mix < 1 && <g opacity={1 - mix}>{inside}</g>}
        {dollop && mix < 1 && <path className="lg-cube" opacity={1 - mix} d="M28 80c0-10 10-14 16-10 6-6 16-2 14 8 4 6-2 12-10 11H36c-8 0-12-4-8-9Z" fill={dollop} {...THIN} />}
        {mix > 0 && <rect x="-2" y={118 - h} width="90" height={h + 4} fill={shake} opacity={Math.min(1, mix * 1.4)} />}
        {mix > 0 && <path d={`M-2 ${118 - h}c14-6 28 6 44 0s30-6 46 0`} stroke="#ffffff" strokeWidth="3" fill="none" opacity={0.6 * mix} />}
        {spin && <g className="mk-swirl"><path d="M42 104c-18-4-22-26-6-34s30 6 22 20-26 8-22-4 16-10 18-2" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.7" /></g>}
        <path d="M58 0h30v120H50Z" fill="#00244c" opacity="0.06" />
      </g>
      {/* blades */}
      <path d="M30 112l12-4 12 4M42 108v6" stroke={OUT} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d={jar} fill="none" {...INK} />
      {[30, 50, 70].map((my) => <path key={my} d={`M6 ${my}h9`} {...THIN} />)}
      <path d="M12 12l6 86" {...SHINE} />
      {lid && <g><rect x="-5" y="-12" width="94" height="14" rx="4" fill={C.dark} {...INK} /><rect x="32" y="-22" width="20" height="11" rx="3" fill={C.caramel} {...THIN} /></g>}
      {base && (
        <g>
          <rect x="-2" y="116" width="88" height="14" rx="3" fill={C.steel} {...INK} />
          <path d="M-12 130h108l-8 56H-4Z" fill={C.dark} {...INK} />
          <path d="M72 132h22l-7 52H66Z" fill="#00244c" opacity="0.25" />
          <circle cx="42" cy="158" r="12" fill={spin ? '#a7641a' : C.caramel} {...THIN} />
          <circle cx="42" cy="158" r="5" fill="#ffffff" opacity="0.8" />
          <circle cx="12" cy="158" r="3.5" fill={spin ? '#73c3ff' : '#8fa9c9'} /><circle cx="72" cy="158" r="3.5" fill={spin ? '#73c3ff' : '#8fa9c9'} />
        </g>
      )}
    </g>
  )
}

/** the ice bin with its scoop (tap the scoop: one scoop over the glass, see ScoopOver) */
export function IceBin({ scooping, busy, full, label, onScoop }: { scooping: boolean; busy: boolean; full: boolean; label: string; onScoop: () => void }) {
  return (
    <g>
      <path d="M26 206h178l-8 138H34Z" fill={C.steelDark} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M26 206h178l-3 18H29Z" fill={C.steel} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M40 228h150l-6 104H46Z" fill="#e8f5ff" stroke={OUT} strokeWidth="2" />
      {Array.from({ length: 15 }, (_, i) => {
        const x = 50 + (i % 5) * 26 + (Math.floor(i / 5) % 2) * 10, y = 240 + Math.floor(i / 5) * 26
        return (
          <g key={i} transform={`rotate(${(i * 29) % 34 - 17} ${x + 10} ${y + 9})`}>
            <rect x={x} y={y} width="21" height="19" rx="5" fill={C.ice} stroke="#73c3ff" strokeWidth="1.8" />
            <path d={`M${x + 4} ${y + 5}h7M${x + 4} ${y + 9}v3`} stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        )
      })}
      <path d="M34 214h40" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
      <g className={'lg-pick' + (scooping ? ' lg-away' : busy ? '' : ' lg-scoop live') + (full ? ' lg-blocked' : '')} role="button" tabIndex={0} aria-label={label} onClick={onScoop} onKeyDown={(e) => e.key === 'Enter' && onScoop()}>
        <path d="M184 202l30 30" stroke={OUT} strokeWidth="12" strokeLinecap="round" />
        <path d="M184 202l30 30" stroke={C.dark} strokeWidth="7" strokeLinecap="round" />
        <path d="M140 150c-10 10-10 30 4 44l22 10c6 2 12-4 10-10l-10-22c-14-14-34-14-44-4Z" transform="rotate(-8 160 180)" fill={C.steel} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
        <path d="M146 162c-4 8-2 18 6 26" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85" />
        <rect x="170" y="186" width="16" height="12" rx="3" transform="rotate(45 178 192)" fill={C.steelDark} stroke={OUT} strokeWidth="2" />
      </g>
    </g>
  )
}

/* ---------- the game frame ---------- */

/** step dots, the hint, the scene (360 × 420, on the backdrop) and the action row under it */
export function GameFrame({ step, stage, stages, tip, scene, hand, actions, svgRef }: {
  step: string; stage: number; stages: number; tip: string; scene: ReactNode; hand?: ReactNode; actions: ReactNode; svgRef?: RefObject<SVGSVGElement>
}) {
  return (
    <div className="lg" data-step={step}>
      <ol className="lg-dots" aria-label={`${stage + 1} / ${stages}`}>
        {Array.from({ length: stages }, (_, i) => <li key={i} className={i < stage ? 'done' : i === stage ? 'now' : ''} />)}
      </ol>
      <Tip text={tip} />
      <div className="lg-stage">
        <svg ref={svgRef} viewBox="0 0 360 420" className="lg-scene" aria-hidden={step === 'serve'}>
          <Backdrop />
          {scene}
          {hand}
        </svg>
      </div>
      <div className="lg-actions">{actions}</div>
    </div>
  )
}

/** the ice step's buttons: how much ice, Undo, Done / No ice */
export function IceBar({ ice, busy, onUndo, onDone }: { ice: number; busy: boolean; onUndo: () => void; onDone: () => void }) {
  const { t } = useLang()
  return (
    <div className="lg-pumpbar">
      <p className="lg-pumpcount" aria-live="polite"><b>{t(ICE_KEYS[ice])}</b><small>{ice} / 3</small></p>
      <div className="lg-pumpbtns">
        {ice > 0 && <button type="button" className="pill outline small" onClick={onUndo} disabled={busy}>{t('lgUndo')}</button>}
        <button type="button" className={'pill ' + (ice ? 'solid' : 'outline')} onClick={onDone} disabled={busy}>{ice ? t('lgDone') : t('lgIceNone')}</button>
      </div>
    </div>
  )
}

/** the finished drink: the real menu item, the choices, the size and the price; Add to order goes on to checkout */
export function ServePanel({ item, opts, size, setSize, price, onDone, onAgain }: {
  item: MenuItem; opts: string[]; size: number; setSize: (i: number) => void; price: number; onDone: () => void; onAgain: () => void
}) {
  const { t } = useLang()
  const { add } = useCart()
  const order = () => {
    add({ name: item.name, size: item.sizes?.[size], price, opts: opts.length ? opts : undefined }, 1)
    onDone()
    openCheckout()
  }
  return (
    <div className="lg-serve">
      <h3>{item.name}</h3>
      {opts.length > 0 && <p className="lg-opts">{opts.join(' · ')}</p>}
      {item.sizes && (
        <div className="lg-sizes" role="group" aria-label={t('lgSize')}>
          {item.sizes.map((sz, i) => <button key={sz} type="button" aria-pressed={size === i} onClick={() => setSize(i)}>{sz}</button>)}
        </div>
      )}
      <p className="lg-price" dir="ltr">{iqd(price)} IQD</p>
      <div className="lg-serve-actions">
        <button type="button" className="pill solid" onClick={order}>{t('lgAdd')}</button>
        <button type="button" className="pill outline small" onClick={onAgain}>{t('lgAgain')}</button>
      </div>
    </div>
  )
}
