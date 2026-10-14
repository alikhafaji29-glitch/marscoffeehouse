import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LangProvider } from './i18n'
import './menuAdmin' // staff prices + stock onto the menu before anything reads it
import { recordVisit } from './staff/store' // the dashboard's events, offers and item details onto the site
import App from './App'
import { startSync } from './sync'
import './styles.css'

if (location.hash !== '#staff') recordVisit() // Analytics → Traffic

startSync() // with the shared backend on: this device's orders go to it, and their stages come back

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </StrictMode>,
)
