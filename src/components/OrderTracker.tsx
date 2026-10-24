import { useState } from 'react'
import { useLang } from '../i18n'
import { iqd } from '../account'
import type { Order } from '../account'
import { dueOf, groupLines, isCancelled, isLater, mergedInto, reasonText, splitLine, stageIndex, stagesFor, timeText, useNow, whenText } from '../orders'
import { nameOf } from '../menuAdmin'
import { useS } from '../staff/strings'
import { backendOn } from '../backend'

const LABEL = { received: 'stReceived', preparing: 'stPreparing', done: 'stDone', onway: 'stOnWay', delivered: 'stDelivered' } as const

/** Where an order is right now: five steps, the ones passed ticked, the current one pulsing. A combo order shows one
 *  card per combo (its sandwich and drink, the drink's choices small), one under another in their own scroll box; the status
 *  bar and the window's Close stay in view under them (owner, 2026-10-21); other orders a short list, one item a line. */
export function OrderTracker({ order, dark = false }: { order: Order; dark?: boolean }) {
  const { t, lang } = useLang()
  const s = useS()
  const now = useNow()
  const cur = stageIndex(order, now)
  const groups = groupLines(order.items)
  const combos = groups.some((g) => g.combo)
  const [open, setOpen] = useState(false) // several combos: one line "Combo ×4" until Show details (owner, 2026-10-22)
  // an order for later says when it is scheduled until the café's board brings it up (LEAD_MIN before its time)
  const status = mergedInto(order) ? t('mergedTitle').replace('{code}', mergedInto(order)!) : isCancelled(order) ? t('stCancelled') : isLater(order, now) ? t('scheduledFor').replace('{t}', timeText(dueOf(order)!, lang)) : t(LABEL[stagesFor(order)[cur]])
  const item = (line: string, i: number) => {
    const p = splitLine(line)
    return <li key={i}><span>{nameOf(p.name.replace(/\s*\((8|12|16|20)oz\)$/, ''), lang)}{/\((\d+oz)\)$/.exec(p.name)?.[1] && <small dir="ltr"> {/\((\d+oz)\)$/.exec(p.name)![1]}</small>}{p.qty > 1 && <b dir="ltr"> ×{p.qty}</b>}</span>{p.extra && <small>{p.extra}</small>}</li>
  }
  return (
    <div className={'track' + (dark ? ' dark' : '')} aria-live="polite">
      <div className="track-head">
        <b dir="ltr">#{order.id}</b>
        <span dir="ltr">{iqd(order.total)} IQD</span>
      </div>
      {combos && groups.length > 1 && !open ? (
        <div className="track-combo track-sum">
          <b className="track-combo-title" dir="auto">{order.offer?.name && <span className="track-sum-name">{order.offer.name}</span>}{s('comboTimes', { n: groups.length })}</b>
          <button type="button" className="track-more" aria-expanded={false} onClick={() => setOpen(true)}>{s('showDetails')}</button>
        </div>
      ) : combos ? (<>
        <div className="track-combos">
          {groups.map((g, k) => (
            <article key={k} className="track-combo">
              <b className="track-combo-title">{s('comboN', { n: g.combo ?? k + 1 })}</b>
              <ul>{g.lines.map(item)}</ul>
            </article>
          ))}
        </div>
        {groups.length > 1 && <button type="button" className="track-more less" aria-expanded={true} onClick={() => setOpen(false)}>{s('showLess')}</button>}
      </>) : <ul className="track-lines">{order.items.map(item)}</ul>}
      {/* not at the café yet: on its way to the database, or held back by the hourly limit (owner, 2026-10-22) */}
      {backendOn && !order.synced && !isCancelled(order) && <p className={'track-send' + (order.held ? ' held' : '')} role="status">{order.held ? s('heldLimit') : s('sending')}</p>}
      {order.offer?.wantAt && <p className="track-items"><b>{t('scheduledFor').replace('{t}', whenText(order.offer.wantAt, lang))}</b></p>}
      {order.arriveAt && <p className="track-items"><b>{s('arriveAt', { t: timeText(order.arriveAt, lang) })}</b></p>}
      {order.note && <p className="track-items">{t('orderNote')}: {order.note}</p>}
      {order.delivery && <p className="track-items">{t('deliveryTo')}: {[order.delivery.address, order.delivery.location && s('locPin')].filter(Boolean).join(' · ')}</p>}
      {mergedInto(order) && (
        <div className="track-merged" role="status">
          <b>{t('mergedTitle').replace('{code}', mergedInto(order)!)}</b>
          <span>{t('mergedLine')}</span>
        </div>
      )}
      {isCancelled(order) && !mergedInto(order) && (
        <div className="track-cancelled" role="status">
          <b>{t('orderCancelled')}</b>
          {order.cancelReason && <span>{t('cancelReason')}: {reasonText(order.cancelReason, t)}</span>}
        </div>
      )}
      {/* one slim bar instead of the five-step list (owner, 2026-10-21: "keep the screen as clean as possible") */}
      {!isCancelled(order) && (
        <div className="track-progress" role="progressbar" aria-valuemin={1} aria-valuemax={stagesFor(order).length} aria-valuenow={cur + 1} aria-valuetext={status}>
          <div className="tp-segs">{stagesFor(order).map((st, i) => <span key={st} className={i < cur ? 'past' : i === cur ? 'now' : ''} />)}</div>
          <div className="tp-label"><b>{status}</b><small dir="ltr">{cur + 1} / {stagesFor(order).length}</small></div>
        </div>
      )}
    </div>
  )
}
