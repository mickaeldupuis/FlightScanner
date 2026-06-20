'use client'
import { useEffect, useState } from 'react'
import type { Aircraft } from '@/lib/types'
import { formatAlt, formatSpeed, compassPoint, categoryLabel, vertRateLabel, getAirlineName } from '@/lib/utils'

interface FlightInfo {
  origin?: string | null; originIata?: string | null
  destination?: string | null; destinationIata?: string | null
  registration?: string | null; aircraftType?: string | null
  status?: string | null
  airlineIata?: string | null; airlineIcao?: string | null; airlineName?: string | null
  // départ
  depScheduled?: string | null; depEstimated?: string | null; depActual?: string | null
  depDelay?: number | null; depTerminal?: string | null; depGate?: string | null
  // arrivée
  arrScheduled?: string | null; arrEstimated?: string | null; arrActual?: string | null
  arrDelay?: number | null; arrTerminal?: string | null; arrGate?: string | null; arrBaggage?: string | null
}

interface Props {
  aircraft:    Aircraft
  onTrack:     () => void
  isTracked:   boolean
  photoLink?:  string | null
  photographer?: string | null
}

// Logo compagnie via Daisycon (CDN public sans clé, IATA code)
function AirlineLogo({ iata, name }: { iata: string | null | undefined; name: string }) {
  const [ok, setOk] = useState(false)
  const [tried, setTried] = useState(false)
  if (!iata) return <span className="fd-airline-name">{name}</span>
  const src = `https://daisycon.io/images/airline/?iata=${iata}&width=120&height=40&color=ffffff`
  return (
    <div className="fd-logo-wrap">
      {!tried || ok ? (
        <img
          src={src}
          alt={name}
          className="fd-logo-img"
          onLoad={() => { setOk(true); setTried(true) }}
          onError={() => setTried(true)}
          style={{ display: ok ? 'block' : 'none' }}
        />
      ) : null}
      {(!ok || !tried) && !ok && tried && <span className="fd-airline-name">{name}</span>}
      {!tried && <span className="fd-airline-name" style={{ opacity: .5 }}>{name}</span>}
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  active: '🟢 En vol', scheduled: '🕐 Prévu', landed: '🏁 Atterri',
  cancelled: '❌ Annulé', diverted: '⚠️ Dérouté', incident: '🔴 Incident',
}
const STATUS_COLOR: Record<string, string> = {
  active: 'var(--green)', scheduled: 'var(--text-muted)', landed: 'var(--amber)',
  cancelled: '#ef4444', diverted: 'var(--amber)', incident: '#ef4444',
}

function TimeCell({ scheduled, estimated, actual, delay }: {
  scheduled?: string | null; estimated?: string | null; actual?: string | null; delay?: number | null
}) {
  if (!scheduled) return <span className="fd-val">—</span>
  const mainTime = actual || estimated || scheduled
  const isDelayed = (delay ?? 0) > 0
  const isEarly   = (delay ?? 0) < 0
  return (
    <div className="fd-time-cell">
      <span className="fd-time-main" style={{ color: isDelayed ? 'var(--amber)' : isEarly ? 'var(--green)' : 'var(--text-primary)' }}>
        {mainTime}
      </span>
      {scheduled && mainTime !== scheduled && (
        <span className="fd-time-sched">prévu {scheduled}</span>
      )}
      {delay != null && Math.abs(delay) > 1 && (
        <span className="fd-time-delay" style={{ color: isDelayed ? 'var(--amber)' : 'var(--green)' }}>
          {isDelayed ? `+${delay} min` : `${delay} min`}
        </span>
      )}
    </div>
  )
}

export default function FlightDetail({ aircraft: ac, onTrack, isTracked, photoLink, photographer }: Props) {
  const [info, setInfo] = useState<FlightInfo | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ac.callsign) return
    setLoading(true)
    fetch(`/api/flight-info?callsign=${ac.callsign}`)
      .then(r => r.json())
      .then(d => setInfo(Object.keys(d).length ? d : null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ac.callsign])

  const airline  = info?.airlineName  || getAirlineName(ac.callsign)
  const iata     = info?.airlineIata
  const hasRoute = info?.originIata || info?.destinationIata

  return (
    <div className="fd-root">

      {/* ── ROUTE + LOGO ── */}
      <div className="fd-top">
        {/* Logo compagnie */}
        <div className="fd-logo-section">
          <AirlineLogo iata={iata} name={airline} />
        </div>

        {/* Route IATA */}
        {hasRoute && (
          <div className="fd-route">
            <div className="fd-iata-block">
              <span className="fd-iata">{info?.originIata || '???'}</span>
              {info?.origin && <span className="fd-airport-name">{info.origin}</span>}
            </div>
            <div className="fd-route-arrow">
              <div className="fd-route-line"/>
              <span className="fd-route-plane">✈</span>
              <div className="fd-route-line"/>
            </div>
            <div className="fd-iata-block" style={{ textAlign: 'right' }}>
              <span className="fd-iata">{info?.destinationIata || '???'}</span>
              {info?.destination && <span className="fd-airport-name">{info.destination}</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── HORAIRES ── */}
      {info && (info.depScheduled || info.arrScheduled) && (
        <div className="fd-schedule">
          <div className="fd-schedule-col">
            <div className="fd-schedule-header">
              <span className="fd-schedule-icon">🛫</span>
              <span className="fd-schedule-label">DÉPART</span>
              {info.depTerminal && <span className="fd-schedule-tag">T{info.depTerminal}</span>}
              {info.depGate     && <span className="fd-schedule-tag">Porte {info.depGate}</span>}
            </div>
            <TimeCell scheduled={info.depScheduled} estimated={info.depEstimated} actual={info.depActual} delay={info.depDelay} />
          </div>
          <div className="fd-schedule-sep"/>
          <div className="fd-schedule-col">
            <div className="fd-schedule-header">
              <span className="fd-schedule-icon">🛬</span>
              <span className="fd-schedule-label">ARRIVÉE</span>
              {info.arrTerminal && <span className="fd-schedule-tag">T{info.arrTerminal}</span>}
              {info.arrGate     && <span className="fd-schedule-tag">Porte {info.arrGate}</span>}
              {info.arrBaggage  && <span className="fd-schedule-tag">🧳 {info.arrBaggage}</span>}
            </div>
            <TimeCell scheduled={info.arrScheduled} estimated={info.arrEstimated} actual={info.arrActual} delay={info.arrDelay} />
          </div>
        </div>
      )}

      {/* ── STATUT ── */}
      {info?.status && (
        <div className="fd-status" style={{ color: STATUS_COLOR[info.status] || 'var(--text-muted)' }}>
          {STATUS_LABEL[info.status] || info.status}
        </div>
      )}

      {/* ── DONNÉES TECHNIQUES ── */}
      <div className="fd-rows">
        {([
          ['ICAO24',         ac.icao24.toUpperCase()],
          info?.registration ? ['Immatriculation', info.registration] : null,
          info?.aircraftType ? ['Type appareil',   info.aircraftType] : null,
          ['Pays d\'origine', ac.originCountry],
          ['Catégorie',      categoryLabel(ac.category)],
          ac.squawk ? ['Squawk', ac.squawk] : null,
          ['Altitude',       formatAlt(ac.altitude)],
          ['Vitesse sol',    formatSpeed(ac.velocity)],
          ['Taux V/S',       vertRateLabel(ac.verticalRate)],
          ['Cap',            ac.trueTrack != null ? `${Math.round(ac.trueTrack)}° ${compassPoint(ac.trueTrack)}` : '—'],
          ['Relèvement',     ac.bearing   != null ? `${ac.bearing}° ${compassPoint(ac.bearing)}` : '—'],
          ['Distance',       `${ac.distance} km`],
          ac.latitude ? ['Position', `${ac.latitude.toFixed(4)}° / ${ac.longitude?.toFixed(4)}°`] : null,
        ] as ([string, string] | null)[]).filter((row): row is [string, string] => row !== null).map(([l, v]) => (
          <div className="fd-row" key={l}>
            <span>{l}</span><strong>{v}</strong>
          </div>
        ))}
      </div>

      {loading && <div className="fd-loading">Chargement des détails vol…</div>}

      {/* ── ACTIONS ── */}
      <div className="fd-actions">
        <button className={`fd-btn${isTracked ? ' act' : ''}`} onClick={e => { e.stopPropagation(); onTrack() }}>
          {isTracked ? '⏹ Arrêter le suivi' : '📡 Suivre cet appareil'}
        </button>
        {photoLink && (
          <a href={photoLink} target="_blank" rel="noreferrer" className="fd-btn"
            onClick={e => e.stopPropagation()}>
            📷 {photographer ? `© ${photographer}` : 'Photo'}
          </a>
        )}
        <a href={`https://www.flightradar24.com/${ac.callsign || ac.icao24}`}
          target="_blank" rel="noreferrer" className="fd-btn"
          onClick={e => e.stopPropagation()}>
          🌐 FR24
        </a>
      </div>

      <style jsx>{`
        .fd-root { display:flex; flex-direction:column; gap:10px; padding:14px; border-top:1px solid var(--border); background:var(--bg-panel); }

        /* TOP */
        .fd-top { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .fd-logo-section { display:flex; align-items:center; }
        .fd-logo-wrap { display:flex; align-items:center; min-height:32px; }
        .fd-logo-img { height:28px; max-width:110px; object-fit:contain; filter:brightness(0) invert(1); opacity:.9; }
        .fd-airline-name { font-family:var(--font-mono); font-size:12px; color:var(--text-secondary); }

        /* ROUTE */
        .fd-route { display:flex; align-items:center; gap:10px; flex:1; justify-content:center; }
        .fd-iata-block { display:flex; flex-direction:column; align-items:center; gap:2px; }
        .fd-iata { font-family:var(--font-mono); font-size:20px; font-weight:500; color:var(--text-primary); letter-spacing:.06em; }
        .fd-airport-name { font-size:9px; color:var(--text-muted); text-align:center; max-width:90px; line-height:1.3; }
        .fd-route-arrow { display:flex; align-items:center; gap:4px; color:var(--accent); flex:1; max-width:80px; }
        .fd-route-line { flex:1; height:1px; background:var(--border-bright); }
        .fd-route-plane { font-size:14px; flex-shrink:0; }

        /* HORAIRES */
        .fd-schedule {
          display:flex; gap:0;
          background:var(--bg-card); border:1px solid var(--border);
          border-radius:var(--radius-sm); overflow:hidden;
        }
        .fd-schedule-col { flex:1; padding:10px 12px; display:flex; flex-direction:column; gap:6px; }
        .fd-schedule-sep { width:1px; background:var(--border); flex-shrink:0; }
        .fd-schedule-header { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
        .fd-schedule-icon { font-size:13px; }
        .fd-schedule-label { font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:var(--text-muted); font-family:var(--font-mono); }
        .fd-schedule-tag { font-size:9px; background:var(--bg-panel); color:var(--text-muted); padding:1px 5px; border-radius:4px; border:1px solid var(--border); font-family:var(--font-mono); }
        .fd-time-cell { display:flex; flex-direction:column; gap:1px; }
        .fd-time-main { font-family:var(--font-mono); font-size:18px; font-weight:400; letter-spacing:.04em; line-height:1.2; }
        .fd-time-sched { font-size:10px; color:var(--text-muted); font-family:var(--font-mono); text-decoration:line-through; }
        .fd-time-delay { font-size:10px; font-family:var(--font-mono); font-weight:500; }

        /* STATUT */
        .fd-status { font-size:12px; font-family:var(--font-mono); padding:6px 10px; background:var(--bg-card); border-radius:var(--radius-sm); border:1px solid var(--border); }

        /* ROWS */
        .fd-rows { display:flex; flex-direction:column; border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; }
        .fd-row { display:flex; justify-content:space-between; align-items:center; padding:5px 10px; font-size:12px; border-bottom:1px solid var(--border); background:var(--bg-card); }
        .fd-row:last-child { border-bottom:none; }
        .fd-row:nth-child(even) { background:var(--bg-base); }
        .fd-row span { color:var(--text-muted); }
        .fd-row strong { font-weight:400; color:var(--text-secondary); font-size:12px; text-align:right; font-family:var(--font-mono); }
        .fd-val { font-family:var(--font-mono); font-size:12px; color:var(--text-muted); }

        /* LOADING */
        .fd-loading { font-size:11px; color:var(--text-muted); text-align:center; padding:6px; font-family:var(--font-mono); }

        /* ACTIONS */
        .fd-actions { display:flex; gap:6px; flex-wrap:wrap; }
        .fd-btn { font-size:11px; padding:6px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-bright); background:var(--bg-card); color:var(--text-secondary); cursor:pointer; transition:all .15s; text-decoration:none; font-family:var(--font-ui); display:inline-flex; align-items:center; gap:4px; }
        .fd-btn:hover { background:var(--accent-soft); color:var(--accent); border-color:var(--accent); }
        .fd-btn.act { background:var(--green-soft); color:var(--green); border-color:rgba(39,200,122,.4); }
      `}</style>
    </div>
  )
}
