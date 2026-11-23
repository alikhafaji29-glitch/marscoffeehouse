// The campaign photos that came with the site for Home's New Season cards; the dashboard's Events page shows them as
// each item's own picture until staff upload another (moved out of HomeDeck.tsx 2026-11-23 so both can read them).
/* "New this season": the cards that drift right-to-left (owner's photos). */
// New this season: the first three only (owner, 2026-09-28). One look (owner, 2026-09-28): every card is the owner's cup-on-white-table photo with the drink
// recoloured per item (the reference photo docs/reference/season/cup-reference.webp is in git history before commit 2026-09-30 "Delete unused files"; recolour script in that session's scratchpad season/make.py)
// 2026-10-22 (owner's two campaign photos): Pink + and Kakaw Crunch replace the mojito / smoothie / milkshake;
// `light` = a bright photo with its own title on top, so the card skips the dark top shade
export const SEASON: { names: string[]; title: string; img: string; bg: string; cropTop?: boolean; light?: boolean }[] = [
  { names: ['Pink +'], title: 'Pink +', img: '/assets/featured/season-pink.jpg', bg: '#c9e8fb', light: true },
  { names: ['Kakaw Crunch'], title: 'Kakaw Crunch', img: '/assets/featured/season-kakaw.jpg', bg: '#e9c7a5', light: true },
  { names: ['Carrot Cake'], title: 'Carrot Cake', img: '/assets/featured/season-carrot.jpg', bg: '#dc863e', light: true }, // owner's poster, 2026-10-22
]
