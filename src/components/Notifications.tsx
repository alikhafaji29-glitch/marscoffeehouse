import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { useLang } from '../i18n'
import { useAccount } from '../account'
import { markAllRead, markRead, useNotices } from '../notify'
import type { Notice } from '../notify'
import { IconBell, IconComment, IconGift, IconHeart } from './Icons'

/* Bell: gifts received, likes and comments on your creations. `bell` = the round button beside the profile row in the
 * sections menu (signed-in customers only, owner 2026-09-14); `inline` = a full-width row; default = the header button. */
function ago(at: number, lang: string, justNow: string): string {
  const s = Math.round((Date.now() - at) / 1000)
  if (s < 60) return justNow
  const [n, unit]: [number, Intl.RelativeTimeFormatUnit] = s < 3600 ? [Math.round(s / 60), 'minute'] : s < 86400 ? [Math.round(s / 3600), 'hour'] : [Math.round(s / 86400), 'day']
  try { return new Intl.RelativeTimeFormat(lang === 'ku' ? 'ckb' : lang, { numeric: 'always' }).format(-n, unit) } catch { return new Intl.RelativeTimeFormat('en').format(-n, unit) }
}

export function Notifications({ inline = false, bell = false }: { inline?: boolean; bell?: boolean }) {
  const { t, lang } = useLang()
  const a = useAccount()
  const notices = useNotices(a?.phone ?? null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const unread = notices.filter((n) => !n.read).length

  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const text = (n: Notice) => t(n.kind === 'gift' ? 'noticeGift' : n.kind === 'like' ? 'noticeLike' : 'noticeComment').replace('{name}', n.from).replace('{title}', n.title)
  const go = (n: Notice) => (_e: MouseEvent) => {
    markRead(n.id)
    setOpen(false)
    if (n.ref) setTimeout(() => document.getElementById('post-' + n.ref)?.scrollIntoView({ block: 'center', behavior: 'instant' }), 300)
  }

  return (
    <div className="notify" ref={ref}>
      <button type="button" className={bell ? 'notify-bell' : inline ? 'notify-row' : 'notify-btn'} aria-label={t('notifications') + (unread ? ` (${unread})` : '')} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <IconBell />
        {inline && <span className="notify-row-label">{t('notifications')}</span>}
        {unread > 0 && <span className="notify-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className={'notify-panel' + (inline ? ' inline' : '') + (bell ? ' bell' : '')} role="dialog" aria-label={t('notifications')}>
          <div className="notify-head">
            <h3>{t('notifications')}</h3>
            {unread > 0 && a && <button type="button" className="chip" onClick={() => markAllRead(a.phone)}>{t('markAllRead')}</button>}
          </div>
          {!a ? (
            <p className="acct-hint">{t('signInForNotices')} <a href="#account" className="inline-link" onClick={() => setOpen(false)}>{t('signInTitle')}</a></p>
          ) : notices.length === 0 ? (
            <p className="acct-hint">{t('noNotices')}</p>
          ) : (
            <ul className="notify-list">
              {notices.slice(0, 30).map((n) => (
                <li key={n.id} className={n.read ? '' : 'unread'}>
                  <a href={n.kind === 'gift' ? '#account' : '#community'} onClick={go(n)}>
                    <span className={'notify-icon ' + n.kind} aria-hidden="true">{n.kind === 'gift' ? <IconGift /> : n.kind === 'like' ? <IconHeart filled /> : <IconComment />}</span>
                    <span className="notify-text">{text(n)}<small>{ago(n.at, lang, t('justNow'))}</small></span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
