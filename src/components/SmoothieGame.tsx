import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useLang } from '../i18n'
import type { TKey } from '../i18n'
import { Blender, C, GameFrame, Hand, ICE_KEYS, IceBar, IceBin, INK, OUT, ScoopOver, ServePanel, SHINE, THIN, findItem, g, priceAt, useHold, useUid } from './BaristaKit'

/*
 * Build Your Drink → Smoothie (owner, 2026-09-30: "lets do the smoothie"), the same barista mini-game style as the
 * Latte, Mojito and Milkshake: pick the fruit from the bowls (strawberry, passion fruit, or mango + orange: the three
 * menu smoothies) → tap the knife to chop it on the board → ice scoops into the blender (no / light / regular / extra)
 * → hold to blend → hold to pour → fruit on the rim or not → the REAL menu smoothie at its menu price (one size).
 */
type Fruit = 'strawberry' | 'passion' | 'mango' | 'orange'
type Recipe = 'strawberry' | 'passion' | 'mango'
type Step = 'fruit' | 'chop' | 'ice' | 'blend' | 'pour' | 'garnish' | 'serve'
const STAGE: Record<Step, number> = { fruit: 0, chop: 1, ice: 2, blend: 3, pour: 4, garnish: 5, serve: 6 }
const STAGES = 7
const FRUITS: Fruit[] = ['strawberry', 'passion', 'mango', 'orange']
const FRUIT_KEY: Record<Fruit, TKey> = { strawberry: 'mjStrawberry', passion: 'smPassion', mango: 'smMango', orange: 'smOrange' }
const ITEM: Record<Recipe, string> = { strawberry: 'Strawberry Smoothie', passion: 'Passion Fruit Smoothie', mango: 'Mango with Orange Smoothie' }
const SMOOTHIE: Record<Recipe, string> = { strawberry: '#ec6f82', passion: '#f6c342', mango: '#f7a534' }
const RED = '#e0475b', LEAF = '#4caf50', LEAF_DARK = '#2e7d32', PURPLE = '#5b2a5e', PULP = '#f6c342', MANGO = '#f6b23c', ORANGE = '#f39a1e'
const recipeOf = (fs: Fruit[]): Recipe | null => (fs.includes('strawberry') ? 'strawberry' : fs.includes('passion') ? 'passion' : fs.includes('mango') && fs.includes('orange') ? 'mango' : null)

/** a whole fruit, centred on (0, 0), about 44 units across */
function FruitArt({ f, x, y, s = 1 }: { f: Fruit; x: number; y: number; s?: number }) {
  return (
    <g transform={g(x, y, s)}>
      {f === 'strawberry' && (
        <g>
          <path d="M0 20c-14-4-22-16-20-26 2-8 10-10 20-8 10-2 18 0 20 8 2 10-6 22-20 26Z" fill={RED} {...INK} />
          {[[-9, -4], [0, -2], [9, -4], [-5, 6], [5, 6], [0, 13]].map(([sx, sy], i) => <ellipse key={i} cx={sx} cy={sy} rx="1.3" ry="2" fill="#fbe38e" />)}
          <path d="M-12 -13l6 3 6-8 6 8 6-3-4 6h-16Z" fill={LEAF} stroke={OUT} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M-12 -4c1-4 3-6 6-7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7" />
        </g>
      )}
      {f === 'passion' && (
        <g>
          <circle r="20" fill={PURPLE} {...INK} />
          {[[-8, -6], [6, -10], [10, 4], [-4, 10], [-12, 4], [2, 0]].map(([sx, sy], i) => <circle key={i} cx={sx} cy={sy} r="1.6" fill="#8a5a8e" />)}
          <path d="M0 -20v-6" stroke={LEAF_DARK} strokeWidth="3" strokeLinecap="round" />
          <path d="M-12 -8a14 14 0 0 1 8-8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.6" />
        </g>
      )}
      {f === 'mango' && (
        <g transform="rotate(-18)">
          <ellipse rx="25" ry="18" fill={MANGO} {...INK} />
          <ellipse cx="10" cy="-6" rx="11" ry="8" fill={RED} opacity="0.35" />
          <path d="M20 -12c6-6 12-6 14-2-4 4-10 5-14 2Z" fill={LEAF} stroke={OUT} strokeWidth="1.6" />
          <path d="M-16 -6c2-5 6-8 11-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7" />
        </g>
      )}
      {f === 'orange' && (
        <g>
          <circle r="19" fill={ORANGE} {...INK} />
          {[[-8, -4], [6, -8], [8, 6], [-4, 9], [0, -1]].map(([sx, sy], i) => <circle key={i} cx={sx} cy={sy} r="1.2" fill="#d97f0f" />)}
          <path d="M0 -19c2-6 8-8 12-6-2 5-7 7-12 6Z" fill={LEAF} stroke={OUT} strokeWidth="1.6" />
          <path d="M-11 -7a13 13 0 0 1 7-7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7" />
        </g>
      )}
    </g>
  )
}

/** a chopped piece, centred on (0, 0) */
function Piece({ f, x, y, r = 0 }: { f: Fruit; x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      {f === 'strawberry' && <g><path d="M-8 -5h16c3 4 1 10-8 14-9-4-11-10-8-14Z" fill={RED} {...THIN} /><path d="M-4 -3h8c1 3-1 6-4 8-3-2-5-5-4-8Z" fill="#f7a3b0" /></g>}
      {f === 'passion' && <g><circle r="9" fill={PURPLE} {...THIN} /><circle r="6" fill={PULP} /><circle cx="-2" cy="-1" r="1" fill={OUT} /><circle cx="2" cy="2" r="1" fill={OUT} /><circle cx="1" cy="-3" r="1" fill={OUT} /></g>}
      {f === 'mango' && <rect x="-6" y="-6" width="12" height="12" rx="3" fill="#f7b43b" {...THIN} />}
      {f === 'orange' && <g><path d="M-9 3a9 9 0 0 1 18 0Z" fill={ORANGE} {...THIN} /><path d="M-6 2a6 6 0 0 1 12 0Z" fill="#ffc766" /><path d="M0 2v-5M0 2l-4-3M0 2l4-3" stroke={ORANGE} strokeWidth="1" /></g>}
    </g>
  )
}

/** the chopped fruit and the ice inside the blender jar (jar units: 0..84 wide, bottom at 118) */
function inJar(fruits: Fruit[], chopped: boolean, ice: number) {
  if (!chopped) return null
  const pieces = fruits.flatMap((f) => Array.from({ length: fruits.length > 1 ? 5 : 8 }, () => f))
  return (
    <g>
      {pieces.map((f, i) => <g key={i} className="lg-cube"><Piece f={f} x={14 + ((i * 17) % 58)} y={108 - Math.floor(i / 4) * 11} r={(i * 47) % 90} /></g>)}
      {Array.from({ length: ice * 3 }, (_, i) => {
        const cx = 8 + (i % 4) * 17, cy = 72 - Math.floor(i / 4) * 15 - (i % 2) * 4
        return <rect key={`i${i}`} className="lg-cube" x={cx} y={cy} width="15" height="14" rx="3.5" fill={C.ice} fillOpacity="0.9" stroke="#73c3ff" strokeWidth="1.6" transform={`rotate(${(i * 23) % 30 - 12} ${cx + 7} ${cy + 7})`} />
      })}
    </g>
  )
}

/** the tall smoothie glass: the smoothie, fruit on the rim, the blue straw */
function SmoothieGlass({ x, y, s = 1, r, fill = 0, garnish = false, straw = false }: { x: number; y: number; s?: number; r: Recipe | null; fill?: number; garnish?: boolean; straw?: boolean }) {
  const id = useUid()
  const body = 'M2 0h60c-2 22-8 34-8 54s6 30 4 46a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8c-2-16 4-26 4-46S4 22 2 0Z'
  return (
    <g transform={g(x, y, s)}>
      <defs><clipPath id={`sg${id}`}><path d={body} /></clipPath></defs>
      {straw && <><path d="M44 -46 38 96" stroke={OUT} strokeWidth="9" strokeLinecap="round" /><path d="M44 -46 38 96" stroke="#397dc9" strokeWidth="5" strokeLinecap="round" /></>}
      <path d={body} fill="#eaf6ff" fillOpacity="0.8" />
      <g clipPath={`url(#sg${id})`}>
        {fill > 0 && r && <rect x="-2" y={108 - 108 * fill} width="68" height={108 * fill + 4} fill={SMOOTHIE[r]} />}
        {fill > 0 && r === 'mango' && <rect x="-2" y={108 - 108 * fill} width="68" height={Math.min(30, 108 * fill)} fill={ORANGE} opacity="0.55" />}
        {fill > 0 && r === 'passion' && Array.from({ length: 16 }, (_, i) => <circle key={i} cx={8 + ((i * 23) % 50)} cy={104 - ((i * 37) % 100)} r="1.6" fill={OUT} opacity={104 - ((i * 37) % 100) > 108 - 108 * fill + 3 ? 0.75 : 0} />)}
        {fill > 0 && r === 'strawberry' && Array.from({ length: 10 }, (_, i) => <ellipse key={i} cx={10 + ((i * 29) % 46)} cy={100 - ((i * 41) % 96)} rx="1" ry="1.6" fill="#fbe38e" opacity={100 - ((i * 41) % 96) > 108 - 108 * fill + 3 ? 0.8 : 0} />)}
        <path d="M44 0h26v112H40Z" fill="#00244c" opacity="0.06" />
      </g>
      <path d={body} fill="none" {...INK} />
      <ellipse cx="32" cy="0" rx="30" ry="4" fill="none" {...THIN} />
      <path d="M9 10c2 14-4 24-2 42" {...SHINE} />
      {garnish && r && (
        <g className="lg-heart">
          {r === 'strawberry' && <FruitArt f="strawberry" x={58} y={-8} s={0.6} />}
          {r === 'passion' && <g transform="translate(58 -4) scale(1.5)"><Piece f="passion" x={0} y={0} /></g>}
          {r === 'mango' && <g><circle cx="58" cy="-2" r="13" fill={ORANGE} {...THIN} /><circle cx="58" cy="-2" r="9" fill="#ffc766" /><path d="M58 -11v18M49 -2h18M52 -8l12 12M64 -8 52 4" stroke={ORANGE} strokeWidth="1.4" /></g>}
        </g>
      )}
    </g>
  )
}

function Knife() {
  return (
    <g>
      <rect x="-62" y="-6" width="58" height="18" rx="7" fill={C.dark} {...INK} />
      <circle cx="-46" cy="3" r="2.5" fill={C.steel} /><circle cx="-22" cy="3" r="2.5" fill={C.steel} />
      <path d="M-4 -10h140c8 0 12 8 6 14L126 24H-4Z" fill={C.steel} {...INK} />
      <path d="M4 18h120" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
    </g>
  )
}

export function SmoothieGame({ onDone }: { onDone: () => void }) {
  const { t } = useLang()
  const [step, setStep] = useState<Step>('fruit')
  const [fruits, setFruits] = useState<Fruit[]>([])
  const [cuts, setCuts] = useState(0)
  const [ice, setIce] = useState(0)
  const [scooping, setScooping] = useState<number | null>(null)
  const [mix, setMix] = useState(0)
  const [pour, setPour] = useState(0)
  const [garnish, setGarnish] = useState(false)
  const [note, setNote] = useState<TKey | null>(null)
  const [busy, setBusy] = useState(false)
  const go = (s: Step, ms = 350) => { setBusy(true); setTimeout(() => { setBusy(false); setNote(null); setStep(s) }, ms) }
  const recipe = recipeOf(fruits)

  // 1. the fruit: strawberry or passion fruit alone; mango and orange go together
  const pick = (f: Fruit) => {
    if (busy || recipe || fruits.includes(f)) return
    const half = fruits[0]
    if (half && f !== (half === 'mango' ? 'orange' : 'mango')) { setNote(half === 'mango' ? 'smNeedOrange' : 'smNeedMango'); return }
    const next = [...fruits, f]
    setFruits(next)
    if (recipeOf(next)) go('chop', 900)
    else setNote(f === 'mango' ? 'smNeedOrange' : 'smNeedMango')
  }
  // 2. three cuts with the knife
  const cut = () => {
    if (busy || cuts >= 3) return
    setBusy(true); setCuts((n) => n + 1)
    if (cuts + 1 >= 3) setTimeout(() => { setBusy(false); go('ice', 700) }, 450)
    else setTimeout(() => setBusy(false), 420)
  }
  // 3. ice scoops into the blender
  const scoop = () => {
    if (busy) return
    if (ice >= 3) { setNote('lgIceMax'); return }
    setNote(null); setBusy(true); setScooping(Date.now())
    setTimeout(() => setIce((n) => n + 1), 780)
    setTimeout(() => { setScooping(null); setBusy(false) }, 1200)
  }
  // 4. hold to blend, 5. hold to pour
  const blendHold = useHold(2400, useCallback((d: number) => setMix((v) => { const n = Math.min(1, v + d); if (n >= 1 && v < 1) go('pour', 600); return n }), []), step === 'blend') // eslint-disable-line react-hooks/exhaustive-deps
  const pourHold = useHold(2000, useCallback((d: number) => setPour((v) => { const n = Math.min(1, v + d); if (n >= 1 && v < 1) go('garnish', 500); return n }), []), step === 'pour') // eslint-disable-line react-hooks/exhaustive-deps

  const item = recipe ? findItem(ITEM[recipe]) : undefined
  const total = item ? priceAt(item, 0) : 0
  const opts = [ice !== 2 ? t(ICE_KEYS[ice]) : '', !garnish ? t('mjNoGarnish') : ''].filter(Boolean)
  const again = () => { setStep('fruit'); setFruits([]); setCuts(0); setIce(0); setMix(0); setPour(0); setGarnish(false); setNote(null) }
  const color = recipe ? SMOOTHIE[recipe] : '#ffffff'
  const glass = (x: number, y: number, s: number) => <SmoothieGlass x={x} y={y} s={s} r={recipe} fill={pour} garnish={(step === 'garnish' || step === 'serve') && garnish} straw={step === 'serve'} />

  const tip: Record<Step, TKey> = { fruit: 'smFruit', chop: 'smChop', ice: 'lgIce', blend: 'mkBlend', pour: 'smPour', garnish: 'smGarnish', serve: 'smServe' }
  let scene: ReactNode = null
  let hand: ReactNode = null
  const board = (
    <g>
      <rect x="26" y="300" width="308" height="20" rx="8" fill={C.wood} {...INK} />
      <rect x="26" y="286" width="308" height="22" rx="8" fill="#dbc6b6" {...INK} />
      <circle cx="312" cy="297" r="5" fill="none" {...THIN} />
    </g>
  )
  const onBoard = (s: number) => fruits.map((f, i) => <g key={f} className="lg-cube"><FruitArt f={f} x={fruits.length > 1 ? 120 + i * 110 : 176} y={262} s={s} /></g>)
  if (step === 'fruit') {
    scene = (
      <g>
        {FRUITS.map((f, i) => {
          const half = fruits[0]
          const blocked = fruits.includes(f) || (!!half && !recipe && f !== (half === 'mango' ? 'orange' : 'mango'))
          return (
            <g key={f} transform={`translate(${6 + i * 88} 132)`}>
              <g className={'lg-pick' + (blocked ? ' lg-blocked' : '')} role="button" tabIndex={0} aria-label={t(FRUIT_KEY[f])} onClick={() => pick(f)} onKeyDown={(e) => e.key === 'Enter' && pick(f)}>
                <FruitArt f={f} x={24} y={30} s={0.72} /><FruitArt f={f} x={56} y={30} s={0.72} /><FruitArt f={f} x={40} y={14} s={0.72} />
                <path d="M0 36h80l-8 32a8 8 0 0 1-8 6H16a8 8 0 0 1-8-6Z" fill="#ffffff" {...INK} />
                <rect x="4" y="46" width="72" height="10" fill={C.body} />
                <path d="M2 44h76" {...THIN} />
                <text x="40" y="96" textAnchor="middle" className="lg-label small">{t(FRUIT_KEY[f])}</text>
              </g>
            </g>
          )
        })}
        {board}
        {onBoard(1.3)}
      </g>
    )
    hand = busy || fruits.length ? null : <Hand from={[46, 170]} kind="tap" />
  } else if (step === 'chop') {
    const lines = [-14, 0, 14].slice(0, cuts)
    scene = (
      <g role="button" tabIndex={0} aria-label={t('smChop').replace(/\*/g, '')} onClick={cut} onKeyDown={(e) => e.key === 'Enter' && cut()} style={{ cursor: 'pointer' }}>
        <rect x="0" y="0" width="360" height="420" fill="transparent" />
        {board}
        {cuts < 3
          ? fruits.map((f, i) => {
            const cx = fruits.length > 1 ? 120 + i * 110 : 176
            return (
              <g key={f}>
                <FruitArt f={f} x={cx} y={250} s={1.8} />
                {lines.map((lx) => <path key={lx} d={`M${cx + lx * 1.8} 214v72`} stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />)}
              </g>
            )
          })
          : fruits.flatMap((f, i) => Array.from({ length: 7 }, (_, k) => <g key={`${f}${k}`} className="lg-cube"><Piece f={f} x={(fruits.length > 1 ? 80 + i * 110 : 120) + (k % 4) * 26 + (k > 3 ? 13 : 0)} y={k > 3 ? 262 : 278} r={k * 41} /></g>))}
        <g transform="translate(118 150)"><g key={cuts} className={cuts ? 'sm-chop' : undefined}><Knife /></g></g>
      </g>
    )
    hand = busy || cuts ? null : <Hand from={[196, 150]} kind="tap" />
  } else if (step === 'ice') {
    scene = (
      <g>
        <IceBin scooping={scooping !== null} busy={busy} full={ice >= 3} label={t('lgIce').replace(/\*/g, '')} onScoop={scoop} />
        <Blender tf="translate(240 222) scale(0.9)" inside={inJar(fruits, true, ice)} />
        {scooping !== null && <ScoopOver k={scooping} />}
      </g>
    )
    hand = busy || ice > 0 ? null : <Hand from={[176, 196]} kind="tap" />
  } else if (step === 'blend') {
    const spinning = mix > 0 && mix < 1
    scene = (
      <g className={spinning ? 'lg-shake' : undefined}>
        <Blender tf="translate(112 106) scale(1.5)" inside={inJar(fruits, true, ice)} mix={mix} shake={color} lid spin={spinning} />
      </g>
    )
  } else if (step === 'pour') {
    const pouring = pour > 0 && pour < 1
    scene = (
      <g>
        {glass(100, 200, 1.6)}
        <Blender tf={pouring ? 'translate(200 150) rotate(-100) scale(0.9)' : 'translate(216 40) rotate(-20) scale(0.9)'} mix={1} shake={color} level={100 * (1 - pour) + 6} base={false} />
        {pouring && <path className="lg-stream" d="M198 154q-10 70 -46 150" stroke={color} strokeWidth="12" strokeLinecap="round" fill="none" />}
        {pouring && <path d="M198 154q-10 70 -46 150" stroke={OUT} strokeWidth="1.5" fill="none" opacity="0.35" />}
      </g>
    )
  } else if (step === 'garnish' || step === 'serve') {
    scene = <g>{glass(112, 150, 2.1)}</g>
  }

  return (
    <GameFrame step={step} stage={STAGE[step]} stages={STAGES} tip={note ? t(note) : t(tip[step])} scene={scene} hand={hand} actions={<>
        {step === 'ice' && <IceBar ice={ice} busy={busy} onUndo={() => { setIce((n) => n - 1); setNote(null) }} onDone={() => go('blend', 300)} />}
        {step === 'blend' && <button type="button" className="lg-hold" {...blendHold} disabled={busy}>{t('lgHold')}</button>}
        {step === 'pour' && <button type="button" className="lg-hold" {...pourHold} disabled={busy}>{t('lgHold')}</button>}
        {step === 'garnish' && (
          <>
            <button type="button" className="pill solid" onClick={() => { setGarnish(true); go('serve', 700) }}>{t('smGarnishYes')}</button>
            <button type="button" className="pill outline" onClick={() => { setGarnish(false); go('serve', 300) }}>{t('lgNothing')}</button>
          </>
        )}
        {step === 'serve' && item && <ServePanel item={item} opts={opts} size={0} setSize={() => undefined} price={total} onDone={onDone} onAgain={again} />}
    </>} />
  )
}
