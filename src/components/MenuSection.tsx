import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import type { Lang } from '../i18n'
import { MENU, ORDER_MENU, CURATED } from '../menu'
import type { MenuItem } from '../menu'
import { MiniCup } from './MiniCup'
import { IconSearch } from './Icons'
import { DESC, TINT, categoryOf } from '../menuMeta'
import { BRANCHES, activeEvent, branchLabel, setCustomerBranch, useStaff } from '../staff/store'
import { categoryName, itemState, nameOf, photoOf } from '../menuAdmin'
import type { BranchId } from '../staff/store'
import { useS } from '../staff/strings'

/*
 * The Order screen, after the Blank Street ordering page (owner, 2026-09-10): a round search button and a
 * branch pill on top, a scrolling row of category tabs with an underline that follows the section in view,
 * then every category as a heading + cards (photo tile, name, price, one line, SOLD OUT badge).
 */
export const CATEGORY_NAMES: Record<string, Record<Lang, string>> = {
  positive: { en: 'Positive Energy', ar: 'طاقة إيجابية', ku: 'وزەی ئەرێنی' },
  season: { en: 'New Season', ar: 'جديد الموسم', ku: 'نوێی ئەم وەرزە' },
  signature: { en: 'Signature', ar: 'مشروباتنا المميزة', ku: 'تایبەتەکانی مارس' },
  coffeeMore: { en: 'Coffee & More', ar: 'قهوة وأكثر', ku: 'قاوە و زیاتر' },
  coffeeMilk: { en: 'Coffee with Milk', ar: 'قهوة بالحليب', ku: 'قاوە بە شیر' },
  coldCoffee: { en: 'Cold Coffee', ar: 'قهوة باردة', ku: 'قاوەی سارد' },
  refreshers: { en: 'Refreshers', ar: 'منعشات', ku: 'فێنککەرەوەکان' },
  milkshake: { en: 'Milk Shake', ar: 'ميلك شيك', ku: 'میلک شێک' },
  mojito: { en: 'Mojito', ar: 'موهيتو', ku: 'مۆهیتۆ' },
  smoothie: { en: 'Smoothie', ar: 'سموذي', ku: 'سموزی' },
  matcha: { en: 'Matcha Collection', ar: 'تشكيلة الماتشا', ku: 'کۆلێکشنی ماتچا' },
  autumn: { en: 'Autumn Drinks', ar: 'مشروبات الخريف', ku: 'خواردنەوەکانی پاییز' },
  extra: { en: 'Extras', ar: 'إضافات', ku: 'زیادەکان' },
  sweets: { en: 'Sweets & Bakery', ar: 'حلويات ومخبوزات', ku: 'شیرینی و بەیکەری' },
  savory: { en: 'Sandwiches & More', ar: 'ساندويتشات وأكثر', ku: 'ساندویچ و زیاتر' },
}

/** a category's name: the branch's own (as on the live menu), else ours (Positive Energy, New Season, Signature) */
export const catLabel = (id: string, lang: Lang) => categoryName(id, lang) ?? CATEGORY_NAMES[id]?.[lang] ?? id

const BADGE_LABELS = { top: 'TOP SELLER', premium: 'PREMIUM', signature: 'SIGNATURE' }


/** an item's picture as the menu shows it: staff's (or the site's) photo, else the cup drawn in its category's colour.
 *  Shared with Home's Coffee of the day (owner, 2026-10-22: "why not use the menu's photo") */
export function ItemPic({ name, cat = categoryOf(name), size = 64 }: { name: string; cat?: string; size?: number }) {
  const photo = photoOf(name)
  return photo ? <img src={photo} alt="" loading="lazy" /> : <MiniCup color={TINT[cat] || [200, 200, 200]} ice={cat === 'coldCoffee' || cat === 'refreshers' || cat === 'mojito' ? 1 : 0} size={size} />
}

function Card({ item, cat, onPick }: { item: MenuItem; cat: string; onPick: (i: MenuItem) => void }) {
  const { t, lang } = useLang()
  // the menu's own description for this branch (dashboard → Edit Item) comes first, in its own language only
  const line = itemState(item.name)?.desc[lang] || (DESC[item.name] ? t(DESC[item.name]) : '')
  const iqd = (n: number) => n.toLocaleString('en-US')
  return (
    <li>
      <button type="button" className={'ocard' + (item.soldOut ? ' sold' : '')} data-item={item.name} onClick={() => onPick(item)}>
        <span className="ocard-tile" aria-hidden="true">
          <ItemPic name={item.name} cat={cat} />
          {item.soldOut && <span className="ocard-sold">{t('soldOut')}</span>}
        </span>
        <span className="ocard-main">
          {/* Blank Street's card (owner, 2026-10-22): the name on its own (two lines at most), the description cut at two
              lines, then the price and the badge on one line; both sizes' prices, as on the live menu (2026-10-13) */}
          <span className="ocard-name">{nameOf(item.name, lang)}</span>
          {line && <span className="ocard-line">{line}</span>}
          <span className="ocard-foot">
            {Array.isArray(item.price)
              ? <span className="ocard-price" dir="ltr" title={item.sizes?.map((z, i) => `${z}: ${iqd((item.price as number[])[i])} IQD`).join(' · ')}>{item.price.map(iqd).join(' / ')}<small> IQD</small></span>
              : <span className="ocard-price" dir="ltr">{item.price === 0 ? t('free') : iqd(item.price)}{item.price !== 0 && <small> IQD</small>}</span>}
            {item.badge && <span className={'ocard-badge ' + item.badge}>{BADGE_LABELS[item.badge]}</span>}
          </span>
        </span>
      </button>
    </li>
  )
}

export function MenuSection({ onPick, gift = false }: { onPick: (item: MenuItem) => void; gift?: boolean }) {
  const { lang, t } = useLang()
  const u = useS()
  const staff = useStaff()
  // the New Season section is the dashboard's active event: its items, its name, its promo strip; without one it is left out
  const event = activeEvent()
  // an item the chosen branch does not sell is left out (menuAdmin.ts marks it hidden)
  const sections = ORDER_MENU.map((c) => ({ id: c.id, items: c.items.filter((i) => !i.hidden) })).filter((c) => c.items.length)
  const sectionName = (id: string) => (id === 'season' && event?.name[lang]) || catLabel(id, lang)
  // the menu is a list of sections first; a tap opens one, "‹ All sections" goes back (owner, 2026-10-22: "make the main
  // menu as sections like positive hours"; it was one long page with a tab row following the scroll)
  const [open, setOpen] = useState('')
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const results = query ? MENU.flatMap((c) => c.items.filter((i) => !i.hidden && [i.name, ...Object.values(itemState(i.name)?.names ?? {})].some((n) => n.toLowerCase().includes(query))).map((i) => ({ item: i, cat: c.id }))) : [] // any language
  const shown = sections.find((c) => c.id === open)
  // a section that left the menu (a branch switch, an event ended) goes back to the list
  useEffect(() => { if (open && !shown) setOpen('') }, [open, shown])
  // coming to the menu again (Order now, the header's Menu) starts at the sections
  useEffect(() => {
    const on = () => { if (location.hash === '#menu') setOpen('') }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const toTop = () => { const el = document.getElementById('menu'); if (el && el.getBoundingClientRect().top < 0) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70 }) }
  const openSection = (id: string) => { setOpen(id); requestAnimationFrame(toTop) }

  return (
    <section className="order" id="menu">
      {gift && (
        <div className="gift-banner" role="status">
          <span>{t('giftPick')}</span>
          <a href="#menu" className="link-btn">{t('giftCancel')}</a>
        </div>
      )}
      {event?.promo[lang] && !gift && <p className="promo-strip" role="note">{event.promo[lang]}</p>}
      <div className="order-top">
        <div className="order-bar">
          <button type="button" className={'order-search-btn' + (searching ? ' on' : '')} aria-label={t('searchMenu')} aria-expanded={searching} onClick={() => { setSearching((v) => !v); if (searching) setQ('') }}><IconSearch /></button>
          <label className="order-branch">
            <span className="sr-only">{t('branch')}</span>
            <select value={staff.customerBranch} onChange={(e) => setCustomerBranch(e.target.value as BranchId)}>
              {BRANCHES.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{branchLabel(b.id, lang)}</option>)}
            </select>
          </label>
        </div>
        {searching && <input className="order-search" autoFocus placeholder={t('searchMenu')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('searchMenu')} />}
      </div>

      {query ? (
        <div className="osection" data-cat="search">
          <h2 className="osection-title">{t('results')}</h2>
          {results.length ? <ul className="ocards">{results.map(({ item, cat }) => <Card key={item.name} item={item} cat={cat} onPick={onPick} />)}</ul> : <p className="acct-hint">{t('noResults')}</p>}
        </div>
      ) : !shown ? (
        <div className="osection" data-cat="sections">
          <ul className="order-sections" aria-label={u('comboSections')}>
            {sections.map((c) => (
              <li key={c.id}>
                <button type="button" className="combo-section order-section" onClick={() => openSection(c.id)}>
                  <span className="combo-section-cup" aria-hidden="true"><ItemPic name={c.items[0].name} size={40} /></span>
                  <span className="combo-section-text"><b>{sectionName(c.id)}</b><small>{c.items.length === 1 ? u('menuItem1') : u('menuItemsN', { n: c.items.length })}</small></span>
                  <span className="combo-section-go" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="osection" id={'cat-' + shown.id} data-cat={shown.id}>
          <button type="button" className="combo-sections-back" onClick={() => openSection('')}>‹ {u('comboAllSections')}</button>
          <h2 className="osection-title">{sectionName(shown.id)}</h2>
          <ul className="ocards">{shown.items.map((item) => <Card key={item.name} item={item} cat={CURATED.includes(shown.id) ? categoryOf(item.name) : shown.id} onPick={onPick} />)}</ul>
        </div>
      )}
    </section>
  )
}
