import { NextRequest, NextResponse } from 'next/server'
import { haversineKm, bearingDeg } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── OAuth2 token cache (OpenSky exige OAuth2 depuis le 18 mars 2026) ──
let cachedToken: { token: string; expiresAt: number } | null = null

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    // AbortError = timeout
    if (err.name === 'AbortError') return 'Timeout : OpenSky n\'a pas répondu à temps'
    // Cause souvent présente sur les erreurs fetch (ENOTFOUND, ECONNRESET, etc.)
    const cause = (err as { cause?: unknown }).cause
    const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : null
    return causeMsg ? `${err.message} (${causeMsg})` : err.message
  }
  return String(err)
}

async function getOpenSkyToken(): Promise<{ token: string | null; error: string | null }> {
  const clientId = process.env.OPENSKY_CLIENT_ID
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET
  if (!clientId || !clientSecret) return { token: null, error: null }

  if (cachedToken && cachedToken.expiresAt > Date.now()) return { token: cachedToken.token, error: null }

  const { signal, clear } = withTimeout(8000)
  try {
    const res = await fetch(
      'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
        signal,
      }
    )
    clear()
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { token: null, error: `OAuth2 ${res.status}: ${t.slice(0, 200)}` }
    }
    const data = await res.json()
    cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 30) * 1000 }
    return { token: cachedToken.token, error: null }
  } catch (err) {
    clear()
    return { token: null, error: `OAuth2 fetch error: ${describeError(err)}` }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') || '0')
  const lon = parseFloat(searchParams.get('lon') || '0')
  const radius = parseFloat(searchParams.get('radius') || '50')
  const max = parseInt(searchParams.get('max') || '20')

  const deg = radius / 111
  const lamin = lat - deg
  const lamax = lat + deg
  const lomin = lon - deg / Math.cos(lat * Math.PI / 180)
  const lomax = lon + deg / Math.cos(lat * Math.PI / 180)

  const debug: Record<string, unknown> = {}

  try {
    const { token, error: tokenError } = await getOpenSkyToken()
    debug.tokenAcquired = !!token
    if (tokenError) debug.tokenError = tokenError

    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const { signal, clear } = withTimeout(9000)
    let res: Response
    try {
      res = await fetch(url, { headers, cache: 'no-store', signal })
      clear()
    } catch (fetchErr) {
      clear()
      const msg = describeError(fetchErr)
      console.error('OpenSky fetch threw:', fetchErr)
      return NextResponse.json({
        aircraft: [],
        time: Date.now(),
        error: `Connexion à OpenSky impossible : ${msg}`,
        debug,
      }, { status: 200 })
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      console.error(`OpenSky API ${res.status}: ${bodyText.slice(0, 300)}`)
      return NextResponse.json({
        aircraft: [],
        time: Date.now(),
        error: `OpenSky a renvoyé ${res.status}${bodyText ? ' : ' + bodyText.slice(0, 150) : ''}`,
        authenticated: !!token,
        hint: res.status === 403 || res.status === 429
          ? 'Limite de requêtes anonymes probablement atteinte. Configurez OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET pour passer à 4000 req/jour.'
          : undefined,
        debug,
      }, { status: 200 })
    }

    const data = await res.json()
    const states: unknown[][] = data.states || []

    const aircraft = states
      .map((s: unknown[]) => {
        const aLat = s[6] as number | null
        const aLon = s[5] as number | null
        if (aLat == null || aLon == null) return null
        const distance = haversineKm(lat, lon, aLat, aLon)
        if (distance > radius) return null
        const bearing = bearingDeg(lat, lon, aLat, aLon)
        return {
          icao24: s[0],
          callsign: (s[1] as string)?.trim() || null,
          originCountry: s[2],
          longitude: aLon,
          latitude: aLat,
          altitude: s[7] ?? s[13],
          onGround: s[8],
          velocity: s[9],
          trueTrack: s[10],
          verticalRate: s[11],
          squawk: s[14],
          category: s[17] || 0,
          distance: Math.round(distance * 10) / 10,
          bearing: Math.round(bearing),
        }
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, max)

    return NextResponse.json({
      aircraft,
      time: Date.now(),
      authenticated: !!token,
      totalInBox: states.length,
    })
  } catch (err) {
    console.error('Flights API unexpected error:', err)
    return NextResponse.json({
      aircraft: [],
      time: Date.now(),
      error: `Erreur inattendue : ${describeError(err)}`,
      debug,
    }, { status: 200 })
  }
}
