import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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

export default defineConfig({
  plugins: [react(), moodApi()],
  server: { port: 1440, host: true },
})

