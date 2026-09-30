// Mars CoffeeHouse — the AI barista behind "Tell us in your words" and the mood game (owner, 2026-09-29: option 2,
// the site's own AI connection). The browser sends only the customer's words, the language and the hour; this
// function builds the barista prompt itself (prompts.json, generated from src/mood.ts by
// scripts/build-mood-function.ts), so the endpoint only ever picks drinks and cannot be used as a general AI.
//
// Secrets (set in Supabase → Edge Functions → Secrets, never in the code): ANTHROPIC_API_KEY, optional
// ANTHROPIC_WORKSPACE_ID (organisation-level keys), optional ALLOWED_ORIGINS (comma-separated; the site's addresses).
// Deployed with verify_jwt off: the site calls it without signing in; the origin list and the rate limit below guard it.
import prompts from './prompts.json' with { type: 'json' }

const MODEL = 'claude-haiku-4-5-20251001'
const LANGS = ['en', 'ar', 'ku'] as const
type Lang = (typeof LANGS)[number]
const MAX_TEXT = 400
const PER_MINUTE = 8 // answers per visitor per minute (best effort: per function instance)

const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const originOk = (o: string | null) => !allowed.length || (o !== null && allowed.includes(o))
const cors = (o: string | null) => ({
  'access-control-allow-origin': o && originOk(o) ? o : allowed[0] ?? '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  vary: 'origin',
})
const hits = new Map<string, number[]>()
const limited = (ip: string) => {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > PER_MINUTE
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'content-type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  if (!originOk(origin)) return json(403, { error: 'origin not allowed' })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  if (limited(ip)) return json(429, { error: 'too many requests, try again in a minute' })

  let text = '', lang: Lang = 'en', hour = 12
  try {
    const b = await req.json() as { text?: unknown; lang?: unknown; hour?: unknown }
    text = String(b.text ?? '').trim().slice(0, MAX_TEXT)
    lang = LANGS.includes(b.lang as Lang) ? (b.lang as Lang) : 'en'
    const h = Number(b.hour)
    hour = Number.isInteger(h) && h >= 0 && h < 24 ? h : 12
  } catch { return json(400, { error: 'send JSON {text, lang, hour}' }) }
  if (!text) return json(400, { error: 'text is empty' })

  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json(501, { error: 'ANTHROPIC_API_KEY is not set' })
  const workspace = Deno.env.get('ANTHROPIC_WORKSPACE_ID')
  const prompt = (prompts as Record<Lang, string>)[lang].replace('{{HOUR}}', String(hour)).replace('{{TEXT}}', text)

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', ...(workspace ? { 'anthropic-workspace-id': workspace } : {}) },
    body: JSON.stringify({ model: MODEL, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
  }).catch(() => null)
  if (!r) return json(502, { error: 'could not reach the AI' })
  const raw = await r.text()
  let data: { content?: { text?: string }[]; error?: { type?: string } } = {}
  try { data = raw ? JSON.parse(raw) : {} } catch { /* not JSON */ }
  if (!r.ok || data.error) return json(502, { error: `AI ${r.status}${data.error?.type ? ' ' + data.error.type : raw ? '' : ' empty reply'}` })
  const answer = (data.content ?? []).map((c) => c.text ?? '').join('').match(/\{[\s\S]*\}/)
  if (!answer) return json(502, { error: 'AI reply had no JSON' })
  try { return json(200, JSON.parse(answer[0])) } catch { return json(502, { error: 'AI reply was not valid JSON' }) }
})
