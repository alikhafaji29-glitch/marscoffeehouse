import type { ReactNode } from 'react'
import { useLang } from '../i18n'
import type { Deal, MenuItem } from '../menu'
import { iqd } from '../account'
import { nameOf, photoOf, photoStyle } from '../menuAdmin'
import { cotdFor, settingsFor } from '../staff/store'
import { useS } from '../staff/strings'

/*
 * Coffee of the day on Home: a slide laid out like New this season (owner, 2026-10-23: "make the slide look like new this
 * season", with Mars' own photos): the title above, then a drifting row of 4:5 photo cards with the name and a "+". A tap
 * opens the coffee in the item window at the day's one price (the smallest size). The branch's manager sets the price and
 * the coffees in Tools. A coffee without its own card photo shows its menu photo on white.
 */
const CARD: Record<string, string> = {
  Americano: '/assets/featured/cotd-americano.jpg',
  'Filter Coffee': '/assets/featured/cotd-filter.jpg',
  Espresso: '/assets/featured/cotd-espresso.jpg',
  'Turkish Coffee': '/assets/featured/cotd-turkish.jpg',
}

export function CoffeeOfTheDay({ items, onPick, Shelf }: { items: MenuItem[]; onPick: (item: MenuItem, o: { deal: Deal }) => void; Shelf: (p: { children: ReactNode }) => ReactNode }) {
  const { t, lang } = useLang()
  const s = useS()
  const cotd = cotdFor()
  if (!cotd.on || !items.length || !settingsFor().pickup) return null // pickup only: not shown while the branch takes no pickups
  const price = iqd(cotd.price)
  const pick = (it: MenuItem) => { if (!it.soldOut) onPick(it, { deal: { price: cotd.price, label: 'Coffee of the day' } }) }
  return (
    <section className="slide slide-fav" id="coffee-of-the-day" aria-labelledby="cotd-title">
      <div className="slide-text fav-head">
        <p className="eyebrow">{s('cotdSub', { price })} · {s('cotdPickupShort')}</p>
        <h2 className="slide-title" id="cotd-title">{s('cotdTitle')}</h2>
      </div>
      <Shelf>
        <div className="fav-set">
          {items.map((it) => {
            const name = nameOf(it.name, lang)
            const own = CARD[it.name]
            return (
              <article key={it.name} className={'fav-card season-card' + (own ? '' : ' light menu-pic') + (it.soldOut ? ' sold' : '')} style={{ background: own ? '#3b2314' : '#fff' }} onClick={() => pick(it)}>
                {(own || photoOf(it.name)) && <img src={own ?? photoOf(it.name)} alt="" draggable={false} style={own ? undefined : photoStyle(it.name)} />}
                <div className="fav-card-text season-text">
                  <h3>{name}{it.soldOut && <small className="cotd-sold"> · {t('soldOut')}</small>}</h3>
                  {!it.soldOut && (
                    <button type="button" className="season-plus" aria-label={`${t('orderNow')} ${name}`} onClick={(e) => { e.stopPropagation(); pick(it) }}>
                      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg>
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </Shelf>
    </section>
  )
}
