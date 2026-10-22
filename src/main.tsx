import { ClerkProvider } from '@clerk/react'
import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { LangProvider } from './i18n'
import './menuAdmin' // staff prices + stock onto the menu before anything reads it
import { recordVisit } from './staff/store' // the dashboard's events, offers and item details onto the site
import App from './App'
import { startSync } from './sync'
import './styles.css'

if (location.hash !== '#staff') recordVisit() // Analytics → Traffic

startSync() // with the shared backend on: this device's orders go to it, and their stages come back

// customers' sign-in is Clerk's (owner, 2026-10-22), on when the build knows the app's PUBLISHABLE key
// (VITE_CLERK_PUBLISHABLE_KEY); without it (the demo build, a deploy without the key) the site runs as before
const clerkKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim()
const WithClerk = ({ children }: { children: ReactNode }) => (clerkKey ? <ClerkProvider publishableKey={clerkKey} afterSignOutUrl="/">{children}</ClerkProvider> : <>{children}</>)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WithClerk>
      <LangProvider>
        <App />
      </LangProvider>
    </WithClerk>
  </StrictMode>,
)
