import { useEffect, useState } from 'react'
import type { Lang } from './i18n'
import { getAccount, normPhone } from './account'
import { pushNotice } from './notify'

/*
 * Mars Community — DEMO store. Posts are the seeded samples below plus anything
 * the customer posts on this device (localStorage). Hearts are per device too.
 * A real backend (Supabase, approve-first moderation) replaces this file's
 * load/save functions later; the shapes are meant to survive that move.
 */

// A post is about a real menu drink: picked by the mood game ('mood'), or made in one of the Be the barista games
// ('barista', with the choices the customer made). The custom soda builder and its 'build' posts were removed on
// 2026-09-30.
export type Game = 'latte' | 'mojito' | 'milkshake' | 'smoothie' | 'matcha' | 'refreshers'
export type Recipe = { kind: 'mood'; drink: string } | { kind: 'barista'; game: Game; drink: string; opts?: string[] }

export interface Post {
  id: string
  name: string // first name only
  title: string // what the customer called it
  rating: 1 | 2 | 3 | 4 | 5
  text: string
  lang: Lang
  recipe: Recipe
  hearts: number
  createdAt: number // ms epoch
  staff?: boolean // staff pick
  mine?: boolean // posted from this device
  phone?: string // author's account number when signed in (for like/comment notices)
  comments?: Comment[] // seeded comments; customers' comments live in the comments store
}
export interface Comment { id: string; name: string; text: string; at: number; phone?: string }

const POSTS_KEY = 'mars-community-posts'
const HEARTS_KEY = 'mars-community-hearts'
const COMMENTS_KEY = 'mars-community-comments'
const DAY = 86_400_000
const now = Date.now()

const made = (game: Game, drink: string, opts: string[] = []): Recipe => ({ kind: 'barista', game, drink, opts })

// Demo posts (2026-09-30, after the soda builder was removed): drinks made in the Be the barista games and picked by
// the mood game. First names only; replaced by real, approved posts when the backend arrives.
export const SEED: Post[] = [
  { id: 'b1', name: 'Dilan', title: 'Caramel, but make it nutty', rating: 5, lang: 'en', recipe: made('latte', 'Latte Caramel', ['Hazelnut', 'Double shot']), hearts: 44, createdAt: now - 1.1 * DAY, staff: true,
    text: 'One extra pump of hazelnut on the caramel latte and a double shot. Sweet but not too sweet, and my latte art heart came out on the first try.',
    comments: [{ id: 'k1', name: 'Rawa', text: 'Caramel and hazelnut together, trying this tomorrow.', at: now - 0.6 * DAY }, { id: 'k2', name: 'Noor', text: 'The double shot is the secret.', at: now - 0.3 * DAY }] },
  { id: 'b2', name: 'سارة', title: 'موهيتو الصيف', rating: 5, lang: 'ar', recipe: made('mojito', 'Strawberry Mojito', ['بطيخ', 'نعناع وليمون']), hearts: 39, createdAt: now - 2 * DAY,
    text: 'أضفت ضخّة بطيخ إلى موهيتو الفراولة فجاء منعشًا جدًا. هرس النعناع في اللعبة ممتع، والطعم في المقهى أجمل.' },
  { id: 'b3', name: 'Zhyar', title: 'Lotus all the way down', rating: 5, lang: 'en', recipe: made('milkshake', 'Lotus Milkshake', ['Whipped cream', 'Lotus biscuit crumbs']), hearts: 36, createdAt: now - 0.6 * DAY,
    text: 'Sauce down the cup, whipped cream, biscuit crumbs on top. It is dessert in a cup and I am not sorry.',
    comments: [{ id: 'k3', name: 'Lana', text: 'Saving this for Friday night.', at: now - 0.2 * DAY }] },
  { id: 'b4', name: 'هێڤی', title: 'ماتچای ڕەنگاوڕەنگ', rating: 5, lang: 'ku', recipe: made('matcha', 'Berry Matcha', ['شیری بێ لاکتۆز']), hearts: 31, createdAt: now - 3 * DAY, staff: true,
    text: 'چینەکان زۆر جوانن: بێری لە خوارەوە، شیر، دواتر ماتچا. بە شیری بێ لاکتۆزیش هەر خۆشە.' },
  { id: 'b5', name: 'Tara', title: 'Pistachio, no drizzle', rating: 5, lang: 'en', recipe: made('milkshake', 'Pistachio Milkshake', ['No drizzle', 'Crushed pistachio']), hearts: 27, createdAt: now - 2.8 * DAY, staff: true,
    text: 'Skipped the drizzle and went for crushed pistachio on top. Nutty, smooth, and that green is lovely.' },
  { id: 'b6', name: 'Ahmed', title: 'Mango sunshine', rating: 4, lang: 'en', recipe: made('smoothie', 'Mango with Orange Smoothie', ['Extra ice']), hearts: 24, createdAt: now - 4.5 * DAY,
    text: 'Picked the mango and the game asked for the orange. Chopping is oddly satisfying. Extra ice makes it thick and cold.' },
  { id: 'b7', name: 'Aland', title: 'Iced Spanish, extra cold', rating: 5, lang: 'en', recipe: made('latte', 'Iced Spanish Latte', ['Extra ice']), hearts: 21, createdAt: now - 5 * DAY,
    text: 'Three scoops of ice and the condensed milk still comes through. My go-to after the gym.' },
  { id: 'b8', name: 'مريم', title: 'برتقال ورمان', rating: 4, lang: 'ar', recipe: made('refreshers', 'Orange Pomegranate Fresh Juice', ['ثلج خفيف']), hearts: 18, createdAt: now - 6 * DAY,
    text: 'العصير طازج فعلًا، وطبقة الرمان في الأسفل جميلة. أنصح بثلج خفيف كي لا يخفّ الطعم.' },
  { id: 'b9', name: 'شاد', title: 'چای قۆخی سارد', rating: 4, lang: 'ku', recipe: made('refreshers', 'Iced Peach Tea'), hearts: 14, createdAt: now - 7.5 * DAY,
    text: 'دەمکردنی چاکە لە یارییەکەدا خۆشە. تامی قۆخەکە سووکە و زۆر شیرین نییە.' },
  { id: 'b10', name: 'Rand', title: 'Classic, no fuss', rating: 4, lang: 'en', recipe: made('mojito', 'Lemon-Mint Mojito', ['Mint only']), hearts: 11, createdAt: now - 9 * DAY,
    text: 'No syrup, just lime, mint and soda. Simple, and it wakes you up in the afternoon.' },
  { id: 's5', name: 'Lana', title: 'Berry for a grey day', rating: 4, lang: 'en', recipe: { kind: 'mood', drink: 'Berry Matcha' }, hearts: 26, createdAt: now - 4 * DAY,
    text: 'Took the mood game feeling sleepy and sad, it gave me this. Ten minutes later I was fine. Coincidence? Maybe.' },
  { id: 's9', name: 'Noor', title: 'Sunrise pick-me-up', rating: 5, lang: 'en', recipe: { kind: 'mood', drink: 'Fresh Orange Juice' }, hearts: 17, createdAt: now - 8 * DAY,
    text: 'The mood game said something fresh and citrusy. It was right. This is my new morning drink.' },
  { id: 's11', name: 'Tara', title: 'Lime Mint Splash', rating: 5, lang: 'en', recipe: { kind: 'mood', drink: 'Lemon-Mint Mojito' }, hearts: 21, createdAt: now - 10 * DAY, staff: true,
    text: 'The mood pick I keep coming back to. Fresh, light, not too sweet.' },
]

function readLocal(): Post[] {
  try {
    const raw = localStorage.getItem(POSTS_KEY)
    return raw ? (JSON.parse(raw) as Post[]).filter((p) => p.recipe?.kind === 'mood' || p.recipe?.kind === 'barista') : []
  } catch { return [] }
}
function readHearts(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HEARTS_KEY) || '[]') as string[]) } catch { return new Set() }
}

function readComments(): Record<string, Comment[]> {
  try { return JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}') as Record<string, Comment[]> } catch { return {} }
}

let posts: Post[] = [...readLocal().map((p) => ({ ...p, mine: true })), ...SEED]
let hearted = readHearts()
let comments = readComments()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function addPost(p: Omit<Post, 'id' | 'hearts' | 'createdAt' | 'mine'>): Post {
  const post: Post = { ...p, id: 'u' + Date.now().toString(36), hearts: 0, createdAt: Date.now(), mine: true }
  posts = [post, ...posts]
  try { localStorage.setItem(POSTS_KEY, JSON.stringify(posts.filter((x) => x.mine).map(({ mine: _m, ...rest }) => rest))) } catch { /* private mode */ }
  emit()
  return post
}

/** Notify the author when someone else (signed in or not) likes or comments. */
function notifyAuthor(post: Post, kind: 'like' | 'comment', fallbackName: string) {
  const me = getAccount()
  if (!post.phone || (me && normPhone(me.phone) === normPhone(post.phone))) return
  pushNotice(post.phone, { kind, from: me?.name || fallbackName, title: post.title, ref: post.id })
}

const persistMine = () => {
  try { localStorage.setItem(POSTS_KEY, JSON.stringify(posts.filter((x) => x.mine).map(({ mine: _m, ...rest }) => rest))) } catch { /* private mode */ }
}
/** Remove one of the customer's own posts (demo: device posts only). */
export function removePost(id: string) {
  posts = posts.filter((p) => !(p.id === id && p.mine))
  persistMine()
  emit()
}
/** Posts by the signed-in number, plus older device posts that carry no number. */
export function myPosts(all: Post[], phone: string | null): Post[] {
  const me = phone ? normPhone(phone) : ''
  return all.filter((p) => (p.phone ? normPhone(p.phone) === me : p.mine))
}

export function toggleHeart(id: string, likerName = 'Someone') {
  const on = hearted.has(id)
  if (on) hearted.delete(id)
  else hearted.add(id)
  posts = posts.map((p) => (p.id === id ? { ...p, hearts: p.hearts + (on ? -1 : 1) } : p))
  try { localStorage.setItem(HEARTS_KEY, JSON.stringify([...hearted])) } catch { /* private mode */ }
  const post = posts.find((p) => p.id === id)
  if (!on && post) notifyAuthor(post, 'like', likerName)
  emit()
}

export const commentsFor = (p: Post): Comment[] => [...(p.comments || []), ...(comments[p.id] || [])]
export function addComment(postId: string, name: string, text: string, phone?: string): Comment {
  const c: Comment = { id: 'c' + Date.now().toString(36), name, text, at: Date.now(), phone }
  comments = { ...comments, [postId]: [...(comments[postId] || []), c] }
  try { localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments)) } catch { /* private mode */ }
  const post = posts.find((p) => p.id === postId)
  if (post) notifyAuthor(post, 'comment', name)
  emit()
  return c
}

export function useCommunity() {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return { posts, hearted, comments }
}

export type Tab = 'popular' | 'new' | 'staff'

export function selectPosts(all: Post[], tab: Tab): Post[] {
  let list = all
  if (tab === 'staff') list = list.filter((p) => p.staff)
  const week = Date.now() - 7 * DAY
  if (tab === 'popular') {
    const recent = list.filter((p) => p.createdAt >= week)
    const rest = list.filter((p) => p.createdAt < week)
    return [...recent.sort((a, b) => b.hearts - a.hearts), ...rest.sort((a, b) => b.hearts - a.hearts)]
  }
  return [...list].sort((a, b) => b.createdAt - a.createdAt)
}
