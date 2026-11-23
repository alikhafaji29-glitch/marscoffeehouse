import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../i18n'
import { iqd } from '../account'
import type { Order } from '../account'
import { backendOn } from '../backend'
import { catLabel } from '../components/MenuSection'
import { MENU } from '../menu'
import { nameOf, useMenuVersion } from '../menuAdmin'
import { useNow } from '../orders'
import { customerReport } from './remote'
import { NO_FILTERS, PERIODS, applyFilters, customersFromOrders, daysAgo, num, smartCsv, sortRows } from './smart'
import type { Customer, Filters, Period, SortKey } from './smart'
import { startOf } from './stats'
import { branchName, useStaff } from './store'
import { useS } from './strings'
import type { SKey } from './strings'
import { Card, Field, I, Stat } from './ui'

const DAY = 86400000
const SHOWN = 300 // rows on the screen; the export always has them all
const PERIOD_LABEL: Record<Period, SKey> = { '7': 'r7', '30': 'r30', '90': 'r90', all: 'rAll', custom: 'srCustom' }
const dateValue = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const WEEK = [6, 0, 1, 2, 3, 4, 5] // Saturday first, as the week runs here; the numbers are JavaScript's (Sunday = 0)
const fromValue = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d).getTime() }
// one tap fills the filters; nothing is saved
const PRESETS: { key: SKey; period: Period; f: Partial<Filters> }[] = [
  { key: 'srPreRegulars', period: '30', f: { minOrders: '5' } },
  { key: 'srPreQuiet', period: 'all', f: { minOrders: '3', lastOver: '14' } },
  { key: 'srPreNew', period: '7', f: { firstWithin: '7' } },
  { key: 'srPreOnce', period: 'all', f: { minOrders: '1', maxOrders: '1', lastOver: '14' } },
]

export function SmartReport({ orders, owner }: { orders: Order[]; owner: boolean }) {
  const { lang } = useLang()
  const s = useS()
  const branch = useStaff().branch
  useMenuVersion()
  const now = useNow(60000)
  const today = startOf(now)
  const [period, setPeriod] = useState<Period>('30')
  const [from, setFrom] = useState(today - 29 * DAY)
  const [to, setTo] = useState(today)
  const [everywhere, setEverywhere] = useState(false) // the owner's sign-in: every branch together
  const [f, setF] = useState<Filters>(NO_FILTERS)
  const [rows, setRows] = useState<Customer[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'orders', desc: true })
  const [all, setAll] = useState(false)
  const [copied, setCopied] = useState(false)
  const set = (p: Partial<Filters>) => setF((x) => ({ ...x, ...p }))

  const start = period === 'all' ? 0 : period === 'custom' ? from : today - (Number(period) - 1) * DAY
  const end = period === 'custom' ? to + DAY : today + DAY
  const scope = owner && everywhere ? null : branch
  // what the database counts with: the items of the chosen category, and the chosen items
  const catItems = useMemo(() => (f.cat ? MENU.find((c) => c.id === f.cat)?.items.map((i) => i.name) ?? [] : []), [f.cat])
  const itemKey = f.items.join('|')
  useEffect(() => {
    let live = true
    setFailed(false)
    if (!backendOn) { setRows(customersFromOrders(orders, scope, start, end, f.items, catItems, Date.now())); return }
    setRows(null)
    void customerReport(scope, start, end, f.items, catItems).then((r) => { if (!live) return; if (r) setRows(r); else setFailed(true) })
    return () => { live = false }
  }, [scope, start, end, itemKey, f.cat, tick, backendOn ? 0 : orders]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => sortRows(applyFilters(rows ?? [], f, now), sort.key, sort.desc), [rows, f, now, sort])
  const sum = useMemo(() => ({ orders: list.reduce((n, c) => n + c.orders, 0), spent: list.reduce((n, c) => n + c.spent, 0) }), [list])
  const shown = all ? list : list.slice(0, SHOWN)
  const cats = MENU.filter((c) => c.id !== 'extra' && c.items.length) // add-ons (extra milk, a shot) are not what a customer comes for
  const itemsAll = useMemo(() => [...new Set(cats.flatMap((c) => c.items.map((i) => i.name)))].sort((a, b) => nameOf(a, lang).localeCompare(nameOf(b, lang))), [lang]) // eslint-disable-line react-hooks/exhaustive-deps
  // the delivery companies to choose from: the ones in the list, and the one chosen
  const couriers = useMemo(() => [...new Set([...(rows ?? []).flatMap((c) => c.couriers), ...(f.courier ? [f.courier] : [])])].sort((a, b) => a.localeCompare(b)), [rows, f.courier])
  const dayName = (d: number) => new Intl.DateTimeFormat(lang === 'ku' ? 'ckb' : lang, { weekday: 'short' }).format(new Date(2026, 10, 1 + d)) // 1 Nov 2026 is a Sunday
  const preset = (p: (typeof PRESETS)[number]) => { setPeriod(p.period); setF({ ...NO_FILTERS, ...p.f }); setSort(p.f.lastOver ? { key: 'lastAt', desc: true } : { key: 'orders', desc: true }) }
  const isPreset = (p: (typeof PRESETS)[number]) => period === p.period && JSON.stringify(f) === JSON.stringify({ ...NO_FILTERS, ...p.f })
  const clean = period === '30' && JSON.stringify(f) === JSON.stringify(NO_FILTERS)
  const day = (t?: number) => (t === undefined ? '-' : new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }))
  const exportCsv = () => {
    const text = smartCsv(list, now, branchName)
    try {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
      a.download = `mars-customers-${scope ?? 'all'}-${dateValue(now)}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    } catch { /* clipboard only */ }
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) }).catch(() => {})
  }
  const numberBox = (key: 'itemMin' | 'minOrders' | 'maxOrders' | 'lastOver' | 'lastWithin' | 'firstWithin' | 'minSpent' | 'minAvg' | 'maxAvg', label: SKey, hint?: SKey) => (
    <Field label={s(label)} hint={hint && s(hint)}>
      <input type="text" inputMode="numeric" dir="ltr" value={f[key]} className={f[key].trim() !== '' && num(f[key]) === undefined ? 'bad' : ''} onChange={(e) => set({ [key]: e.target.value.replace(/[^\d]/g, '').slice(0, 9) })} />
    </Field>
  )
  const th = (key: SortKey, label: SKey, end = false) => (
    <th className={end ? 'end' : ''} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
      <button type="button" onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== 'name' && key !== 'fav' })}>{s(label)}{sort.key === key && <span aria-hidden="true">{sort.desc ? ' ↓' : ' ↑'}</span>}</button>
    </th>
  )

  return (
    <>
      <p className="d-lead">{s('srLead')}</p>
      <div className="d-toolbar start sr-presets">
        {PRESETS.map((p) => <button key={p.key} type="button" className={'d-btn small' + (isPreset(p) ? ' solid' : ' outline')} onClick={() => preset(p)}>{s(p.key)}</button>)}
        <button type="button" className="d-btn small text" disabled={clean} onClick={() => { setPeriod('30'); setF(NO_FILTERS); setSort({ key: 'orders', desc: true }) }}>{s('srClear')}</button>
      </div>
      <Card title={s('srFilters')} sub={s('srFiltersSub')}>
        <div className="d-toolbar start">
          <div className="d-seg" role="tablist" aria-label={s('range')}>
            {PERIODS.map((p) => <button key={p} role="tab" aria-selected={p === period} className={p === period ? 'on' : ''} onClick={() => setPeriod(p)}>{s(PERIOD_LABEL[p])}</button>)}
          </div>
          {period === 'custom' && (
            <>
              <label className="deliv-date"><span>{s('delivFrom')}</span><input type="date" value={dateValue(from)} max={dateValue(to)} onChange={(e) => e.target.value && setFrom(fromValue(e.target.value))} /></label>
              <label className="deliv-date"><span>{s('delivTo')}</span><input type="date" value={dateValue(to)} min={dateValue(from)} max={dateValue(today)} onChange={(e) => e.target.value && setTo(fromValue(e.target.value))} /></label>
            </>
          )}
          {owner && (
            <div className="d-seg" role="tablist" aria-label={s('srBranch')}>
              <button role="tab" aria-selected={!everywhere} className={everywhere ? '' : 'on'} onClick={() => setEverywhere(false)}>{branchName(branch)}</button>
              <button role="tab" aria-selected={everywhere} className={everywhere ? 'on' : ''} onClick={() => setEverywhere(true)}>{s('srAllBranches')}</button>
            </div>
          )}
        </div>
        <div className="sr-grid">
          <Field label={s('srItem')} wide>
            <select value="" onChange={(e) => e.target.value && !f.items.includes(e.target.value) && set({ items: [...f.items, e.target.value] })}>
              <option value="">{f.items.length ? s('srItemMore') : s('srAny')}</option>
              {itemsAll.filter((n) => !f.items.includes(n)).map((n) => <option key={n} value={n}>{nameOf(n, lang)}</option>)}
            </select>
          </Field>
          {numberBox('itemMin', 'srItemMin', 'srItemMinHint')}
          <Field label={s('srCategory')}>
            <select value={f.cat} onChange={(e) => set({ cat: e.target.value })}>
              <option value="">{s('srAny')}</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{catLabel(c.id, lang)}</option>)}
            </select>
          </Field>
          {f.items.length > 0 && (
            <ul className="d-chips plain sr-items">
              {f.items.map((n) => <li key={n} className="d-chip">{nameOf(n, lang)}<button type="button" aria-label={s('srRemove', { name: nameOf(n, lang) })} onClick={() => set({ items: f.items.filter((x) => x !== n) })}><I.close /></button></li>)}
            </ul>
          )}
          {numberBox('minOrders', 'srMinOrders')}
          {numberBox('maxOrders', 'srMaxOrders')}
          {numberBox('minSpent', 'srMinSpent')}
          {numberBox('minAvg', 'srMinAvg')}
          {numberBox('maxAvg', 'srMaxAvg')}
          {numberBox('lastOver', 'srLastOver', 'srLastOverHint')}
          {numberBox('lastWithin', 'srLastWithin')}
          {numberBox('firstWithin', 'srFirstWithin')}
          <Field label={s('srHow')}>
            <select value={f.how} onChange={(e) => set({ how: e.target.value as Filters['how'] })}>
              <option value="">{s('srAny')}</option><option value="delivery">{s('delivery')}</option><option value="pickup">{s('pickup')}</option>
            </select>
          </Field>
          <Field label={s('srTime')}>
            <select value={f.time} onChange={(e) => set({ time: e.target.value as Filters['time'] })}>
              <option value="">{s('srAny')}</option><option value="morning">{s('srMorning')}</option><option value="afternoon">{s('srAfternoon')}</option><option value="evening">{s('srEvening')}</option>
            </select>
          </Field>
          <Field label={s('srCourier')}>
            <select value={f.courier} onChange={(e) => set({ courier: e.target.value })}>
              <option value="">{s('srAny')}</option>
              {couriers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <div className="sr-days" role="group" aria-label={s('srDays')}>
            <span>{s('srDays')}</span>
            <div>
              {WEEK.map((d) => <button key={d} type="button" aria-pressed={f.days.includes(d)} className={f.days.includes(d) ? 'on' : ''} onClick={() => set({ days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() })}>{dayName(d)}</button>)}
            </div>
          </div>
          <label className="sr-check"><input type="checkbox" checked={f.offer} onChange={(e) => set({ offer: e.target.checked })} /><span>{s('srOffer')}</span></label>
          <label className="sr-check"><input type="checkbox" checked={f.cancelled} onChange={(e) => set({ cancelled: e.target.checked })} /><span>{s('srCancelled')}</span></label>
          <label className="sr-check"><input type="checkbox" checked={f.discount} onChange={(e) => set({ discount: e.target.checked })} /><span>{s('srDiscount')}</span></label>
          <label className="sr-check"><input type="checkbox" checked={f.gift} onChange={(e) => set({ gift: e.target.checked })} /><span>{s('srGift')}</span></label>
        </div>
      </Card>

      {failed ? <p className="d-hint">{s('srFailed')} <button type="button" className="link-btn" onClick={() => setTick(tick + 1)}>{s('delivRetry')}</button></p>
        : rows === null ? <p className="d-hint">{s('srLoading')}</p>
          : (
            <>
              <div className="d-stats sr-stats">
                <Stat icon={<I.people />} tone="sky" value={list.length.toLocaleString('en-US')} label={s('srCustomers')} />
                <Stat icon={<I.orders />} value={sum.orders.toLocaleString('en-US')} label={s('srOrdersIn')} />
                <Stat icon={<I.money />} tone="green" value={iqd(sum.spent)} label={s('srSpentIn')} />
                <Stat icon={<I.receipt />} tone="caramel" value={sum.orders ? iqd(Math.round(sum.spent / sum.orders)) : '-'} label={s('srAvgOrder')} />
              </div>
              <Card title={s('srCustomers')} sub={list.length > shown.length ? s('srShowing', { n: shown.length, all: list.length }) : undefined}
                right={<button type="button" className="d-btn outline" onClick={exportCsv} disabled={!list.length}><I.download />{copied ? s('csvCopied') : s('exportCsv')}</button>}>
                {list.length ? (
                  <div className="sr-scroll">
                    <table className="d-steps sr-table">
                      <thead>
                        <tr>
                          {th('name', 'name')}<th>{s('srPhone')}</th>{scope === null && <th>{s('srBranch')}</th>}
                          {th('orders', 'srColOrders', true)}{th('spent', 'srColSpent', true)}{th('avg', 'srColAvg', true)}{th('ever', 'srColEver', true)}
                          {th('firstAt', 'srColFirst')}{th('lastAt', 'srColLast')}<th className="end">{s('srColDays')}</th>{th('fav', 'srColFav')}
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((c) => (
                          <tr key={c.phone}>
                            <th scope="row">{c.name || '-'}</th>
                            <td dir="ltr"><a href={`tel:${c.phone}`}>{c.phone}</a></td>
                            {scope === null && <td>{branchName(c.branch)}</td>}
                            <td className="end" dir="ltr">{c.orders}</td>
                            <td className="end" dir="ltr">{iqd(c.spent)}</td>
                            <td className="end" dir="ltr">{c.orders ? iqd(Math.round(c.spent / c.orders)) : '-'}</td>
                            <td className="end" dir="ltr">{c.ever}</td>
                            <td dir="ltr">{day(c.firstAt)}</td>
                            <td dir="ltr">{day(c.lastAt)}</td>
                            <td className="end" dir="ltr">{c.lastAt === undefined ? '-' : daysAgo(c.lastAt, now)}</td>
                            <td>{c.fav ? nameOf(c.fav, lang) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="d-empty">{s('srNone')}</p>}
                {list.length > SHOWN && <button type="button" className="d-btn small outline sr-more" onClick={() => setAll(!all)}>{all ? s('srShowLess') : s('srShowAll', { n: list.length })}</button>}
              </Card>
              <p className="d-hint">{s('srNote')}</p>
            </>
          )}
    </>
  )
}
