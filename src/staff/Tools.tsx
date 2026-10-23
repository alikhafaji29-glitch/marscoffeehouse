import { branchName, settingsFor, update, useStaff } from './store'
import type { Settings } from './store'
import { useS } from './strings'
import { LEAD_MIN } from '../orders'
import { Card, Field, I, Switch } from './ui'

/* Tools, after the live panel's order settings: how a finished order reaches the staff, and which of Delivery /
 * Pickup the customer is offered at checkout. Per branch; saved as soon as it is changed. */
export function Tools() {
  const s = useS()
  const data = useStaff()
  const set = settingsFor(data.branch)
  const patch = (p: Partial<Settings>) => update((st) => ({ settings: { ...st.settings, [st.branch]: { ...settingsFor(st.branch), ...p } } }))
  return (
    <div className="d-narrow">
      <p className="d-lead">{s('toolsLead', { branch: branchName(data.branch) })}</p>
      <Card title={s('reachTitle')} sub={s('reachSub')}>
        <div className="d-seg big" role="radiogroup" aria-label={s('reachTitle')}>
          <button type="button" role="radio" aria-checked={set.reach === 'whatsapp'} className={set.reach === 'whatsapp' ? 'on' : ''} onClick={() => patch({ reach: 'whatsapp' })}><I.whatsapp />{s('reachWhatsapp')}</button>
          <button type="button" role="radio" aria-checked={set.reach === 'dashboard'} className={set.reach === 'dashboard' ? 'on' : ''} onClick={() => patch({ reach: 'dashboard' })}><I.cashier />{s('reachDashboard')}</button>
        </div>
        <p className="d-hint">{set.reach === 'whatsapp' ? s('reachWhatsappHint') : s('reachDashboardHint')}</p>
        {set.reach === 'whatsapp' && (
          <Field label={s('whatsappNumber')} hint={s('whatsappNumberHint')}>
            <input type="tel" inputMode="tel" dir="ltr" value={set.whatsapp} onChange={(e) => patch({ whatsapp: e.target.value.replace(/[^\d+ ]/g, '') })} placeholder="+964 750 000 0000" />
          </Field>
        )}
      </Card>
      <Card title={s('fulfilTitle')} sub={s('fulfilSub')}>
        <div className="d-switch-row line">
          <span className="d-row-icon"><I.bike /></span>
          <div><b>{s('delivery')}</b><small>{s('deliveryHint')}</small></div>
          <Switch on={set.delivery} onChange={(v) => patch({ delivery: v })} label={s('delivery')} disabled={set.delivery && !set.pickup} />
        </div>
        <div className="d-switch-row line">
          <span className="d-row-icon"><I.store /></span>
          <div><b>{s('pickup')}</b><small>{s('pickupHint')}</small></div>
          <Switch on={set.pickup} onChange={(v) => patch({ pickup: v })} label={s('pickup')} disabled={set.pickup && !set.delivery} />
        </div>
        <p className="d-hint">{s('fulfilOne')}</p>
      </Card>
      <Card title={s('leadTitle')} sub={s('leadSub')}>
        <div className="d-seg" role="radiogroup" aria-label={s('leadTitle')}>
          {[10, 15, 20, 30].map((n) => <button key={n} type="button" role="radio" aria-checked={(set.lead ?? LEAD_MIN) === n} className={(set.lead ?? LEAD_MIN) === n ? 'on' : ''} onClick={() => patch({ lead: n })}>{s('leadMin', { n })}</button>)}
        </div>
      </Card>
      <p className="demo-note">{s('savedAuto')}</p>
    </div>
  )
}
