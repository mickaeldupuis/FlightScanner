import { NextRequest, NextResponse } from 'next/server'
import { haversineKm, bearingDeg } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // secondes — Hobby plan autorise jusqu'à 60s

// ───────────────────────────────────────────────────────────
// Stratégie : interroger les 3 sources EN PARALLÈLE, fusionner
// et dédupliquer les résultats. Maximise les chances de détecter
// un appareil dans les zones à faible couverture ADS-B (Pacifique,
// océans, zones rurales) où une seule source peut manquer un avion
// qu'une autre capte.
// 1. AirLabs    — clé API gratuite (1000 req/mois), bbox natif
// 2. ADSB.one   — gratuit, sans clé (peut être bloqué par Cloudflare
//                 depuis certaines IP, donc traité comme best-effort)
// 3. OpenSky    — gratuit, OAuth2 optionnel (peut timeout depuis
//                 certaines IP cloud, donc traité comme best-effort)
// ───────────────────────────────────────────────────────────

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 1, retryDelayMs = 350): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options)
    } catch (err) {
      lastErr = err
      const isConnectIssue = err instanceof Error && (
        err.message.includes('fetch failed') ||
        err.message.includes('UND_ERR_CONNECT_TIMEOUT') ||
        err.name === 'TypeError'
      )
      if (!isConnectIssue || attempt === retries) throw err
      await new Promise(r => setTimeout(r, retryDelayMs * (attempt + 1)))
    }
  }
  throw lastErr
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'Timeout'
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
  _source: string // pour debug/info, retiré avant envoi final si besoin
}

function buildAircraft(
  lat: number, lon: number, radius: number, aLat: number, aLon: number,
  base: Omit<NormalizedAircraft, 'distance' | 'bearing' | 'longitude' | 'latitude'>
): NormalizedAircraft | null {
  const distance = haversineKm(lat, lon, aLat, aLon)
  if (distance > radius) return null
  const bearing = bearingDeg(lat, lon, aLat, aLon)
  return { ...base, longitude: aLon, latitude: aLat, distance: Math.round(distance * 10) / 10, bearing: Math.round(bearing) }
}

function radiusToBbox(lat: number, lon: number, radiusKm: number): [number, number, number, number] {
  const deg = radiusKm / 111
  const lonDeg = deg / Math.cos((lat * Math.PI) / 180)
  return [lat - deg, lon - lonDeg, lat + deg, lon + lonDeg]
}

// ── Source : AirLabs ──
async function fetchFromAirLabs(lat: number, lon: number, radius: number): Promise<NormalizedAircraft[]> {
  const key = process.env.AIRLABS_KEY
  if (!key) throw new Error('clé non configurée')

  const [swLat, swLon, neLat, neLon] = radiusToBbox(lat, lon, radius)
  const bbox = `${swLat},${swLon},${neLat},${neLon}`
  const url = `https://airlabs.co/api/v9/flights?api_key=${key}&bbox=${bbox}`

  const { signal, clear } = withTimeout(11000)
  try {
    const res = await fetchWithRetry(url, { headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA }, cache: 'no-store', signal })
    clear()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data?.error) throw new Error(data.error.message || 'erreur API')

    const list: Record<string, unknown>[] = Array.isArray(data?.response) ? data.response : []
    return list
      .map((f) => {
        const aLat = f.lat as number | undefined
        const aLon = f.lng as number | undefined
        if (aLat == null || aLon == null) return null
        const status = f.status as string | undefined
        return buildAircraft(lat, lon, radius, aLat, aLon, {
          icao24: String(f.hex || '').toUpperCase(),
          callsign: (f.flight_icao as string) || (f.flight_iata as string) || (f.flight_number as string) || null,
          originCountry: (f.flag as string) || '—',
          altitude: f.alt != null ? (f.alt as number) : null,
          onGround: status === 'landed' || status === 'scheduled',
          velocity: f.speed != null ? (f.speed as number) * 0.277778 : null,
          trueTrack: (f.dir as number) ?? null,
          verticalRate: f.v_speed != null ? (f.v_speed as number) : null,
          squawk: (f.squawk as string) || null,
          category: 0,
          _source: 'airlabs',
        })
      })
      .filter((a): a is NormalizedAircraft => a !== null)
  } catch (err) {
    clear()
    throw err
  }
}

// ── Source : ADSB.one ──
async function fetchFromAdsbOne(lat: number, lon: number, radius: number): Promise<NormalizedAircraft[]> {
  const radiusNm = Math.min(Math.round(radius / 1.852), 250)
  const url = `https://api.adsb.one/v2/point/${lat}/${lon}/${radiusNm}`
  const { signal, clear } = withTimeout(7000)
  try {
    const res = await fetchWithRetry(url, { headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA }, cache: 'no-store', signal })
    clear()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const list: Record<string, unknown>[] = data.ac || []
    return list
      .map((a) => {
        const aLat = a.lat as number | undefined
        const aLon = a.lon as number | undefined
        if (aLat == null || aLon == null) return null
        return buildAircraft(lat, lon, radius, aLat, aLon, {
          icao24: String(a.hex ?? '').toUpperCase(),
          callsign: (a.flight as string)?.trim() || null,
          originCountry: '—',
          altitude: a.alt_baro === 'ground' ? 0 : (a.alt_baro != null ? (a.alt_baro as number) * 0.3048 : (a.alt_geom != null ? (a.alt_geom as number) * 0.3048 : null)),
          onGround: a.alt_baro === 'ground',
          velocity: a.gs != null ? (a.gs as number) * 0.514444 : null,
          trueTrack: (a.track as number) ?? null,
          verticalRate: a.baro_rate != null ? (a.baro_rate as number) * 0.00508 : null,
          squawk: (a.squawk as string) || null,
          category: a.category ? parseInt(String(a.category).replace(/\D/g, '')) || 0 : 0,
          _source: 'adsb.one',
        })
      })
      .filter((a): a is NormalizedAircraft => a !== null)
  } catch (err) {
    clear()
    throw err
  }
}

// ── Source : OpenSky Network ──
let cachedToken: { token: string; expiresAt: number } | null = null

async function getOpenSkyToken(): Promise<string | null> {
  const clientId = process.env.OPENSKY_CLIENT_ID
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token

  const { signal, clear } = withTimeout(7000)
  try {
    const res = await fetchWithRetry(
      'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': BROWSER_UA },
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

async function fetchFromOpenSky(lat: number, lon: number, radius: number): Promise<NormalizedAircraft[]> {
  const deg = radius / 111
  const lamin = lat - deg, lamax = lat + deg
  const lomin = lon - deg / Math.cos(lat * Math.PI / 180)
  const lomax = lon + deg / Math.cos(lat * Math.PI / 180)

  const token = await getOpenSkyToken()
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': BROWSER_UA }
  if (token) headers.Authorization = `Bearer ${token}`

  const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`
  const { signal, clear } = withTimeout(9000)
  try {
    const res = await fetchWithRetry(url, { headers, cache: 'no-store', signal })
    clear()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const states: unknown[][] = data.states || []
    return states
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
          _source: 'opensky',
        })
      })
      .filter((a): a is NormalizedAircraft => a !== null)
  } catch (err) {
    clear()
    throw err
  }
}

// ── Fusion + déduplication ──
// Deux détections sont considérées comme le même avion si :
// - même icao24 (cas le plus fiable), OU
// - même callsign ET position à moins de 3km l'une de l'autre
//   (cas où le format icao24 diffère entre sources)
function dedupeAircraft(groups: NormalizedAircraft[][]): NormalizedAircraft[] {
  const merged: NormalizedAircraft[] = []

  for (const group of groups) {
    for (const candidate of group) {
      const existingIdx = merged.findIndex(m => {
        if (candidate.icao24 && m.icao24 && candidate.icao24 === m.icao24) return true
        if (candidate.callsign && m.callsign && candidate.callsign === m.callsign) {
          const d = haversineKm(candidate.latitude, candidate.longitude, m.latitude, m.longitude)
          return d < 3
        }
        return false
      })

      if (existingIdx === -1) {
        merged.push(candidate)
      } else {
        // Garde la détection avec le plus d'informations utiles (originCountry connu, squawk présent, etc.)
        const existing = merged[existingIdx]
        const candidateScore = (candidate.originCountry !== '—' ? 1 : 0) + (candidate.squawk ? 1 : 0) + (candidate.callsign ? 1 : 0)
        const existingScore = (existing.originCountry !== '—' ? 1 : 0) + (existing.squawk ? 1 : 0) + (existing.callsign ? 1 : 0)
        if (candidateScore > existingScore) merged[existingIdx] = candidate
      }
    }
  }

  return merged
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') || '0')
  const lon = parseFloat(searchParams.get('lon') || '0')
  const radius = parseFloat(searchParams.get('radius') || '50')
  const max = parseInt(searchParams.get('max') || '20')

  const sourcesStatus: Record<string, { ok: boolean; count: number; error?: string }> = {}

  const [airlabsResult, adsbOneResult, openSkyResult] = await Promise.allSettled([
    process.env.AIRLABS_KEY ? fetchFromAirLabs(lat, lon, radius) : Promise.reject(new Error('clé non configurée')),
    fetchFromAdsbOne(lat, lon, radius),
    fetchFromOpenSky(lat, lon, radius),
  ])

  const groups: NormalizedAircraft[][] = []

  if (airlabsResult.status === 'fulfilled') {
    groups.push(airlabsResult.value)
    sourcesStatus.airlabs = { ok: true, count: airlabsResult.value.length }
  } else {
    sourcesStatus.airlabs = { ok: false, count: 0, error: describeError(airlabsResult.reason) }
  }

  if (adsbOneResult.status === 'fulfilled') {
    groups.push(adsbOneResult.value)
    sourcesStatus.adsbOne = { ok: true, count: adsbOneResult.value.length }
  } else {
    sourcesStatus.adsbOne = { ok: false, count: 0, error: describeError(adsbOneResult.reason) }
  }

  if (openSkyResult.status === 'fulfilled') {
    groups.push(openSkyResult.value)
    sourcesStatus.openSky = { ok: true, count: openSkyResult.value.length }
  } else {
    sourcesStatus.openSky = { ok: false, count: 0, error: describeError(openSkyResult.reason) }
  }

  const anySourceWorked = groups.length > 0
  const merged = dedupeAircraft(groups)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max)
    // Retire le champ interne _source avant envoi (garde la réponse propre pour le frontend)
    .map(({ _source, ...rest }) => rest)

  if (!anySourceWorked) {
    return NextResponse.json({
      aircraft: [],
      time: Date.now(),
      error: 'Toutes les sources de données avions sont indisponibles.',
      hint: Object.entries(sourcesStatus).map(([k, v]) => `${k}: ${v.error}`).join(' | '),
      sourcesStatus,
    }, { status: 200 })
  }

  return NextResponse.json({
    aircraft: merged,
    time: Date.now(),
    sourcesStatus,
  })
}
