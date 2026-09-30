/* Simple line icons drawn inline (no emoji, no icon font). All are decorative: aria-hidden. */
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const IconCommunity = () => (
  <svg {...base}><circle cx="8.5" cy="9" r="3" /><circle cx="16" cy="10" r="2.5" /><path d="M3.5 19c.5-3 2.6-4.6 5-4.6s4.5 1.6 5 4.6" /><path d="M14.2 18.6c.3-2.2 1.6-3.4 3.3-3.4 1.4 0 2.6.8 3 2.6" /></svg>
)

export const IconHeart = ({ filled = false }: { filled?: boolean }) => (
  <svg {...base} fill={filled ? 'currentColor' : 'none'}><path d="M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20Z" /></svg>
)
export const IconStar = ({ filled = false }: { filled?: boolean }) => (
  <svg {...base} fill={filled ? 'currentColor' : 'none'}><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6Z" /></svg>
)
export const IconArrow = () => (
  <svg {...base}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)

export const IconBell = () => (
  <svg {...base}><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
)
export const IconGift = () => (
  <svg {...base}><rect x="3.5" y="9" width="17" height="11" rx="1.5" /><path d="M12 9v11M3.5 13.5h17" /><path d="M12 9c-1.2-1.7-2.8-4.5-4.5-3.7S7 9 12 9zm0 0c1.2-1.7 2.8-4.5 4.5-3.7S17 9 12 9z" /></svg>
)
export const IconComment = () => (
  <svg {...base}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16A2.5 2.5 0 0 1 4 13.5z" /></svg>
)
export const IconSearch = () => (
  <svg {...base}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
)
export const IconPin = () => (
  <svg {...base}><path d="M12 21s6.5-5.6 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.4 6.5 11 6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></svg>
)

export const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

export const IconTruck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7h10v9H3zM13 10h4l3 3v3h-7z" />
    <circle cx="7" cy="17.5" r="1.6" /><circle cx="16.5" cy="17.5" r="1.6" />
  </svg>
)
