import { NextRequest, NextResponse } from 'next/server'
import { haversineKm, bearingDeg } from '@/lib/utils'

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
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 15 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'OpenSky unavailable', states: [] }, { status: 200 })
    }

    const data = await res.json()
    const states = data.states || []

    // Parse & enrich
    const aircraft = states
      .map((s: unknown[]) => {
        const aLat = s[6] as number | null
        const aLon = s[5] as number | null
        if (!aLat || !aLon) return null
        const distance = haversineKm(lat, lon, aLat, aLon)
        if (distance > radius) return null
        const bearing = bearingDeg(lat, lon, aLat, aLon)
        return {
          icao24: s[0],
          callsign: (s[1] as string)?.trim() || null,
          originCountry: s[2],
          longitude: aLon,
          latitude: aLat,
          altitude: s[7] ?? s[13],   // baro alt, fallback geo
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
      .filter(Boolean)
      .sort((a: {distance:number}, b: {distance:number}) => a.distance - b.distance)
      .slice(0, max)

    return NextResponse.json({ aircraft, time: Date.now() })
  } catch (err) {
    console.error('Flights API error:', err)
    return NextResponse.json({ aircraft: [], time: Date.now(), error: 'fetch failed' })
  }
}
