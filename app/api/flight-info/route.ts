import { NextRequest, NextResponse } from 'next/server'

function fmtTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const callsign = searchParams.get('callsign') || ''
  if (!callsign) return NextResponse.json({})

  const key = process.env.AVIATIONSTACK_KEY
  if (!key) return NextResponse.json({})

  try {
    const url = `http://api.aviationstack.com/v1/flights?access_key=${key}&flight_icao=${callsign}&limit=1`
    const res = await fetch(url, { next: { revalidate: 60 } })
    if (!res.ok) return NextResponse.json({})
    const data = await res.json()
    const f = data.data?.[0]
    if (!f) return NextResponse.json({})

    const dep = f.departure || {}
    const arr = f.arrival || {}

    return NextResponse.json({
      // identité
      origin:           dep.airport || dep.iata || null,
      originIata:       dep.iata || null,
      destination:      arr.airport || arr.iata || null,
      destinationIata:  arr.iata || null,
      registration:     f.aircraft?.registration || null,
      aircraftType:     f.aircraft?.icao || null,
      status:           f.flight_status || null,
      airlineIata:      f.airline?.iata || null,
      airlineIcao:      f.airline?.icao || null,
      airlineName:      f.airline?.name || null,
      // départ
      depScheduled:     fmtTime(dep.scheduled),
      depEstimated:     fmtTime(dep.estimated),
      depActual:        fmtTime(dep.actual),
      depDelay:         dep.delay ?? null,         // minutes
      depTerminal:      dep.terminal || null,
      depGate:          dep.gate || null,
      // arrivée
      arrScheduled:     fmtTime(arr.scheduled),
      arrEstimated:     fmtTime(arr.estimated),
      arrActual:        fmtTime(arr.actual),
      arrDelay:         arr.delay ?? null,
      arrTerminal:      arr.terminal || null,
      arrGate:          arr.gate || null,
      arrBaggage:       arr.baggage || null,
    })
  } catch {
    return NextResponse.json({})
  }
}
