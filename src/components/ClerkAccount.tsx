import type React from 'react'
import { useEffect } from 'react'
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/react'
import { useS } from '../staff/strings'
import { useLang } from '../i18n'
import { saveContact, useMyOrders } from '../account'
import { TrackCard } from './AccountScreen'

/*
 * The customer's account with Clerk (owner, 2026-10-22: "can we use clerk as auth for clients"), on when the build has
 * the Clerk app's publishable key (main.tsx). Signed out: Clerk's sign-in (its sign-up is one tap away inside it).
 * Signed in: hello and the Clerk user button (profile, sign out), and this device's orders. Ordering never needs it:
 * a signed-in customer's name and number simply fill the checkout (saveContact), and orders still go through the
 * guest path. Tying orders to the Clerk account across devices is the next step (Supabase third-party auth).
 */
export const clerkOn = !!(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim()

export function ClerkAccount() {
  const { t } = useLang()
  const s = useS()
  const { isLoaded, isSignedIn, user } = useUser()
  const orders = useMyOrders()
  // a signed-in customer's first name and phone (when the account has one) fill the next checkout
  useEffect(() => {
    if (!isSignedIn || !user) return
    const name = user.firstName || user.fullName || ''
    const phone = user.primaryPhoneNumber?.phoneNumber?.replace(/^\+964/, '0') ?? ''
    if (name || phone) saveContact({ ...(name && { name }), ...(phone && { phone }) })
  }, [isSignedIn, user])
  if (!isLoaded) return <div className="acct-loading" aria-busy="true" />
  if (!isSignedIn) {
    return (
      <div className="profile">
        {/* Clerk's windows open over the page (mode modal): its steps never touch the address, which picks the site's screens */}
        <div className="acct-card clerk-signin">
          <p className="acct-hint">{s('clerkWhy')}</p>
          <div className="clerk-btns">
            <SignInButton mode="modal"><button type="button" className="add-btn">{t('signInTitle')}</button></SignInButton>
            <SignUpButton mode="modal"><button type="button" className="mood-again dark">{s('clerkSignUp')}</button></SignUpButton>
          </div>
        </div>
        <TrackCard orders={orders} />
      </div>
    )
  }
  return (
    <div className="profile">
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
