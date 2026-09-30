import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useLang } from '../i18n'
import type { TKey } from '../i18n'
import { Blender, C, Carton, CREAM, EXTRA, GameFrame, Hand, INK, OUT, ServePanel, SHINE, THIN, findItem, g, priceAt, useHold, useUid } from './BaristaKit'

/*
 * Build Your Drink → Milkshake (owner, 2026-09-30: "lets do the milkshake"), the same barista mini-game style as the
 * Latte and the Mojito: two scoops of ice cream into the blender → the milk pours once → pick the flavour (the six menu
 * milkshakes) → hold to blend → drizzle the flavour's sauce down the cup (the menu's "drizzle down the cup") → hold to
 * pour → topping → the result, ordered as the REAL menu milkshake at its size price; whipped cream +2,000 (the menu's
 * "Whipped Cream" extra). The toppings (the flavour's crumbs) are free.
 */
type Flavor = 'lotus' | 'pistachio' | 'oreo' | 'nutella' | 'strawberry' | 'rashi'
type Step = 'scoop' | 'milk' | 'flavor' | 'blend' | 'drizzle' | 'pour' | 'top' | 'serve'
type Top = 'none' | 'whip' | 'crumbs' | 'both'
const STAGE: Record<Step, number> = { scoop: 0, milk: 1, flavor: 2, blend: 3, drizzle: 4, pour: 5, top: 6, serve: 7 }
const STAGES = 8
const FLAVORS: Flavor[] = ['lotus', 'pistachio', 'oreo', 'nutella', 'strawberry', 'rashi']
const ITEM: Record<Flavor, string> = { lotus: 'Lotus Milkshake', pistachio: 'Pistachio Milkshake', oreo: 'Oreo Milkshake', nutella: 'Nutella Milkshake', strawberry: 'Strawberry Milkshake', rashi: 'Rashi Milkshake' }
const KEY: Record<Flavor, TKey> = { lotus: 'mkLotus', pistachio: 'mkPistachio', oreo: 'mkOreo', nutella: 'mkNutella', strawberry: 'mjStrawberry', rashi: 'mkRashi' }
const TOP_KEY: Record<Flavor, TKey> = { lotus: 'mkTopLotus', pistachio: 'mkTopPistachio', oreo: 'mkTopOreo', nutella: 'mkTopNutella', strawberry: 'mkTopStrawberry', rashi: 'mkTopRashi' }
/** what is in the jar, the blended shake, the sauce down the cup, the crumbs on top */
const JAR: Record<Flavor, string> = { lotus: '#c98a45', pistachio: '#8fbf5a', oreo: '#2f2622', nutella: '#6b3f18', strawberry: '#e0475b', rashi: '#d7b98a' }
const SHAKE: Record<Flavor, string> = { lotus: '#e8c79c', pistachio: '#d3e4ab', oreo: '#dcd5ce', nutella: '#bf9270', strawberry: '#f6b8c4', rashi: '#eadabd' }
const SAUCE: Record<Flavor, string> = { lotus: '#a8652a', pistachio: '#6f9e3e', oreo: '#3a2a22', nutella: '#5a3314', strawberry: '#d93a50', rashi: '#7a4a22' }
const CRUMB: Record<Flavor, string> = { lotus: '#b5773a', pistachio: '#7fae4e', oreo: '#2b2320', nutella: '#8a5a2b', strawberry: '#e0475b', rashi: '#f3e6c8' }


/** the ice cream tub: vanilla, open, with scoop marks */
function Tub({ x, y }: { x: number; y: number }) {
  return (
    <g transform={g(x, y)}>
      <path d="M0 22h112l-10 84a8 8 0 0 1-8 7H18a8 8 0 0 1-8-7Z" fill="#ffffff" {...INK} />
      <path d="M86 24h24l-10 82a8 8 0 0 1-8 7h-9Z" fill="#00244c" opacity="0.07" />
      <rect x="4" y="50" width="104" height="26" fill={C.body} {...THIN} />
      <path d="M22 63c6-6 12-6 18 0s12 6 18 0 12-6 18 0 12 6 18 0" stroke="#ffffff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="56" cy="22" rx="56" ry="9" fill={CREAM} {...INK} />
      <path d="M22 22c6-5 14-5 20 0M60 20c6-5 14-5 20 0" stroke="#e5cdb5" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M10 32l6 64" {...SHINE} />
    </g>
  )
}

/** the ice cream scoop, resting in the tub or flying to the blender */
function ScoopTool() {
  return (
    <g>
      <path d="M40 30 82 4" stroke={OUT} strokeWidth="12" strokeLinecap="round" />
      <path d="M40 30 82 4" stroke={C.dark} strokeWidth="7" strokeLinecap="round" />
      <path d="M12 26a16 16 0 0 0 32 0Z" fill={C.steel} {...INK} />
      <circle cx="28" cy="22" r="14" fill={CREAM} {...THIN} />
      <path d="M20 18c3-4 8-5 11-3" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </g>
  )
}
function ScoopOver({ k }: { k: number }) {
  return (
    <g key={k}>
      <g transform="translate(150 150)"><g className="mk-scooping"><ScoopTool /></g></g>
      <circle className="mk-drop" style={{ ['--dy' as string]: '112px' }} cx="178" cy="178" r="14" fill={CREAM} {...THIN} />
    </g>
  )
}

/** a jar of spread / cookies / sauce on the shelf */
function Jar({ x, y, f, label, row }: { x: number; y: number; f: Flavor; label: string; row: number }) {
  const body = 'M6 14h34v5l6 8v45a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V27l6-8Z'
  return (
    <g transform={g(x, y)}>
      <path d={body} fill="#eaf6ff" />
      <path d="M2 34h42v38a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z" fill={JAR[f]} />
      {f === 'oreo' && [40, 52, 64].map((cy) => <g key={cy}><rect x="6" y={cy} width="34" height="9" rx="4" fill="#2f2622" /><path d={`M8 ${cy + 4.5}h30`} stroke="#ffffff" strokeWidth="2.5" /></g>)}
      {f === 'strawberry' && [[12, 44], [26, 50], [36, 42], [16, 62], [32, 64]].map(([sx, sy], i) => <ellipse key={i} cx={sx} cy={sy} rx="1.4" ry="2.2" fill="#fbe38e" />)}
      {f === 'pistachio' && [[12, 46], [28, 44], [20, 60], [34, 62]].map(([sx, sy], i) => <ellipse key={i} cx={sx} cy={sy} rx="5" ry="3.2" fill="#b7d98a" stroke="#5f8f33" strokeWidth="1" />)}
      {(f === 'lotus' || f === 'nutella' || f === 'rashi') && <path d="M4 38c8-5 14 3 20-1s12-4 18 1" stroke="#ffffff" strokeWidth="2.5" fill="none" opacity="0.45" />}
      <path d="M34 22l8 9v42a6 6 0 0 1-6 6h-3Z" fill="#00244c" opacity="0.1" />
      <path d={body} fill="none" {...INK} />
      <rect x="4" y="2" width="38" height="13" rx="3" fill={C.dark} {...THIN} />
      <path d="M9 7h14" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M8 30v36" {...SHINE} />
      <text x="23" y={row ? 112 : 98} textAnchor="middle" className="lg-label small">{label}</text>
    </g>
  )
}
/** the spoon brings a dollop of the flavour over the blender */
function SpoonOver({ color, k }: { color: string; k: number }) {
  return (
    <g key={k}>
      <g transform="translate(150 206)"><g className="mk-spooning">
        <path d="M38 22 88 -12" stroke={OUT} strokeWidth="9" strokeLinecap="round" />
        <path d="M38 22 88 -12" stroke={C.steel} strokeWidth="5" strokeLinecap="round" />
        <ellipse cx="28" cy="28" rx="16" ry="10" fill={C.steel} {...INK} />
        <path d="M16 24c2-8 10-10 14-6 6-4 14 0 10 8Z" fill={color} {...THIN} />
      </g></g>
      <circle className="mk-drop" style={{ ['--dy' as string]: '70px', animationDelay: '0.62s' }} cx="180" cy="234" r="9" fill={color} {...THIN} />
    </g>
  )
}

/** the milk carton over the blender: tip, pour */
function CartonOver({ k }: { k: number }) {
  return (
    <g key={k}>
      <g transform="translate(98 110)"><g className="lg-cartoning">
        <path d="M12 -6h40v8H12Z" fill="#ffffff" {...INK} />
        <path d="M0 18 12 2h40l12 16Z" fill="#ffffff" {...INK} />
        <path d="M0 18h64v74a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6Z" fill="#ffffff" {...INK} />
        <rect x="0" y="40" width="64" height="30" fill={C.dark} {...THIN} />
        <path d="M32 46c-5 7-7 10-7 13a7 7 0 0 0 14 0c0-3-2-6-7-13Z" fill="#ffffff" />
      </g></g>
      <path className="lg-milkstream" pathLength={1} d="M178 178q3 46 2 92" stroke={OUT} strokeWidth="9" strokeLinecap="round" fill="none" />
      <path className="lg-milkstream" pathLength={1} d="M178 178q3 46 2 92" stroke={C.milk} strokeWidth="6" strokeLinecap="round" fill="none" />
    </g>
  )
}

/** the squeeze bottle of the flavour's sauce */
function Squeeze({ color, label }: { color: string; label?: string }) {
  return (
    <g>
      <path d="M16 0h12l6 22H10Z" fill="#ffffff" {...INK} />
      <path d="M20 -12h4v12h-4Z" fill={OUT} />
      <rect x="4" y="22" width="36" height="78" rx="8" fill={color} {...INK} />
      <path d="M32 26h6v70a6 6 0 0 1-6 4Z" fill="#00244c" opacity="0.15" />
      <rect x="4" y="46" width="36" height="24" fill="#ffffff" {...THIN} />
      <path d="M12 58c4-5 8-5 10 0s8 5 10 0" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M10 30v62" {...SHINE} />
      {label && <text x="22" y="124" textAnchor="middle" className="lg-label small">{label}</text>}
    </g>
  )
}

/** the clear plastic cup: sauce down the walls, the shake, whipped cream, crumbs, the blue straw */
function ShakeCup({ x, y, s = 1, f, drizzle = false, drawing = false, fill = 0, whip = false, crumbs = false, straw = false }: {
  x: number; y: number; s?: number; f?: Flavor; drizzle?: boolean; drawing?: boolean; fill?: number; whip?: boolean; crumbs?: boolean; straw?: boolean
}) {
  const id = useUid()
  const body = 'M0 0h70l-7 104a7 7 0 0 1-7 6H14a7 7 0 0 1-7-6Z'
  const sauce = f ? SAUCE[f] : OUT
  const lines = ['M8 5c8 10-4 22 4 34s-3 24 3 36 -2 18 4 28', 'M62 5c-8 10 4 22-4 34s3 24-3 36 2 18-4 28', 'M22 3c6 8-4 16 2 26s-2 14 2 20', 'M48 3c-6 8 4 16-2 26s2 14-2 20', 'M35 2v16']
  const topY = whip ? -12 : fill > 0.95 ? 2 : 110 - 104 * fill
  return (
    <g transform={g(x, y, s)}>
      <defs><clipPath id={`sc${id}`}><path d={body} /></clipPath></defs>
      {straw && <><path d="M48 -48 40 96" stroke={OUT} strokeWidth="9" strokeLinecap="round" /><path d="M48 -48 40 96" stroke="#397dc9" strokeWidth="5" strokeLinecap="round" /></>}
      <path d={body} fill="#eaf6ff" fillOpacity="0.8" />
      <g clipPath={`url(#sc${id})`}>
        {fill > 0 && f && <rect x="-2" y={110 - 106 * fill} width="74" height={106 * fill + 4} fill={SHAKE[f]} />}
        {fill > 0 && f === 'oreo' && Array.from({ length: 14 }, (_, i) => <circle key={i} cx={8 + ((i * 23) % 56)} cy={104 - ((i * 37) % 96)} r="1.8" fill="#2f2622" opacity={110 - ((i * 37) % 96) - 6 > 110 - 104 * fill ? 0.8 : 0} />)}
        {drizzle && lines.map((d, i) => <path key={i} className={drawing ? 'mk-drizzle' : undefined} style={drawing ? { animationDelay: `${0.35 + i * 0.12}s` } : undefined} pathLength={1} d={d} stroke={sauce} strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.92" />)}
        <path d="M46 0h28v112H40Z" fill="#00244c" opacity="0.06" />
      </g>
      <path d={body} fill="none" {...INK} />
      <ellipse cx="35" cy="0" rx="35" ry="4.5" fill="none" {...THIN} />
      <path d="M9 12l4 76" {...SHINE} />
      {whip && (
        <g className="lg-heart">
          <path d="M3 2c-4-12 6-18 14-14 2-12 18-16 26-8 8-8 24-2 22 10 6 4 4 10 2 12Z" fill="#ffffff" {...INK} />
          <path d="M16 -4c6-4 12-2 16 2M36 -10c6-2 12 2 14 6" stroke="#e5cdb5" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          {drizzle && <path d="M8 -2c8-8 14 2 22-4s14 0 22-6 10 2 12 4" stroke={sauce} strokeWidth="3.5" strokeLinecap="round" fill="none" />}
        </g>
      )}
      {crumbs && f && (
        <g className="lg-heart">
          {[[12, 0], [22, -6], [32, 2], [42, -8], [52, -2], [60, 2], [28, -12], [46, 0], [18, 4], [38, -4]].map(([cx, cy], i) => (
            <path key={i} d={`M${cx} ${topY + cy}l4-3 3 4-4 3Z`} fill={CRUMB[f]} stroke={f === 'rashi' ? '#b59a6a' : OUT} strokeWidth="1" transform={`rotate(${i * 37} ${cx + 2} ${topY + cy})`} />
          ))}
        </g>
      )}
    </g>
  )
}

export function MilkshakeGame({ onDone }: { onDone: () => void }) {
  const { t } = useLang()
  const [step, setStep] = useState<Step>('scoop')
  const [balls, setBalls] = useState(0)
  const [scooping, setScooping] = useState<number | null>(null)
  const [milk, setMilk] = useState(0)
  const [carting, setCarting] = useState<number | null>(null)
  const [flavor, setFlavor] = useState<Flavor | null>(null)
  const [spooning, setSpooning] = useState<{ f: Flavor; k: number } | null>(null)
  const [mix, setMix] = useState(0)
  const [drizzle, setDrizzle] = useState(false)
  const [squeezing, setSqueezing] = useState<number | null>(null)
  const [pour, setPour] = useState(0)
  const [top, setTop] = useState<Top>('none')
  const [size, setSize] = useState(0)
  const [busy, setBusy] = useState(false)
  const go = (s: Step, ms = 350) => { setBusy(true); setTimeout(() => { setBusy(false); setStep(s) }, ms) }

  // 1. two scoops of ice cream
  const scoop = () => {
    if (busy || balls >= 2) return
    setBusy(true); setScooping(Date.now())
    setTimeout(() => setBalls((n) => n + 1), 1050)
    setTimeout(() => { setScooping(null); if (balls + 1 >= 2) go('milk', 500); else setBusy(false) }, 1250)
  }
  // 2. the milk pours once
  const pourMilk = () => {
    if (busy || milk) return
    setBusy(true); setCarting(Date.now())
    setTimeout(() => setMilk(1), 900)
    setTimeout(() => { setCarting(null); go('flavor', 300) }, 1500)
  }
  // 3. one flavour: the six menu milkshakes
  const pick = (f: Flavor) => {
    if (busy || flavor) return
    setBusy(true); setSpooning({ f, k: Date.now() })
    setTimeout(() => setFlavor(f), 1100)
    setTimeout(() => { setSpooning(null); go('blend', 400) }, 1400)
  }
  // 4. hold to blend
  const blendHold = useHold(2400, useCallback((d: number) => setMix((v) => { const n = Math.min(1, v + d); if (n >= 1 && v < 1) go('drizzle', 600); return n }), []), step === 'blend') // eslint-disable-line react-hooks/exhaustive-deps
  // 5. drizzle the sauce down the cup (or not)
  const squeeze = () => {
    if (busy || drizzle) return
    setBusy(true); setSqueezing(Date.now()); setDrizzle(true)
    setTimeout(() => { setSqueezing(null); go('pour', 200) }, 1700)
  }
  // 6. hold to pour
  const pourHold = useHold(2000, useCallback((d: number) => setPour((v) => { const n = Math.min(1, v + d); if (n >= 1 && v < 1) go('top', 500); return n }), []), step === 'pour') // eslint-disable-line react-hooks/exhaustive-deps

  const item = flavor ? findItem(ITEM[flavor]) : undefined
  const whip = top === 'whip' || top === 'both'
  const crumbs = top === 'crumbs' || top === 'both'
  const total = item ? priceAt(item, size) + (whip ? EXTRA.whip : 0) : 0
  const opts = [
    !drizzle ? t('mkNoDrizzle') : '',
    whip ? t('lgOptWhip') : '',
    crumbs && flavor ? t(TOP_KEY[flavor]) : '',
  ].filter(Boolean)
  const again = () => { setStep('scoop'); setBalls(0); setMilk(0); setFlavor(null); setMix(0); setDrizzle(false); setPour(0); setTop('none'); setSize(0) }
  const cup = (x: number, y: number, s: number, extra: { drawing?: boolean; straw?: boolean } = {}) => (
    <ShakeCup x={x} y={y} s={s} f={flavor ?? undefined} drizzle={drizzle} fill={pour} whip={step === 'top' || step === 'serve' ? whip : false} crumbs={step === 'top' || step === 'serve' ? crumbs : false} {...extra} />
  )
  const shake = flavor ? SHAKE[flavor] : CREAM

  const tip: Record<Step, TKey> = { scoop: 'mkScoop', milk: 'mkMilk', flavor: 'mkFlavor', blend: 'mkBlend', drizzle: 'mkDrizzle', pour: 'mkPour', top: 'lgTop', serve: 'mkServe' }
  let scene: ReactNode = null
  let hand: ReactNode = null
  if (step === 'scoop') {
    scene = (
      <g>
        <g className={'lg-pick' + (balls >= 2 ? ' lg-blocked' : '')} role="button" tabIndex={0} aria-label={t('mkIceCream')} onClick={scoop} onKeyDown={(e) => e.key === 'Enter' && scoop()}>
          <Tub x={14} y={262} />
          {!scooping && <g transform="translate(40 232)"><ScoopTool /></g>}
          <text x="70" y="398" textAnchor="middle" className="lg-label">{t('mkIceCream')}</text>
        </g>
        <Blender tf="translate(200 196)" balls={balls} />
        {scooping !== null && <g transform="translate(64 0)"><ScoopOver k={scooping} /></g>}
      </g>
    )
    hand = busy ? null : <Hand from={[70, 296]} kind="tap" />
  } else if (step === 'milk') {
    scene = (
      <g>
        <g className={'lg-pick' + (carting ? ' lg-away' : '')} role="button" tabIndex={0} aria-label={t('mkMilkLabel')} onClick={pourMilk} onKeyDown={(e) => e.key === 'Enter' && pourMilk()}>
          <Carton x={30} y={250} color={C.dark} label={t('mkMilkLabel')} />
        </g>
        <Blender tf="translate(138 196)" balls={balls} milk={milk} />
        {carting !== null && <CartonOver k={carting} />}
      </g>
    )
    hand = busy || milk ? null : <Hand from={[64, 300]} kind="tap" />
  } else if (step === 'flavor') {
    scene = (
      <g>
        <rect x="4" y="196" width="352" height="10" rx="4" fill="#dbc6b6" {...INK} />
        {FLAVORS.map((f, i) => (
          <g key={f} className={'lg-pick' + (spooning && spooning.f !== f ? ' lg-blocked' : '') + (spooning?.f === f ? ' lg-away' : '')} role="button" tabIndex={0} aria-label={t(KEY[f])} onClick={() => pick(f)} onKeyDown={(e) => e.key === 'Enter' && pick(f)}>
            <Jar x={10 + i * 58} y={118} f={f} label={t(KEY[f])} row={i % 2} />
          </g>
        ))}
        <Blender tf="translate(150 262) scale(0.7)" balls={balls} milk={milk} dollop={flavor ? JAR[flavor] : undefined} />
        {spooning && <SpoonOver color={JAR[spooning.f]} k={spooning.k} />}
      </g>
    )
    hand = busy ? null : <Hand from={[30, 160]} kind="tap" />
  } else if (step === 'blend') {
    const spinning = mix > 0 && mix < 1
    scene = (
      <g>
        <g className={spinning ? 'lg-shake' : undefined}>
          <Blender tf="translate(112 106) scale(1.5)" balls={balls} milk={milk} dollop={flavor ? JAR[flavor] : undefined} mix={mix} shake={shake} lid spin={spinning} />
        </g>
      </g>
    )
  } else if (step === 'drizzle') {
    scene = (
      <g>
        {cup(64, 150, 1.9, { drawing: true })}
        {squeezing === null
          ? (
            <g transform="translate(262 196) scale(1.3)"><g className={'lg-pick' + (drizzle ? ' lg-blocked' : '')} role="button" tabIndex={0} aria-label={t('mkSauce')} onClick={squeeze} onKeyDown={(e) => e.key === 'Enter' && squeeze()}>
              {flavor && <Squeeze color={SAUCE[flavor]} label={t('mkSauce')} />}
            </g></g>
          )
          : flavor && <g transform="translate(102 2) scale(1.3)"><g className="lg-pumping"><g transform="rotate(180 22 50)"><Squeeze color={SAUCE[flavor]} /></g></g></g>}
      </g>
    )
    hand = busy || drizzle ? null : <Hand from={[288, 276]} kind="tap" />
  } else if (step === 'pour') {
    const pouring = pour > 0 && pour < 1
    scene = (
      <g>
        {cup(96, 206, 1.6)}
        <Blender tf={pouring ? 'translate(200 150) rotate(-100) scale(0.9)' : 'translate(216 40) rotate(-20) scale(0.9)'} balls={0} mix={1} shake={shake} level={100 * (1 - pour) + 6} base={false} />
        {pouring && <path className="lg-stream" d="M198 154q-10 70 -46 150" stroke={shake} strokeWidth="12" strokeLinecap="round" fill="none" />}
        {pouring && <path d="M198 154q-10 70 -46 150" stroke={OUT} strokeWidth="1.5" fill="none" opacity="0.35" />}
      </g>
    )
  } else if (step === 'top' || step === 'serve') {
    scene = <g>{cup(110, 150, 2.1, { straw: step === 'serve' })}</g>
  }

  return (
    <GameFrame step={step} stage={STAGE[step]} stages={STAGES} tip={t(tip[step])} scene={scene} hand={hand} actions={<>
        {step === 'blend' && <button type="button" className="lg-hold" {...blendHold} disabled={busy}>{t('lgHold')}</button>}
        {step === 'drizzle' && <button type="button" className="pill outline" onClick={() => go('pour', 300)} disabled={busy}>{t('mkNoDrizzle')}</button>}
        {step === 'pour' && <button type="button" className="lg-hold" {...pourHold} disabled={busy}>{t('lgHold')}</button>}
        {step === 'top' && flavor && (
          <>
            <button type="button" className="pill solid" onClick={() => { setTop('both'); go('serve', 700) }}>{t('mkBothTop')}</button>
            <button type="button" className="pill outline" onClick={() => { setTop('whip'); go('serve', 700) }}>{t('lgWhip')}</button>
            <button type="button" className="pill outline" onClick={() => { setTop('crumbs'); go('serve', 700) }}>{t(TOP_KEY[flavor])}</button>
            <button type="button" className="pill outline" onClick={() => { setTop('none'); go('serve', 300) }}>{t('lgNothing')}</button>
          </>
        )}
        {step === 'serve' && item && <ServePanel item={item} opts={opts} size={size} setSize={setSize} price={total} onDone={onDone} onAgain={again} />}
    </>} />
  )
}
