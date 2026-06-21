'use client'
import { useEffect, useState } from 'react'

export const ALL_TZ = [
  { tz: 'UTC', label: 'ZULU', city: 'UTC' },
  { tz: 'Europe/Paris', label: 'PARIS', city: 'Paris' },
  { tz: 'Europe/London', label: 'LONDON', city: 'Londres' },
  { tz: 'Europe/Berlin', label: 'BERLIN', city: 'Berlin' },
  { tz: 'Europe/Madrid', label: 'MADRID', city: 'Madrid' },
  { tz: 'Europe/Moscow', label: 'MOSCOW', city: 'Moscou' },
  { tz: 'Europe/Istanbul', label: 'ISTANBUL', city: 'Istanbul' },
  { tz: 'Asia/Dubai', label: 'DUBAI', city: 'Dubaï' },
  { tz: 'Asia/Kolkata', label: 'DELHI', city: 'New Delhi' },
  { tz: 'Asia/Bangkok', label: 'BANGKOK', city: 'Bangkok' },
  { tz: 'Asia/Singapore', label: 'SINGAPORE', city: 'Singapour' },
  { tz: 'Asia/Tokyo', label: 'TOKYO', city: 'Tokyo' },
  { tz: 'Asia/Seoul', label: 'SEOUL', city: 'Séoul' },
  { tz: 'Asia/Shanghai', label: 'BEIJING', city: 'Pékin' },
  { tz: 'Australia/Sydney', label: 'SYDNEY', city: 'Sydney' },
  { tz: 'Pacific/Auckland', label: 'AUCKLAND', city: 'Auckland' },
  { tz: 'Pacific/Tahiti', label: 'TAHITI', city: 'Papeete' },
  { tz: 'Pacific/Honolulu', label: 'HONOLULU', city: 'Honolulu' },
  { tz: 'America/Anchorage', label: 'ANCHORAGE', city: 'Anchorage' },
  { tz: 'America/Los_Angeles', label: 'LA', city: 'Los Angeles' },
  { tz: 'America/Chicago', label: 'CHICAGO', city: 'Chicago' },
  { tz: 'America/New_York', label: 'NEW YORK', city: 'New York' },
  { tz: 'America/Sao_Paulo', label: 'SAO PAULO', city: 'São Paulo' },
  { tz: 'Atlantic/Reykjavik', label: 'REYKJAVIK', city: 'Reykjavik' },
  { tz: 'Africa/Cairo', label: 'CAIRO', city: 'Le Caire' },
  { tz: 'Africa/Johannesburg', label: 'JOBURG', city: 'Johannesburg' },
]

export const DEFAULT_TZ = [
  'UTC', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
  'Pacific/Tahiti', 'America/Los_Angeles', 'Europe/Paris',
]

interface Props {
  activeTZ: string[]
}

export default function WorldClock({ activeTZ }: Props) {
  const [times, setTimes] = useState<string[]>([])

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTimes(activeTZ.map(tz =>
        now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz })
      ))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeTZ])

  return (
    <div className="wc-strip" role="region" aria-label="Horloge mondiale">
      {activeTZ.map((tz, i) => {
        const zone = ALL_TZ.find(z => z.tz === tz)
        return (
          <div key={tz} className={`wc-zone${tz === 'UTC' ? ' wc-zone--zulu' : ''}`}>
            <span className="wc-time">{times[i] || '--:--:--'}</span>
            <span className="wc-label">{zone?.label ?? tz}</span>
          </div>
        )
      })}
      <style jsx>{`
        .wc-strip { display:flex; overflow-x:auto; background:var(--bg-panel); scrollbar-width:none; }
        .wc-strip::-webkit-scrollbar { display:none; }
        .wc-zone { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8px 16px; border-right:1px solid var(--border); min-width:108px; flex-shrink:0; gap:2px; }
        .wc-zone--zulu { background:rgba(45,125,210,0.06); }
        .wc-time { font-family:var(--font-mono); font-size:14px; font-weight:500; color:var(--text-primary); letter-spacing:0.04em; }
        .wc-zone--zulu .wc-time { color:var(--accent); }
        .wc-label { font-size:8px; letter-spacing:0.15em; color:var(--text-muted); text-transform:uppercase; font-family:var(--font-mono); }
      `}</style>
    </div>
  )
}
