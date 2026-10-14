/*
 * Tiny page-wide events so sections can talk without prop drilling:
 * - 'mars:build'         → open the Build Your Drink question on the Home deck (header / sections links)
 * - 'mars:checkout'      → open the order basket / checkout (the mood game after Order it)
 * - 'mars:combo'         → open an offer's stepped combo order (the Positive Hours slide, or the offer's link)
 */
// Build Your Drink lives on the Home deck (#mood-home): the header / sections links go there and open its question
// (from your mood, or be the barista). The soda builder and its #build screen were removed on 2026-09-30.
export const openBuild = () => {
  if (location.hash !== '#mood-home') {
    history.pushState(null, '', '#mood-home')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
  setTimeout(() => window.dispatchEvent(new Event('mars:build')), 80)
}
/** Community "Make this": Be the barista, straight into that drink's game. */
export const openBarista = (game: string) => {
  if (location.hash !== '#mood-home') {
    history.pushState(null, '', '#mood-home')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
  setTimeout(() => window.dispatchEvent(new CustomEvent<string>('mars:barista', { detail: game })), 80)
}
export const onOpenBarista = (fn: (game: string) => void) => {
  const h = (e: Event) => fn((e as CustomEvent<string>).detail)
  window.addEventListener('mars:barista', h)
  return () => window.removeEventListener('mars:barista', h)
}
export const onOpenBuild = (fn: () => void) => {
  window.addEventListener('mars:build', fn)
  return () => window.removeEventListener('mars:build', fn)
}

export const openCheckout = () => window.dispatchEvent(new Event('mars:checkout'))
export const onCheckout = (fn: () => void) => {
  window.addEventListener('mars:checkout', fn)
  return () => window.removeEventListener('mars:checkout', fn)
}

/** An offer's combo order (staff dashboard → Offers): pick one item per group, then name / number / address. */
export const openCombo = (offerId: string) => window.dispatchEvent(new CustomEvent<string>('mars:combo', { detail: offerId }))
export const onOpenCombo = (fn: (offerId: string) => void) => {
  const h = (e: Event) => fn((e as CustomEvent<string>).detail)
  window.addEventListener('mars:combo', h)
  return () => window.removeEventListener('mars:combo', h)
}
