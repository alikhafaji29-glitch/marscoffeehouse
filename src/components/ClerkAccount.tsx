import type React from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/react'
import { useS } from '../staff/strings'
import { useLang } from '../i18n'
import { saveContact, savedContact, useMyOrders } from '../account'
import { clerkContact, saveClerkContact } from '../backend'
import { TrackCard } from './AccountScreen'

/*
 * The customer's account with Clerk (owner, 2026-10-22: "can we use clerk as auth for clients"), on when the build has
 * the Clerk app's publishable key (main.tsx). Signed out: Clerk's sign-in (its sign-up is one tap away inside it).
 * Signed in: hello and the Clerk user button (profile, sign out), and this device's orders. Ordering never needs it:
 * a signed-in customer's name and number simply fill the checkout (saveContact), and orders still go through the
 * guest path. Tying orders to the Clerk account across devices is the next step (Supabase third-party auth).
 */
export const clerkOn = !!(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim()

/* right after signing in (owner, 2026-10-22): back to Home and a small "Welcome, Ali!" with Close. A tap on Sign in /
 * Create account leaves a mark for this visit, so a customer already signed in when the page opens is not welcomed
 * again; the mark survives Google's round trip, which reloads the page */
const SIGNING = 'mars-signing-in'
const markSigning = () => { try { sessionStorage.setItem(SIGNING, '1') } catch { /* private mode: no welcome */ } }
const takeSigning = () => { try { const on = sessionStorage.getItem(SIGNING) === '1'; sessionStorage.removeItem(SIGNING); return on } catch { return false } }

export function ClerkAccount() {
  const { t } = useLang()
  const s = useS()
  const { isLoaded, isSignedIn, user } = useUser()
  const orders = useMyOrders()
  const [welcome, setWelcome] = useState('')
  useEffect(() => {
    if (!isSignedIn || !user || !takeSigning()) return
    setWelcome(user.firstName || user.fullName || '')
    if (location.hash === '#account') { history.pushState(null, '', location.pathname + location.search); window.dispatchEvent(new HashChangeEvent('hashchange')); window.scrollTo({ top: 0 }) }
  }, [isSignedIn, user])
  const welcomeBox = welcome !== '' && createPortal(
    <div className="modal-overlay" onClick={() => setWelcome('')}>
      <div className="modal welcome-box" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="welcome-title">{s('welcomeName', { name: welcome })}</h3>
        <button type="button" className="btn-pill" onClick={() => setWelcome('')}>{t('close')}</button>
      </div>
    </div>,
    document.body,
  )
  // signed in: the details kept on the account (name, phone, address from an earlier order on any device) fill this
  // device's checkout; an account with none yet takes the ones typed on this device before signing in
  useEffect(() => {
    if (!isSignedIn || !user) return
    const kept = clerkContact()
    if (kept && (kept.name || kept.phone)) { saveContact(kept); return }
    const here = savedContact()
    const name = here.name || user.firstName || user.fullName || ''
    if (here.phone || name) saveClerkContact({ ...here, ...(name && { name }) })
    if (name && !here.name) saveContact({ name })
  }, [isSignedIn, user])
  if (!isLoaded) return <div className="acct-loading" aria-busy="true" />
  if (!isSignedIn) {
    return (
      <div className="profile">
        {/* Clerk's windows open over the page (mode modal): its steps never touch the address, which picks the site's screens */}
        <div className="acct-card clerk-signin">
          <p className="acct-hint">{s('clerkWhy')}</p>
          <div className="clerk-btns">
            <SignInButton mode="modal"><button type="button" className="add-btn" onClick={markSigning}>{t('signInTitle')}</button></SignInButton>
            <SignUpButton mode="modal"><button type="button" className="mood-again dark" onClick={markSigning}>{s('clerkSignUp')}</button></SignUpButton>
          </div>
        </div>
        <TrackCard orders={orders} />
      </div>
    )
  }
  return (
    <div className="profile">
      {welcomeBox}
      <div className="acct-card clerk-me">
        <UserButton />
        <div>
          <b>{t('helloName').replace('{name}', user.firstName || user.fullName || '')}</b>
          <small dir="ltr">{user.primaryPhoneNumber?.phoneNumber || user.primaryEmailAddress?.emailAddress || ''}</small>
        </div>
      </div>
      <TrackCard orders={orders} />
    </div>
  )
}

/** the header's way in with Clerk on: the signed-in customer's initial, else the Sign in pill (owner, 2026-10-22) */
export function ClerkHeaderUser({ signIn }: { signIn: React.ReactNode }) {
  const { isSignedIn, user } = useUser()
  if (!isSignedIn || !user) return <>{signIn}</>
  const name = user.firstName || user.fullName || user.primaryEmailAddress?.emailAddress || '?'
  return <a className="header-user" href="#account" aria-label={name} title={name}>{name.slice(0, 1).toUpperCase()}</a>
}
