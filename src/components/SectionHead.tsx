import type { ReactNode } from 'react'

/* One header shape for every section: small eyebrow, title, one line. */
export function SectionHead({ eyebrow, title, sub, light = false, children }: { eyebrow?: string; title: string; sub?: string; light?: boolean; children?: ReactNode }) {
  return (
    <div className={'section-head' + (light ? ' light' : '')}>
      {eyebrow && <div className="section-eyebrow">{eyebrow}</div>}
      <h2 className="section-title">{title}</h2>
      {sub && <p className="section-sub">{sub}</p>}
      {children}
    </div>
  )
}
