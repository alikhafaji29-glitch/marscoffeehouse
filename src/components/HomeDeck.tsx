import { useEffect, useRef, useState } from 'react'
import { onOpenBarista, onOpenBuild } from '../bus'
import { useLang } from '../i18n'
import type { TKey } from '../i18n'
import { MENU } from '../menu'
import type { MenuItem } from '../menu'
import { useCart } from '../cart'
import { useCountdown, LUNCH_HOURS } from './useCountdown'
import { clockNow } from '../clock'
import { MoodDialog } from './MoodQuiz'
import { periodOf } from './MoodGame'
import { MoodJourney } from './MoodJourney'
import { BaristaJourney } from './BaristaJourney'
import type { Cat } from './BaristaJourney'
import { SidePanel } from './SidePanel'
import { PHOTOS } from '../photos'
import { Logo } from './Header'
import { IconPin } from './Icons'
import { iqd } from '../account'

// Build Your Drink card photo: a finished iced build in the Mars cup (the builder's last frame)
const BUILD_PHOTO = '/assets/featured/build.jpg'

/*
 * Home = a deck of full-screen slides (after the Blank Street app the owner sent, 2026-09-10):
 * welcome / Positive Hours (cream) → Lunch Hours (photo) → new & seasonal drinks → Your Mood Drink →
 * Shop (Mars products) → coffee Mars is proud of → brand + locations. Each slide: eyebrow, big
 * headline, one pill button, bottom-start.
 */
const item = (name: string) => MENU.flatMap((c) => c.items).find((i) => i.name === name)

// short descriptions for the side panel, by menu item name
const DESC: Record<string, TKey> = {
  'Lemon-Mint Mojito': 'descLemonMint', 'Mango with Orange Smoothie': 'descSmoothie', 'Nutella Milkshake': 'descNutella',
  'Strawberry Milkshake': 'descStrawberry', 'Pistachio Milkshake': 'descPistachio', 'Lotus Milkshake': 'descLotus',
}

/* "New this season": the cards that drift right-to-left (owner's photos). */
// New this season: the first three only (owner, 2026-09-28). One look (owner, 2026-09-28): every card is the owner's cup-on-white-table photo with the drink
// recoloured per item (the reference photo docs/reference/season/cup-reference.webp is in git history before commit 2026-09-30 "Delete unused files"; recolour script in that session's scratchpad season/make.py)
const SEASON: { names: string[]; title: string; img: string; bg: string; cropTop?: boolean }[] = [
  { names: ['Lemon-Mint Mojito'], title: 'Lemon-Mint Mojito', img: '/assets/featured/season-mojito.jpg', bg: '#2b2420' },
  { names: ['Mango with Orange Smoothie'], title: 'Mango & Orange Smoothie', img: '/assets/featured/season-smoothie.jpg', bg: '#2b2420' },
  { names: ['Nutella Milkshake'], title: 'Nutella Milkshake', img: '/assets/featured/season-nutella.jpg', bg: '#2b2420' },
]
// Demo products from the owner's photos; prices are placeholders until Mars confirms (TODO B)
/* Build Your Drink asks how (owner, 2026-09-27): from your mood (the mood game) or be the barista (the drink builder) */
function BuildAsk({ onClose, onMood, onBarista }: { onClose: () => void; onMood: () => void; onBarista: () => void }) {
  const { t } = useLang()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('build-ask-open')
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('build-ask-open') }
  }, [onClose])
  return (
    <div className="build-ask" role="dialog" aria-modal="true" aria-labelledby="build-ask-q" onClick={onClose}>
      <div className="build-ask-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="build-ask-close" aria-label={t('close')} onClick={onClose}>×</button>
        <h2 id="build-ask-q">{t('buildAskQ')}</h2>
        <div className="build-ask-options">
          <button type="button" className="build-ask-opt" onClick={onMood} autoFocus>
            <img src={PHOTOS.mood} alt="" draggable={false} />
            <span className="build-ask-text"><b>{t('buildAskMood')}</b><small>{t('buildAskMoodSub')}</small></span>
          </button>
          <button type="button" className="build-ask-opt" onClick={onBarista}>
            <img src={BUILD_PHOTO} alt="" draggable={false} />
            <span className="build-ask-text"><b>{t('buildAskBarista')}</b><small>{t('buildAskBaristaSub')}</small></span>
          </button>
        </div>
      </div>
    </div>
  )
}

const PRODUCTS: { key: TKey; price: number; img: string; bg: string }[] = [
  { key: 'prodChocolate', price: 15000, img: PHOTOS.chocolate, bg: '#1f2f6b' },
  { key: 'prodBouquet', price: 25000, img: PHOTOS.bouquet, bg: '#1d4f9a' },
  { key: 'prodTeddy', price: 20000, img: PHOTOS.teddy, bg: '#28446f' },
]

/*
 * A row of cards that drifts right-to-left on its own and follows the finger: a native horizontal
 * scroller (so flicks and drags just work) nudged forward by requestAnimationFrame; a touch, drag or
 * wheel pauses the drift for a few seconds. The content is rendered twice so the loop is seamless.
 */
/* Positive Hours background: the owner's reel clips, one after another, crossfaded, muted, looping.
 * Two stacked <video>s: while one plays, the other is loaded with the next clip. Phones get the
 * portrait crops, wide screens the full-frame versions; reduced motion keeps the photo. */
const HOURS_CLIPS_PHONE = ['/assets/featured/hours-indoor.mp4', '/assets/featured/hours-sea.mp4', '/assets/featured/hours-city.mp4', '/assets/featured/sandwich-open.mp4']
const HOURS_CLIPS_WIDE = ['/assets/featured/hours-indoor-wide.mp4', '/assets/featured/hours-city-wide.mp4', '/assets/featured/hours-sea-wide.mp4']
// Lunch Hours (owner, 2026-09-27): the owner's lunch reel; the phone cut follows the food shot by shot, the mute icon is blurred
const LUNCH_CLIPS_PHONE = ['/assets/featured/lunch-hours.mp4']
const LUNCH_CLIPS_WIDE = ['/assets/featured/lunch-hours-wide.mp4']
const LUNCH_POSTER_PHONE = '/assets/featured/lunch-hours.jpg'
const LUNCH_POSTER_WIDE = '/assets/featured/lunch-hours-wide.jpg'
// Positive Hours when it has ended (pre-order): the owner's full flat-lay photo, Instagram's carousel arrow removed
const PREORDER_PHOTO = '/assets/featured/positive-hours-preorder.jpg'
// Lunch Hours after 17:00 (pre-order): the owner's wrapped-sandwich photo, Instagram's arrows and dots removed
const LUNCH_PREORDER_PHOTO = '/assets/featured/lunch-preorder.jpg'
// after both windows close (17:00-7:30): the owner's iced-coffee pour reel (portrait, 2026-09-28), every burned-in text,
// the logo and the Instagram icons painted out frame by frame. Phones play it full screen; desktop centres it over a blurred copy
const NIGHT_CLIPS_PHONE = ['/assets/featured/night.mp4']
const NIGHT_CLIPS_WIDE = ['/assets/featured/night-wide.mp4']
function HoursVideo({ poster, phone = HOURS_CLIPS_PHONE, wide = HOURS_CLIPS_WIDE }: { poster: string; phone?: string[]; wide?: string[] }) {
  const [list] = useState(() => (window.matchMedia('(max-width: 760px)').matches ? phone : wide))
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [front, setFront] = useState(0) // which of the two players is visible
  const [srcs, setSrcs] = useState<[string, string]>([list[0], list[1 % list.length]])
  const next = useRef(2 % list.length)
  const refs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)]
  const ended = (i: number) => {
    if (i !== front) return
    const other = 1 - i
    refs[other].current?.play().catch(() => {})
    setFront(other)
    // the player that just finished loads the clip after the one now playing
    setSrcs((s) => { const copy: [string, string] = [...s] as [string, string]; copy[i] = list[next.current]; return copy })
    next.current = (next.current + 1) % list.length
  }
  // React does not reflect `muted` to the attribute; browsers only allow silent autoplay when it is there
  const arm = (el: HTMLVideoElement | null, i: number) => { (refs[i] as React.MutableRefObject<HTMLVideoElement | null>).current = el; if (el) { el.muted = true; el.setAttribute('muted', ''); el.defaultMuted = true } }
  useEffect(() => {
    const kick = () => { const v = refs[0].current; if (v && v.paused && front === 0) v.play().catch(() => {}) }
    kick()
    document.addEventListener('visibilitychange', kick)
    window.addEventListener('touchstart', kick, { passive: true, once: true })
    return () => { document.removeEventListener('visibilitychange', kick); window.removeEventListener('touchstart', kick) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (still) return <img className="bg" src={poster} alt="" />
  return (
    <>
      <img className="bg" src={poster} alt="" />
      {[0, 1].map((i) => (
        <video key={i} ref={(el) => arm(el, i)} className={'bg bg-video' + (front === i ? ' on' : '')} src={srcs[i]} muted autoPlay={i === 0} playsInline preload="auto" disablePictureInPicture onEnded={() => ended(i)} />
      ))}
    </>
  )
}

/* New this season / Mars Shop: a native horizontal scroller the customer moves by finger (or wheel);
 * it does not move on its own (owner, 2026-09-12: "only through touch scrolling"). */
function Track({ children }: { children: React.ReactNode }) {
  return <div className="fav-track" dir="ltr">{children}</div>
}


export function HomeDeck({ onOrder, onPick }: { onOrder: () => void; onPick: (item: MenuItem, o?: { checkout?: boolean }) => void }) {
  const { t } = useLang()
  const { active, text } = useCountdown()
  const lunch = useCountdown(LUNCH_HOURS) // 12:00-17:00
  const { add } = useCart()
  const [added, setAdded] = useState('')
  const [moodOpen, setMoodOpen] = useState(false)
  const [journey, setJourney] = useState(false) // the Based On Your Mood pop-up
  const [buildAsk, setBuildAsk] = useState(false) // Build Your Drink: mood or barista?
  const [barista, setBarista] = useState<Cat | true | false>(false) // Be the barista: true = the categories, or one game (Community "Make this")
  useEffect(() => onOpenBarista((g) => setBarista(g as Cat)), [])
  useEffect(() => onOpenBuild(() => setBuildAsk(true)), []) // the header / sections Build Your Drink links
  // the side panel: a season item (menu item + its card) or the Positive Hours offer
  const [panel, setPanel] = useState<{ kind: 'item'; item: MenuItem; img: string; title: string } | { kind: 'hours' } | null>(null)
  const openItem = (it: MenuItem, img: string, title: string) => setPanel({ kind: 'item', item: it, img, title })
  const related = (except: string) => SEASON.filter((f) => f.title !== except).slice(0, 3).map((f) => ({ title: f.title, img: f.img, onClick: () => { const it = item(f.names[0]); if (it) openItem(it, f.img, f.names.length > 1 ? it.name : f.title) } }))
  const addProduct = (key: TKey, p: number) => { add({ name: t(key), price: p }, 1); setAdded(key); setTimeout(() => setAdded(''), 1600) }

  const hoursSlide = (
    <section key={'hours-' + (active ? 'live' : 'pre')} className={'slide slide-photo' + (active ? ' live' : '')} id="hours" aria-labelledby="hours-title" style={{ background: '#d9c9b0' }}>
      {/* after 12:00 (pre-order) the owner's flat-lay photo instead of the video (owner, 2026-09-27) */}
      {active ? <HoursVideo poster={PHOTOS.hours} /> : <img className="bg" src={PREORDER_PHOTO} alt="" draggable={false} />}
      <div className="slide-text">
        <p className="eyebrow count" dir="auto">{active ? <>{t('offerEndsIn')} <b dir="ltr">{text}</b></> : <>{t('startsAgainAt')} <b dir="ltr">{text}</b></>}</p>
        <h2 className="slide-title" id="hours-title">Positive Hours</h2>
        <p className="slide-sub">{active ? t('offerText') : t('preOrderHint')}</p>
        <button type="button" className="pill soft" onClick={() => setPanel({ kind: 'hours' })}>{active ? t('orderNow') : t('preOrder')}</button>
      </div>
    </section>
  )
  // lunch.active: the reel + Order now at the top; after 17:00: the pre-order version (photo + countdown) under Mars Shop
  const lunchSlide = (
    <section key={'lunch-' + (lunch.active ? 'live' : 'pre')} className={'slide slide-photo slide-lunch' + (lunch.active ? ' live' : '')} id="lunch" aria-labelledby="lunch-title" style={{ background: '#c9a77a' }}>
      {lunch.active
        ? <HoursVideo poster={window.matchMedia('(max-width: 760px)').matches ? LUNCH_POSTER_PHONE : LUNCH_POSTER_WIDE} phone={LUNCH_CLIPS_PHONE} wide={LUNCH_CLIPS_WIDE} />
        : <img className="bg" src={LUNCH_PREORDER_PHOTO} alt="" draggable={false} />}
      <div className="slide-text">
        {!lunch.active && <p className="eyebrow count" dir="auto">{t('startsAgainAt')} <b dir="ltr">{lunch.text}</b></p>}
        <h2 className="slide-title" id="lunch-title">Lunch Hours</h2>
        {!lunch.active && <p className="slide-sub">{t('preOrderHint')}</p>}
        <button type="button" className="pill soft" onClick={onOrder}>{lunch.active ? t('headerOrder') : t('preOrder')}</button>
      </div>
    </section>
  )
  const nightSlide = (
    <section key="night" className="slide slide-photo slide-night" id="night" aria-label="Mars CoffeeHouse" style={{ background: '#2a120a' }}>
      <HoursVideo poster={window.matchMedia('(max-width: 760px)').matches ? '/assets/featured/night.jpg' : '/assets/featured/night-wide.jpg'} phone={NIGHT_CLIPS_PHONE} wide={NIGHT_CLIPS_WIDE} />
    </section>
  )
  // the top slide: Positive Hours (7:30-12:00), Lunch Hours (12:00-17:00), then the night reel until 7:30 (owner, 2026-09-27)
  const hero = active ? hoursSlide : lunch.active ? lunchSlide : nightSlide

  return (
    <div className={'deck' + (hero ? '' : ' no-hero')} id="top">
      {/* 1. Order band under the header, like Starbucks (owner, 2026-09-25): a line and an Order now pill that opens the menu */}
      <div className="order-band">
        <p>{t('greatDay')}</p>
        <a className="pill band-pill" href="#menu">{t('headerOrder')}</a>
      </div>
      {/* 2. Positive Hours while it runs (7:30-12:00); once it ends, Lunch Hours takes the top and Positive Hours moves under Mars Shop (owner, 2026-09-27) */}
      {hero}

      {/* 3. New this season: full-bleed photos drifting right-to-left under a fixed title; a tap orders */}
      <section className="slide slide-fav" id="seasonal" aria-labelledby="fav-title">
        <Track>
          <div className="fav-set">
              {SEASON.map((f) => {
                const items = f.names.map(item).filter((x): x is MenuItem => !!x)
                if (!items.length) return null
                // Blank Street look (owner, 2026-09-28): just the name and a "+"; a tap anywhere on the card opens the drink
                if (items.length === 1) {
                  const open = () => openItem(items[0], f.img, f.title)
                  return (
                    <article className={'fav-card season-card' + (f.cropTop ? ' crop-top' : '')} key={f.title} style={{ background: f.bg }} onClick={open}>
                      <img src={f.img} alt="" draggable={false} />
                      <div className="fav-card-text season-text">
                        <h3>{f.title}</h3>
                        <button type="button" className="season-plus" aria-label={`${t('orderNow')} ${f.title}`} onClick={(e) => { e.stopPropagation(); open() }}>
                          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg>
                        </button>
                      </div>
                    </article>
                  )
                }
                return (
                  <article className={'fav-card' + (f.cropTop ? ' crop-top' : '')} key={f.title} style={{ background: f.bg }}>
                    <img src={f.img} alt="" draggable={false} />
                    <div className="fav-card-text">
                      <h3>{f.title}</h3>
                      <div className="pills">
                        {items.map((it) => (
                          <button key={it.name} type="button" className="pill soft small" onClick={() => openItem(it, f.img, items.length === 1 ? f.title : it.name)}>
                            {items.length === 1 ? t('orderNow') : it.name.replace(' Milkshake', '')}
                          </button>
                        ))}
                      </div>
                    </div>
                  </article>
                )
              })}
          </div>
        </Track>
        <div className="slide-text fav-head">
          <p className="eyebrow">{t('coffeeEyebrow')}</p>
          <h2 className="slide-title" id="fav-title">{t('seasonEyebrow')}</h2>
        </div>
      </section>

      {/* 4. Your Mood Drink */}
      {/* 4. Build Your Drink + Based On Your Mood: two 16:9 photo cards framed by white strokes (owner, 2026-09-25) */}
      {/* 4. Build Your Drink: ONE card (owner, 2026-09-27); a tap asks: build it from your mood, or be the barista */}
      <section className="slide slide-duo slide-build-one" id="mood-home" data-period={periodOf(clockNow().getHours())}>
        <article className="duo-card duo-build" onClick={() => setBuildAsk(true)}>
          {/* the Your Mood Drink photo (owner, 2026-09-28) */}
          <img src={PHOTOS.mood} alt="" draggable={false} />
          <div className="duo-text">
            <h2>{t('cardBuild')}</h2>
            <button type="button" className="pill soft small" onClick={(e) => { e.stopPropagation(); setBuildAsk(true) }}>{t('moodStart')}</button>
          </div>
        </article>
      </section>

      {/* 5. Shop: the owner's product photos drifting under a fixed title; Add puts the product in the order */}
      <section className="slide slide-fav slide-shop" id="shop" aria-labelledby="shop-title">
        <Track>
          <div className="fav-set">
              {PRODUCTS.map((p) => (
                <article className="fav-card" key={p.key} style={{ background: p.bg }}>
                  <img src={p.img} alt="" draggable={false} />
                  <div className="fav-card-text">
                    <h3>{t(p.key)}</h3>
                    <p dir="ltr">{iqd(p.price)} IQD</p>
                    <div className="pills">
                      <button type="button" className="pill soft small" onClick={() => addProduct(p.key, p.price)}>{added === p.key ? t('shopAdded') : t('shopAdd')}</button>
                    </div>
                  </div>
                </article>
              ))}
          </div>
        </Track>
        <div className="slide-text fav-head">
          <p className="eyebrow">{t('shopEyebrow')}</p>
          <h2 className="slide-title" id="shop-title">{t('shopTitle')}</h2>
        </div>
      </section>

      {/* after 12:00 Positive Hours (pre-order) sits here: under Mars Shop, above the locations (owner, 2026-09-27) */}
      {!active && hoursSlide}
      {/* Lunch Hours pre-order (wrapped-sandwich photo) sits here whenever lunch is not running:
          during Positive Hours (owner, 2026-09-27) and after 17:00 */}
      {!lunch.active && lunchSlide}

      {/* 6. brand + locations */}
      <section className="slide slide-brand" id="about">
        <div className="brand-logo"><Logo /></div>
        <p className="brand-line">{t('footer')}</p>
        <div className="branches" id="locations">
          {[1, 2].map((n) => (
            <div className="branch" key={n}>
              <span className="branch-icon"><IconPin /></span>
              <div>
                <h3>{t('branch')} {n} · Erbil</h3>
                <p>{t('locTbc')}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="brand-copy">© Mars CoffeeHouse</p>
      </section>
      {moodOpen && <MoodDialog onPick={onPick} onClose={() => setMoodOpen(false)} />}
      {journey && <MoodJourney onPick={onPick} onWords={() => setMoodOpen(true)} onClose={() => setJourney(false)} />}
      {barista && <BaristaJourney start={barista === true ? undefined : barista} onClose={() => setBarista(false)} />}
      {buildAsk && <BuildAsk onClose={() => setBuildAsk(false)} onMood={() => { setBuildAsk(false); setJourney(true) }} onBarista={() => { setBuildAsk(false); setBarista(true) }} />}

      {panel?.kind === 'item' && (
        <SidePanel
          title={panel.title}
          img={panel.img}
          desc={DESC[panel.item.name] ? t(DESC[panel.item.name]) : ''}
          primary={t('orderNow')}
          onPrimary={() => { const it = panel.item; setPanel(null); onPick(it, { checkout: true }) }} // New this season: after Add to order, checkout (owner, 2026-09-28)
          related={related(panel.title)}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === 'hours' && (
        <SidePanel
          title="Positive Hours"
          img={PHOTOS.hours}
          desc={`${t('offerText')} ${t('preOrderHint')}`}
          primary={active ? t('orderNow') : t('preOrder')}
          onPrimary={() => { setPanel(null); onOrder() }}
          related={related('')}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  )
}
