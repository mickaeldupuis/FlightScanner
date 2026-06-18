import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const icao = searchParams.get('icao') || ''
  const reg = searchParams.get('reg') || ''

  try {
    const query = reg || icao
    const url = `https://api.planespotters.net/pub/photos/hex/${icao}`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return NextResponse.json({ photoUrl: null })
    const data = await res.json()
    const photo = data.photos?.[0]
    if (!photo) return NextResponse.json({ photoUrl: null })
    return NextResponse.json({
      photoUrl: photo.thumbnail_large?.src || photo.thumbnail?.src || null,
      photographer: photo.photographer || null,
      link: photo.link || null,
    })
  } catch {
    return NextResponse.json({ photoUrl: null })
  }
}
