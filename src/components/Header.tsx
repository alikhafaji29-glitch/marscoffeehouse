import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MouseEvent } from 'react'
import { LANGS, useLang } from '../i18n'
import type { Lang } from '../i18n'
import { openBuild } from '../bus'
import { useAccount } from '../account'
import { SectionsMenu } from './SectionsMenu'
import { useNotices } from '../notify'

/* The real Mars logo (owner's PNG, white background removed → public/assets/logo.png). */
export function Logo({ white = false }: { white?: boolean }) {
  return <img className="logo-img" src={white ? '/assets/logo-white.png' : '/assets/logo.png'} alt="Mars CoffeeHouse" />
}

/* On Home the bar floats transparent over the first photo together with the order band (owner, 2026-09-27).
   Once the band has scrolled up under the bar, the bar turns solid and the band's Order now moves into it. */
const SCREENS = ['menu', 'community', 'account', 'gift', 'staff']
function useOverHero() {
  const [over, setOver] = useState(false)
  const [bandGone, setBandGone] = useState(false)
  useEffect(() => {
    const update = () => {
      const home = !SCREENS.includes(location.hash.replace('#', ''))
      const line = document.querySelector('.order-band p')
      const bar = document.querySelector('.header')
      // the band counts as gone as soon as its line reaches the bar (the solid bar then covers it, no overlap)
      const visible = line && bar ? line.getBoundingClientRect().top > bar.getBoundingClientRect().bottom - 2 : window.scrollY < 24
      setOver(home && visible)
      setBandGone(home && !visible)
      document.body.classList.toggle('band-gone', home && !visible) // the band fades out as its Order now lands in the bar
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    window.addEventListener('hashchange', update)
    const late = setTimeout(update, 300) // the deck mounts after the header on a fresh load
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); window.removeEventListener('hashchange', update); clearTimeout(late) }
  }, [])
  return { over, bandGone }
}

/* Logo top-left; top-right: nav (desktop), language, a Sign in pill (or the customer's initial), the sections button. */
/** which screen the hash points at (App switches screens with pushState + a synthetic hashchange) */
function useHash() {
  const [hash, setHash] = useState(() => location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

export function Header() {
  const { lang, setLang, t } = useLang()
  const hash = useHash()
  const onOrder = hash === '#menu' || hash === '#gift'
  const a = useAccount()
  const [open, setOpen] = useState(false)
  const hero = useOverHero()
  const over = hero.over && !open // over the open menu the bar is solid cream with navy text
  useEffect(() => { document.body.classList.toggle('sections-open', open); return () => document.body.classList.remove('sections-open') }, [open])
  const unread = useNotices(a?.phone ?? null).filter((n) => !n.read).length
  return (
    <header className={'header' + (over ? ' over' : '')}>
      <a className="logo-link" href="#top" aria-label="Mars CoffeeHouse"><Logo white={over} /></a>
      <div className="header-right">
        <nav className="nav" aria-label={t('sections')}>
          <a href="#menu">{t('menu')}</a>
          <a href="#mood-home" onClick={(e: MouseEvent) => { e.preventDefault(); openBuild() }}>{t('navBuild')}</a>
          <a href="#mood-home">{t('navMood')}</a>
          <a href="#shop">{t('navShop')}</a>
          <a href="#community">{t('navCommunity')}</a>
          <a href="#hours">{t('navHours')}</a>
          <a href="#account">{t('navAccount')}</a>
        </nav>
        <label className="lang-group">
          <span className="sr-only">{t('language')}</span>
          <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        {/* Order now in the header (replaces the bottom tab bar, owner 2026-09-14); on the Order page it turns into Home */}
        {onOrder && <a className="header-order" href="#top">{t('tabHome')}</a>}
        {/* on Home the band's Order now lands here once the band has scrolled away (owner, 2026-09-27) */}
        {hero.bandGone && <a className="header-order header-order-in" href="#menu">{t('headerOrder')}</a>}
        {/* always a way in: "Sign in" when signed out, the customer's initial once signed in (owner, 2026-09-14) */}
        {a ? (
          <a className="header-user" href="#account" aria-label={a.name} title={a.name}>{a.name.slice(0, 1).toUpperCase()}</a>
        ) : (
          <a className="header-signin" href="#account">{t('signInTitle')}</a>
        )}
        {/* the sections icon turns into an X while the menu is open (Blank Street) and closes it */}
        <button type="button" className={'sections-btn' + (open ? ' is-open' : '')} aria-label={(open ? t('close') : t('sections')) + (unread && !open ? ` (${unread})` : '')} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="burger" aria-hidden="true"><i /><i /><i /></span>
          {unread > 0 && <span className="sections-dot" aria-hidden="true" />}
        </button>
      </div>
      {open && createPortal(<SectionsMenu onClose={() => setOpen(false)} />, document.body)}
    </header>
  )
}
