import { useLang } from '../i18n'

/*
 * One switch instead of the Delivery | Pickup choice (owner, 2026-10-25: "a button that's off says pickup; if not pressed
 * the order is delivery; some customers order pickup meaning delivery"). Off = delivery to the customer's shared
 * location, on = they collect it at the branch. The line under it says which, in plain words.
 */
export function PickupSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useLang()
  return (
    <div className={'pickup-switch' + (on ? ' on' : '')}>
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
        <span className="ps-track" aria-hidden="true"><span className="ps-knob" /></span>
        <span className="ps-label">{t('pickupSwitch')}</span>
      </button>
      <p className="ps-hint" aria-live="polite">{on ? t('pickupOnHint') : t('pickupOffHint')}</p>
    </div>
  )
}
