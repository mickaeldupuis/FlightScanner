import { NextRequest, NextResponse } from 'next/server'
import { haversineKm, bearingDeg } from '@/lib/utils'

// ── OAuth2 token cache (OpenSky exige OAuth2 depuis le 18 mars 2026) ──
let cachedToken: { token: string; expiresAt: number } | null = null

async function getOpenSkyToken(): Promise<string | null> {
  const clientId = process.env.OPENSKY_CLIENT_ID
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token

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
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 30) * 1000 }
    return cachedToken.token
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') || '0')
  const lon = parseFloat(searchParams.get('lon') || '0')
  const radius = parseFloat(searchParams.get('radius') || '50')
  const max = parseInt(searchParams.get('max') || '20')

  // Bounding box (approx)
  const deg = radius / 111
  const lamin = lat - deg
  const lamax = lat + deg
  const lomin = lon - deg / Math.cos(lat * Math.PI / 180)
  const lomax = lon + deg / Math.cos(lat * Math.PI / 180)

  try {
    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`

    const token = await getOpenSkyToken()
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(url, { headers, cache: 'no-store' })

    if (!res.ok) {
      // 403/429 = rate limit anonyme épuisé, ou clé invalide
      const bodyText = await res.text().catch(() => '')
      console.error(`OpenSky API ${res.status}: ${bodyText.slice(0, 300)}`)
      return NextResponse.json({
        aircraft: [],
        time: Date.now(),
        error: `OpenSky a renvoyé ${res.status}`,
        authenticated: !!token,
        hint: res.status === 403 || res.status === 429
          ? 'Limite de requêtes anonymes probablement atteinte. Configurez OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET pour passer à 4000 req/jour.'
          : undefined,
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
    console.error('Flights API error:', err)
    return NextResponse.json({ aircraft: [], time: Date.now(), error: 'fetch failed' })
  }
}
