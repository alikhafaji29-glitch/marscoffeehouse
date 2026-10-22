import type { ReactNode } from 'react'
import { useLang } from '../i18n'
import { iqd } from '../account'
import type { Order } from '../account'
import { isActive, useNow } from '../orders'
import { outCount, useMenuVersion } from '../menuAdmin'
import { startOf } from './stats'
import { OrderCard } from './Orders'
import { activeEvent, branchName, positiveOffer, settingsFor, useStaff } from './store'
import { useS } from './strings'
import { Card, I, Stat } from './ui'

/* Dashboard: today at a glance for the chosen branch, the orders waiting for a hand, and what is running on the site. */
export function Overview({ orders, go, readOnly = false }: { orders: Order[]; go: (page: string) => void; readOnly?: boolean }) {
  const s = useS()
  const { lang } = useLang()
  const data = useStaff()
  useMenuVersion()
  const now = useNow(30000)
  const today = orders.filter((o) => o.at >= startOf(now))
  const active = orders.filter((o) => isActive(o))
  const offer = positiveOffer(data.branch)
  const ev = activeEvent()
  const set = settingsFor(data.branch)
  // a barista sees what is running but has no Offers, Events or Tools pages to go to (owner, 2026-10-22)
  const Fact = ({ to, children }: { to: string; children: ReactNode }) => (readOnly ? <div className="d-fact">{children}</div> : <button type="button" className="d-fact" onClick={() => go(to)}>{children}</button>)
  return (
    <>
      <p className="d-lead">{s('overviewLead', { branch: branchName(data.branch) })}</p>
      <div className="d-stats">
        <Stat icon={<I.receipt />} value={today.length} label={s('ordersTodayStat')} />
        <Stat icon={<I.money />} tone="green" value={iqd(today.reduce((n, o) => n + o.total, 0))} label={s('revenueToday')} />
        <Stat icon={<I.clock />} tone="caramel" value={active.length} label={s('activeNow')} />
        <Stat icon={<I.alert />} tone={outCount() ? 'red' : 'sky'} value={outCount()} label={s('outOfStock')} />
      </div>
      <div className="d-grid2 wide-first">
        <Card title={s('needsHand')} right={<button type="button" className="d-btn text" onClick={() => go('orders')}>{s('seeAll')}</button>}>
          {active.length
            ? <div className="staff-list">{active.slice(0, 4).map((o) => <OrderCard key={o.uid ?? o.id} o={o} />)}</div>
            : <p className="d-empty">{s('noActive')}</p>}
        </Card>
        <Card title={s('runningNow')}>
          <ul className="d-facts">
            <li>
              <Fact to="offers">
                <span>{offer?.name[lang] || 'Positive Hours'}</span>
                <b className={offer?.active ? 'ok' : 'off'}>{offer?.active ? <span dir="ltr">{offer.start} – {offer.end}</span> : s('inactive')}</b>
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
    </>
  )
}
