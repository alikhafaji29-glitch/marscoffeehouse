// Writes supabase/functions/mood/prompts.json from the site's own barista prompt (src/mood.ts moodPrompt), so the
// server-side function and the site never drift: same menu, same rules. Re-run after any menu or prompt change, then
// redeploy the function.   npx tsx scripts/build-mood-function.ts
import { writeFileSync } from 'node:fs'
import { moodPrompt } from '../src/mood'

const TEXT = '{{TEXT}}'
const out: Record<string, string> = {}
for (const lang of ['en', 'ar', 'ku'] as const) {
  const p = moodPrompt(TEXT, lang, 99)
  if (!p.includes('Local time: 99:00') || !p.includes(TEXT)) throw new Error('moodPrompt changed shape: update this script')
  out[lang] = p.replace('Local time: 99:00', 'Local time: {{HOUR}}:00')
}
writeFileSync('supabase/functions/mood/prompts.json', JSON.stringify(out, null, 1) + '\n')
console.log('wrote supabase/functions/mood/prompts.json', Object.values(out).map((p) => p.length).join(' / '), 'chars')
