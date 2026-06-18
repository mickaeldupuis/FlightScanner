import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const callsign = searchParams.get('callsign') || ''

  if (!callsign) return NextResponse.json({})

  // Try AviationStack free tier (requires AVIATIONSTACK_KEY env var)
  const key = process.env.AVIATIONSTACK_KEY
  if (!key) return NextResponse.json({})

  try {
    const url = `http://api.aviationstack.com/v1/flights?access_key=${key}&flight_icao=${callsign}&limit=1`
    const res = await fetch(url, { next: { revalidate: 60 } })
    if (!res.ok) return NextResponse.json({})
    const data = await res.json()
    const f = data.data?.[0]
    if (!f) return NextResponse.json({})
    return NextResponse.json({
      origin: f.departure?.airport || f.departure?.iata || null,
      originIata: f.departure?.iata || null,
      destination: f.arrival?.airport || f.arrival?.iata || null,
      destinationIata: f.arrival?.iata || null,
      registration: f.aircraft?.registration || null,
      aircraftType: f.aircraft?.icao || null,
      status: f.flight_status || null,
    })
  } catch {
    return NextResponse.json({})
  }
}
