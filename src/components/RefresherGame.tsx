import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useLang } from '../i18n'
import type { TKey } from '../i18n'
import { Bottle, C, GameFrame, Hand, ICE_KEYS, IceBar, IceBin, INK, OUT, PumpOver, ScoopOver, ServePanel, SHINE, THIN, findItem, g, priceAt, useHold, useUid } from './BaristaKit'

/*
 * Build Your Drink → Refreshers (owner, 2026-09-30: "refreshers?"), the same barista mini-game style. Two paths, the
 * menu's refreshers:
 *   iced tea → hold to steep the tea bag → one pump of Peach or Mango → ice scoops → hold to pour the tea over
 *              → Iced Peach Tea / Iced Mango Tea (12 / 16oz)
 *   fresh juice → tap three orange halves onto the juicer → pomegranate or just orange → ice scoops
 *              → Fresh Orange Juice (one size) / Orange Pomegranate Fresh Juice (12 / 16oz)
 * Energy + is not in the game (its recipe is not known yet).
 */
type Base = 'tea' | 'juice'
type Tea = 'peach' | 'mango'
type Step = 'base' | 'steep' | 'flavor' | 'squeeze' | 'pom' | 'ice' | 'pour' | 'serve'
const PATH: Record<Base, Step[]> = { tea: ['base', 'steep', 'flavor', 'ice', 'pour', 'serve'], juice: ['base', 'squeeze', 'pom', 'ice', 'serve'] }
const TEA_ITEM: Record<Tea, string> = { peach: 'Iced Peach Tea', mango: 'Iced Mango Tea' }
const SYRUP: Record<Tea, string> = { peach: '#f5a06b', mango: '#f6b23c' }
const TEA_KEY: Record<Tea, TKey> = { peach: 'rfPeach', mango: 'smMango' }
const TEA = '#c47a2c', JUICE = '#f7a21b', POM = '#b3203f', ORANGE = '#f39a1e', PITH = '#ffc766'
const HALVES = 3

/** the tall glass: pomegranate at the bottom, juice / tea (tinted by the syrup), ice, the blue straw */
function Glass({ x, y, s = 1, syrup, pom = 0, juice = 0, tea = 0, ice = 0, straw = false }: { x: number; y: number; s?: number; syrup?: string; pom?: number; juice?: number; tea?: number; ice?: number; straw?: boolean }) {
  const id = useUid()
  const body = 'M0 0h56l-4 92a6 6 0 0 1-6 5H10a6 6 0 0 1-6-5Z'
  const bot = 97, h = 90
  const pomH = h * 0.28 * pom
  const juiceTop = bot - pomH - h * (pom ? 0.66 : 0.92) * juice
  const syH = syrup ? 10 : 0
  const teaTop = bot - syH - (h * 0.92 - syH) * tea
  return (
    <g transform={g(x, y, s)}>
      <defs><clipPath id={`rg${id}`}><path d={body} /></clipPath></defs>
      {straw && <><path d="M40 -36 32 86" stroke={OUT} strokeWidth="9" strokeLinecap="round" /><path d="M40 -36 32 86" stroke="#397dc9" strokeWidth="5" strokeLinecap="round" /></>}
      <path d={body} fill="#eaf6ff" fillOpacity="0.8" />
      <g clipPath={`url(#rg${id})`}>
        {syrup && <path className="lg-settle" d={`M-2 ${bot - syH}c10-3 20 3 30 0s18-3 30 0V${bot + 4}H-2Z`} fill={syrup} />}
        {tea > 0 && <rect x="-2" y={teaTop} width="62" height={bot - syH - teaTop + 2} fill={TEA} opacity="0.85" />}
        {tea > 0 && syrup && <rect x="-2" y={teaTop} width="62" height={bot - syH - teaTop + 2} fill={syrup} opacity="0.3" />}
        {pom > 0 && <rect className="lg-settle" x="-2" y={bot - pomH} width="62" height={pomH + 4} fill={POM} />}
        {juice > 0 && <rect x="-2" y={juiceTop} width="62" height={bot - pomH - juiceTop + 1} fill={JUICE} />}
        {juice > 0 && pom > 0 && <rect x="-2" y={bot - pomH - 6} width="62" height="8" fill={POM} opacity="0.4" />}
        {juice > 0 && Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${8 + ((i * 19) % 42)} ${bot - 8 - ((i * 23) % 70)}h3`} stroke="#ffd98a" strokeWidth="1.6" strokeLinecap="round" opacity={bot - 8 - ((i * 23) % 70) > juiceTop + 2 ? 0.9 : 0} />)}
        {Array.from({ length: ice * 3 }, (_, i) => {
          const cx = 6 + (i % 3) * 15, cy = 16 + Math.floor(i / 3) * 16 + (i % 2) * 5
          return (
            <g key={i} className="lg-cube" transform={`rotate(${(i * 23) % 30 - 12} ${cx + 7} ${cy + 6})`}>
              <rect x={cx} y={cy} width="15" height="14" rx="3.5" fill={C.ice} fillOpacity="0.8" stroke="#73c3ff" strokeWidth="1.6" />
              <path d={`M${cx + 3} ${cy + 3}h5`} stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </g>
          )
        })}
        <path d="M40 0h22v100H36Z" fill="#00244c" opacity="0.06" />
      </g>
      <path d={body} fill="none" {...INK} />
      <ellipse cx="28" cy="0" rx="28" ry="4" fill="none" {...THIN} />
      <path d="M8 10l3 66" {...SHINE} />
    </g>
  )
}

/** the glass jug the tea steeps in */
function Jug({ steep = 0, tea = 1, bag = true }: { steep?: number; tea?: number; bag?: boolean }) {
  const id = useUid()
  const body = 'M8 10h66l-4 86a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8Z'
  return (
    <g>
      <defs><clipPath id={`jg${id}`}><path d={body} /></clipPath></defs>
      <path d="M72 24h10a10 10 0 0 1 10 10v36a10 10 0 0 1-10 10H70" fill="none" stroke={OUT} strokeWidth="10" strokeLinejoin="round" />
      <path d="M72 24h10a10 10 0 0 1 10 10v36a10 10 0 0 1-10 10H70" fill="none" stroke="#eaf6ff" strokeWidth="5" strokeLinejoin="round" />
      <path d={body} fill="#eaf6ff" fillOpacity="0.85" />
      <g clipPath={`url(#jg${id})`}>
        <rect x="0" y={104 - 80 * tea} width="90" height={80 * tea + 4} fill="#e3f3ff" />
        <rect x="0" y={104 - 80 * tea} width="90" height={80 * tea + 4} fill={TEA} opacity={0.9 * steep} />
        {bag && steep > 0 && steep < 1 && <g className="lg-steam">{[0, 1, 2].map((i) => <path key={i} d={`M${34 + i * 8} 70c-4 8 4 12 0 20`} stroke={TEA} strokeWidth="3" fill="none" strokeLinecap="round" />)}</g>}
        <path d="M54 10h26v100H50Z" fill="#00244c" opacity="0.06" />
      </g>
      <path d={body} fill="none" {...INK} />
      <path d="M8 10-4 2" stroke={OUT} strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="41" cy="10" rx="33" ry="4" fill="none" {...THIN} />
      <path d="M18 22l4 66" {...SHINE} />
      {bag && (
        <g>
          <path d="M44 -26v84" stroke={OUT} strokeWidth="1.5" />
          <rect x="34" y="-40" width="20" height="16" rx="2" fill={C.caramel} {...THIN} />
          <path d="M34 56h20v22a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4Z" fill="#dbc6b6" {...THIN} />
        </g>
      )}
    </g>
  )
}

/** an orange half, cut face up (on the board) */
function HalfTop({ x, y }: { x: number; y: number }) {
  return (
    <g transform={g(x, y)}>
      <ellipse cx="0" cy="0" rx="22" ry="12" fill={ORANGE} {...INK} />
      <ellipse cx="0" cy="-1" rx="17" ry="8.5" fill={PITH} />
      {[0, 60, 120].map((a) => <path key={a} d="M-15 -1h30" stroke={ORANGE} strokeWidth="1.2" transform={`rotate(${a} 0 -1) scale(1 0.5)`} />)}
    </g>
  )
}

/** the juicer: a ridged cone on a dish over the glass; the half comes down and twists */
function Juicer() {
  return (
    <g>
      <path d="M-44 0h88l-8 12H-36Z" fill="#eaf6ff" {...INK} />
      <path d="M-20 0c4-34 16-40 20-40s16 6 20 40Z" fill="#ffffff" {...INK} />
      {[-10, 0, 10].map((rx) => <path key={rx} d={`M${rx * 0.4} -38 ${rx * 1.6} -2`} stroke={C.steelDark} strokeWidth="1.5" />)}
      <path d="M-36 12h72" {...THIN} />
    </g>
  )
}
function PressOver({ color, k }: { color: string; k: number }) {
  return (
    <g key={k}>
      <g transform="translate(245 200)"><g className="rf-press">
        <path d="M-24 0a24 20 0 0 1 48 0Z" fill={color} {...INK} />
        <path d="M-24 0h48" stroke={color === POM ? '#f2c5cf' : PITH} strokeWidth="4" />
        <path d="M-12 -12a14 12 0 0 1 8-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7" />
      </g></g>
      {[0, 1, 2].map((i) => <circle key={i} className="mk-drop" style={{ ['--dy' as string]: '40px', animationDelay: `${0.7 + i * 0.12}s` }} cx={240 + i * 5} cy={272} r="3" fill={color === POM ? POM : JUICE} />)}
    </g>
  )
}


export function RefresherGame({ onDone }: { onDone: () => void }) {
  const { t } = useLang()
  const [step, setStep] = useState<Step>('base')
  const [base, setBase] = useState<Base>('tea')
  const [steep, setSteep] = useState(0)
  const [flavor, setFlavor] = useState<Tea | null>(null)
  const [pumping, setPumping] = useState<{ f: Tea; k: number } | null>(null)
  const [halves, setHalves] = useState(0)
  const [pressing, setPressing] = useState<{ k: number; pom: boolean } | null>(null)
  const [pom, setPom] = useState(false)
  const [ice, setIce] = useState(0)
  const [scooping, setScooping] = useState<number | null>(null)
  const [pour, setPour] = useState(0)
  const [size, setSize] = useState(0)
  const [note, setNote] = useState<TKey | null>(null)
  const [busy, setBusy] = useState(false)
  const go = (s: Step, ms = 350) => { setBusy(true); setTimeout(() => { setBusy(false); setNote(null); setStep(s) }, ms) }
  const path = PATH[base]
  const next = () => path[path.indexOf(step) + 1]

  const pickBase = (b: Base) => { if (busy) return; setBase(b); go(b === 'tea' ? 'steep' : 'squeeze', 400) }
  // tea: hold to steep, one syrup pump
  const steepHold = useHold(2200, useCallback((d: number) => setSteep((v) => { const n = Math.min(1, v + d); if (n >= 1 && v < 1) go('flavor', 600); return n }), []), step === 'steep') // eslint-disable-line react-hooks/exhaustive-deps
  const pump = (f: Tea) => {
    if (busy || flavor) return
    setBusy(true); setPumping({ f, k: Date.now() })
    setTimeout(() => setFlavor(f), 850)
    setTimeout(() => { setPumping(null); go('ice', 300) }, 1350)
  }
  // juice: three orange halves on the juicer, then pomegranate or not
  const press = (isPom: boolean) => {
    if (busy) return
    if (!isPom && halves >= HALVES) return
    setBusy(true); setPressing({ k: Date.now(), pom: isPom })
    setTimeout(() => { if (isPom) setPom(true); else setHalves((n) => n + 1) }, 1000)
    setTimeout(() => { setPressing(null); if (isPom) go('ice', 400); else if (halves + 1 >= HALVES) go('pom', 400); else setBusy(false) }, 1400)
  }
  // ice scoops
  const scoop = () => {
    if (busy) return
    if (ice >= 3) { setNote('lgIceMax'); return }
    setNote(null); setBusy(true); setScooping(Date.now())
    setTimeout(() => setIce((n) => n + 1), 780)
    setTimeout(() => { setScooping(null); setBusy(false) }, 1200)
  }
  // tea: hold to pour over the ice
  const pourHold = useHold(2000, useCallback((d: number) => setPour((v) => { const n = Math.min(1, v + d); if (n >= 1 && v < 1) go('serve', 500); return n }), []), step === 'pour') // eslint-disable-line react-hooks/exhaustive-deps

  const itemName = base === 'tea' ? (flavor ? TEA_ITEM[flavor] : '') : pom ? 'Orange Pomegranate Fresh Juice' : 'Fresh Orange Juice'
  const item = findItem(itemName)
  const total = item ? priceAt(item, size) : 0
  const opts = [ice !== 2 ? t(ICE_KEYS[ice]) : ''].filter(Boolean)
  const again = () => { setStep('base'); setSteep(0); setFlavor(null); setHalves(0); setPom(false); setIce(0); setPour(0); setSize(0); setNote(null) }
  const glass = (x: number, y: number, s = 1) => (
    <Glass x={x} y={y} s={s} syrup={flavor ? SYRUP[flavor] : undefined} pom={pom ? 1 : 0} juice={halves / HALVES} tea={pour} ice={ice} straw={step === 'serve'} />
  )

  const tip: Record<Step, TKey> = { base: 'rfBase', steep: 'rfSteep', flavor: 'rfFlavor', squeeze: 'rfSqueeze', pom: 'rfPom', ice: 'lgIce', pour: 'rfPour', serve: 'rfServe' }
  let scene: ReactNode = null
  let hand: ReactNode = null
  if (step === 'base') {
    scene = (
      <g>
        <g transform="translate(22 150)">
          <g className="lg-pick" role="button" tabIndex={0} aria-label={t('rfTea')} onClick={() => pickBase('tea')} onKeyDown={(e) => e.key === 'Enter' && pickBase('tea')}>
            <rect x="0" y="0" width="150" height="200" rx="20" fill="#ffffff" {...INK} />
            <g transform="translate(34 58) scale(0.9)"><Jug steep={1} /></g>
            <text x="75" y="186" textAnchor="middle" className="lg-label">{t('rfTea')}</text>
          </g>
        </g>
        <g transform="translate(188 150)">
          <g className="lg-pick" role="button" tabIndex={0} aria-label={t('rfJuice')} onClick={() => pickBase('juice')} onKeyDown={(e) => e.key === 'Enter' && pickBase('juice')}>
            <rect x="0" y="0" width="150" height="200" rx="20" fill="#ffffff" {...INK} />
            <g transform="translate(22 30) scale(0.9)"><Glass x={30} y={40} juice={1} /></g>
            <circle cx="112" cy="130" r="18" fill={ORANGE} {...INK} /><HalfTop x={44} y={146} />
            <text x="75" y="186" textAnchor="middle" className="lg-label">{t('rfJuice')}</text>
          </g>
        </g>
      </g>
    )
    hand = busy ? null : <Hand from={[96, 250]} kind="tap" />
  } else if (step === 'steep') {
    scene = <g><g transform="translate(96 150) scale(1.9)"><Jug steep={steep} /></g></g>
  } else if (step === 'flavor') {
    const FL: Tea[] = ['peach', 'mango']
    scene = (
      <g>
        <rect x="24" y="210" width="312" height="12" rx="4" fill="#dbc6b6" {...INK} />
        {FL.map((f, i) => (
          <g key={f} className={'lg-pick' + (pumping?.f === f ? ' lg-away' : pumping ? ' lg-blocked' : '')} role="button" tabIndex={0} aria-label={t(TEA_KEY[f])} onClick={() => pump(f)} onKeyDown={(e) => e.key === 'Enter' && pump(f)}>
            <Bottle x={i ? 262 : 48} y={114} color={SYRUP[f]} label={t(TEA_KEY[f])} />
          </g>
        ))}
        {glass(151, 296)}
        {pumping && <PumpOver color={SYRUP[pumping.f]} tin={false} k={pumping.k} />}
      </g>
    )
    hand = busy ? null : <Hand from={[76, 170]} kind="tap" />
  } else if (step === 'squeeze' || step === 'pom') {
    const left = HALVES - halves - (pressing && !pressing.pom ? 1 : 0)
    scene = (
      <g>
        <rect x="14" y="300" width="160" height="18" rx="8" fill={C.wood} {...INK} />
        <rect x="14" y="288" width="160" height="18" rx="8" fill="#dbc6b6" {...INK} />
        {step === 'squeeze' && Array.from({ length: Math.max(0, left) }, (_, i) => (
          <g key={i} transform={`translate(${46 + i * 48} 282)`}>
            <g className="lg-pick" role="button" tabIndex={0} aria-label={t('smOrange')} onClick={() => press(false)} onKeyDown={(e) => e.key === 'Enter' && press(false)}><HalfTop x={0} y={0} /></g>
          </g>
        ))}
        {step === 'pom' && !pressing && (
          <g transform="translate(94 246)">
            <g className="lg-pick" role="button" tabIndex={0} aria-label={t('mjPomegranate')} onClick={() => press(true)} onKeyDown={(e) => e.key === 'Enter' && press(true)}>
              <circle r="26" fill={POM} {...INK} />
              <path d="M-8 -24l3-8 5 5 5-5 3 8Z" fill={POM} {...THIN} />
              <path d="M-14 -10a16 16 0 0 1 8-8" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.6" />
              <text x="0" y="-42" textAnchor="middle" className="lg-label">{t('mjPomegranate')}</text>
            </g>
          </g>
        )}
        {glass(217, 262, 1.1)}
        <g transform="translate(245 256)"><Juicer /></g>
        {pressing && <PressOver color={pressing.pom ? POM : ORANGE} k={pressing.k} />}
      </g>
    )
    hand = busy ? null : step === 'squeeze' ? (halves ? null : <Hand from={[46, 280]} kind="tap" />) : <Hand from={[94, 250]} kind="tap" />
  } else if (step === 'ice') {
    scene = (
      <g>
        <IceBin scooping={scooping !== null} busy={busy} full={ice >= 3} label={t('lgIce').replace(/\*/g, '')} onScoop={scoop} />
        {glass(248, 262, 1.1)}
        {scooping !== null && <ScoopOver k={scooping} />}
      </g>
    )
    hand = busy || ice > 0 ? null : <Hand from={[176, 196]} kind="tap" />
  } else if (step === 'pour') {
    const pouring = pour > 0 && pour < 1
    scene = (
      <g>
        {glass(110, 206, 1.8)}
        <g transform={pouring ? 'translate(250 70) rotate(-62 40 50) scale(0.95)' : 'translate(232 60) rotate(-10 40 50) scale(0.95)'}><Jug steep={1} tea={1 - pour * 0.8} bag={false} /></g>
        {pouring && <path className="lg-stream" d="M206 136q-24 50 -44 130" stroke={TEA} strokeWidth="8" strokeLinecap="round" fill="none" opacity="0.9" />}
      </g>
    )
  } else if (step === 'serve') {
    scene = <g>{glass(120, 140, 2.2)}</g>
  }

  const stage = path.indexOf(step)
  return (
    <GameFrame step={step} stage={stage} stages={path.length} tip={note ? t(note) : t(tip[step])} scene={scene} hand={hand} actions={<>
        {step === 'steep' && <button type="button" className="lg-hold" {...steepHold} disabled={busy}>{t('lgHold')}</button>}
        {step === 'pom' && <button type="button" className="pill outline" onClick={() => go('ice', 300)} disabled={busy}>{t('rfJustOrange')}</button>}
        {step === 'ice' && <IceBar ice={ice} busy={busy} onUndo={() => { setIce((n) => n - 1); setNote(null) }} onDone={() => go(next(), 300)} />}
        {step === 'pour' && <button type="button" className="lg-hold" {...pourHold} disabled={busy}>{t('lgHold')}</button>}
        {step === 'serve' && item && <ServePanel item={item} opts={opts} size={size} setSize={setSize} price={total} onDone={onDone} onAgain={again} />}
    </>} />
  )
}
