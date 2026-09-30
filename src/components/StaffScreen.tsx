import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { LANGS, useLang } from '../i18n'
import type { Lang, TKey } from '../i18n'
import { iqd, setOrderStatus, useAllOrders } from '../account'
import type { Order } from '../account'
import { STAGES, isActive, nextStage, stageIndex, stagesFor, useNow } from '../orders'
import type { Stage } from '../orders'
import { Logo } from './Header'
import { chime, unlockAudio } from '../chime'
import { IconCheck } from './Icons'

/*
 * Staff dashboard (#staff): the incoming orders and the buttons that move each one
 * through the tracking stages the customer sees. DEMO: a PIN gate (1234) and the
 * orders stored in this browser; see src/orders.ts for what the real version needs.
 */
const PIN = '1234'
const LABEL: Record<Stage, TKey> = { received: 'stReceived', preparing: 'stPreparing', done: 'stDone', onway: 'stOnWay', delivered: 'stDelivered' }

function ago(at: number, now: number, lang: Lang, justNow: string): string {
  const s = Math.round((now - at) / 1000)
  if (s < 45) return justNow
  const rtf = new Intl.RelativeTimeFormat(lang === 'ku' ? 'ckb' : lang, { numeric: 'always' })
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute')
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour')
  return rtf.format(-Math.round(s / 86400), 'day')
}

function OrderCard({ o }: { o: Order }) {
  const { t, lang } = useLang()
  const now = useNow(15000)
  const cur = stageIndex(o)
  const next = nextStage(o)
  const stages = stagesFor(o)
  return (
    <article className={'staff-order' + (isActive(o) ? '' : ' finished')}>
      <header className="staff-order-head">
        <b dir="ltr">#{o.id}</b>
        <span className="staff-ago">{ago(o.at, now, lang, t('justNow'))}</span>
        <span className={'staff-stage s-' + stages[cur]}>{t(LABEL[stages[cur]])}</span>
      </header>
      <p className="staff-customer">
        <span className={'staff-how ' + (o.fulfil === 'delivery' ? 'deliv' : 'pick')}>{o.fulfil === 'delivery' ? t('getDelivery') : t('getPickup')}</span>
        {o.giftTo && <span className="staff-how gift">{t('giftBadge')}</span>}
        {o.customer && <>{o.customer.name} · <a dir="ltr" href={'tel:' + (o.delivery?.phone ?? o.customer.phone)}>{o.delivery?.phone ?? o.customer.phone}</a></>}
      </p>
      {o.delivery && <p className="staff-address">{o.giftTo ? `${t('giftFor')} ${o.giftTo} · ` : ''}{o.delivery.address}</p>}
      <ul className="staff-items">{o.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      <p className="staff-total"><b dir="ltr">{iqd(o.total)} IQD</b> · {o.pay === 'wallet' ? t('paidByWallet') : o.fulfil === 'delivery' ? t('payOnDelivery') : t('payAtPickup')}</p>
      <ol className="staff-steps" aria-label={t('trackOrder')}>
        {stages.map((st, i) => (
          <li key={st} className={i < cur ? 'past' : i === cur ? 'now' : ''}>
            <button type="button" onClick={() => setOrderStatus(o.id, st)} aria-current={i === cur ? 'step' : undefined}>
              <span className="staff-dot">{i < cur ? <IconCheck /> : i + 1}</span>
              <span>{t(LABEL[st])}</span>
            </button>
          </li>
        ))}
      </ol>
      {next && (
        <button type="button" className="staff-next" onClick={() => setOrderStatus(o.id, next)}>
          {t('markAs').replace('{stage}', t(LABEL[next]))}
        </button>
      )}
    </article>
  )
}

export function StaffScreen() {
  const { t, lang, setLang } = useLang()
  const [ok, setOk] = useState(() => { try { return sessionStorage.getItem('mars-staff') === '1' } catch { return false } })
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  const [tab, setTab] = useState<'active' | 'all' | Stage>('active')
  const orders = useAllOrders()
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('mars-staff-sound') !== '0' } catch { return true } })
  const toggleSound = () => {
    const on = !sound
    setSound(on)
    try { localStorage.setItem('mars-staff-sound', on ? '1' : '0') } catch { /* ignore */ }
    if (on) chime() // also unlocks audio on this tap
  }
  // a chime when an order id shows up that was not there before (not on the first render)
  const known = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = new Set(orders.map((o) => o.id))
    if (known.current && ok && sound && orders.some((o) => !known.current!.has(o.id))) chime()
    known.current = ids
  }, [orders, ok, sound])
  const enter = (e: FormEvent) => {
    e.preventDefault()
    unlockAudio()
    if (pin === PIN) { setOk(true); try { sessionStorage.setItem('mars-staff', '1') } catch { /* ignore */ } } else setErr(true)
  }
  const leave = () => { setOk(false); setPin(''); try { sessionStorage.removeItem('mars-staff') } catch { /* ignore */ } }
  const active = orders.filter((o) => isActive(o))
  const shown = tab === 'active' ? active : tab === 'all' ? orders : orders.filter((o) => (o.status ?? 'received') === tab)
  const counts = STAGES.map((st) => orders.filter((o) => (o.status ?? 'received') === st).length)

  return (
    <div className="staff">
      <header className="staff-top">
        <a href="#top" className="staff-logo"><Logo /></a>
        <h1>{t('staffTitle')}</h1>
        <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('language')}>
          {LANGS.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
        </select>
        {ok && <button type="button" className={'chip' + (sound ? ' on' : '')} aria-pressed={sound} onClick={toggleSound}>{sound ? t('soundOn') : t('soundOff')}</button>}
        {ok && <button type="button" className="chip ghost" onClick={leave}>{t('staffLeave')}</button>}
      </header>

      {!ok ? (
        <form className="staff-gate" onSubmit={enter}>
          <label htmlFor="staff-pin">{t('staffPin')}</label>
          <input id="staff-pin" inputMode="numeric" autoComplete="one-time-code" value={pin} onChange={(e) => { setPin(e.target.value); setErr(false) }} dir="ltr" />
          <button type="submit" className="pill solid">{t('staffEnter')}</button>
          <p className={'staff-hint' + (err ? ' err' : '')}>{err ? t('staffWrongPin') : t('staffPinHint')}</p>
        </form>
      ) : (
        <>
          {/* the stage counters are tabs too: tap one to see just that stage, tap it again to go back to Active */}
          <div className="staff-counts" role="tablist" aria-label={t('staffTitle')}>
            {STAGES.map((st, i) => (
              <button key={st} role="tab" aria-selected={tab === st} className={'s-' + st + (tab === st ? ' on' : '')} onClick={() => setTab(tab === st ? 'active' : st)}>
                <b>{counts[i]}</b><span>{t(LABEL[st])}</span>
              </button>
            ))}
          </div>
          <div className="staff-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'active'} className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>{t('staffActive')} · {active.length}</button>
            <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{t('staffAll')} · {orders.length}</button>
          </div>
          {shown.length ? <div className="staff-list">{shown.map((o) => <OrderCard key={o.id} o={o} />)}</div> : <p className="staff-empty">{orders.length ? t('staffNoneHere') : t('staffNoOrders')}</p>}
          <p className="demo-note">{t('staffDemoNote')}</p>
        </>
      )}
    </div>
  )
}
