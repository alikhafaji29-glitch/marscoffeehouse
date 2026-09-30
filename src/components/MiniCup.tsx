export type RGB = [number, number, number]

/* Small brand cup for cards: liquid colour + ice hint, drawn as inline SVG. */
export function MiniCup({ color, ice, size = 64 }: { color: RGB; ice: 0 | 1 | 2; size?: number }) {
  const c = `rgb(${color[0]},${color[1]},${color[2]})`
  const light = `rgba(${Math.min(255, color[0] + 60)},${Math.min(255, color[1] + 60)},${Math.min(255, color[2] + 60)},0.9)`
  const cubes = ice === 2 ? [[26, 44], [40, 40], [33, 56], [46, 58], [22, 62]] : ice === 1 ? [[30, 60], [44, 62]] : []
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 72 100" aria-hidden="true" className="mini-cup">
      <defs>
        <clipPath id="mc-clip"><path d="M14 18h44l-5 70a4 4 0 0 1-4 3.6H23a4 4 0 0 1-4-3.6L14 18Z" /></clipPath>
      </defs>
      <path d="M14 18h44l-5 70a4 4 0 0 1-4 3.6H23a4 4 0 0 1-4-3.6L14 18Z" fill="rgba(255,255,255,0.45)" stroke="rgba(0,47,109,0.35)" strokeWidth="1.6" />
      <g clipPath="url(#mc-clip)">
        <rect x="10" y="38" width="52" height="60" fill={c} />
        <rect x="10" y="38" width="52" height="8" fill={light} />
        {cubes.map(([x, y], i) => (
          <rect key={i} x={x - 6} y={y - 6} width="12" height="12" rx="2.5" fill="rgba(255,255,255,0.75)" stroke="rgba(255,255,255,0.95)" strokeWidth="1" transform={`rotate(${(i * 23) % 40 - 20} ${x} ${y})`} />
        ))}
        <rect x="20" y="24" width="3" height="60" rx="1.5" fill="rgba(255,255,255,0.55)" />
      </g>
      <path d="M10 18h52" stroke="rgba(0,47,109,0.5)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M44 6 40 62" stroke="#0b3fa8" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
