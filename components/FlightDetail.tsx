'use client'
import { useEffect, useState } from 'react'
import type { Aircraft } from '@/lib/types'
import { formatAlt, formatSpeed, compassPoint, categoryLabel, vertRateLabel, getAirlineName } from '@/lib/utils'

interface FlightInfo {
  origin?: string | null
  originIata?: string | null
  destination?: string | null
  destinationIata?: string | null
  registration?: string | null
  aircraftType?: string | null
  status?: string | null
}

interface Props {
  aircraft: Aircraft
  onTrack: () => void
  isTracked: boolean
  photoLink?: string | null
  photographer?: string | null
}

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--green)',
  scheduled: 'var(--text-muted)',
  landed: 'var(--amber)',
  cancelled: 'var(--red)',
  diverted: 'var(--amber)',
}

export default function FlightDetail({ aircraft: ac, onTrack, isTracked, photoLink, photographer }: Props) {
  const [info, setInfo] = useState<FlightInfo | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ac.callsign) return
    setLoading(true)
    fetch(`/api/flight-info?callsign=${ac.callsign}`)
      .then(r => r.json())
      .then(d => setInfo(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ac.callsign])

  const airline = getAirlineName(ac.callsign)
  const statusColor = info?.status ? STATUS_COLORS[info.status] || 'var(--text-muted)' : 'var(--text-muted)'

  return (
    <div className="fdet">
      {/* Route */}
      {(info?.originIata || info?.destinationIata) && (
        <div className="fdet-route">
          <div className="fdet-iata">{info.originIata || '???'}</div>
          <div className="fdet-route-line">
            <span className="fdet-route-dot"/>
            <span className="fdet-route-track"/>
            <span className="fdet-plane">✈</span>
            <span className="fdet-route-track"/>
            <span className="fdet-route-dot"/>
          </div>
          <div className="fdet-iata">{info.destinationIata || '???'}</div>
        </div>
      )}
      {info?.origin && (
        <div className="fdet-airports">
          <span>{info.origin}</span>
          <span>→</span>
          <span>{info.destination || '—'}</span>
        </div>
      )}

      {/* Main data rows */}
      <div className="fdet-rows">
        <div className="fdet-row">
          <span>ICAO24</span>
          <strong>{ac.icao24.toUpperCase()}</strong>
        </div>
        {info?.registration && (
          <div className="fdet-row">
            <span>Immatriculation</span>
            <strong>{info.registration}</strong>
          </div>
        )}
        {info?.aircraftType && (
          <div className="fdet-row">
            <span>Type</span>
            <strong>{info.aircraftType}</strong>
          </div>
        )}
        {info?.status && (
          <div className="fdet-row">
            <span>Statut</span>
            <strong style={{ color: statusColor, textTransform: 'capitalize' }}>{info.status}</strong>
          </div>
        )}
        <div className="fdet-row">
          <span>Compagnie</span>
          <strong>{airline}</strong>
        </div>
        <div className="fdet-row">
          <span>Pays d'origine</span>
          <strong>{ac.originCountry}</strong>
        </div>
        <div className="fdet-row">
          <span>Catégorie</span>
          <strong>{categoryLabel(ac.category)}</strong>
        </div>
        {ac.squawk && (
          <div className="fdet-row">
            <span>Squawk</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{ac.squawk}</strong>
          </div>
        )}
        <div className="fdet-row">
          <span>Altitude</span>
          <strong>{formatAlt(ac.altitude)}</strong>
        </div>
        <div className="fdet-row">
          <span>Vitesse sol</span>
          <strong>{formatSpeed(ac.velocity)}</strong>
        </div>
        <div className="fdet-row">
          <span>Taux V/S</span>
          <strong>{vertRateLabel(ac.verticalRate)}</strong>
        </div>
        <div className="fdet-row">
          <span>Cap</span>
          <strong>
            {ac.trueTrack != null
              ? `${Math.round(ac.trueTrack)}° ${compassPoint(ac.trueTrack)}`
              : '—'}
          </strong>
        </div>
        <div className="fdet-row">
          <span>Relèvement obs.</span>
          <strong>
            {ac.bearing != null
              ? `${ac.bearing}° ${compassPoint(ac.bearing)}`
              : '—'}
          </strong>
        </div>
        <div className="fdet-row">
          <span>Distance</span>
          <strong>{ac.distance} km</strong>
        </div>
        <div className="fdet-row">
          <span>Position</span>
          <strong style={{ fontSize: '11px' }}>
            {ac.latitude?.toFixed(4)}° / {ac.longitude?.toFixed(4)}°
          </strong>
        </div>
      </div>

      {loading && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '6px 0', textAlign: 'center' }}>
          Chargement des détails...
        </div>
      )}

      {/* Actions */}
      <div className="fdet-actions">
        <button
          className={`fdet-btn ${isTracked ? 'fdet-btn--active' : ''}`}
          onClick={e => { e.stopPropagation(); onTrack() }}
        >
          {isTracked ? '⏹ Arrêter le suivi' : '📡 Suivre cet appareil'}
        </button>
        {photoLink && (
          <a
            href={photoLink}
            target="_blank"
            rel="noreferrer"
            className="fdet-btn"
            onClick={e => e.stopPropagation()}
          >
            📷 Photo{photographer ? ` (© ${photographer})` : ''}
          </a>
        )}
        <a
          href={`https://www.flightradar24.com/${ac.callsign || ac.icao24}`}
          target="_blank"
          rel="noreferrer"
          className="fdet-btn"
          onClick={e => e.stopPropagation()}
        >
          🌐 FlightRadar24
        </a>
      </div>

      <style jsx>{`
        .fdet { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-top: 1px solid var(--border); background: var(--bg-panel); }

        .fdet-route { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px 0 4px; }
        .fdet-iata { font-family: var(--font-mono); font-size: 22px; font-weight: 500; color: var(--text-primary); letter-spacing: 0.08em; }
        .fdet-route-line { display: flex; align-items: center; gap: 3px; color: var(--accent); font-size: 16px; }
        .fdet-route-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); opacity: 0.5; }
        .fdet-route-track { display: block; height: 1px; width: 24px; background: var(--border-bright); }
        .fdet-plane { font-size: 16px; }

        .fdet-airports { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 11px; color: var(--text-muted); margin-top: -4px; margin-bottom: 4px; text-align: center; }

        .fdet-rows { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
        .fdet-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; font-size: 12px; border-bottom: 1px solid var(--border); background: var(--bg-card); }
        .fdet-row:last-child { border-bottom: none; }
        .fdet-row:nth-child(even) { background: var(--bg-base); }
        .fdet-row span { color: var(--text-muted); }
        .fdet-row strong { font-weight: 400; color: var(--text-secondary); font-size: 12px; text-align: right; }

        .fdet-actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .fdet-btn { font-size: 11px; padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-bright); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; transition: all 0.15s; text-decoration: none; white-space: nowrap; }
        .fdet-btn:hover { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
        .fdet-btn--active { background: var(--green-soft); color: var(--green); border-color: rgba(39,200,122,0.4); }
      `}</style>
    </div>
  )
}
