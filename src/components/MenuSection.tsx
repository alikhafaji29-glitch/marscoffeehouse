import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../i18n'
import type { Lang } from '../i18n'
import { MENU, ORDER_MENU, CURATED } from '../menu'
import type { MenuItem } from '../menu'
import { MiniCup } from './MiniCup'
import { IconSearch } from './Icons'
import { DESC, PHOTO, TINT, categoryOf } from '../menuMeta'

/*
 * The Order screen, after the Blank Street ordering page (owner, 2026-09-10): a round search button and a
 * branch pill on top, a scrolling row of category tabs with an underline that follows the section in view,
 * then every category as a heading + cards (photo tile, name, price, one line, SOLD OUT badge).
 */
const CATEGORY_NAMES: Record<string, Record<Lang, string>> = {
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
  extra: { en: 'Extras', ar: 'إضافات', ku: 'زیادەکان' },
  sweets: { en: 'Sweets & Bakery', ar: 'حلويات ومخبوزات', ku: 'شیرینی و بەیکەری' },
  savory: { en: 'Sandwiches & More', ar: 'ساندويتشات وأكثر', ku: 'ساندویچ و زیاتر' },
}

const BADGE_LABELS = { top: 'TOP SELLER', premium: 'PREMIUM', signature: 'SIGNATURE' }
const BRANCHES = ['Erbil · Branch 1', 'Erbil · Branch 2'] // placeholders until the owner sends the addresses

const SHOW_SOLD_OUT = false // the stock flags in menu.ts are the 2026-08-24 snapshot (46 items!); turn on with a live feed

const price = (item: MenuItem, free: string) =>
  item.price === 0 ? free : typeof item.price === 'number' ? item.price.toLocaleString('en-US') : item.price[0].toLocaleString('en-US')

function Card({ item, cat, onPick }: { item: MenuItem; cat: string; onPick: (i: MenuItem) => void }) {
  const { t } = useLang()
  const photo = PHOTO[item.name]
  const line = DESC[item.name] ? t(DESC[item.name]) : item.sizes ? `${item.sizes[0]} / ${item.sizes[1]}` : ''
  return (
    <li>
      <button type="button" className={'ocard' + (item.soldOut && SHOW_SOLD_OUT ? ' sold' : '')} onClick={() => onPick(item)}>
        <span className="ocard-tile" aria-hidden="true">
          {photo ? <img src={photo} alt="" loading="lazy" /> : <MiniCup color={TINT[cat] || [200, 200, 200]} ice={cat === 'coldCoffee' || cat === 'refreshers' || cat === 'mojito' ? 1 : 0} size={64} />}
          {item.soldOut && SHOW_SOLD_OUT && <span className="ocard-sold">{t('soldOut')}</span>}
        </span>
        <span className="ocard-main">
          <span className="ocard-head">
            <span className="ocard-name">{item.name}</span>
            <span className="ocard-price" dir="ltr">{price(item, t('free'))}{item.price !== 0 && <small> IQD</small>}</span>
          </span>
          {line && <span className="ocard-line">{line}</span>}
          {item.badge && <span className={'ocard-badge ' + item.badge}>{BADGE_LABELS[item.badge]}</span>}
        </span>
      </button>
    </li>
  )
}

export function MenuSection({ onPick, gift = false }: { onPick: (item: MenuItem) => void; gift?: boolean }) {
  const { lang, t } = useLang()
  const [active, setActive] = useState(ORDER_MENU[0].id)
  const [branch, setBranch] = useState(0)
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState('')
  const tabsRef = useRef<HTMLDivElement>(null)
  const query = q.trim().toLowerCase()
  const results = useMemo(() => (query ? MENU.flatMap((c) => c.items.filter((i) => i.name.toLowerCase().includes(query)).map((i) => ({ item: i, cat: c.id }))) : []), [query])

  // the underline follows the section in view: the last section whose top has passed the line 45% down the screen
  // (the first one at the top of the list). Worked out from positions on every scroll, so arriving on the Menu screen
  // from a scrolled Home cannot leave a stale tab lit (an IntersectionObserver band saw no change at the very top).
  useEffect(() => {
    if (query) return
    let raf = 0
    const update = () => {
      raf = 0
      const heads = [...document.querySelectorAll<HTMLElement>('.osection')]
      if (!heads.length || !heads[0].getClientRects().length) return // the Menu screen is hidden (phones)
      const line = window.innerHeight * 0.45
      let cur = heads[0].dataset.cat!
      for (const h of heads) {
        if (h.getBoundingClientRect().top > line) break
        cur = h.dataset.cat!
      }
      setActive(cur)
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update) }
    const onHash = () => setTimeout(schedule, 120) // after App has switched the screen and scrolled it to the top
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('hashchange', onHash)
    update()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('hashchange', onHash)
    }
  }, [query])
  // centre the lit tab in its row: only the row scrolls sideways (scrollIntoView also scrolled the page, which on
  // desktop cancelled the scroll to a tapped category)
  useEffect(() => {
    const row = tabsRef.current
    const tab = row?.querySelector<HTMLElement>(`[data-tab="${active}"]`)
    if (!row || !tab) return
    const delta = tab.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - tab.offsetWidth) / 2
    row.scrollBy({ left: delta, behavior: 'smooth' })
  }, [active])

  const go = (id: string) => {
    setActive(id)
    const el = document.getElementById('cat-' + id)
    if (el) { const y = el.getBoundingClientRect().top + window.scrollY - 118; window.scrollTo({ top: y, behavior: 'smooth' }) }
  }

  return (
    <section className="order" id="menu">
      {gift && (
        <div className="gift-banner" role="status">
          <span>{t('giftPick')}</span>
          <a href="#menu" className="link-btn">{t('giftCancel')}</a>
        </div>
      )}
      <div className="order-top">
        <div className="order-bar">
          <button type="button" className={'order-search-btn' + (searching ? ' on' : '')} aria-label={t('searchMenu')} aria-expanded={searching} onClick={() => { setSearching((v) => !v); if (searching) setQ('') }}><IconSearch /></button>
          <label className="order-branch">
            <span className="sr-only">{t('branch')}</span>
            <select value={branch} onChange={(e) => setBranch(Number(e.target.value))}>
              {BRANCHES.map((b, i) => <option key={b} value={i}>{b}</option>)}
            </select>
          </label>
        </div>
        {searching && <input className="order-search" autoFocus placeholder={t('searchMenu')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('searchMenu')} />}
        {!query && (
          <div className="order-tabs" ref={tabsRef} role="tablist">
            {ORDER_MENU.map((c) => (
              <button key={c.id} type="button" role="tab" data-tab={c.id} aria-selected={c.id === active} className={'order-tab' + (c.id === active ? ' on' : '')} onClick={() => go(c.id)}>
                {CATEGORY_NAMES[c.id][lang]}
              </button>
            ))}
          </div>
        )}
      </div>

      {query ? (
        <div className="osection" data-cat="search">
          <h2 className="osection-title">{t('results')}</h2>
          {results.length ? <ul className="ocards">{results.map(({ item, cat }) => <Card key={item.name} item={item} cat={cat} onPick={onPick} />)}</ul> : <p className="acct-hint">{t('noResults')}</p>}
        </div>
      ) : (
        ORDER_MENU.map((c) => (
          <div className="osection" key={c.id} id={'cat-' + c.id} data-cat={c.id}>
            <h2 className="osection-title">{CATEGORY_NAMES[c.id][lang]}</h2>
            <ul className="ocards">{c.items.map((item) => <Card key={item.name} item={item} cat={CURATED.includes(c.id) ? categoryOf(item.name) : c.id} onPick={onPick} />)}</ul>
          </div>
        ))
      )}
    </section>
  )
}
