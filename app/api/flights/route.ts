import { NextRequest, NextResponse } from 'next/server'
import { haversineKm, bearingDeg } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // secondes — Hobby plan autorise jusqu'à 60s

// ───────────────────────────────────────────────────────────
// Sources de données, dans l'ordre de priorité :
// 1. ADSB.one (api.adsb.one) — gratuit, sans clé, fiable, simple
// 2. OpenSky Network — fallback si ADSB.one échoue (OAuth2 si configuré)
// ───────────────────────────────────────────────────────────

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'Timeout : le service n\'a pas répondu à temps'
    const cause = (err as { cause?: unknown }).cause
    const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : null
    return causeMsg ? `${err.message} (${causeMsg})` : err.message
  }
  return String(err)
}

interface NormalizedAircraft {
  icao24: string
  callsign: string | null
  originCountry: string
  longitude: number
  latitude: number
  altitude: number | null
  onGround: boolean
  velocity: number | null
  trueTrack: number | null
  verticalRate: number | null
  squawk: string | null
  category: number
  distance: number
  bearing: number
}

function buildAircraft(lat: number, lon: number, radius: number, aLat: number, aLon: number, base: Omit<NormalizedAircraft, 'distance' | 'bearing' | 'longitude' | 'latitude'>): NormalizedAircraft | null {
  const distance = haversineKm(lat, lon, aLat, aLon)
  if (distance > radius) return null
  const bearing = bearingDeg(lat, lon, aLat, aLon)
  return { ...base, longitude: aLon, latitude: aLat, distance: Math.round(distance * 10) / 10, bearing: Math.round(bearing) }
}

// ── Source 1 : ADSB.one ──
async function fetchFromAdsbOne(lat: number, lon: number, radius: number, max: number) {
  const radiusNm = Math.min(Math.round(radius / 1.852), 250) // km → nm, plafonné à 250nm
  const url = `https://api.adsb.one/v2/point/${lat}/${lon}/${radiusNm}`
  const { signal, clear } = withTimeout(8000)
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal })
    clear()
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`ADSB.one ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    const list: Record<string, unknown>[] = data.ac || []

    const aircraft = list
      .map((a) => {
        const aLat = a.lat as number | undefined
        const aLon = a.lon as number | undefined
        if (aLat == null || aLon == null) return null
        return buildAircraft(lat, lon, radius, aLat, aLon, {
          icao24: String(a.hex ?? '').toUpperCase(),
          callsign: (a.flight as string)?.trim() || null,
          originCountry: '—', // ADSB.one ne fournit pas le pays directement
          altitude: a.alt_baro === 'ground' ? 0 : (a.alt_baro != null ? (a.alt_baro as number) * 0.3048 : (a.alt_geom != null ? (a.alt_geom as number) * 0.3048 : null)),
          onGround: a.alt_baro === 'ground',
          velocity: a.gs != null ? (a.gs as number) * 0.514444 : null, // knots → m/s
          trueTrack: (a.track as number) ?? null,
          verticalRate: a.baro_rate != null ? (a.baro_rate as number) * 0.00508 : null, // ft/min → m/s
          squawk: (a.squawk as string) || null,
          category: a.category ? parseInt(String(a.category).replace(/\D/g, '')) || 0 : 0,
        })
      })
      .filter((a): a is NormalizedAircraft => a !== null)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, max)

    return { aircraft, totalInBox: list.length, source: 'adsb.one' as const }
  } catch (err) {
    clear()
    throw err
  }
}

// ── Source 2 : OpenSky Network (fallback) ──
let cachedToken: { token: string; expiresAt: number } | null = null

async function getOpenSkyToken(): Promise<string | null> {
  const clientId = process.env.OPENSKY_CLIENT_ID
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token

  const { signal, clear } = withTimeout(8000)
  try {
    const res = await fetch(
      'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
        signal,
      }
    )
    clear()
    if (!res.ok) return null
    const data = await res.json()
    cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 30) * 1000 }
    return cachedToken.token
  } catch {
    clear()
    return null
  }
}

async function fetchFromOpenSky(lat: number, lon: number, radius: number, max: number) {
  const deg = radius / 111
  const lamin = lat - deg, lamax = lat + deg
  const lomin = lon - deg / Math.cos(lat * Math.PI / 180)
  const lomax = lon + deg / Math.cos(lat * Math.PI / 180)

  const token = await getOpenSkyToken()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`
  const { signal, clear } = withTimeout(10000)
  try {
    const res = await fetch(url, { headers, cache: 'no-store', signal })
    clear()
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`OpenSky ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    const states: unknown[][] = data.states || []

    const aircraft = states
      .map((s) => {
        const aLat = s[6] as number | null
        const aLon = s[5] as number | null
        if (aLat == null || aLon == null) return null
        return buildAircraft(lat, lon, radius, aLat, aLon, {
          icao24: String(s[0]).toUpperCase(),
          callsign: (s[1] as string)?.trim() || null,
          originCountry: s[2] as string,
          altitude: (s[7] ?? s[13]) as number | null,
          onGround: !!s[8],
          velocity: s[9] as number | null,
          trueTrack: s[10] as number | null,
          verticalRate: s[11] as number | null,
          squawk: s[14] as string | null,
          category: (s[17] as number) || 0,
        })
      })
      .filter((a): a is NormalizedAircraft => a !== null)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, max)

    return { aircraft, totalInBox: states.length, source: 'opensky' as const, authenticated: !!token }
  } catch (err) {
    clear()
    throw err
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') || '0')
  const lon = parseFloat(searchParams.get('lon') || '0')
  const radius = parseFloat(searchParams.get('radius') || '50')
  const max = parseInt(searchParams.get('max') || '20')

  const errors: string[] = []

  // 1. Tentative ADSB.one
  try {
    const result = await fetchFromAdsbOne(lat, lon, radius, max)
    return NextResponse.json({ ...result, time: Date.now() })
  } catch (err) {
    errors.push(`ADSB.one: ${describeError(err)}`)
    console.error('ADSB.one failed:', err)
  }

  // 2. Fallback OpenSky
  try {
    const result = await fetchFromOpenSky(lat, lon, radius, max)
    return NextResponse.json({ ...result, time: Date.now(), fallbackUsed: true })
  } catch (err) {
    errors.push(`OpenSky: ${describeError(err)}`)
    console.error('OpenSky fallback failed:', err)
  }

  // Les deux sources ont échoué
  return NextResponse.json({
    aircraft: [],
    time: Date.now(),
    error: 'Toutes les sources de données avions sont indisponibles.',
    hint: errors.join(' | '),
  }, { status: 200 })
}
