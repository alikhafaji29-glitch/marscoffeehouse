import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLang } from '../i18n'
import {
  DEMO_CODE, GIFT_CARD_AMOUNTS, REWARD_AT, TOPUP_AMOUNTS,
  buyGiftCard, claimToWallet, iqd, setPassword, signIn, signInStored, signInWithCode, signOut, storedFor, takeInbox, topUp, useAccount, useInbox, useReward,
} from '../account'
import type { Account, GiftCard, InboxGift, Order } from '../account'
import { isActive, useNow } from '../orders'
import { TrackModal } from './TrackModal'
import { useCart } from '../cart'
import { commentsFor, myPosts, removePost, useCommunity } from '../community'
import type { Post } from '../community'
import { SectionHead } from './SectionHead'
import { MiniCup } from './MiniCup'
import { SendToFriend } from './SendToFriend'
import { IconArrow, IconComment, IconCommunity, IconHeart, IconStar, IconTruck } from './Icons'

/* ---------- sign in: phone → (password | demo code → choose password → name) ---------- */
function SignIn() {
  const { t } = useLang()
  const [step, setStep] = useState<'login' | 'code' | 'setpass' | 'name'>(() => (location.hash === '#join' ? 'code' : 'login')) // #join = Join now from the sections
  // Join now (#join) from the sections menu lands on the phone-code step, also when the form is already on screen
  useEffect(() => {
    const on = () => { if (location.hash === '#join') setStep('code') }
    on()
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const okPhone = phone.replace(/\D/g, '').length >= 10
  const known = storedFor(phone)

  // phone + password; a number without a password on this phone is sent to the code path
  const login = (e: FormEvent) => {
    e.preventDefault()
    if (!okPhone) { setErr(t('badPhone')); return }
    if (!known) { setErr(t('noAccountHere')); return }
    if (!known.passHash) { setErr(t('noPasswordYet')); return }
    if (!signInStored(phone, pw)) setErr(t('wrongPassword'))
  }
  const toCode = () => { if (!okPhone) { setErr(t('badPhone')); return } setErr(''); setCode(''); setStep('code') }
  const afterCode = () => {
    if (known?.passHash) { signInWithCode(phone); return } // forgot the password: the code signs the stored account in
    setPw(''); setPw2(''); setStep('setpass') // new number, or an account that never chose a password
  }
  const afterPassword = () => {
    if (pw !== pw2) { setErr(t('passMismatch')); return }
    if (known) { signInWithCode(phone); setPassword(pw); return } // existing account: sign in, then keep the password
    setStep('name')
  }
  return (
    <div className="signin">
      <p className="demo-note">{t('demoNote')} {t('demoCodeIs').replace(/^\w/, (ch) => ch.toUpperCase())} <b>{DEMO_CODE}</b>.</p>
      {step === 'login' && (
        <form onSubmit={login} noValidate>
          <label className="field">
            <span>{t('phoneLabel')}</span>
            <input inputMode="tel" autoComplete="tel" placeholder="0750 000 0000" value={phone} onChange={(e) => { setPhone(e.target.value); setErr('') }} />
          </label>
          <label className="field">
            <span>{t('passwordLabel')}</span>
            <input type="password" autoComplete="current-password" value={pw} onChange={(e) => { setPw(e.target.value); setErr('') }} />
          </label>
          {err && <p className="field-error" role="alert">{err}</p>}
          <button type="submit" className="add-btn" disabled={!okPhone || pw.length < 1}>{t('signInTitle')}</button>
          <button type="button" className="mood-again dark" onClick={toCode}>{t('signInWithCode')}</button>
        </form>
      )}
      {step === 'code' && (
        <>
          <p className="signin-hint">{t('codeSentTo')} <b dir="ltr">{phone}</b> · {t('demoCodeIs')} <b>{DEMO_CODE}</b></p>
          <label className="field">
            <span>{t('codeLabel')}</span>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => { setCode(e.target.value); setErr('') }} />
          </label>
          {err && <p className="field-error" role="alert">{err}</p>}
          <div className="review-actions">
            <button type="button" className="wizard-back" onClick={() => { setErr(''); setStep('login') }}>{t('back')}</button>
            <button type="button" className="add-btn" disabled={code.length < 6} onClick={() => (code === DEMO_CODE ? afterCode() : setErr(t('wrongCode')))}>{t('verify')}</button>
          </div>
        </>
      )}
      {step === 'setpass' && (
        <>
          <p className="signin-hint">{t('setPasswordHint')}</p>
          <label className="field">
            <span>{t('setPassword')}</span>
            <input type="password" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setErr('') }} />
          </label>
          <label className="field">
            <span>{t('confirmPassword')}</span>
            <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => { setPw2(e.target.value); setErr('') }} />
          </label>
          {err && <p className="field-error" role="alert">{err}</p>}
          <button type="button" className="add-btn" disabled={pw.length < 6 || pw2.length < 6} onClick={afterPassword}>{t('continue')}</button>
        </>
      )}
      {step === 'name' && (
        <>
          <label className="field">
            <span>{t('nameLabel')}</span>
            <input autoComplete="given-name" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="button" className="add-btn" disabled={name.trim().length < 2} onClick={() => signIn(phone.trim(), name.trim(), pw)}>{t('finishSignIn')}</button>
        </>
      )}
    </div>
  )
}

/* ---------- a scannable-looking demo code for the counter ---------- */
function QrLike({ seed }: { seed: string }) {
  let h = 2166136261
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) }
  const n = 17
  const cells: string[] = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const finder = (x < 5 && y < 5) || (x > n - 6 && y < 5) || (x < 5 && y > n - 6)
    if (finder) { const ex = x < 5 ? x : x - (n - 5), ey = y < 5 ? y : y - (n - 5); if (ex === 0 || ey === 0 || ex === 4 || ey === 4 || (ex > 1 && ex < 3 + 1 && ey > 1 && ey < 4)) cells.push(`M${x} ${y}h1v1h-1z`); continue }
    h ^= (x * 31 + y * 17); h = Math.imul(h, 16777619)
    if ((h >>> 0) % 5 < 2) cells.push(`M${x} ${y}h1v1h-1z`)
  }
  return (
    <svg className="qr" viewBox={`-1 -1 ${n + 2} ${n + 2}`} aria-hidden="true"><rect x="-1" y="-1" width={n + 2} height={n + 2} fill="#fff" /><path d={cells.join('')} fill="#0b1a3a" /></svg>
  )
}

function GiftCardRow({ g, from }: { g: GiftCard; from: string }) {
  const { t } = useLang()
  const [sharing, setSharing] = useState(false)
  return (
    <li className={'giftcard' + (g.sentTo ? ' sent' : '')}>
      <div className="giftcard-face">
        <span className="giftcard-brand">mars</span>
        <span className="giftcard-amount">{iqd(g.amount)} <small>IQD</small></span>
        <span className="giftcard-code" dir="ltr">{g.code}</span>
      </div>
      {g.sentTo ? (
        <small className="acct-hint" dir="auto">{t('sentTo').replace('{n}', g.sentTo)}</small>
      ) : (
        <div className="creation-actions">
          <button className="chip" aria-expanded={sharing} onClick={() => setSharing((v) => !v)}>{t('sendToFriend')}</button>
        </div>
      )}
      {sharing && <SendToFriend payload={{ t: 'card', from, amount: g.amount, code: g.code }} text={`${from}: ${t('giftCards')} ${iqd(g.amount)} IQD`} cardId={g.id} onClose={() => setSharing(false)} />}
    </li>
  )
}

function InboxRow({ g }: { g: InboxGift }) {
  const { t } = useLang()
  const { add } = useCart()
  const p = g.payload
  if (p.t === 'item') {
    // a menu item a friend paid for: the price lands in the wallet and the item in the order
    return (
      <li className="creation">
        <div className="creation-main"><strong>{p.name}{p.size ? ` (${p.size})` : ''}</strong><small className="inbox-from">{t('giftFrom').replace('{name}', g.from)} · {p.address ? t('giftOnWay').replace('{address}', p.address) : t('giftPaid').replace('{n}', iqd(p.paid))}</small></div>
        <div className="creation-actions">
          {!p.address && <button className="chip" onClick={() => { claimToWallet(p.paid, `gift from ${g.from}`, 'gift-claim'); add({ name: p.name, size: p.size, price: p.price }, 1); takeInbox(g.id) }}>{t('claimAndOrder')}</button>}
          <button className="chip ghost" aria-label={t('remove')} onClick={() => takeInbox(g.id)}>×</button>
        </div>
      </li>
    )
  }
  const from = <small className="inbox-from">{t('giftFrom').replace('{name}', g.from)}</small>
  return (
    <li className="creation">
      <div className="creation-main"><strong>{t('giftCards')} · {iqd(p.amount)} IQD</strong>{from}</div>
      <div className="creation-actions">
        <button className="chip" onClick={() => { claimToWallet(p.amount, `gift card ${p.code}`, 'card-redeem'); takeInbox(g.id) }}>{t('redeemCard')}</button>
      </div>
    </li>
  )
}

function MyPostRow({ p }: { p: Post }) {
  const { t } = useLang()
  const view = () => setTimeout(() => document.getElementById('post-' + p.id)?.scrollIntoView({ block: 'center', behavior: 'instant' }), 300)
  return (
    <li className="creation">
      <MiniCup color={[242, 150, 190]} ice={1} size={40} />
      <div className="creation-main">
        <strong>{p.title}</strong>
        <small className="mypost-meta">
          <span className="mypost-stars" aria-label={`${p.rating}/5`}>{[1, 2, 3, 4, 5].map((n) => <IconStar key={n} filled={n <= p.rating} />)}</span>
          <span><IconHeart filled /> {p.hearts}</span>
          <span><IconComment /> {commentsFor(p).length}</span>
        </small>
      </div>
      <div className="creation-actions">
        <a className="chip" href="#community" onClick={view}>{t('viewPost')}</a>
        {p.mine && <button className="chip ghost" aria-label={t('remove')} onClick={() => removePost(p.id)}>×</button>}
      </div>
    </li>
  )
}

/* ---------- the signed-in screen ---------- */
function Profile({ a }: { a: Account }) {
  const { t, lang } = useLang()
  const inbox = useInbox()
  const { posts } = useCommunity()
  const mine = myPosts(posts, a.phone)
  const likes = mine.reduce((n, p) => n + p.hearts, 0)
  const replies = mine.reduce((n, p) => n + commentsFor(p).length, 0)
  const [buyMsg, setBuyMsg] = useState('')
  const pct = Math.min(100, Math.round((a.points / REWARD_AT) * 100))
  const buy = (amount: number) => {
    const card = buyGiftCard(amount)
    setBuyMsg(card ? t('cardBought') : t('notEnough'))
  }
  return (
    <div className="account-grid">
      <div className="acct-card acct-profile">
        <div className="acct-avatar" aria-hidden="true">{a.name.slice(0, 1).toUpperCase()}</div>
        <div>
          <h3>{a.name}</h3>
          <p dir="ltr">{a.phone}</p>
          <p className="acct-since">{t('memberSince')} {new Date(a.since).toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'ar' ? 'ar-IQ' : 'ku')}</p>
        </div>
        <button className="chip ghost" onClick={signOut}>{t('signOut')}</button>
      </div>

      <div className="acct-card">
        <h3><IconHeart /> {t('loyalty')}</h3>
        <p className="acct-big">{a.points} <small>{t('points')}</small></p>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={REWARD_AT} aria-valuenow={a.points} aria-label={t('loyalty')}>
          <span style={{ width: pct + '%' }} />
        </div>
        <p className="acct-hint">{t('pointsHint').replace('{n}', String(REWARD_AT - a.points))}</p>
        {a.rewards.length > 0 && (
          <ul className="rewards">
            {a.rewards.map((r) => (
              <li key={r.id} className={'reward' + (r.used ? ' used' : '')}>
                <QrLike seed={r.code} />
                <div>
                  <strong>{t('freeDrink')}</strong>
                  <small dir="ltr">{r.code}</small>
                  {r.used ? <small>{t('rewardUsed')}</small> : <button className="chip" onClick={() => useReward(r.id)}>{t('markUsed')}</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="acct-card">
        <h3>{t('wallet')}</h3>
        <p className="acct-big">{iqd(a.balance)} <small>IQD</small></p>
        <div className="chips">
          {TOPUP_AMOUNTS.map((n) => <button key={n} className="chip" onClick={() => topUp(n)}>+ {iqd(n)}</button>)}
        </div>
        <p className="acct-hint">{t('topupHint')}</p>
        {a.txns.length > 0 && (
          <ul className="txns">
            {a.txns.slice(0, 6).map((x) => (
              <li key={x.id}><span>{x.note}</span><b className={x.amount < 0 ? 'neg' : 'pos'} dir="ltr">{x.amount > 0 ? '+' : ''}{iqd(x.amount)}</b></li>
            ))}
          </ul>
        )}
      </div>

      {inbox.length > 0 && (
        <div className="acct-card acct-inbox">
          <h3>{t('giftsForYou')}</h3>
          <ul className="creations">{inbox.map((g) => <InboxRow key={g.id} g={g} />)}</ul>
        </div>
      )}

      <div className="acct-card">
        <h3><IconCommunity /> {t('navCommunityTitle')}</h3>
        <ul className="acct-stats" aria-label={t('navCommunityTitle')}>
          <li><b>{mine.length}</b><span>{t('statPosts')}</span></li>
          <li><b>{likes}</b><span>{t('statLikes')}</span></li>
          <li><b>{replies}</b><span>{t('statComments')}</span></li>
        </ul>
        {mine.length ? (
          <ul className="creations">{mine.map((p) => <MyPostRow key={p.id} p={p} />)}</ul>
        ) : (
          <p className="acct-hint">{t('noPostsYet')} <a href="#community" className="inline-link">{t('navCommunityTitle')} <IconArrow /></a></p>
        )}
      </div>

      <div className="acct-card">
        <h3>{t('giftCards')}</h3>
        <p className="acct-hint">{t('giftCardHint')}</p>
        <div className="chips">
          {GIFT_CARD_AMOUNTS.map((n) => <button key={n} className="chip" disabled={a.balance < n} onClick={() => buy(n)}>{iqd(n)}</button>)}
        </div>
        {buyMsg && <p className="acct-hint" role="status">{buyMsg}</p>}
        {a.giftCards.length > 0 && <ul className="giftcards">{a.giftCards.map((g) => <GiftCardRow key={g.id} g={g} from={a.name} />)}</ul>}
      </div>

      <TrackCard orders={a.orders} />
      <p className="demo-note">{t('demoNote')}</p>
    </div>
  )
}

/** Track order: always a button (owner, 2026-09-12) that opens the small tracker window; finished orders listed below. */
function TrackCard({ orders }: { orders: Order[] }) {
  const { t } = useLang()
  const now = useNow()
  const active = orders.filter((o) => isActive(o, now)).length
  const past = orders.filter((o) => !isActive(o, now)).slice(0, 5)
  const [open, setOpen] = useState(false)
  return (
    <div className="acct-card" id="track">
      <h3><IconTruck /> {t('trackOrder')}</h3>
      <p className="acct-hint">{active ? t('activeOrders').replace('{n}', String(active)) : t('noActiveOrder')}</p>
      <div className="chips">
        <button className="chip" onClick={() => setOpen(true)}>{t('trackOrder')}</button>
      </div>
      {past.length > 0 && (
        <>
          <p className="acct-sub">{t('pastOrders')}</p>
          <ul className="txns">
            {past.map((o) => <li key={o.id}><span>{o.items.slice(0, 2).join(', ')}{o.items.length > 2 ? '…' : ''}</span><b dir="ltr">{iqd(o.total)}</b></li>)}
          </ul>
        </>
      )}
      {open && <TrackModal orders={orders} onClose={() => setOpen(false)} />}
    </div>
  )
}

export function AccountScreen() {
  const { t } = useLang()
  const a = useAccount()
  return (
    <section className="account" id="account">
      <SectionHead eyebrow={t('accountEyebrow')} title={a ? t('helloName').replace('{name}', a.name) : t('signInTitle')} sub={a ? undefined : t('signInSub')} />
      {a ? <Profile a={a} /> : <SignIn />}
    </section>
  )
}
