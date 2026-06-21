import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function radiusToBbox(lat: number, lon: number, radiusKm: number): [number, number, number, number] {
  const deg = radiusKm / 111
  const lonDeg = deg / Math.cos((lat * Math.PI) / 180)
  return [lat - deg, lon - lonDeg, lat + deg, lon + lonDeg]
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  // Défaut : Faa'a International Airport (NTAA/PPT)
  const lat = parseFloat(searchParams.get('lat') || '-17.5537')
  const lon = parseFloat(searchParams.get('lon') || '-149.6066')
  const radius = parseFloat(searchParams.get('radius') || '100')

  const key = process.env.AIRLABS_KEY
  const report: Record<string, unknown> = { lat, lon, radius, hasKey: !!key }

  if (!key) {
    report.error = 'AIRLABS_KEY non configurée'
    return NextResponse.json(report)
  }

  const [swLat, swLon, neLat, neLon] = radiusToBbox(lat, lon, radius)
  const bbox = `${swLat},${swLon},${neLat},${neLon}`
  report.bbox = bbox

  // Test 1 : requête avec bbox (comme dans l'app)
  try {
    const url = `https://airlabs.co/api/v9/flights?api_key=${key}&bbox=${bbox}`
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA }, cache: 'no-store' })
    const data = await res.json()
    report.bboxQuery = {
      status: res.status,
      error: data?.error || null,
      resultCount: Array.isArray(data?.response) ? data.response.length : 0,
      sample: Array.isArray(data?.response) ? data.response.slice(0, 5) : data,
    }
  } catch (err) {
    report.bboxQuery = { error: err instanceof Error ? err.message : String(err) }
  }

  // Test 2 : requête SANS bbox, juste limit (pour voir si AirLabs a des données dans le Pacifique en général)
  try {
    const url = `https://airlabs.co/api/v9/flights?api_key=${key}&limit=5`
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA }, cache: 'no-store' })
    const data = await res.json()
    report.globalSample = {
      status: res.status,
      error: data?.error || null,
      resultCount: Array.isArray(data?.response) ? data.response.length : 0,
      sample: Array.isArray(data?.response) ? data.response.slice(0, 3) : data,
    }
  } catch (err) {
    report.globalSample = { error: err instanceof Error ? err.message : String(err) }
  }

  // Test 3 : requête par aéroport directement (dep_iata=PPT) — souvent plus fiable que bbox
  try {
    const url = `https://airlabs.co/api/v9/flights?api_key=${key}&dep_iata=PPT`
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA }, cache: 'no-store' })
    const data = await res.json()
    report.byAirportPPT = {
      status: res.status,
      error: data?.error || null,
      resultCount: Array.isArray(data?.response) ? data.response.length : 0,
      sample: Array.isArray(data?.response) ? data.response.slice(0, 5) : data,
    }
  } catch (err) {
    report.byAirportPPT = { error: err instanceof Error ? err.message : String(err) }
  }

  return NextResponse.json(report)
}
