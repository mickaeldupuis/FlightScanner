import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = searchParams.get('lat') || '0'
  const lon = searchParams.get('lon') || '0'

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m&wind_speed_unit=kmh&timezone=auto`
    const res = await fetch(url, { next: { revalidate: 300 } })
    const data = await res.json()
    const c = data.current
    return NextResponse.json({
      temperature: Math.round(c.temperature_2m),
      weatherCode: c.weather_code,
      windSpeed: Math.round(c.wind_speed_10m),
      windDirection: c.wind_direction_10m,
      humidity: c.relative_humidity_2m,
    })
  } catch {
    return NextResponse.json({ temperature: null, weatherCode: 0, windSpeed: null, windDirection: null, humidity: null })
  }
}
