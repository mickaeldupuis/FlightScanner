import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function withTimeout(ms: number) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

export async function GET() {
  const report: Record<string, unknown> = {}
  const clientId = process.env.OPENSKY_CLIENT_ID
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET
  report.hasCredentials = !!clientId && !!clientSecret
  report.clientIdLength = clientId?.length ?? 0

  // Étape 1 : OAuth2
  const t0 = Date.now()
  const { signal: s1, clear: c1 } = withTimeout(15000)
  try {
    const res = await fetch(
      'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId || '',
          client_secret: clientSecret || '',
        }),
        signal: s1,
      }
    )
    c1()
    report.oauthDurationMs = Date.now() - t0
    report.oauthStatus = res.status
    const text = await res.text()
    report.oauthBodyPreview = text.slice(0, 300)

    if (!res.ok) {
      return NextResponse.json(report)
    }

    const data = JSON.parse(text)
    const token = data.access_token
    report.tokenObtained = !!token
    report.tokenExpiresIn = data.expires_in

    // Étape 2 : appel states/all (zone minuscule pour répondre vite)
    const t1 = Date.now()
    const { signal: s2, clear: c2 } = withTimeout(15000)
    try {
      const res2 = await fetch(
        'https://opensky-network.org/api/states/all?lamin=48.8&lamax=48.9&lomin=2.3&lomax=2.4',
        {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: s2,
          cache: 'no-store',
        }
      )
      c2()
      report.statesDurationMs = Date.now() - t1
      report.statesStatus = res2.status
      const text2 = await res2.text()
      report.statesBodyPreview = text2.slice(0, 300)
    } catch (err) {
      c2()
      report.statesError = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      report.statesDurationMs = Date.now() - t1
    }

    return NextResponse.json(report)
  } catch (err) {
    c1()
    report.oauthError = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    report.oauthDurationMs = Date.now() - t0
    return NextResponse.json(report)
  }
}
