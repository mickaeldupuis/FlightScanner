export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

export function compassPoint(deg: number): string {
  const pts = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO']
  return pts[Math.round(deg / 22.5) % 16]
}

export function metersToFeet(m: number): number { return Math.round(m * 3.28084) }
export function msToKnots(ms: number): number { return Math.round(ms * 1.94384) }
export function msToKmh(ms: number): number { return Math.round(ms * 3.6) }

export function formatAlt(m: number | null): string {
  if (m === null) return '—'
  return `${metersToFeet(m).toLocaleString()} ft`
}

export function formatSpeed(ms: number | null): string {
  if (ms === null) return '—'
  return `${msToKnots(ms)} kt`
}

export function weatherDesc(code: number): string {
  if (code === 0) return 'Dégagé'
  if (code <= 2) return 'Partiellement nuageux'
  if (code === 3) return 'Couvert'
  if (code <= 49) return 'Brouillard'
  if (code <= 59) return 'Bruine'
  if (code <= 69) return 'Pluie'
  if (code <= 79) return 'Neige'
  if (code <= 84) return 'Averses'
  if (code <= 99) return 'Orage'
  return 'Inconnu'
}

export function weatherIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '⛅'
  if (code === 3) return '☁️'
  if (code <= 49) return '🌫️'
  if (code <= 69) return '🌧️'
  if (code <= 79) return '❄️'
  if (code <= 84) return '🌦️'
  if (code <= 99) return '⛈️'
  return '🌡️'
}

export function getAirlineName(callsign: string | null): string {
  if (!callsign) return '—'
  const prefix = callsign.replace(/[0-9\s]/g, '').trim().toUpperCase()
  const airlines: Record<string, string> = {
    'AFR': 'Air France', 'UAL': 'United', 'AAL': 'American', 'DAL': 'Delta',
    'BAW': 'British Airways', 'DLH': 'Lufthansa', 'IBE': 'Iberia', 'KLM': 'KLM',
    'EZY': 'easyJet', 'RYR': 'Ryanair', 'VLG': 'Vueling', 'AZA': 'Alitalia',
    'UAE': 'Emirates', 'QTR': 'Qatar', 'ETD': 'Etihad', 'THY': 'Turkish',
    'SWR': 'SWISS', 'AUA': 'Austrian', 'SAS': 'SAS', 'FIN': 'Finnair',
    'TAP': 'TAP Portugal', 'AEE': 'Aegean', 'NOZ': 'Norwegian', 'WZZ': 'Wizz Air',
    'TOM': 'TUI', 'BEL': 'Brussels', 'JST': 'Jetstar', 'QFA': 'Qantas',
    'CPA': 'Cathay Pacific', 'SIA': 'Singapore', 'MAS': 'Malaysia', 'THA': 'Thai',
    'JAL': 'Japan Airlines', 'ANA': 'ANA', 'KAL': 'Korean Air', 'AAR': 'Asiana',
    'CCA': 'Air China', 'CSN': 'China Southern', 'CES': 'China Eastern',
    'SVA': 'Saudi', 'MSR': 'EgyptAir', 'ETH': 'Ethiopian',
    'AIC': 'Air India', 'ISS': 'Meridiana',
    'ATN': 'Air Transport Intl', 'UPS': 'UPS', 'FDX': 'FedEx',
    'GTI': 'Atlas Air', 'ABX': 'ABX Air',
    'AIH': 'Air Tahiti Nui', 'THT': 'Air Tahiti',
  }
  return airlines[prefix] || callsign.trim()
}

export function categoryLabel(cat: number): string {
  const labels: Record<number, string> = {
    0: 'Inconnu', 1: 'Aucune info', 2: 'Léger', 3: 'Moyen',
    4: 'Lourd', 5: 'Haute perf.', 6: 'Hélicoptère', 7: 'Ultra-léger',
    8: 'Planeur', 9: 'Ballon', 10: 'Parachute', 11: 'ULM',
    12: 'UAV', 13: 'Espace', 14: 'Surface véhicule', 15: 'Service sol',
  }
  return labels[cat] || 'Inconnu'
}

export function vertRateLabel(vr: number | null): string {
  if (vr === null) return '—'
  if (Math.abs(vr) < 0.5) return '→ Palier'
  if (vr > 0) return `↑ +${Math.round(vr * 196)} ft/min`
  return `↓ ${Math.round(vr * 196)} ft/min`
}

// World clock zones for ops center display
export const OPS_ZONES = [
  { label: 'ZULU', tz: 'UTC' },
  { label: 'PARIS', tz: 'Europe/Paris' },
  { label: 'LONDON', tz: 'Europe/London' },
  { label: 'DUBAI', tz: 'Asia/Dubai' },
  { label: 'TOKYO', tz: 'Asia/Tokyo' },
  { label: 'NEW YORK', tz: 'America/New_York' },
  { label: 'LOS ANGELES', tz: 'America/Los_Angeles' },
  { label: 'SYDNEY', tz: 'Australia/Sydney' },
]

export function formatDayLength(seconds: number | null): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, '0')}min`
}
