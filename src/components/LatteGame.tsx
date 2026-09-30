import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as RKeyboardEvent, PointerEvent as RPointerEvent, ReactNode } from 'react'
import { useLang } from '../i18n'
import type { TKey } from '../i18n'
import { Bottle, C, Carton, EXTRA, GameFrame, Hand, ICE_KEYS, IceBar, IceBin, INK, MAX_PUMPS, MAX_SYRUPS, OUT, PumpOver, ScoopOver, ServePanel, SHINE, SW, THIN, findItem, g, priceAt, useHold, useUid } from './BaristaKit'

/*
 * Build Your Drink → Latte: a barista mini-game (owner, 2026-09-29, art "like the photos": a cosy coffee-shop game
 * with thick brown outlines, soft cream / steel colours, a pointing hand and a hint bubble for every move).
 * Cup (mug = hot, glass = iced) → grind (drag the portafilter to the grinder, hold) → tamp (drag down) → brew
 * (portafilter back in the machine, press, one or two shots) → milk (pick one; hot: steam and let go in the green,
 * iced: scoop ice and the cold milk pours) → flavour → pour (hot) → topping → the result, ordered as the REAL menu
 * drink: Latte Classic / Latte Caramel / Hot Spanish Latte / Latte with Flavor (and the iced ones) at the menu's
 * size prices, plus the menu's extras (Espresso Shot, Free Lactose, Skimmed Milk, Whipped Cream, Cold Foam).
 * Every drag also works as a tap. Drawn in one SVG scene (viewBox 360 × 420).
 */
type Temp = 'hot' | 'iced'
type Milk = 'regular' | 'skimmed' | 'lactose'
type Flavor = 'none' | 'caramel' | 'vanilla' | 'hazelnut' | 'spanish'
type Top = 'none' | 'whip' | 'foam'
type Step = 'cup' | 'grindDrag' | 'grindHold' | 'tamp' | 'brewDrag' | 'brewPress' | 'shot' | 'milk' | 'steam' | 'ice' | 'flavor' | 'pour' | 'top' | 'serve'
const STAGE: Record<Step, number> = { cup: 0, grindDrag: 1, grindHold: 1, tamp: 2, brewDrag: 3, brewPress: 3, shot: 3, milk: 4, steam: 4, ice: 4, flavor: 5, pour: 5, top: 6, serve: 7 }
const STAGES = 8

const ITEM: Record<Temp, Record<Flavor, string>> = {
  hot: { none: 'Latte Classic', caramel: 'Latte Caramel', spanish: 'Hot Spanish Latte', vanilla: 'Latte with Flavor', hazelnut: 'Latte with Flavor' },
  iced: { none: 'Iced Classic Latte', caramel: 'Ice Latte Caramel', spanish: 'Iced Spanish Latte', vanilla: 'Iced Latte with Flavor', hazelnut: 'Iced Latte with Flavor' },
}

const FLAVOR_COLOR: Record<Flavor, string> = { none: '#ffffff', caramel: '#db863a', vanilla: '#e5cdb5', hazelnut: '#935a25', spanish: '#f8f2e9' }
const FLAVOR_KEY: Record<Flavor, TKey> = { none: 'lgClassic', caramel: 'lgCaramel', vanilla: 'lgVanilla', hazelnut: 'lgHazelnut', spanish: 'lgSpanish' }
const MILK_COLOR: Record<Milk, string> = { regular: '#002f6d', skimmed: '#73c3ff', lactose: '#db863a' }





function Mug({ x, y, s = 1, coffee = 0, milk = 0, heart = false, whip = false, steam = false, saucer = true, syrups = [] }: { x: number; y: number; s?: number; coffee?: number; milk?: number; heart?: boolean; whip?: boolean; steam?: boolean; saucer?: boolean; syrups?: string[] }) {
  const id = useUid()
  const top = 8, bot = 62, h = bot - top
  const level = Math.min(1, coffee + milk)
  const full = level > 0.9
  const body = 'M-2 8h58l-5 50a8 8 0 0 1-8 7H11a8 8 0 0 1-8-7Z'
  return (
    <g transform={g(x, y, s)}>
      {saucer && <><ellipse cx="27" cy="68" rx="40" ry="8" fill="#e8eef5" {...INK} /><ellipse cx="27" cy="66" rx="24" ry="4" fill="#d3deea" /></>}
      {/* handle: outer and inner ring */}
      <path d="M52 18h8a14 14 0 0 1 0 28h-10" fill="none" stroke={OUT} strokeWidth="9" strokeLinecap="round" />
      <path d="M52 18h8a14 14 0 0 1 0 28h-10" fill="none" stroke={C.mug} strokeWidth="3.5" strokeLinecap="round" />
      <defs><clipPath id={`m${id}`}><path d={body} /></clipPath></defs>
      <path d={body} fill={C.mug} />
      <g clipPath={`url(#m${id})`}>
        {/* Mars band, then what shows of the drink, then the side in shade */}
        <rect x="-4" y="34" width="64" height="9" fill={C.body} />
        {level > 0 && <rect x="-4" y={bot - h * level} width="64" height={h * level + 6} fill={milk > 0.05 ? C.latte : C.coffee} />}
        {level > 0 && milk <= 0.05 && <rect x="-4" y={bot - h * level} width="64" height="3" fill={C.crema} />}
        {syrups.map((c, i) => <path key={i} className="lg-settle" d={`M-4 ${bot + 3 - 4 * (i + 1)}c10-3 20 3 32 0s22-3 32 0v4H-4Z`} fill={c} />)}
        <path d="M40 0h20v70H36Z" fill="#00244c" opacity="0.08" />
      </g>
      <path d={body} fill="none" {...INK} />
      <path d="M7 16l2 32" {...SHINE} />
      {/* rim + the surface: crema ring, then the latte with its art */}
      <ellipse cx="27" cy="8" rx="29" ry="5.5" fill={full ? (milk > 0.05 ? C.latte : C.crema) : '#eef3f8'} {...INK} />
      {full && milk > 0.05 && <ellipse cx="27" cy="8" rx="22" ry="3.6" fill="#d9b48c" opacity="0.6" />}
      {heart && (
        <g className="lg-heart">
          <path d="M27 11.5c-2.5-1-9.5-2.2-9.5-4.3 0-1.8 3.6-2.6 6-1.4 1.4.6 2.6.6 3.5.9.9-.3 2.1-.3 3.5-.9 2.4-1.2 6-.4 6 1.4 0 2.1-7 3.3-9.5 4.3Z" fill={C.milk} />
          <path d="M27 11.4V6.4" stroke="#d9b48c" strokeWidth="1" />
        </g>
      )}
      {whip && (
        <g>
          <path d="M4 7c-3-9 5-13 10-11 1-7 10-10 15-5 5-5 15-1 14 6 6-1 11 5 8 10" fill="#ffffff" {...INK} />
          <path d="M14 -4c3 2 5 5 5 9M29 -9c2 3 3 6 2 10M43 -2c1 3 1 6-1 9" fill="none" stroke="#dbe6f2" strokeWidth="2" strokeLinecap="round" />
          <circle cx="24" cy="-3" r="1.5" fill={C.caramel} /><circle cx="34" cy="1" r="1.5" fill={C.caramel} /><circle cx="17" cy="3" r="1.3" fill={C.caramel} />
        </g>
      )}
      {steam && <g className="lg-steam"><path d="M16 -4c-5-7 5-10 0-18M28 -8c-5-7 5-10 0-18M40 -4c-5-7 5-10 0-18" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" opacity="0.9" /></g>}
    </g>
  )
}

function Glass({ x, y, s = 1, coffee = 0, milk = 0, ice = 0, foam = false, straw = false, syrups = [] }: { x: number; y: number; s?: number; coffee?: number; milk?: number; ice?: number; foam?: boolean; straw?: boolean; syrups?: string[] }) {
  const id = useUid()
  const bot = 80, h = 80
  const body = 'M0 0h52l-5 80a6 6 0 0 1-6 5H11a6 6 0 0 1-6-5Z'
  const cLevel = coffee > 0 ? 0.3 : 0
  const mLevel = milk * 0.52
  return (
    <g transform={g(x, y, s)}>
      <defs>
        <clipPath id={`g${id}`}><path d={body} /></clipPath>
        <pattern id={`gd${id}`} width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.1" fill="#73c3ff" /></pattern>
      </defs>
      {straw && <path d="M34 -30 26 70" stroke={OUT} strokeWidth="9" strokeLinecap="round" />}
      {straw && <path d="M34 -30 26 70" stroke="#397dc9" strokeWidth="5" strokeLinecap="round" />}
      <path d={body} fill={C.glass} fillOpacity="0.8" />
      <g clipPath={`url(#g${id})`}>
        {cLevel > 0 && <rect x="-2" y={bot - h * cLevel} width="56" height={h * cLevel + 8} fill={C.coffee} />}
        {mLevel > 0 && <rect x="-2" y={bot - h * (cLevel + mLevel)} width="56" height={h * mLevel} fill={C.milk} />}
        {mLevel > 0 && cLevel > 0 && <path d={`M-2 ${bot - h * cLevel - 4}c10 -6 20 6 30 0s18 -6 26 0v10H-2Z`} fill={C.latte} />}
        {syrups.map((c, i) => <path key={i} className="lg-settle" d={`M-2 ${bot + 2 - 5 * (i + 1)}c10-3 20 3 30 0s18-3 26 0v5H-2Z`} fill={c} />)}
        {Array.from({ length: ice * 3 }, (_, i) => {
          const cx = 6 + (i % 3) * 14, cy = bot - 34 - Math.floor(i / 3) * 16 - (i % 2) * 5
          return (
            <g key={i} className="lg-cube" transform={`rotate(${(i * 23) % 30 - 12} ${cx + 7} ${cy + 6})`}>
              <rect x={cx} y={cy} width="14" height="13" rx="3.5" fill={C.ice} fillOpacity="0.9" stroke="#73c3ff" strokeWidth="1.6" />
              <path d={`M${cx + 3} ${cy + 3}h5`} stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </g>
          )
        })}
        {foam && <><rect x="-2" y="2" width="56" height="13" fill="#ffffff" /><path d="M-2 15c8 3 14-3 22 0s16 3 34 0" fill="none" stroke="#dbc6b6" strokeWidth="1.5" /></>}
        {/* Mars dot grid print (cold drinks) and the side in shade */}
        <rect x="10" y="44" width="32" height="18" fill={`url(#gd${id})`} opacity="0.7" />
        <path d="M38 0h20v90H34Z" fill="#00244c" opacity="0.07" />
      </g>
      <path d="M5 80a6 6 0 0 0 6 5h30a6 6 0 0 0 6-5l.6-7H4.4Z" fill="#cfe8fb" opacity="0.8" />
      <path d={body} fill="none" {...INK} />
      <ellipse cx="26" cy="0" rx="26" ry="4" fill="none" {...THIN} />
      <path d="M8 8l3 60" {...SHINE} />
    </g>
  )
}

function Portafilter({ x, y, s = 1, grounds = 0, pressed = false }: { x: number; y: number; s?: number; grounds?: number; pressed?: boolean }) {
  return (
    <g transform={g(x, y, s)}>
      {/* spouts under the basket */}
      <path d="M-8 12v8M8 12v8" stroke={OUT} strokeWidth="6" strokeLinecap="round" />
      <path d="M-8 12v8M8 12v8" stroke={C.steel} strokeWidth="2.5" strokeLinecap="round" />
      {/* handle: collar, wood, end cap */}
      <rect x="24" y="-6" width="12" height="12" rx="3" fill={C.steelDark} {...INK} />
      <path d="M34 -7h44a7 7 0 0 1 0 14H34Z" fill={C.wood} {...INK} />
      <path d="M40 -3h34" stroke="#bb7833" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="84" cy="0" r="6" fill={C.steel} {...INK} />
      {/* basket */}
      <ellipse cx="0" cy="4" rx="28" ry="15" fill={C.steelDark} {...INK} />
      <ellipse cx="0" cy="0" rx="28" ry="15" fill={C.steel} {...INK} />
      <ellipse cx="0" cy="-1" rx="21" ry="9.5" fill="#8fa9c9" {...THIN} />
      {grounds > 0 && (pressed
        ? <g><ellipse cx="0" cy="-1" rx="20" ry="8.8" fill={C.coffee} /><path d="M-10 -4c6-2 14-2 18 1" stroke="#a7641a" strokeWidth="2" strokeLinecap="round" fill="none" /></g>
        : <g>
            <path d={`M-20 -1a20 9 0 0 0 40 0c-4 ${-15 * grounds}-36 ${-15 * grounds}-40 0Z`} fill={C.coffee} />
            {grounds > 0.4 && <g fill="#935a25"><circle cx="-6" cy={-4 - 6 * grounds} r="1.4" /><circle cx="4" cy={-2 - 7 * grounds} r="1.4" /><circle cx="-1" cy={-1 - 4 * grounds} r="1.2" /><circle cx="9" cy={-1 - 3 * grounds} r="1.1" /></g>}
          </g>)}
      <path d="M-18 6c8 5 28 5 36 0" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </g>
  )
}

function Grinder({ x, y, grinding }: { x: number; y: number; grinding: boolean }) {
  const id = useUid()
  return (
    <g transform={g(x, y)}>
      {/* the bean bag beside it */}
      <g transform="translate(94 110)">
        <path d="M4 10 0 0h40l-4 10 4 60a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6Z" fill="#e5cdb5" {...INK} />
        <path d="M2 10h36" {...THIN} />
        <rect x="8" y="32" width="24" height="24" rx="4" fill="#fff" {...THIN} />
        <ellipse cx="20" cy="44" rx="6" ry="8" fill={C.wood} stroke={OUT} strokeWidth="1.5" transform="rotate(-20 20 44)" />
        <path d="M22 37c-4 4 2 8-2 14" fill="none" stroke="#e5cdb5" strokeWidth="1.5" />
      </g>
      {/* hopper: clear dome full of beans */}
      <defs><clipPath id={`h${id}`}><path d="M14 64c-6-34 78-34 72 0Z" /></clipPath></defs>
      <path d="M14 64c-6-34 78-34 72 0Z" fill="#e8f5ff" fillOpacity="0.9" />
      <g clipPath={`url(#h${id})`}>
        <rect x="0" y="40" width="100" height="30" fill={C.wood} />
        {Array.from({ length: 11 }, (_, i) => <ellipse key={i} cx={18 + (i % 6) * 13} cy={42 + Math.floor(i / 6) * 9} rx="5" ry="3.4" fill="#6b3f18" stroke={OUT} strokeWidth="1" transform={`rotate(${(i * 37) % 60 - 30} ${18 + (i % 6) * 13} ${42 + Math.floor(i / 6) * 9})`} />)}
      </g>
      <path d="M14 64c-6-34 78-34 72 0Z" fill="none" {...INK} />
      <path d="M24 50c2-10 10-16 18-18" {...SHINE} />
      <ellipse cx="50" cy="26" rx="30" ry="7" fill={C.dark} {...INK} />
      <rect x="44" y="14" width="12" height="8" rx="3" fill={C.dark} {...INK} />
      {/* body */}
      <rect x="10" y="62" width="80" height="14" rx="4" fill="#c5d6ea" {...INK} />
      <path d="M8 76h84l-6 96H14Z" fill={C.dark} {...INK} />
      <path d="M70 78h20l-5 92H66Z" fill="#00244c" />
      <circle cx="50" cy="100" r="13" fill="#c5d6ea" {...INK} />
      <path d="M50 100l6-7" stroke={OUT} strokeWidth="3" strokeLinecap="round" />
      <path d="M30 128h40" stroke="#73c3ff" strokeWidth="4" strokeLinecap="round" />
      {/* chute + portafilter fork + base */}
      <path d="M40 172h20l-4 12h-12Z" fill={C.steelDark} {...INK} />
      <path d="M26 188h16M58 188h16" stroke={OUT} strokeWidth="5" strokeLinecap="round" />
      <rect x="12" y="170" width="16" height="84" rx="4" fill={C.dark} {...INK} />
      <rect x="4" y="250" width="92" height="12" rx="4" fill={C.dark} {...INK} />
      <path d="M18 180v60" stroke="#397dc9" strokeWidth="2" opacity="0.6" />
      {grinding && <g className="lg-grind"><circle cx="46" cy="194" r="2.6" fill={C.coffee} /><circle cx="53" cy="200" r="2.6" fill={C.coffee} /><circle cx="49" cy="208" r="2.6" fill={C.coffee} /></g>}
    </g>
  )
}

function Machine({ pfIn, pouring, shots }: { pfIn: boolean; pouring: boolean; shots: number }) {
  return (
    <g>
      {/* cup warmer on top: two cups upside down */}
      <rect x="104" y="116" width="152" height="10" rx="4" fill="#c5d6ea" {...INK} />
      {[128, 196].map((cx) => (
        <g key={cx}>
          <path d={`M${cx} 116l4-22h28l4 22Z`} fill="#ffffff" {...INK} />
          <path d={`M${cx + 6} 112l3-14`} stroke="#fff" strokeWidth="2" />
          <path d={`M${cx + 4} 100h28`} stroke={C.body} strokeWidth="4" />
        </g>
      ))}
      {/* body + side shade + top panel */}
      <rect x="96" y="126" width="168" height="208" rx="12" fill={C.body} {...INK} />
      <path d="M232 128h20a10 10 0 0 1 10 10v184a10 10 0 0 1-10 10h-20Z" fill="#397dc9" opacity="0.35" />
      <rect x="96" y="126" width="168" height="46" rx="12" fill="#cae8ff" {...INK} />
      <path d="M108 140h20" {...SHINE} />
      {/* pressure gauge + the brew button */}
      <circle cx="226" cy="149" r="13" fill="#ffffff" {...INK} />
      <path d="M216 152a11 11 0 0 1 20 0" fill="none" stroke="#c5d6ea" strokeWidth="3" />
      <path d="M232 145a11 11 0 0 1 4 7" fill="none" stroke={C.caramel} strokeWidth="3" />
      <path d="M226 149l5-6" stroke={OUT} strokeWidth="2.5" strokeLinecap="round" />
      <circle className={'lg-btn' + (pfIn && !pouring ? ' live' : '')} cx="180" cy="149" r="12" fill={C.caramel} {...INK} />
      <circle cx="180" cy="149" r="5" fill="#ffffff" opacity="0.8" />
      <circle cx="134" cy="149" r="6" fill={pouring ? C.caramel : '#8fa9c9'} {...THIN} />
      {/* group head */}
      <path d="M146 178h68l-6 22h-56Z" fill={C.steel} {...INK} />
      <rect x="156" y="198" width="48" height="10" rx="3" fill={C.steelDark} {...INK} />
      <path d="M152 184h56" stroke="#fff" strokeWidth="2" opacity="0.7" />
      {/* steam wand with knob */}
      <circle cx="262" cy="182" r="8" fill={C.steelDark} {...INK} />
      <path d="M262 190v68l-8 16" fill="none" stroke={OUT} strokeWidth="7" strokeLinecap="round" />
      <path d="M262 190v68l-8 16" fill="none" stroke={C.steel} strokeWidth="3" strokeLinecap="round" />
      {/* drip tray: grille lines, then feet */}
      <rect x="116" y="316" width="128" height="22" rx="6" fill="#c5d6ea" {...INK} />
      <path d="M128 322v10M140 322v10M152 322v10M164 322v10M176 322v10M188 322v10M200 322v10M212 322v10M224 322v10M236 322v10" stroke="#8fa9c9" strokeWidth="2" />
      <rect x="104" y="334" width="20" height="10" rx="3" fill={C.dark} {...INK} />
      <rect x="236" y="334" width="20" height="10" rx="3" fill={C.dark} {...INK} />
      {pfIn && <Portafilter x={180} y={214} s={0.9} grounds={1} pressed />}
      {pouring && <g className="lg-stream"><path d="M173 228q1 30 0 60" stroke={C.coffee} strokeWidth="4" strokeLinecap="round" fill="none" />{shots > 1 && <path d="M187 228q-1 30 0 60" stroke={C.coffee} strokeWidth="4" strokeLinecap="round" fill="none" />}</g>}
    </g>
  )
}

function Tamper({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={g(x, y, s)}>
      <path d="M-11 -70c0-10 22-10 22 0l-3 22H-8Z" fill={C.wood} {...INK} />
      <path d="M-5 -68c0-4 4-6 7-6" stroke="#bb7833" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <rect x="-7" y="-48" width="14" height="30" rx="3" fill={C.steelDark} {...INK} />
      <rect x="-24" y="-18" width="48" height="10" rx="3" fill={C.steel} {...INK} />
      <path d="M-22 -8h44l-3 6h-38Z" fill={C.steelDark} {...INK} />
      <path d="M-18 -14h20" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    </g>
  )
}

function Pitcher({ x, y, s = 1, tilt = 0, foam = 0, fill = 0 }: { x: number; y: number; s?: number; tilt?: number; foam?: number; fill?: number }) {
  const id = useUid()
  const body = 'M4 8l-9-7h61l-5 63a8 8 0 0 1-8 7H14a8 8 0 0 1-8-7Z'
  return (
    <g transform={`${g(x, y, s)} rotate(${tilt} 30 40)`}>
      <path d="M55 18c14 0 14 34 0 36" fill="none" stroke={OUT} strokeWidth="8" strokeLinecap="round" />
      <path d="M55 18c14 0 14 34 0 36" fill="none" stroke={C.steel} strokeWidth="3" strokeLinecap="round" />
      <path d={body} fill={C.steel} />
      <path d="M36 1h15l-5 63a8 8 0 0 1-6 7h-6Z" fill={C.steelDark} opacity="0.6" />
      {fill > 0 && (
        <g>
          <defs><clipPath id={`p${id}`}><path d={body} /></clipPath></defs>
          <g clipPath={`url(#p${id})`}>
            <rect className="lg-settle" x="-8" y={71 - 66 * fill} width="70" height={66 * fill + 4} fill={C.milk} />
            <ellipse cx="25" cy={71 - 66 * fill} rx="30" ry="3.5" fill="#ffffff" />
            <path d="M36 0h20v75H32Z" fill="#00244c" opacity="0.06" />
          </g>
        </g>
      )}
      <path d={body} fill="none" {...INK} />
      {foam > 0 && (
        <g opacity={Math.min(1, foam * 1.5)}>
          <ellipse cx="25" cy="6" rx="27" ry="4.5" fill={C.milk} {...THIN} />
          <circle cx="16" cy="5" r="1.6" fill="#e5cdb5" /><circle cx="30" cy="7" r="1.3" fill="#e5cdb5" /><circle cx="37" cy="4.5" r="1.1" fill="#e5cdb5" />
        </g>
      )}
      <path d="M12 16l2 42M20 16l1 10" {...SHINE} />
    </g>
  )
}





function CartonOver({ color, k }: { color: string; k: number }) {
  return (
    <g key={k}>
      <g transform="translate(98 180)"><g className="lg-cartoning">
        <path d="M12 -6h40v8H12Z" fill="#ffffff" {...INK} />
        <path d="M0 18 12 2h40l12 16Z" fill="#ffffff" {...INK} />
        <path d="M0 18h64v74a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6Z" fill="#ffffff" {...INK} />
        <rect x="0" y="40" width="64" height="30" fill={color} {...THIN} />
        <path d="M32 46c-5 7-7 10-7 13a7 7 0 0 0 14 0c0-3-2-6-7-13Z" fill="#ffffff" />
      </g></g>
      <path className="lg-milkstream" pathLength={1} d="M178 248q3 28 2 56" stroke={OUT} strokeWidth="9" strokeLinecap="round" fill="none" />
      <path className="lg-milkstream" pathLength={1} d="M178 248q3 28 2 56" stroke={C.milk} strokeWidth="6" strokeLinecap="round" fill="none" />
    </g>
  )
}

function Thermo({ x, y, t }: { x: number; y: number; t: number }) {
  const h = 110
  return (
    <g transform={g(x, y)}>
      <rect x="0" y="0" width="22" height={h} rx="11" fill="#ffffff" {...INK} />
      <rect x="4" y={h * 0.2} width="14" height={h * 0.25} rx="3" fill={C.green} opacity="0.85" />
      {[0.2, 0.4, 0.6, 0.8].map((k) => <path key={k} d={`M22 ${h * k}h6`} {...THIN} />)}
      <rect x="7" y={h - 6 - (h - 12) * t} width="8" height={(h - 12) * t + 6} rx="4" fill={t > 0.8 ? '#a7641a' : '#397dc9'} />
      <circle cx="11" cy={h + 8} r="15" fill={t > 0.8 ? '#a7641a' : '#397dc9'} {...INK} />
      <path d="M6 104a7 7 0 0 1 4-6" {...SHINE} />
    </g>
  )
}


/* ---------- the game ---------- */
export function LatteGame({ onDone }: { onDone: () => void }) {
  const { t } = useLang()
  const [step, setStep] = useState<Step>('cup')
  const [temp, setTemp] = useState<Temp>('hot')
  const [shots, setShots] = useState(1)
  const [milk, setMilk] = useState<Milk>('regular')
  const [pumps, setPumps] = useState<Flavor[]>([]) // syrup pumps in order (owner, 2026-09-30: extra pumps, mix two)
  const [pumping, setPumping] = useState<{ f: Flavor; k: number } | null>(null)
  const [top, setTop] = useState<Top>('none')
  const [size, setSize] = useState(0)
  const [grounds, setGrounds] = useState(0)
  const [tampY, setTampY] = useState(0) // 0..1 how far the tamper went down
  const [coffee, setCoffee] = useState(0)
  const [heat, setHeat] = useState(0)
  const [pour, setPour] = useState(0)
  const [milkPours, setMilkPours] = useState(0) // 0 or 1: the milk is poured once (owner, 2026-09-30: "fills only once")
  const [carting, setCarting] = useState<number | null>(null)
  const [ice, setIce] = useState(0) // scoops: 0 no ice · 1 light · 2 regular · 3 extra
  const [scooping, setScooping] = useState<number | null>(null)
  const [milkPour, setMilkPour] = useState(false)
  const [note, setNote] = useState<TKey | null>(null)
  const [busy, setBusy] = useState(false) // an animation is playing: no input
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ x0: number; y0: number; dx: number; dy: number; moved: boolean } | null>(null)
  const go = (s: Step, ms = 350) => { setBusy(true); setTimeout(() => { setBusy(false); setNote(null); setStep(s) }, ms) }
  const iced = temp === 'iced'

  const toSvg = (cx: number, cy: number) => {
    const s = svgRef.current
    const m = s?.getScreenCTM()
    if (!s || !m) return { x: 0, y: 0 }
    const p = s.createSVGPoint(); p.x = cx; p.y = cy
    const r = p.matrixTransform(m.inverse())
    return { x: r.x, y: r.y }
  }
  /** a draggable object: a tap or a drop inside `target` (scene units) completes it */
  const dragProps = (home: { x: number; y: number }, target: { x: number; y: number; w: number; h: number }, done: () => void, vertical = false) => ({
    style: { cursor: 'grab', touchAction: 'none' } as const,
    onPointerDown: (e: RPointerEvent<SVGGElement>) => {
      if (busy) return
      e.currentTarget.setPointerCapture?.(e.pointerId)
      const p = toSvg(e.clientX, e.clientY)
      setDrag({ x0: p.x, y0: p.y, dx: 0, dy: 0, moved: false })
    },
    onPointerMove: (e: RPointerEvent<SVGGElement>) => {
      if (!drag) return
      const p = toSvg(e.clientX, e.clientY)
      const dx = vertical ? 0 : p.x - drag.x0, dy = p.y - drag.y0
      setDrag({ ...drag, dx, dy: vertical ? Math.max(0, Math.min(90, dy)) : dy, moved: drag.moved || Math.hypot(dx, dy) > 6 })
      if (vertical) setTampY(Math.max(0, Math.min(1, dy / 90)))
    },
    onPointerUp: () => {
      if (!drag) return
      const cx = home.x + drag.dx, cy = home.y + drag.dy
      const hit = vertical ? drag.dy > 70 : cx > target.x && cx < target.x + target.w && cy > target.y && cy < target.y + target.h
      setDrag(null)
      if (!drag.moved || hit) { if (vertical) setTampY(1); done() } else if (vertical) setTampY(0)
    },
    onKeyDown: (e: RKeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (vertical) setTampY(1); done() } },
    tabIndex: 0, role: 'button',
  })
  const off = (on: boolean) => (on && drag ? `translate(${drag.dx} ${drag.dy})` : undefined)

  // grinding (hold): grounds fill up; full = next
  const grind = useHold(1500, useCallback((d: number) => setGrounds((v) => { const n = Math.min(1, v + d); if (n >= 1 && v < 1) go('tamp', 450); return n }), []), step === 'grindHold')
  // steaming (hold): temperature rises; let go in the green (0.55-0.8)
  const steamTick = useCallback((d: number) => setHeat((v) => Math.min(1, v + d)), [])
  const steam = useHold(2600, steamTick, step === 'steam' && !busy)
  const steamUp = () => {
    if (step !== 'steam' || heat === 0) return
    if (heat < 0.55) { setNote('lgSteamLow'); return }
    setNote(heat <= 0.8 ? 'lgSteamGood' : 'lgSteamHot')
    go('flavor', 900)
  }
  useEffect(() => { if (step === 'steam' && heat >= 1) { setNote('lgSteamHot'); go('flavor', 900) } }, [heat, step]) // eslint-disable-line react-hooks/exhaustive-deps
  // pouring the milk (hot, hold): the cup fills and the heart appears
  const pourHold = useHold(1700, useCallback((d: number) => setPour((v) => { const n = Math.min(1, v + d); if (n >= 1 && v < 1) go('top', 1100); return n }), []), step === 'pour')

  const pull = (n: number) => {
    setBusy(true)
    const start = coffee
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 1500)
      setCoffee(start + p * 0.24)
      if (p < 1) requestAnimationFrame(tick)
      else { setBusy(false); setShots(n); if (n === 1) setStep('shot'); else setStep('milk') }
    }
    requestAnimationFrame(tick)
  }
  /** tap a carton: it pours into the pitcher once, then the game moves on (hot: steam, iced: ice) */
  const pourMilk = (m: Milk) => {
    if (busy || milkPours) return
    setNote(null); setMilk(m); setBusy(true); setCarting(Date.now())
    setTimeout(() => setMilkPours(1), 800) // the milk lands in the pitcher
    setTimeout(() => { setCarting(null); setBusy(false); setStep(iced ? 'ice' : 'steam') }, 1500)
  }
  const MILK_LEVEL = [0, 0.7]
  const scoop = () => {
    if (busy) return
    if (ice >= 3) { setNote('lgIceMax'); return }
    setNote(null); setBusy(true); setScooping(Date.now())
    setTimeout(() => setIce((n) => n + 1), 780) // the cubes land in the glass
    setTimeout(() => { setScooping(null); setBusy(false) }, 1200)
  }
  /** Done with the ice: the cold milk pours, then the flavours */
  const iceDone = () => {
    if (busy) return
    setBusy(true); setMilkPour(true); setNote(null)
    const t0 = performance.now()
    const tick = (now: number) => { const p = Math.min(1, (now - t0) / 1200); setPour(p); if (p < 1) requestAnimationFrame(tick); else { setBusy(false); setMilkPour(false); setStep('flavor') } }
    requestAnimationFrame(tick)
  }
  const flavor: Flavor = pumps[0] ?? 'none' // the first syrup decides the menu drink
  const kinds = [...new Set(pumps)]
  const pump = (f: Flavor) => {
    if (busy) return
    if (pumps.length >= MAX_PUMPS) { setNote('lgMaxPumps'); return }
    if (!kinds.includes(f) && kinds.length >= MAX_SYRUPS) { setNote('lgMaxFlavors'); return }
    setNote(null); setBusy(true); setPumping({ f, k: Date.now() })
    setTimeout(() => setPumps((ps) => [...ps, f]), 850) // the syrup lands in the cup
    setTimeout(() => { setPumping(null); setBusy(false) }, 1350)
  }
  const flavorDone = () => { if (!busy) go(iced ? 'top' : 'pour', 300) }

  const itemName = ITEM[temp][flavor]
  const item = findItem(itemName)
  const extras = (shots > 1 ? EXTRA.shot : 0) + (milk === 'lactose' ? EXTRA.lactose : 0) + (top === 'whip' ? EXTRA.whip : top === 'foam' ? EXTRA.foam : 0) + Math.max(0, pumps.length - 1) * EXTRA.pump
  const total = item ? priceAt(item, size) + extras : 0
  const opts = [
    // syrups: the drink's own one needs no line unless doubled; others are named, ×n for extra pumps
    ...kinds.map((f) => { const n = pumps.filter((x) => x === f).length; return f === flavor && n === 1 && (f === 'caramel' || f === 'spanish') ? '' : t(FLAVOR_KEY[f]) + (n > 1 ? ` ×${n}` : '') }),
    iced && ice !== 2 ? t(ICE_KEYS[ice]) : '',
    shots > 1 ? t('lgOptDouble') : '',
    milk === 'skimmed' ? t('lgOptSkimmed') : milk === 'lactose' ? t('lgOptLactose') : '',
    top === 'whip' ? t('lgOptWhip') : top === 'foam' ? t('lgOptFoam') : '',
  ].filter(Boolean)
  const again = () => { setStep('cup'); setShots(1); setMilk('regular'); setMilkPours(0); setCarting(null); setPumps([]); setTop('none'); setSize(0); setGrounds(0); setTampY(0); setCoffee(0); setHeat(0); setPour(0); setIce(0); setScooping(null); setMilkPour(false); setNote(null) }

  const cupLevels = { coffee, milk: iced ? pour : pour * 0.62 }
  const cupAt = (x: number, y: number, s = 1) => iced
    ? <Glass x={x} y={y - 20} s={s} coffee={coffee > 0 ? 1 : 0} milk={cupLevels.milk} ice={ice} foam={top === 'foam'} straw={step === 'serve'} syrups={pumps.map((f) => FLAVOR_COLOR[f])} />
    : <Mug x={x} y={y} s={s} coffee={coffee} milk={cupLevels.milk} heart={pour >= 1} whip={top === 'whip'} steam={pour >= 1 && (step === 'top' || step === 'serve')} syrups={pumps.map((f) => FLAVOR_COLOR[f])} />
  const tip: Record<Step, TKey> = {
    cup: 'lgCup', grindDrag: 'lgGrindDrag', grindHold: 'lgGrindHold', tamp: 'lgTamp', brewDrag: 'lgBrewDrag', brewPress: 'lgBrewPress', shot: 'lgShotQ',
    milk: 'lgMilk', steam: 'lgSteam', ice: 'lgIce', flavor: 'lgFlavor', pour: 'lgPour', top: 'lgTop', serve: 'lgServe',
  }
  const FLAVORS: { f: Flavor; key: TKey }[] = (['caramel', 'vanilla', 'hazelnut', 'spanish'] as Flavor[]).map((f) => ({ f, key: FLAVOR_KEY[f] }))

  let scene: ReactNode = null
  let hand: ReactNode = null
  if (step === 'cup') {
    scene = (
      <g>
        <rect x="30" y="100" width="300" height="12" rx="4" fill="#dbc6b6" stroke={OUT} strokeWidth={SW} />
        {[60, 128].map((x) => <g key={x} className="lg-pick" role="button" tabIndex={0} aria-label={t('tempHot')} onClick={() => { setTemp('hot'); go('grindDrag') }} onKeyDown={(e) => e.key === 'Enter' && (setTemp('hot'), go('grindDrag'))}><Mug x={x} y={36} saucer={false} /></g>)}
        {[206, 266].map((x) => <g key={x} className="lg-pick" role="button" tabIndex={0} aria-label={t('tempCold')} onClick={() => { setTemp('iced'); go('grindDrag') }} onKeyDown={(e) => e.key === 'Enter' && (setTemp('iced'), go('grindDrag'))}><Glass x={x} y={14} /></g>)}
        <text x="100" y="134" textAnchor="middle" className="lg-label">{t('tempHot')}</text>
        <text x="258" y="134" textAnchor="middle" className="lg-label">{t('tempCold')}</text>
        <g transform="translate(0 56)"><Machine pfIn={false} pouring={false} shots={1} /></g>
      </g>
    )
    hand = <Hand from={[96, 58]} kind="tap" />
  } else if (step === 'grindDrag' || step === 'grindHold') {
    const docked = step === 'grindHold'
    scene = (
      <g>
        <Grinder x={30} y={110} grinding={docked && grounds > 0 && grounds < 1} />
        {cupAt(250, 270)}
        {docked
          ? <Portafilter x={80} y={330} grounds={grounds} />
          : <g {...dragProps({ x: 230, y: 380 }, { x: 30, y: 280, w: 110, h: 90 }, () => go('grindHold', 250))} transform={off(true)}><Portafilter x={230} y={380} /></g>}
      </g>
    )
    hand = docked ? null : <Hand from={[250, 382]} to={[88, 328]} kind="drag" />
  } else if (step === 'tamp') {
    scene = (
      <g>
        <rect x="40" y="60" width="280" height="330" rx="26" fill="#ffffff" stroke={OUT} strokeWidth={SW} />
        <Portafilter x={128} y={300} s={1.75} grounds={1} pressed={tampY >= 1} />
        <g {...dragProps({ x: 128, y: 150 }, { x: 0, y: 0, w: 0, h: 0 }, () => go('brewDrag', 500), true)} transform={`translate(0 ${tampY * 90})`}><Tamper x={128} y={196} s={1.4} /></g>
      </g>
    )
    hand = tampY > 0 ? null : <Hand from={[146, 128]} to={[146, 214]} kind="drag" />
  } else if (step === 'brewDrag' || step === 'brewPress' || step === 'shot') {
    const inMachine = step !== 'brewDrag'
    scene = (
      <g>
        <Machine pfIn={inMachine} pouring={busy && inMachine} shots={1} />
        {cupAt(152, 250)}
        {!inMachine && <g {...dragProps({ x: 70, y: 380 }, { x: 120, y: 170, w: 120, h: 90 }, () => go('brewPress', 250))} transform={off(true)}><Portafilter x={70} y={380} grounds={1} pressed /></g>}
        {step === 'brewPress' && <circle cx="180" cy="150" r="22" fill="transparent" role="button" tabIndex={0} aria-label={t('lgBrewPress').replace(/\*/g, '')} onClick={() => !busy && pull(1)} onKeyDown={(e) => e.key === 'Enter' && !busy && pull(1)} style={{ cursor: 'pointer' }} />}
      </g>
    )
    hand = step === 'brewDrag' ? <Hand from={[92, 382]} to={[186, 214]} kind="drag" /> : step === 'brewPress' && !busy ? <Hand from={[184, 152]} kind="tap" /> : null
  } else if (step === 'milk') {
    const MILKS: { m: Milk; key: TKey }[] = [{ m: 'regular', key: 'lgMilkRegular' }, { m: 'skimmed', key: 'lgMilkSkimmed' }, { m: 'lactose', key: 'lgMilkLactose' }]
    scene = (
      <g>
        <rect x="30" y="70" width="300" height="206" rx="14" fill="#c5d6ea" stroke={OUT} strokeWidth={SW} />
        <rect x="42" y="82" width="276" height="182" rx="8" fill="#fff" stroke={OUT} strokeWidth="2" />
        {MILKS.map(({ m, key }, i) => {
          const other = carting !== null && m !== milk
          return (
            <g key={m} className={'lg-pick' + (other ? ' lg-blocked' : '') + (carting && m === milk ? ' lg-away' : '')} role="button" tabIndex={0} aria-label={t(key)} onClick={() => pourMilk(m)} onKeyDown={(e) => e.key === 'Enter' && pourMilk(m)}>
              <Carton x={58 + i * 90} y={116} color={MILK_COLOR[m]} label={t(key).split(' (')[0]} />
            </g>
          )
        })}
        <text x="270" y="262" textAnchor="middle" className="lg-label small">+1,000</text>
        <Pitcher x={150} y={302} s={1.1} fill={MILK_LEVEL[milkPours]} />
        {cupAt(262, 318, 0.8)}
        {carting !== null && <CartonOver color={MILK_COLOR[milk]} k={carting} />}
      </g>
    )
    hand = busy || milkPours ? null : <Hand from={[96, 150]} kind="tap" />
  } else if (step === 'steam') {
    scene = (
      <g>
        <rect x="40" y="60" width="280" height="330" rx="26" fill="#ffffff" stroke={OUT} strokeWidth={SW} />
        <path d="M120 60v120l-18 30" fill="none" stroke={OUT} strokeWidth="7" strokeLinecap="round" />
        <path d="M120 60v120l-18 30" fill="none" stroke={C.steel} strokeWidth="3" strokeLinecap="round" />
        <g className={heat > 0 && heat < 1 ? 'lg-shake' : undefined}><Pitcher x={70} y={200} s={1.8} foam={heat} fill={MILK_LEVEL[milkPours]} /></g>
        <Thermo x={268} y={130} t={heat} />
        {heat > 0.05 && <g className="lg-steam"><path d="M110 196c-6-10 6-14 0-24M126 190c-6-10 6-14 0-24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" /></g>}
      </g>
    )
  } else if (step === 'ice') {
    scene = (
      <g>
        <IceBin scooping={scooping !== null} busy={busy} full={ice >= 3} label={t('lgIce').replace(/\*/g, '')} onScoop={scoop} />
        {cupAt(250, 290, 1.2)}
        {scooping !== null && <ScoopOver k={scooping} />}
        {milkPour && <g className="lg-stream"><rect x="276" y="150" width="6" height="110" rx="3" fill={C.milk} stroke="#dbc6b6" /></g>}
      </g>
    )
    hand = busy || ice > 0 ? null : <Hand from={[176, 196]} kind="tap" />
  } else if (step === 'flavor') {
    scene = (
      <g>
        <rect x="24" y="210" width="312" height="12" rx="4" fill="#dbc6b6" stroke={OUT} strokeWidth={SW} />
        <rect x="0" y="222" width="360" height="30" fill={C.counter} />
        {FLAVORS.map(({ f, key }, i) => {
          const n = pumps.filter((x) => x === f).length
          const blocked = pumps.length >= MAX_PUMPS || (!kinds.includes(f) && kinds.length >= MAX_SYRUPS)
          return (
            <g key={f} className={'lg-pick' + (blocked ? ' lg-blocked' : '') + (pumping?.f === f ? ' lg-away' : '')} role="button" tabIndex={0} aria-label={`${t(key)}${n ? ` ×${n}` : ''}`} onClick={() => pump(f)} onKeyDown={(e) => e.key === 'Enter' && pump(f)}>
              <Bottle x={34 + i * 76} y={114} color={FLAVOR_COLOR[f]} label={t(key)} tin={f === 'spanish'} />
              {n > 0 && <g className="lg-count"><circle cx={59 + i * 76} cy={100} r="12" fill={C.caramel} {...THIN} /><text x={59 + i * 76} y={104.5} textAnchor="middle" className="lg-count-t">×{n}</text></g>}
            </g>
          )
        })}
        {cupAt(152, 300)}
        {pumping && <PumpOver color={FLAVOR_COLOR[pumping.f]} tin={pumping.f === 'spanish'} k={pumping.k} />}
      </g>
    )
    hand = pumps.length || pumping ? null : <Hand from={[62, 170]} kind="tap" />
  } else if (step === 'pour') {
    scene = (
      <g>
        <Mug x={130} y={250} s={1.5} coffee={coffee} milk={pour * 0.62} heart={pour >= 1} steam={pour >= 1} />
        <g transform="translate(360 0) scale(-1 1)"><Pitcher x={112} y={128} s={1.3} tilt={pour > 0 && pour < 1 ? 34 : 10} foam={1} /></g>
        {pour > 0 && pour < 1 && <path className="lg-stream" d="M157 158q4 52 15 100" stroke={C.milk} strokeWidth="7" strokeLinecap="round" fill="none" />}
        {pour > 0 && pour < 1 && <path d="M157 158q4 52 15 100" stroke="#dbc6b6" strokeWidth="1.5" fill="none" opacity="0.8" />}
      </g>
    )
  } else if (step === 'top' || step === 'serve') {
    scene = <g>{cupAt(iced ? 128 : 112, iced ? 170 : 190, iced ? 2 : 2.2)}</g>
  }

  const holdBtn = (h: ReturnType<typeof useHold>, onUp?: () => void) => (
    <button type="button" className="lg-hold" {...h} onPointerUp={() => { h.onPointerUp(); onUp?.() }} onKeyUp={() => { h.onKeyUp(); onUp?.() }} disabled={busy}>{t('lgHold')}</button>
  )
  return (
    <GameFrame step={step} stage={STAGE[step]} stages={STAGES} tip={note ? t(note) : t(tip[step])} svgRef={svgRef} scene={scene} hand={hand} actions={<>
        {step === 'grindHold' && holdBtn(grind)}
        {step === 'steam' && holdBtn(steam, steamUp)}
        {step === 'pour' && holdBtn(pourHold)}
        {step === 'shot' && (
          <>
            <button type="button" className="pill solid" onClick={() => pull(2)} disabled={busy}>{t('lgShotDouble')}</button>
            <button type="button" className="pill outline" onClick={() => setStep('milk')} disabled={busy}>{t('lgShotOne')}</button>
          </>
        )}
        {step === 'ice' && <IceBar ice={ice} busy={busy} onUndo={() => { setIce((n) => n - 1); setNote(null) }} onDone={iceDone} />}
        {step === 'flavor' && (
          <div className="lg-pumpbar">
            <p className="lg-pumpcount" aria-live="polite"><b>{t('lgPumps')}: {pumps.length} / {MAX_PUMPS}</b><small>{t('lgPumpPrice')}</small></p>
            <div className="lg-pumpbtns">
              {pumps.length > 0 && <button type="button" className="pill outline small" onClick={() => { setPumps((ps) => ps.slice(0, -1)); setNote(null) }} disabled={busy}>{t('lgUndo')}</button>}
              <button type="button" className={'pill ' + (pumps.length ? 'solid' : 'outline')} onClick={flavorDone} disabled={busy}>{pumps.length ? t('lgDone') : t('lgClassic')}</button>
            </div>
          </div>
        )}
        {step === 'top' && (
          <>
            <button type="button" className="pill outline" onClick={() => { setTop(iced ? 'foam' : 'whip'); go('serve', 500) }}>{t(iced ? 'lgFoam' : 'lgWhip')}</button>
            <button type="button" className="pill outline" onClick={() => { setTop(iced ? 'whip' : 'foam'); go('serve', 500) }}>{t(iced ? 'lgWhip' : 'lgFoam')}</button>
            <button type="button" className="pill solid" onClick={() => { setTop('none'); go('serve', 300) }}>{t('lgNothing')}</button>
          </>
        )}
        {step === 'serve' && item && <ServePanel item={item} opts={opts} size={size} setSize={setSize} price={total} onDone={onDone} onAgain={again} />}
    </>} />
  )
}
