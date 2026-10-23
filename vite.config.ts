import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import legacy from '@vitejs/plugin-legacy'
import flexGapPolyfill from 'flex-gap-polyfill'

// dev-only: "Your Mood Drink" asks Claude through the Anthropic API when ANTHROPIC_API_KEY is set
// (the real site gets a backend function for this; without a key the browser falls back on its own)
function moodApi(): Plugin {
  return {
    name: 'mood-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/mood', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        const env = loadEnv('development', process.cwd(), '')
        const key = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY
        const workspace = process.env.ANTHROPIC_WORKSPACE_ID || env.ANTHROPIC_WORKSPACE_ID // needed for organisation-level keys
        if (!key) { res.statusCode = 501; return res.end('no ANTHROPIC_API_KEY') }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', async () => {
          try {
            const { prompt } = JSON.parse(body || '{}') as { prompt?: string }
            const r = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', ...(workspace ? { 'anthropic-workspace-id': workspace } : {}) },
              body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: String(prompt || '') }] }),
            })
            // an empty or non-JSON reply (seen 2026-09-29: 503 with no body) is reported, not a JSON crash
            const raw = await r.text()
            let data: { content?: { type: string; text?: string }[]; error?: { type?: string; message?: string } } = {}
            try { data = raw ? JSON.parse(raw) : {} } catch { /* not JSON */ }
            if (!raw) { res.statusCode = 502; return res.end(`anthropic ${r.status}: empty reply`) }
            if (!r.ok || data.error) { res.statusCode = 502; return res.end(`anthropic ${r.status}: ${data.error?.type || ''} ${data.error?.message || ''}`.trim()) }
            const text = (data.content || []).map((c) => c.text || '').join('')
            const m = text.match(/\{[\s\S]*\}/)
            res.setHeader('content-type', 'application/json')
            res.end(m ? m[0] : '{}')
          } catch (e) { res.statusCode = 502; res.end(String(e)) }
        })
      })
    },
  }
}

// `npm run dev` is plain http on 1440. `npm run dev:https` (mode "https") serves the same site on 1441 with a
// self-signed certificate, for trying on a phone the things browsers only allow on a secure page ("Share my
// location", the share sheet, the clipboard); the phone shows a certificate warning once, which is expected.
// `npm run dev:demo` (mode "demo", port 1442) and `npm run build:demo` leave the shared backend out (.env.demo):
// the on-device demo, for the artifact snapshot and the headless tests.
// `vite build --mode old` (part of `npm run build`) makes a second copy of the site at /old/ for old browser engines
// (owner, 2026-10-23: the Sunmi D2mini, Android 8.1, showed the staff app white): plain old JavaScript with the
// missing parts added, for Chrome 49 and up. The customer site at / is untouched; the tablet app opens /old/#staff.
// It shares the photos and videos of the main copy (absolute /assets/ paths), so it has no public folder of its own.
// MARS_OLD=1 does the same in another mode (the demo build, for testing).
export default defineConfig(({ mode }) => {
  const old = mode === 'old' || process.env.MARS_OLD === '1'
  return {
    plugins: [react(), moodApi(), ...(mode === 'https' ? [basicSsl()] : []), ...(old ? [legacy({ targets: ['chrome >= 49', 'android >= 5'], renderModernChunks: false })] : [])],
    server: { port: mode === 'https' ? 1441 : mode === 'demo' ? 1442 : 1440, host: true },
    ...(old && {
      base: '/old/',
      publicDir: false,
      build: { outDir: 'dist/old', cssTarget: 'chrome61' },
      css: { postcss: { plugins: [flexGapPolyfill()] } }, // flex `gap` came in Chrome 84: margins instead
      define: { 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': '""' }, // no Clerk: its script needs a new engine, and the staff dashboard does not use it
    }),
  }
})

