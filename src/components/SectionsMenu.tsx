import { useEffect } from 'react'
import type { MouseEvent } from 'react'
import { LANGS, useLang } from '../i18n'
import type { Lang } from '../i18n'
import { openBuild } from '../bus'
import { useAccount } from '../account'
import { Notifications } from './Notifications'

/* Phone: the sections list behind the top-right button (Blank Street keeps the header to logo + actions). */
export function SectionsMenu({ onClose }: { onClose: () => void }) {
  const { t, lang, setLang } = useLang()
  const a = useAccount()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  const links: { href: string; label: string; onClick?: (e: MouseEvent) => void }[] = [
    { href: '#top', label: t('tabHome') },
    { href: '#menu', label: t('cardMenu') },
    { href: '#gift', label: t('sectionsGift') }, // Title Case labels in the sections (owner 2026-09-14)
    { href: '#mood-home', label: t('cardBuild'), onClick: (e) => { e.preventDefault(); onClose(); openBuild() } },
    { href: '#mood-home', label: t('sectionsMood') }, // "Based On Your Mood" (owner 2026-09-14)
    { href: '#shop', label: t('shopTitle') },
    { href: '#community', label: t('cardCommunity') },
    { href: '#hours', label: t('cardHours') },
  ]
  return (
    <div className="sections" role="dialog" aria-modal="true" aria-label={t('sections')}>
      {/* Starbucks-style pills (owner, 2026-09-14): Sign in (outlined) + Join now (solid) for visitors, the profile row once
          signed in; then notifications; the links below a divider (owner: "sign in and join now up, notifications up") */}
      {a ? (
        <div className="sections-me">
          <a className="sections-profile" href="#account" onClick={onClose}>
            <span className="sections-avatar" aria-hidden="true">{a.name.slice(0, 1).toUpperCase()}</span>
            <span className="sections-profile-text">
              <strong>{a.name}</strong>
              <small dir="ltr">{a.phone}</small>
            </span>
          </a>
          <Notifications bell />
        </div>
      ) : (
        <div className="sections-auth">
          <a className="pill outline" href="#account" onClick={onClose}>{t('signInTitle')}</a>
          <a className="pill solid" href="#join" onClick={onClose}>{t('joinNow')}</a>
        </div>
      )}
      <hr className="sections-divider" />
      <nav className="sections-list">
        {links.map((l) => <a key={l.href} href={l.href} onClick={l.onClick || onClose}>{l.label}</a>)}
      </nav>
      {/* small links at the bottom, like Blank Street's App / Careers / Menu / Help (owner, 2026-09-14) */}
      <nav className="sections-small" aria-label={t('aboutUs')}>
        <a href="#about" onClick={onClose}>{t('aboutUs')}</a>
        <a href="#about" onClick={onClose}>{t('help')}</a>
        <a href="#about" onClick={onClose}>{t('joinTeam')}</a>
      </nav>
      <label className="sections-lang">
        <span>{t('language')}</span>
        <select className="lang-select dark" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGS.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
        </select>
      </label>
    </div>
  )
}
