import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function withTimeout(ms: number) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

async function tryOnce(label: string) {
  const t0 = Date.now()
  const { signal, clear } = withTimeout(8000)
  try {
    // Test contre un endpoint ultra-fiable (httpbin-like) pour isoler
    // si le problème est spécifique à OpenSky/ADSB.one ou général à Vercel↔Internet
    const res = await fetch('https://api.github.com/zen', { signal, cache: 'no-store' })
    clear()
    const text = await res.text()
    return { label, ok: true, status: res.status, durationMs: Date.now() - t0, bodyPreview: text.slice(0, 80) }
  } catch (err) {
    clear()
    return { label, ok: false, durationMs: Date.now() - t0, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }
  }
}

export async function GET() {
  const report: Record<string, unknown> = {}
  const clientId = process.env.OPENSKY_CLIENT_ID
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET
  report.hasCredentials = !!clientId && !!clientSecret

  // ── Test 0 : connectivité générale Vercel → Internet (api.github.com, très fiable) ──
  report.sanityChecks = await Promise.all([tryOnce('try1'), tryOnce('try2'), tryOnce('try3')])

  // ── Test OAuth2 OpenSky (3 tentatives) ──
  const oauthAttempts = []
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now()
    const { signal, clear } = withTimeout(8000)
    try {
      const res = await fetch(
        'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId || '', client_secret: clientSecret || '' }),
          signal,
        }
      )
      clear()
      const text = await res.text()
      oauthAttempts.push({ attempt: i + 1, ok: res.ok, status: res.status, durationMs: Date.now() - t0, bodyPreview: text.slice(0, 150) })
      if (res.ok) break
    } catch (err) {
      clear()
      oauthAttempts.push({ attempt: i + 1, ok: false, durationMs: Date.now() - t0, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) })
    }
  }
  report.oauthAttempts = oauthAttempts

  return NextResponse.json(report)
}
