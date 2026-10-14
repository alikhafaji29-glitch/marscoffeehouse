import { useCallback, useEffect, useState } from 'react'
import type { GeoPoint } from '../account'
import { useS } from '../staff/strings'
import type { SKey } from '../staff/strings'
import { IconCheck, IconPin } from './Icons'

/*
 * "Share my location" beside a delivery address (owner, 2026-10-12): the phone asks once, the pin is saved with the
 * order and the staff card opens it in Maps. The typed address stays, for the building and floor a pin cannot show.
 *
 * When location is switched off the customer is helped to switch it on rather than told it is unavailable (owner,
 * 2026-10-12): the button says why it is worth it; a refusal shows where the setting is on THIS kind of phone with a
 * Try again button; and when the customer comes back from Settings with it allowed, the pin is taken without another tap.
 * Only a page that is not secure (the shared preview links, the LAN http address) truly cannot ask; it says so.
 */
export const mapsLink = (p: GeoPoint) => `https://www.google.com/maps?q=${p.lat},${p.lng}`

type Trouble = '' | 'off' | 'weak' | 'insecure'
// where the Location setting lives differs by phone
const HOW: SKey = typeof navigator === 'undefined' ? 'locOffDesktop'
  : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'locOffIos'
    : /Android/i.test(navigator.userAgent) ? 'locOffAndroid' : 'locOffDesktop'

export function ShareLocation({ value, onChange }: { value: GeoPoint | null; onChange: (p: GeoPoint | null) => void }) {
  const s = useS()
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState<Trouble>('')
  const ask = useCallback(() => {
    if (!('geolocation' in navigator) || !window.isSecureContext) { setTrouble('insecure'); return }
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false)
        setTrouble('')
        onChange({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)), acc: Math.round(pos.coords.accuracy) })
      },
      (e) => { setBusy(false); setTrouble(e.code === e.PERMISSION_DENIED ? 'off' : 'weak') },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }, [onChange])

  // back from the phone's Settings with location now allowed: take the pin without another tap
  useEffect(() => {
    if (trouble !== 'off') return
    const check = () => {
      if (document.hidden || !navigator.permissions?.query) return
      navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') ask() }).catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check) }
  }, [trouble, ask])

  if (value) {
    return (
      <p className="share-loc got" role="status">
        <span className="share-loc-tick"><IconCheck /></span>
        <span>{s('locShared')}{value.acc ? <small> · {s('locAccuracy', { n: value.acc })}</small> : null}</span>
        <button type="button" className="link-btn" onClick={() => onChange(null)}>{s('remove')}</button>
      </p>
    )
  }
  if (trouble === 'off' || trouble === 'weak') {
    return (
      <div className="share-loc help" role="status">
        <p className="share-loc-title"><IconPin />{s(trouble === 'off' ? 'locOffTitle' : 'locWeakTitle')}</p>
        <p>{s(trouble === 'off' ? HOW : 'locWeak')}</p>
        <button type="button" className="share-loc-btn" onClick={ask} disabled={busy}>{busy ? s('locFinding') : s('locRetry')}</button>
        <p className="share-loc-or">{s('locOrType')}</p>
      </div>
    )
  }
  return (
    <div className="share-loc">
      <button type="button" className="share-loc-btn" onClick={ask} disabled={busy}><IconPin />{busy ? s('locFinding') : s('locShare')}</button>
      <p className="share-loc-msg">{trouble === 'insecure' ? s('locUnavailable') : s('locWhy')}</p>
    </div>
  )
}
