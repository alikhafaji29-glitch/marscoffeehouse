import { useState } from 'react'
import { useLang } from '../i18n'
import { addComment, commentsFor, selectPosts, toggleHeart, useCommunity } from '../community'
import type { Comment } from '../community'
import { useAccount } from '../account'
import type { Post, Tab } from '../community'
import { SectionHead } from './SectionHead'
import { MiniCup } from './MiniCup'
import { openBarista } from '../bus'
import { TINT, categoryOf, isIced } from '../menuMeta'
import { IconComment, IconHeart, IconStar } from './Icons'

function Stars({ n }: { n: number }) {
  return (
    <span className="post-stars" aria-label={`${n} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => <IconStar key={i} filled={i <= n} />)}
    </span>
  )
}

function Comments({ p, list }: { p: Post; list: Comment[] }) {
  const { t } = useLang()
  const a = useAccount()
  const [text, setText] = useState('')
  const [cname, setCname] = useState('')
  const post = () => {
    const txt = text.trim().slice(0, 200)
    if (!txt) return
    addComment(p.id, (a?.name || cname.trim() || t('guest')).slice(0, 24), txt, a?.phone)
    setText('')
  }
  return (
    <div className="comments">
      {list.length ? (
        <ul className="comment-list">
          {list.map((c) => <li key={c.id}><b>{c.name}</b> <span>{c.text}</span></li>)}
        </ul>
      ) : <p className="acct-hint">{t('noComments')}</p>}
      <form className="comment-form" onSubmit={(e) => { e.preventDefault(); post() }}>
        {!a && <input className="comment-name" placeholder={t('reviewNameLabel')} value={cname} maxLength={24} onChange={(e) => setCname(e.target.value)} aria-label={t('reviewNameLabel')} />}
        <input className="comment-input" placeholder={t('addComment')} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} aria-label={t('addComment')} />
        <button type="submit" className="chip solid" disabled={!text.trim()}>{t('post')}</button>
      </form>
    </div>
  )
}

function PostCard({ p, hearted, comments }: { p: Post; hearted: boolean; comments: Comment[] }) {
  const { t } = useLang()
  const a = useAccount()
  const [expanded, setExpanded] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const r = p.recipe
  const barista = r.kind === 'barista'
  const chips = [barista ? t('buildAskBarista') : t('moodDrinkTag'), r.drink, ...(barista ? r.opts ?? [] : [])]
  const cat = categoryOf(r.drink)
  return (
    <article id={'post-' + p.id} className={'post' + (p.mine ? ' mine' : '')} lang={p.lang} dir={p.lang === 'en' ? 'ltr' : 'rtl'}>
      <div className="post-top">
        <MiniCup color={TINT[cat] ?? [242, 150, 190]} ice={isIced(cat) ? 1 : 0} size={46} />
        <div className="post-head">
          <h3 className="post-title">{p.title}</h3>
          <div className="post-meta">
            <span className="post-name">{p.mine ? t('yours') : p.name}</span>
            <Stars n={p.rating} />
          </div>
        </div>
        {p.staff && <span className="post-staff">{t('staffPick')}</span>}
      </div>
      <p className={'post-text' + (expanded ? ' open' : '')} onClick={() => setExpanded((v) => !v)}>{p.text}</p>
      <ul className="post-chips" aria-label={barista ? t('buildAskBarista') : t('cardMood')}>
        {chips.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="post-actions">
        <button
          type="button"
          className={'heart' + (hearted ? ' on' : '')}
          aria-pressed={hearted}
          aria-label={`${t('recommend')} (${p.hearts})`}
          onClick={() => toggleHeart(p.id, a?.name || t('someone'))}
        >
          <IconHeart filled={hearted} /> <span>{p.hearts}</span>
        </button>
        <button type="button" className={'heart' + (showComments ? ' on-blue' : '')} aria-expanded={showComments} aria-label={`${t('comments')} (${comments.length})`} onClick={() => setShowComments((v) => !v)}>
          <IconComment /> <span>{comments.length}</span>
        </button>
        {barista
          ? <button type="button" className="add-btn make-btn" onClick={() => openBarista(r.game)}>{t('makeThis')}</button>
          : <a className="add-btn make-btn" href="#mood">{t('tryQuiz')}</a>}
      </div>
      {showComments && <Comments p={p} list={comments} />}
    </article>
  )
}

export function Community() {
  const { t } = useLang()
  const { posts, hearted } = useCommunity()
  const [tab, setTab] = useState<Tab>('popular')
  const list = selectPosts(posts, tab)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'popular', label: t('tabPopular') },
    { id: 'new', label: t('tabNew') },
    { id: 'staff', label: t('tabStaff') },
  ]

  return (
    <section className="community" id="community">
      <SectionHead eyebrow={t('communityEyebrow')} title={t('communityTitle')} sub={t('communitySub')} />
      <div className="community-controls">
        <div className="seg" role="tablist" aria-label={t('communityTitle')}>
          {tabs.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} className={'seg-btn' + (tab === x.id ? ' on' : '')} onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {list.length ? (
        <div className="post-grid">
          {list.map((p) => <PostCard key={p.id} p={p} hearted={hearted.has(p.id)} comments={commentsFor(p)} />)}
        </div>
      ) : (
        <p className="community-empty">{t('noPosts')}</p>
      )}
    </section>
  )
}
