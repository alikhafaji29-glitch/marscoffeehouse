import { clockNow } from './clock'
import { MENU } from './menu'
import type { MenuItem } from './menu'
import type { Lang } from './i18n'

/*
 * "Your Mood Drink" engine. The customer describes how they feel; we answer with
 * one drink from the menu (the custom soda builder was removed on 2026-09-30).
 *
 * Who answers, in order:
 *  1. Claude, through the artifact runtime (`claude.use('sample')`) when the page
 *     is opened inside claude.ai — the phone demo.
 *  2. POST /api/mood — the Vite dev route (needs ANTHROPIC_API_KEY) today, a
 *     backend function on the real site.
 * Free text is answered by the AI only (owner, 2026-09-29: "don't use word triggers, just the API / AI logic"): when
 * neither answers, askMood throws MoodUnavailable and the page says so. The mood game passes its own table as the
 * fallback, so the game always answers.
 */
export type MoodAnswer = { kind: 'menu'; item: MenuItem; reason: string }
export type MoodSource = 'claude' | 'api' | 'local'

const DRINK_CATS = ['coffeeMore', 'coffeeMilk', 'coldCoffee', 'refreshers', 'milkshake', 'mojito', 'smoothie', 'matcha']
export const drinkItems = (): (MenuItem & { cat: string })[] =>
  MENU.filter((c) => DRINK_CATS.includes(c.id)).flatMap((c) => c.items.map((i) => ({ ...i, cat: c.id })))
const findItem = (name: string) => {
  const n = name.trim().toLowerCase()
  return drinkItems().find((i) => i.name.toLowerCase() === n) || drinkItems().find((i) => i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase()))
}
const LANG_NAME: Record<Lang, string> = { en: 'English', ar: 'formal Modern Standard Arabic', ku: 'Sorani Kurdish' }

export function moodPrompt(text: string, lang: Lang, hour: number): string {
  const menu = drinkItems().map((i) => `${i.name} [${i.cat}] ${Array.isArray(i.price) ? i.price.join('/') : i.price} IQD`).join('\n')
  return [
    'You are the friendly barista of Mars CoffeeHouse (Erbil, Iraq). A customer tells you how they feel; pick ONE drink for them.',
    `Local time: ${hour}:00. Reply in ${LANG_NAME[lang]}.`,
    'Rules: match the mood, the weather they mention and the time (no strong caffeine after 21:00 unless they ask for energy). Warm, short, no emojis.',
    'Read what they rule out and never go against it: "no coffee" means no espresso-based drink (Karak Chai, matcha, Hot Chocolate / Lotus / Pistachio, juices, mojitos, smoothies and milkshakes have no coffee); "no caffeine" also rules out tea, matcha and Energy +; the same for milk, sugar, hot or iced. The reason should show you listened.',
    'Choose a menu item by its exact English name. Reply with only JSON:',
    '{"kind":"menu","name":"<exact menu name>","reason":"<one warm sentence, max 25 words>"}',
    'MENU:\n' + menu,
    'CUSTOMER SAYS:\n' + text.slice(0, 400),
  ].join('\n\n')
}

/** Accept only answers that point at real drinks. */
export function parseAnswer(raw: unknown): MoodAnswer | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const reason = typeof r.reason === 'string' ? r.reason.trim().slice(0, 240) : ''
  if (r.kind === 'menu' && typeof r.name === 'string') {
    const item = findItem(r.name)
    return item ? { kind: 'menu', item, reason } : null
  }
  return null
}

/* ---------- the mood game: 4 questions by time of day (owner, 2026-09-29; docs/mood-questions.md) ----------
 * Q1 depends on the time: morning 05-12, afternoon 12-17, night 17-05, four answers each. Then Hot or cold? · Milk?
 * (milk or no milk only) · How sweet do you want it? — there is no coffee question. Every one of the 51 drinks on the
 * Erbil menu belongs to exactly one first answer per period, so each has the same chance; out-of-stock drinks stay in.
 * Sweetness never removes a drink: the draw is the drinks closest to the asked sweetness (topped up with the next
 * closest when fewer than two match), and the reveal shows two of them at random. Then (sweetFor): a drink sweeter
 * than asked is made less sweet / with no sugar (on the order line); a drink less sweet than asked is made as usual,
 * no sugar added, and a sweet from the bakery is offered with it (SWEET_SIDE).
 * The game sends its answers as the GAME_WORDS phrases, so the AI barista and the on-device one read the same text. */
export const GAME_WORDS = {
  project: 'I am starting a new project', waking: 'I am still waking up', easy: 'I am taking it easy this morning', relaxing: 'I am relaxing this morning',
  slump: 'I am in an afternoon slump', lunch: 'I am on my lunch break', work: 'I am going back to work', friends: 'I am out with friends this afternoon',
  winding: 'I am winding down tonight', friendsnight: 'I am out with friends tonight', studying: 'I am studying late', craving: 'I have a sweet craving',
  hot: 'I want a hot drink', cold: 'I want an iced drink',
  milknone: 'no milk', milkwith: 'with milk',
  sweetnone: 'no sugar please', sweetlittle: 'only a little sweet', sweetyes: 'I want it sweet',
} as const
export type GameAnswer = keyof typeof GAME_WORDS
export type MoodSet = 'morning' | 'afternoon' | 'night'
export type Going = 'project' | 'waking' | 'easy' | 'relaxing' | 'slump' | 'lunch' | 'work' | 'friends' | 'winding' | 'friendsnight' | 'studying' | 'craving'
export type Sweet = 0 | 1 | 2 // no sugar · a little · sweet
type Group4 = 'hotNo' | 'hotMilk' | 'coldNo' | 'coldMilk'
/** which question set is asked at this hour */
export const moodSetOf = (h: number): MoodSet => (h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : 'night')
/** POOLS[set][first answer][hot/cold × milk]: generated from the agreed tables in docs/mood-questions.md */
const POOLS: Record<MoodSet, Partial<Record<Going, Record<Group4, string[]>>>> = {
  morning: {
    project: { hotNo: ['Espresso Doppio', 'Turkish Coffee Double'], hotMilk: ['Cortado', 'Flat White', 'Mocha Dark', 'Classic Matcha', 'Mid-Night Matcha'], coldNo: ['Energy +', 'Iced Mango Tea', 'Cold Brew'], coldMilk: ['Iced Dark Chocolate Mocha', 'Oreo Milkshake', 'Ice Latte Caramel'] },
    waking: { hotNo: ['Espresso', 'Americano'], hotMilk: ['Latte Classic', 'Classic Cappuccino', 'Karak Chai', 'Cappuccino Caramel'], coldNo: ['Fresh Orange Juice', 'Orange Pomegranate Fresh Juice', 'Lemon-Mint Mojito', 'Iced Americano'], coldMilk: ['Iced Classic Latte', 'Strawberry Milkshake', 'Rashi Milkshake'] },
    easy: { hotNo: ['Filter Coffee'], hotMilk: ['Latte with Flavor', 'Cappuccino with Flavors', 'Hot Spanish Latte', 'Berry Matcha', 'Hot Pistachio'], coldNo: ['Iced Peach Tea', 'Mango with Orange Smoothie', 'Strawberry Smoothie', 'Passion Fruit Smoothie'], coldMilk: ['Iced Latte with Flavor', 'Iced Spanish Latte', 'Pistachio Milkshake'] },
    relaxing: { hotNo: ['Turkish Coffee'], hotMilk: ['Latte Caramel', 'Mocha White', 'Hot Lotus', 'Hot Chocolate'], coldNo: ['Strawberry Mojito', 'Watermelon Mojito', 'Pomegranate Mojito'], coldMilk: ['Mars Spanish Latte Signature', 'Iced White Chocolate Mocha', 'Lotus Milkshake', 'Nutella Milkshake'] },
  },
  afternoon: {
    slump: { hotNo: ['Espresso Doppio', 'Turkish Coffee Double'], hotMilk: ['Cortado', 'Mocha Dark', 'Mid-Night Matcha', 'Karak Chai'], coldNo: ['Energy +', 'Iced Mango Tea', 'Iced Peach Tea', 'Cold Brew'], coldMilk: ['Iced Dark Chocolate Mocha', 'Oreo Milkshake', 'Nutella Milkshake'] },
    lunch: { hotNo: ['Espresso'], hotMilk: ['Latte Classic', 'Classic Cappuccino', 'Cappuccino Caramel', 'Classic Matcha'], coldNo: ['Fresh Orange Juice', 'Orange Pomegranate Fresh Juice', 'Lemon-Mint Mojito', 'Iced Americano'], coldMilk: ['Iced Classic Latte', 'Iced Latte with Flavor', 'Strawberry Milkshake', 'Rashi Milkshake'] },
    work: { hotNo: ['Americano', 'Filter Coffee'], hotMilk: ['Flat White', 'Latte with Flavor', 'Cappuccino with Flavors', 'Berry Matcha', 'Hot Pistachio'], coldNo: ['Mango with Orange Smoothie', 'Passion Fruit Smoothie', 'Strawberry Smoothie'], coldMilk: ['Ice Latte Caramel', 'Iced Spanish Latte', 'Pistachio Milkshake'] },
    friends: { hotNo: ['Turkish Coffee'], hotMilk: ['Hot Spanish Latte', 'Latte Caramel', 'Mocha White', 'Hot Lotus', 'Hot Chocolate'], coldNo: ['Strawberry Mojito', 'Watermelon Mojito', 'Pomegranate Mojito'], coldMilk: ['Mars Spanish Latte Signature', 'Iced White Chocolate Mocha', 'Lotus Milkshake'] },
  },
  night: {
    winding: { hotNo: ['Filter Coffee'], hotMilk: ['Latte Classic', 'Classic Cappuccino', 'Hot Spanish Latte', 'Karak Chai', 'Hot Pistachio'], coldNo: ['Fresh Orange Juice', 'Orange Pomegranate Fresh Juice', 'Iced Peach Tea', 'Iced Americano'], coldMilk: ['Iced Latte with Flavor', 'Iced Spanish Latte', 'Pistachio Milkshake'] },
    friendsnight: { hotNo: ['Turkish Coffee', 'Turkish Coffee Double'], hotMilk: ['Latte with Flavor', 'Cappuccino with Flavors', 'Mocha Dark', 'Berry Matcha'], coldNo: ['Strawberry Mojito', 'Watermelon Mojito', 'Pomegranate Mojito'], coldMilk: ['Mars Spanish Latte Signature', 'Ice Latte Caramel', 'Strawberry Milkshake', 'Rashi Milkshake'] },
    studying: { hotNo: ['Espresso Doppio', 'Espresso'], hotMilk: ['Flat White', 'Cortado', 'Mid-Night Matcha', 'Classic Matcha'], coldNo: ['Energy +', 'Iced Mango Tea', 'Lemon-Mint Mojito', 'Cold Brew'], coldMilk: ['Iced Classic Latte', 'Iced Dark Chocolate Mocha', 'Oreo Milkshake'] },
    craving: { hotNo: ['Americano'], hotMilk: ['Latte Caramel', 'Cappuccino Caramel', 'Mocha White', 'Hot Lotus', 'Hot Chocolate'], coldNo: ['Strawberry Smoothie', 'Mango with Orange Smoothie', 'Passion Fruit Smoothie'], coldMilk: ['Iced White Chocolate Mocha', 'Lotus Milkshake', 'Nutella Milkshake'] },
  },
}
/** the four first answers of each set, in order */
export const SET_ANSWERS = Object.fromEntries(Object.entries(POOLS).map(([s, p]) => [s, Object.keys(p)])) as Record<MoodSet, Going[]>
/** every drink's sweetness as made (0 none, 1 a little, 2 sweet); the rest are 0 */
const SWEET_2 = new Set([
  'Latte Caramel', 'Cappuccino Caramel', 'Ice Latte Caramel', 'Mocha Dark', 'Mocha White',
  'Iced Dark Chocolate Mocha', 'Iced White Chocolate Mocha', 'Hot Spanish Latte', 'Iced Spanish Latte',
  'Mars Spanish Latte Signature', 'Latte with Flavor', 'Cappuccino with Flavors', 'Iced Latte with Flavor',
  'Hot Lotus', 'Hot Pistachio', 'Hot Chocolate', 'Energy +', 'Lotus Milkshake', 'Pistachio Milkshake',
  'Oreo Milkshake', 'Nutella Milkshake', 'Strawberry Milkshake', 'Rashi Milkshake', 'Strawberry Mojito',
  'Watermelon Mojito', 'Pomegranate Mojito', 'Berry Matcha',
])
const SWEET_1 = new Set([
  'Karak Chai', 'Iced Peach Tea', 'Iced Mango Tea', 'Lemon-Mint Mojito', 'Strawberry Smoothie',
  'Passion Fruit Smoothie', 'Mango with Orange Smoothie', 'Mid-Night Matcha', 'Latte Classic', 'Classic Cappuccino',
  'Iced Classic Latte', 'Turkish Coffee', 'Turkish Coffee Double',
])
export const sweetnessOf = (name: string): Sweet => (SWEET_2.has(name) ? 2 : SWEET_1.has(name) ? 1 : 0)
/** the sweet offered with a drink that is less sweet than asked: [a little, sweet], by drink family (owner, 2026-09-29) */
const SWEET_SIDE: Record<'coffee' | 'matcha' | 'fresh', [string, string]> = {
  coffee: ['Banana Bread', 'San Sebastian'], matcha: ['Croissant Pistachio', 'Cheesecake Strawberry'], fresh: ['Cookies New York', 'Mango Mousse Cake'],
}
const familyOf = (cat: string) => (['coffeeMore', 'coffeeMilk', 'coldCoffee'].includes(cat) ? 'coffee' : cat === 'matcha' ? 'matcha' : 'fresh')
/** what the asked sweetness does to one drink: made less sweet / no sugar, or made as usual with a bakery sweet offered */
export function sweetFor(name: string, sweet: Sweet): { less?: 'none' | 'less'; side?: string } {
  const s = sweetnessOf(name)
  if (sweet < s) return { less: sweet === 0 ? 'none' : 'less' }
  if (sweet > s) { const cat = drinkItems().find((i) => i.name === name)?.cat ?? ''; return { side: SWEET_SIDE[familyOf(cat)][sweet - 1] } }
  return {}
}
const WHY: Record<Lang, { going: Record<Going, string>; temp: Record<'hot' | 'iced', string>; sweet: [string, string, string]; milk: Record<'none' | 'with', string> }> = {
  en: {
    going: { project: 'Fuel for your new project', waking: 'Something to wake you up gently', easy: 'An easy one for a slow morning', relaxing: 'A treat while you relax',
      slump: 'A lift for the afternoon slump', lunch: 'A good match for your lunch break', work: 'Focus for the rest of the day', friends: 'One for an afternoon with friends',
      winding: 'Something calm to end the day', friendsnight: 'For a night out with friends', studying: 'To keep you going through a late study', craving: 'For that sweet craving' },
    temp: { hot: 'hot', iced: 'iced' }, sweet: ['no sugar', 'lightly sweet', 'sweet'], milk: { none: 'no milk', with: 'with milk' },
  },
  ar: {
    going: { project: 'طاقة لمشروعك الجديد', waking: 'شيء يوقظك بلطف', easy: 'مشروب هادئ لصباح على مهل', relaxing: 'متعة صغيرة وأنت تسترخي',
      slump: 'دفعة لخمول ما بعد الظهر', lunch: 'رفيق جيد لاستراحة الغداء', work: 'تركيز لبقية اليوم', friends: 'لظهيرة مع الأصدقاء',
      winding: 'شيء هادئ لختام يومك', friendsnight: 'لسهرة مع الأصدقاء', studying: 'ليرافقك في الدراسة حتى وقت متأخر', craving: 'لرغبتك في شيء حلو' },
    temp: { hot: 'ساخن', iced: 'مثلّج' }, sweet: ['بدون سكر', 'قليل الحلاوة', 'حلو'], milk: { none: 'بدون حليب', with: 'بالحليب' },
  },
  ku: {
    going: { project: 'وزە بۆ پڕۆژە نوێیەکەت', waking: 'شتێک کە بە نەرمی خەبەرت بکاتەوە', easy: 'خواردنەوەیەکی ئاسان بۆ بەیانییەکی لەسەرخۆ', relaxing: 'شتێکی خۆش لە کاتی پشوودا',
      slump: 'وزەیەک بۆ ماندوویی دوای نیوەڕۆ', lunch: 'هاوڕێیەکی باش بۆ پشووی نانی نیوەڕۆ', work: 'سەرنج بۆ ماوەی ڕۆژەکە', friends: 'بۆ دوای نیوەڕۆیەک لەگەڵ هاوڕێکان',
      winding: 'شتێکی هێمن بۆ کۆتایی ڕۆژەکەت', friendsnight: 'بۆ شەوێک لەگەڵ هاوڕێکان', studying: 'بۆ ئەوەی تا درەنگ لە خوێندندا لەگەڵت بێت', craving: 'بۆ ئارەزووی شتێکی شیرین' },
    temp: { hot: 'گەرم', iced: 'سارد' }, sweet: ['بێ شەکر', 'کەمێک شیرین', 'شیرین'], milk: { none: 'بێ شیر', with: 'بە شیر' },
  },
}
/** random source for the picks; replaceable for tests */
let rand = Math.random
export const setGameRandom = (fn: () => number) => { rand = fn }

/** the game's answers found in the text (the exact GAME_WORDS phrases) */
export function gameAnswers(text: string): Set<GameAnswer> {
  const t = text.toLowerCase()
  return new Set((Object.keys(GAME_WORDS) as GameAnswer[]).filter((k) => t.includes(GAME_WORDS[k].toLowerCase())))
}

/** the drinks the game's answers lead to: `pool` = the whole path, `items` = the draw (closest sweetness) the two picks
 * come from; `sweet` = the asked sweetness. Unanswered questions fall back to the first answer / by the hour / with milk / a little. */
export function gameOptions(a: Set<GameAnswer>, lang: Lang, hour: number): { items: MenuItem[]; pool: MenuItem[]; reason: string; sweet: Sweet } | null {
  const now = moodSetOf(hour)
  const all = Object.values(SET_ANSWERS).flat()
  // the first answer, looked up in the set that has it (the clock may have moved on while the customer played)
  const going: Going = all.find((g) => a.has(g) && POOLS[now][g]) ?? all.find((g) => a.has(g)) ?? SET_ANSWERS[now][0]
  const set: MoodSet = POOLS[now][going] ? now : (Object.keys(POOLS) as MoodSet[]).find((s) => POOLS[s][going])!
  const hot = a.has('hot') ? true : a.has('cold') ? false : !(hour >= 10 && hour < 18)
  const milk = a.has('milknone') ? 'none' : 'with'
  const sweet: Sweet = a.has('sweetnone') ? 0 : a.has('sweetyes') ? 2 : 1
  const names = POOLS[set][going]![`${hot ? 'hot' : 'cold'}${milk === 'none' ? 'No' : 'Milk'}` as Group4]
  const pool = names.map((n) => drinkItems().find((i) => i.name === n)).filter((i): i is NonNullable<typeof i> => !!i)
  if (!pool.length) return null
  const d = (i: MenuItem) => Math.abs(sweetnessOf(i.name) - sweet)
  const sorted = [...pool].sort((x, y) => d(x) - d(y))
  let items = sorted.filter((i) => d(i) === d(sorted[0]))
  if (items.length < 2) { const next = sorted.filter((i) => !items.includes(i)); if (next.length) items = items.concat(next.filter((i) => d(i) === d(next[0]))) }
  const w = WHY[lang]
  const sep = lang === 'en' ? ', ' : '، '
  const reason = `${w.going[going]}: ${[w.temp[hot ? 'hot' : 'iced'], w.milk[milk], w.sweet[sweet]].join(sep)}.`
  return { items, pool, reason, sweet }
}

/** one drink from the draw at random (the backup barista's single pick) */
export function gamePick(a: Set<GameAnswer>, lang: Lang, hour: number): MoodAnswer | null {
  const o = gameOptions(a, lang, hour)
  if (!o) return null
  return { kind: 'menu', item: o.items[Math.floor(rand() * o.items.length) % o.items.length], reason: o.reason }
}
/** a random pick from a list, using the same (test-replaceable) random source */
export const pickOne = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length) % xs.length]

/** thrown when free text has no AI to answer it; `why` says what each barista answered, shown small under the message
 * so a failed phone test can be read from a screenshot (e.g. "Claude: not_granted · site: 404") */
export class MoodUnavailable extends Error { constructor(public why: string) { super('mood AI unavailable: ' + why) } }

/** the site's own AI address: the Supabase `mood` function on the live site, the Vite dev route on this PC */
const MOOD_API: string = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_MOOD_API_URL || '/api/mood'

type SampleFn = { json: (input: string, opts?: Record<string, unknown>) => Promise<unknown> }
declare global { interface Window { claude?: { use: (name: string) => Promise<unknown> } } }
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))])

/** `fallback`: the mood game's own table (on-device), used when the AI does not answer; free text has none */
export async function askMood(text: string, lang: Lang, signal?: AbortSignal, fallback?: (hour: number) => MoodAnswer | null): Promise<{ answer: MoodAnswer; source: MoodSource }> {
  const hour = clockNow().getHours() // follows the review time changer
  const prompt = moodPrompt(text, lang, hour)
  const why: string[] = []
  // 1. Claude via the artifact runtime (phone demo opened inside claude.ai)
  if (window.claude?.use) {
    try {
      const sample = (await withTimeout(window.claude.use('sample'), 20000)) as SampleFn | null
      if (!sample) why.push('Claude: not available in this view')
      else {
        const raw = await sample.json(prompt, { modelTier: 'quick', cache: false, signal })
        const answer = parseAnswer(raw)
        if (answer) return { answer, source: 'claude' }
        why.push('Claude: answer not on the menu')
        console.warn('[mood] Claude answered something that is not a menu drink or a valid soda', raw)
      }
    } catch (e) {
      const code = (e as { code?: string })?.code || String(e)
      why.push('Claude: ' + code) // not_granted, sampling_disabled, rate_limited, invalid_json, upstream_error...
      console.warn('[mood] Claude sample failed', e)
    }
  } else why.push('Claude: not inside claude.ai')
  if (signal?.aborted) throw new Error('cancelled')
  // 2. the site's own endpoint
  try {
    // the live site: the Supabase function (VITE_MOOD_API_URL) builds the prompt itself from {text, lang, hour};
    // on this PC the Vite dev route /api/mood uses `prompt` as it is
    const r = await fetch(MOOD_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, lang, hour, prompt }), signal })
    if (r.ok) { const answer = parseAnswer(await r.json()); if (answer) return { answer, source: 'api' }; why.push('site: answer not on the menu') }
    else why.push('site: ' + r.status)
  } catch { why.push('site: no AI address') /* offline, no key, static host */ }
  if (signal?.aborted) throw new Error('cancelled')
  // 3. the mood game's own table; free text has no on-device answer
  const f = fallback?.(hour)
  if (f) return { answer: f, source: 'local' }
  throw new MoodUnavailable(why.join(' · '))
}
