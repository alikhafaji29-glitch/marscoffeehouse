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
export function Overview({ orders, go }: { orders: Order[]; go: (page: string) => void }) {
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
              <button type="button" onClick={() => go('offers')}>
                <span>{offer?.name[lang] || 'Positive Hours'}</span>
                <b className={offer?.active ? 'ok' : 'off'}>{offer?.active ? <span dir="ltr">{offer.start} – {offer.end}</span> : s('inactive')}</b>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => go('events')}>
                <span>{s('navEvents')}</span>
                <b className={ev ? 'ok' : 'off'}>{ev ? ev.name[lang] || ev.name.en : s('noneActive')}</b>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => go('tools')}>
                <span>{s('reachTitle')}</span>
                <b>{set.reach === 'whatsapp' ? 'WhatsApp' : s('reachDashboard')}</b>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => go('tools')}>
                <span>{s('deliveryPickup')}</span>
                <b>{[set.delivery && s('delivery'), set.pickup && s('pickup')].filter(Boolean).join(' + ')}</b>
              </button>
            </li>
          </ul>
        </Card>
      </div>
    </>
  )
}
