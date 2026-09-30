import { onCheckout, openBuild } from './bus'
import { TimeChanger } from './components/TimeChanger'
import { useEffect, useState } from 'react'
import { Header } from './components/Header'
import { HomeDeck } from './components/HomeDeck'
import { MenuSection } from './components/MenuSection'
import { Community } from './components/Community'
import { OrderModal } from './components/OrderModal'
import { ItemScreen } from './components/ItemScreen'
import { CartBar, CartModal } from './components/Cart'
import { TrackBar } from './components/TrackBar'
import { AccountScreen } from './components/AccountScreen'
import { GiftLanding } from './components/GiftLanding'
import { StaffScreen } from './components/StaffScreen'
import { CartProvider } from './cart'
import type { MenuItem } from './menu'

/*
 * One page on desktop; on phones the same sections behave like app screens:
 * the URL hash picks the screen (#menu, #community, #account, else home; old #build links open Build Your Drink;
 * the mood question lives on the Home slide #mood-home since 2026-09-13)
 * and the header's Order now / Home pill (the bottom tab bar is gone, owner 2026-09-14) switches between them. Anchors inside the home screen
 * (#hours, #about, #locations) still scroll there.
 */
export type View = 'home' | 'menu' | 'community' | 'account' | 'staff'
const VIEWS: View[] = ['menu', 'community', 'account', 'staff']
const GIFT = 'gift' // #gift: the Menu screen in "send a drink to a friend" mode
// anchors inside the home deck: a link to one of these from another screen goes home first
const HOME_ANCHORS = ['hours', 'lunch', 'night', 'seasonal', 'mood-home', 'shop', 'about', 'locations']
const isPhone = () => window.matchMedia('(max-width: 760px)').matches
const viewFromHash = (): View => {
  const h = location.hash.replace('#', '')
  if (h === 'mood') { history.replaceState(null, '', '#mood-home'); return 'home' } // old links to the removed Mood screen
  if (h === GIFT) return 'menu'
  if (h === 'join') return 'account' // Join now: the account screen on the new-customer (code) step
  return (VIEWS as string[]).includes(h) ? (h as View) : 'home'
}

export default function App() {
  const [orderOpen, setOrderOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null)
  const [sheetToCheckout, setSheetToCheckout] = useState(false) // opened from New this season: Add to order goes on to checkout
  const [view, setView] = useState<View>(viewFromHash)
  const [gift, setGift] = useState(() => location.hash === '#' + GIFT)
  const openOrder = () => setOrderOpen(true)
  useEffect(() => onCheckout(() => setCartOpen(true)), []) // the mood game's Order it goes straight to checkout
  useEffect(() => { if (location.hash === '#build') openBuild() }, []) // old links to the removed soda builder screen
  // desktop is one long page: a link that opens the site on a section (#menu, #community, #account, #gift, #join)
  // scrolls there once React has drawn it (the browser's own jump happens before the section exists)
  useEffect(() => {
    if (isPhone()) return
    const h = location.hash.replace('#', '')
    const id = h === GIFT ? 'menu' : h === 'join' ? 'account' : h
    if (!(VIEWS as string[]).includes(id)) return
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' }), 300)
    return () => clearTimeout(t)
  }, [])

  // the header sits over the hero in white; on app screens it needs navy (see styles.css body[data-view])
  useEffect(() => {
    document.body.dataset.view = view
  }, [view])

  useEffect(() => {
    const onHash = () => {
      const v = viewFromHash()
      setView(v)
      setGift(location.hash === '#' + GIFT)
      if (!isPhone()) return
      const id = location.hash.replace('#', '')
      // a screen switch starts at the top (after React has shown the screen); an anchor inside the
      // home screen scrolls to it instead
      const settle = () => {
        const target = v === 'home' && id && id !== 'top' ? document.getElementById(id) : null
        if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' })
        else window.scrollTo({ top: 0, behavior: 'instant' })
      }
      setTimeout(settle, 0)
      setTimeout(settle, 60)
    }
    // on phones, links to a screen switch without the browser's own anchor jump
    const onClick = (e: MouseEvent) => {
      if (!isPhone() || e.defaultPrevented) return
      const a = (e.target as HTMLElement).closest?.('a[href^="#"]') as HTMLAnchorElement | null
      if (!a) return
      const id = a.getAttribute('href')!.slice(1)
      if (!(VIEWS as string[]).includes(id) && id !== GIFT && id !== 'join' && id !== 'top' && !HOME_ANCHORS.includes(id)) return
      e.preventDefault()
      history.pushState(null, '', '#' + id)
      window.dispatchEvent(new HashChangeEvent('hashchange')) // App and Header both listen
    }
    window.addEventListener('hashchange', onHash)
    document.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('hashchange', onHash)
      document.removeEventListener('click', onClick)
    }
  }, [])

  if (view === 'staff') return <StaffScreen />
  return (
    <CartProvider basket={gift ? 'gift' : 'order'}>
      <a className="skip-link" href="#menu">Skip to menu</a>
      <Header />
      <TimeChanger />
      <main data-view={view}>
        <div className="screen screen-home">
          <HomeDeck onOrder={openOrder} onPick={(it, o) => { setSheetToCheckout(!!o?.checkout); setSheetItem(it) }} />
        </div>
        <div className="screen screen-menu">
          <MenuSection onPick={setSheetItem} gift={gift} />
        </div>
        <div className="screen screen-community">
          <Community />
        </div>
        <div className="screen screen-account">
          <AccountScreen />
        </div>
      </main>
      <GiftLanding />
      <TrackBar />
      <CartBar onOpen={() => setCartOpen(true)} />
      {sheetItem && <ItemScreen item={sheetItem} gift={gift} onClose={() => setSheetItem(null)} onAdded={sheetToCheckout ? () => { setSheetToCheckout(false); setCartOpen(true) } : undefined} />}
      {cartOpen && (
        <CartModal
          onClose={() => setCartOpen(false)}
          onCheckout={() => {
            setCartOpen(false)
            setOrderOpen(true)
          }}
        />
      )}
      {orderOpen && <OrderModal onClose={() => setOrderOpen(false)} />}
    </CartProvider>
  )
}
