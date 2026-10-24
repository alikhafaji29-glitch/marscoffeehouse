import type { ReactNode } from 'react'
import { useLang } from '../i18n'
import { iqd } from '../account'
import type { Order } from '../account'
import { hmText, isActive, isCancelled, useNow } from '../orders'
import { outCount, useMenuVersion } from '../menuAdmin'
import { OrderCard } from './Orders'
import { activeEvent, branchName, positiveOffer, settingsFor, useStaff } from './store'
import { useS } from './strings'
import type { SKey } from './strings'
import { useRemote } from './remote'
import { backendOn } from '../backend'
import { localFeedback } from '../feedback'
import { OrderFilterBar, PhoneIcon, ago, useOrderFilter } from './Orders'
import { Card, I, Stat } from './ui'

/* Dashboard: today at a glance for the chosen branch, the orders waiting for a hand, and what is running on the site. */
export function Overview({ orders, go, readOnly = false }: { orders: Order[]; go: (page: string) => void; readOnly?: boolean }) {
  const s = useS()
  const { lang, t } = useLang()
  const data = useStaff()
  useMenuVersion()
  const now = useNow(30000)
  // the date picks the day of the figures; the search narrows the orders waiting for a hand (owner, 2026-10-24)
  const f = useOrderFilter()
  const today = orders.filter((o) => f.byDay(o))
  const active = orders.filter((o) => isActive(o) && f.byText(o))
  const dayLabel = f.day ? new Date(f.day + 'T12:00').toLocaleDateString(lang === 'ku' ? 'ckb' : lang, { day: 'numeric', month: 'short' }) : ''
  const offer = positiveOffer(data.branch)
  const ev = activeEvent()
  const set = settingsFor(data.branch)
  // customer feedback for this branch: the database's (signed-in staff) or this browser's (the demo build)
  const remote = useRemote()
  const feedback = (backendOn ? remote.feedback : localFeedback()).filter((f) => f.branch === data.branch).slice(0, 8)
  // a barista sees what is running but has no Offers, Events or Tools pages to go to (owner, 2026-10-22)
  const Fact = ({ to, children }: { to: string; children: ReactNode }) => (readOnly ? <div className="d-fact">{children}</div> : <button type="button" className="d-fact" onClick={() => go(to)}>{children}</button>)
  return (
    <>
      <p className="d-lead">{s('overviewLead', { branch: branchName(data.branch) })}</p>
      <OrderFilterBar f={f} />
      <div className="d-stats">
        <Stat icon={<I.receipt />} value={today.length} label={f.today ? s('ordersTodayStat') : f.day ? s('ordersDayStat', { d: dayLabel }) : s('ordersAllStat')} />
        <Stat icon={<I.money />} tone="green" value={iqd(today.filter((o) => !isCancelled(o)).reduce((n, o) => n + o.total, 0))} label={f.today ? s('revenueToday') : f.day ? s('revenueDay', { d: dayLabel }) : s('revenueAll')} />
        <Stat icon={<I.clock />} tone="caramel" value={active.length} label={s('activeNow')} />
        <Stat icon={<I.alert />} tone={outCount() ? 'red' : 'sky'} value={outCount()} label={s('outOfStock')} />
      </div>
      <div className="d-grid2 wide-first">
        <Card title={s('needsHand')} right={<button type="button" className="d-btn text" onClick={() => go('orders')}>{s('seeAll')}</button>}>
          {active.length
            ? <div className="staff-list">{active.slice(0, 4).map((o) => <OrderCard key={o.uid ?? o.id} o={o} all={orders} />)}</div>
            : <p className="d-empty">{s('noActive')}</p>}
        </Card>
        <Card title={s('runningNow')}>
          <ul className="d-facts">
            <li>
              <Fact to="offers">
                <span>{offer?.name[lang] || 'Positive Hours'}</span>
                <b className={offer?.active ? 'ok' : 'off'}>{offer?.active ? <span dir="ltr">{hmText(offer.start, lang)} – {hmText(offer.end, lang)}</span> : s('inactive')}</b>
              </Fact>
            </li>
            <li>
              <Fact to="events">
                <span>{s('navEvents')}</span>
                <b className={ev ? 'ok' : 'off'}>{ev ? ev.name[lang] || ev.name.en : s('noneActive')}</b>
              </Fact>
            </li>
            <li>
              <Fact to="tools">
                <span>{s('reachTitle')}</span>
                <b>{set.reach === 'whatsapp' ? 'WhatsApp' : s('reachDashboard')}</b>
              </Fact>
            </li>
            <li>
              <Fact to="tools">
                <span>{s('deliveryPickup')}</span>
                <b>{[set.delivery && s('delivery'), set.pickup && s('pickup')].filter(Boolean).join(' + ')}</b>
              </Fact>
            </li>
          </ul>
        </Card>
      </div>
      <Card title={s('fbCardTitle')}>
        {feedback.length ? (
          <ul className="d-feedback">
            {feedback.map((f) => (
              <li key={f.order + f.kind}>
                <div className="d-fb-head">
                  {f.kind === 'received' && f.rating ? <b className="d-fb-stars" aria-label={`${f.rating} / 5`}>{'★'.repeat(f.rating)}<span>{'★'.repeat(5 - f.rating)}</span></b> : <b className="d-fb-cancel">{s('fbCancelledTag')}</b>}
                  <small dir="ltr">#{f.code} · {ago(f.at, now, lang, t('justNow'))}</small>
                </div>
                {(f.name || f.phone) && (
                  <p className="d-fb-who">
                    {f.name && <b>{f.name}</b>}
                    {f.phone && <a className="staff-phone" dir="ltr" href={'tel:' + f.phone}><PhoneIcon />{f.phone}</a>}
                  </p>
                )}
                {f.tags.length > 0 && <p className="d-fb-tags">{f.tags.map((id) => <span key={id}>{s(('fb_' + id) as SKey)}</span>)}</p>}
                {f.comment && <p className="d-fb-comment">“{f.comment}”</p>}
              </li>
            ))}
          </ul>
        ) : <p className="d-empty">{s('fbNone')}</p>}
      </Card>
    </>
  )
}