import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = searchParams.get('lat') || '0'
  const lon = searchParams.get('lon') || '0'

  try {
    // formatted=0 gives ISO timestamps in UTC
    const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error('sunrise api error')
    const data = await res.json()
    const r = data.results

    // Get timezone offset from Open-Meteo (it returns timezone name for free)
    let tzName = 'UTC'
    try {
      const tzRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&hourly=temperature_2m&forecast_days=1`,
        { next: { revalidate: 86400 } }
      )
      const tzData = await tzRes.json()
      tzName = tzData.timezone || 'UTC'
    } catch { /* use UTC */ }

    const fmt = (iso: string) => {
      try {
        return new Date(iso).toLocaleTimeString('fr-FR', {
          hour: '2-digit', minute: '2-digit', timeZone: tzName,
        })
      } catch {
        return new Date(iso).toLocaleTimeString('fr-FR', {
          hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
        })
      }
    }

    return NextResponse.json({
      sunrise: fmt(r.sunrise),
      sunset: fmt(r.sunset),
      solarNoon: fmt(r.solar_noon),
      dayLength: r.day_length, // seconds
    })
  } catch {
    return NextResponse.json({ sunrise: '—', sunset: '—', solarNoon: '—', dayLength: null })
  }
}
