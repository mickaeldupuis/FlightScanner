'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { AppSettings } from '@/lib/types'
import { ALL_TZ } from '@/components/WorldClock'
import CompassDial from '@/components/CompassDial'

const MiniMap = dynamic(() => import('@/components/LocationMap'), { ssr: false })

interface Props {
  settings:   AppSettings
  activeTZ:   string[]
  onSettings: (s: AppSettings) => void
  onTZ:       (tz: string[]) => void
  onClose:    () => void
}

type Tab = 'general' | 'location' | 'timezones'

export default function SettingsPanel({ settings, activeTZ, onSettings, onTZ, onClose }: Props) {
  const [tab,           setTab]           = useState<Tab>('general')
  const [tzFilter,      setTzFilter]      = useState('')
  const [searchQuery,   setSearchQuery]   = useState(settings.location.label || '')
  const [searchResults, setSearchResults] = useState<{ lat: string; lon: string; display: string }[]>([])
  const [tempLat,       setTempLat]       = useState(settings.location.lat.toFixed(4))
  const [tempLon,       setTempLon]       = useState(settings.location.lon.toFixed(4))
  const [tempRadius,    setTempRadius]    = useState(settings.radius)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fermeture clavier Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Sync si settings change depuis l'extérieur
  useEffect(() => {
    setTempLat(settings.location.lat.toFixed(4))
    setTempLon(settings.location.lon.toFixed(4))
    setTempRadius(settings.radius)
    setSearchQuery(settings.location.label || '')
  }, [settings.location, settings.radius])

  // Recherche Nominatim
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 3) { setSearchResults([]); return }
    try {
      const r    = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=fr`)
      const data = await r.json()
      setSearchResults(data.map((d: { lat: string; lon: string; display_name: string }) => ({
        lat: d.lat, lon: d.lon,
        display: d.display_name.split(',').slice(0, 3).join(', '),
      })))
    } catch { setSearchResults([]) }
  }, [])

  const handleSearchInput = (val: string) => {
    setSearchQuery(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => doSearch(val), 420)
  }

  const pickResult = (lat: string, lon: string, name: string) => {
    setTempLat(parseFloat(lat).toFixed(4))
    setTempLon(parseFloat(lon).toFixed(4))
    setSearchQuery(name)
    setSearchResults([])
  }

  const applyLocation = () => {
    const lat = parseFloat(tempLat), lon = parseFloat(tempLon)
    if (isNaN(lat) || isNaN(lon)) return
    onSettings({ ...settings, radius: tempRadius, location: { lat, lon, label: searchQuery || `${tempLat}°, ${tempLon}°` } })
  }

  const locateMe = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude.toFixed(4)
      const lon = pos.coords.longitude.toFixed(4)
      setTempLat(lat); setTempLon(lon); setSearchQuery('Ma position')
      setSearchResults([])
    })
  }

  const toggleTZ = (tz: string) => {
    if (tz === 'UTC') return
    onTZ(activeTZ.includes(tz) ? activeTZ.filter(t => t !== tz) : [...activeTZ, tz])
  }
  const removeTZ = (tz: string) => onTZ(activeTZ.filter(t => t !== tz))
  const nowShort = (tz: string) => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz })

  const filteredTZ = ALL_TZ.filter(z => {
    if (z.tz === 'UTC') return false
    if (!tzFilter) return true
    const q = tzFilter.toLowerCase()
    return z.label.toLowerCase().includes(q) || z.city.toLowerCase().includes(q) || z.tz.toLowerCase().includes(q)
  })

  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: 'general',   icon: '⚙️', label: 'Général' },
    { id: 'location',  icon: '📍', label: 'Localisation' },
    { id: 'timezones', icon: '🕐', label: 'Fuseaux horaires' },
  ]

  return (
    <>
      {/* Overlay */}
      <div className="sp-overlay" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div className="sp-modal" role="dialog" aria-modal="true" aria-label="Paramètres">

        {/* Header */}
        <div className="sp-header">
          <div className="sp-header-l">
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none"><path d="M11 2L14.5 8.5H20L15.5 13L17 20L11 16L5 20L6.5 13L2 8.5H7.5L11 2Z" fill="#2d7dd2"/></svg>
            <span className="sp-title">Paramètres FlightWall</span>
          </div>
          <button className="sp-close-btn" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="sp-tabs">
          {TABS.map(t => (
            <button key={t.id} className={`sp-tab${tab === t.id ? ' act' : ''}`} onClick={() => setTab(t.id)}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="sp-body">

          {/* ── GÉNÉRAL ── */}
          {tab === 'general' && (
            <div className="sp-general">
              <p className="sp-section-title">Détection & affichage</p>
              <div className="sp-sliders">
                {([
                  ['Rayon de détection', 'radius', 10, 500, 10, (v: number) => `${v} km`],
                  ['Appareils max affichés', 'maxAircraft', 1, 50, 1, (v: number) => `${v}`],
                  ['Alerte atterrissage', 'alertMinutes', 1, 30, 1, (v: number) => `${v} min`],
                ] as [string, keyof AppSettings, number, number, number, (v: number) => string][]).map(([label, key, min, max, step, fmt]) => (
                  <label key={key} className="sp-slider-item">
                    <div className="sp-slider-header">
                      <span className="sp-slider-label">{label}</span>
                      <span className="sp-slider-val">{fmt(settings[key] as number)}</span>
                    </div>
                    <input type="range" min={min} max={max} step={step}
                      value={settings[key] as number}
                      onChange={e => onSettings({ ...settings, [key]: +e.target.value })}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ── LOCALISATION ── */}
          {tab === 'location' && (
            <div className="sp-location">
              {/* Gauche : contrôles */}
              <div className="sp-loc-controls">
                <p className="sp-section-title">Rechercher un lieu</p>
                <div className="sp-field">
                  <input type="text" placeholder="Ex: Papeete, Tokyo, LFPG, JFK…"
                    value={searchQuery} onChange={e => handleSearchInput(e.target.value)} />
                  {searchResults.length > 0 && (
                    <div className="sp-results">
                      {searchResults.map((r, i) => (
                        <button key={i} className="sp-result-item" onClick={() => pickResult(r.lat, r.lon, r.display)}>
                          📍 {r.display}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <p className="sp-section-title" style={{ marginTop: 16 }}>Coordonnées</p>
                <div className="sp-coords-row">
                  <div className="sp-field">
                    <label>Latitude</label>
                    <input type="number" step="0.0001" min="-90" max="90" value={tempLat}
                      onChange={e => setTempLat(e.target.value)} />
                  </div>
                  <div className="sp-field">
                    <label>Longitude</label>
                    <input type="number" step="0.0001" min="-180" max="180" value={tempLon}
                      onChange={e => setTempLon(e.target.value)} />
                  </div>
                </div>

                {/* Rayon directement dans localisation aussi */}
                <p className="sp-section-title" style={{ marginTop: 16 }}>Rayon de détection</p>
                <label className="sp-slider-item">
                  <div className="sp-slider-header">
                    <span className="sp-slider-label">Rayon (visible sur la carte)</span>
                    <span className="sp-slider-val">{tempRadius} km</span>
                  </div>
                  <input type="range" min={10} max={500} step={10} value={tempRadius}
                    onChange={e => setTempRadius(+e.target.value)} />
                </label>

                <div className="sp-loc-coord-info">
                  <span>📌</span>
                  <span>{parseFloat(tempLat) >= 0 ? Math.abs(parseFloat(tempLat)).toFixed(4)+'° N' : Math.abs(parseFloat(tempLat)).toFixed(4)+'° S'}</span>
                  <span>/</span>
                  <span>{parseFloat(tempLon) >= 0 ? Math.abs(parseFloat(tempLon)).toFixed(4)+'° E' : Math.abs(parseFloat(tempLon)).toFixed(4)+'° O'}</span>
                </div>

                <div className="sp-loc-actions">
                  <button className="sp-btn" onClick={locateMe}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
                    Me localiser
                  </button>
                  <button className="sp-btn sp-btn--primary" onClick={applyLocation}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Appliquer
                  </button>
                </div>
              </div>

              {/* Droite : carte agrandie + orientation */}
              <div className="sp-loc-right">
                <div className="sp-map-wrap">
                  <MiniMap
                    center={[parseFloat(tempLat) || settings.location.lat, parseFloat(tempLon) || settings.location.lon]}
                    radius={tempRadius}
                    onSelect={(lat, lon) => {
                      setTempLat(lat.toFixed(4))
                      setTempLon(lon.toFixed(4))
                    }}
                  />
                  <div className="sp-map-hint">Cliquer ou glisser le marqueur • Cercle = zone de détection</div>
                </div>

                <div className="sp-compass-section">
                  <p className="sp-section-title">Orientation du mur</p>
                  <p className="sp-compass-hint">Fais glisser l&apos;aiguille pour définir la direction vers laquelle ton mur d&apos;affichage est tourné.</p>
                  <CompassDial
                    value={settings.orientation}
                    onChange={deg => onSettings({ ...settings, orientation: deg })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── FUSEAUX ── */}
          {tab === 'timezones' && (
            <div className="sp-timezones">
              {/* Disponibles */}
              <div className="sp-tz-col">
                <p className="sp-section-title">Fuseaux disponibles</p>
                <input className="sp-tz-search" type="text" placeholder="Rechercher ville, pays ou code…"
                  value={tzFilter} onChange={e => setTzFilter(e.target.value)} />
                <div className="sp-tz-list">
                  {filteredTZ.map(z => {
                    const on = activeTZ.includes(z.tz)
                    return (
                      <div key={z.tz} className={`sp-tz-item${on ? ' on' : ''}`} onClick={() => toggleTZ(z.tz)}>
                        <div className={`sp-tz-check${on ? ' on' : ''}`}>{on ? '✓' : ''}</div>
                        <div className="sp-tz-info">
                          <span className="sp-tz-code">{z.label}</span>
                          <span className="sp-tz-city">{z.city}</span>
                        </div>
                        <span className="sp-tz-time">{nowShort(z.tz)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Actifs */}
              <div className="sp-tz-col">
                <p className="sp-section-title">Actifs dans l'horloge ({activeTZ.length})</p>
                <div className="sp-tz-active-list">
                  {activeTZ.map(tz => {
                    const z = ALL_TZ.find(a => a.tz === tz)
                    if (!z) return null
                    return (
                      <div key={tz} className={`sp-tz-active-item${tz === 'UTC' ? ' zulu' : ''}`}>
                        <span className="sp-tz-handle">{tz !== 'UTC' ? '⠿' : '★'}</span>
                        <div className="sp-tz-info">
                          <span className="sp-tz-code">{z.label}</span>
                          <span className="sp-tz-city">{z.city}</span>
                        </div>
                        <span className="sp-tz-time">{nowShort(tz)}</span>
                        {tz !== 'UTC' && (
                          <button className="sp-tz-del" onClick={() => removeTZ(tz)} title="Retirer">✕</button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="sp-tz-note">★ ZULU (UTC) est toujours affiché en premier et ne peut pas être retiré.</p>
              </div>
            </div>
          )}

        </div>
      </div>

      <style jsx>{`
        /* OVERLAY */
        .sp-overlay {
          position: fixed; inset: 0; background: rgba(4,8,15,.75);
          z-index: 999; backdrop-filter: blur(4px);
          animation: fadeIn .2s ease;
        }

        /* MODAL */
        .sp-modal {
          position: fixed; inset: 0;
          margin: auto;
          max-width: 1100px; width: calc(100% - 32px);
          max-height: calc(100vh - 40px);
          background: var(--bg-panel);
          border: 1px solid var(--border-bright);
          border-radius: 14px;
          z-index: 1000;
          display: flex; flex-direction: column;
          overflow: hidden;
          animation: slideUp .25s cubic-bezier(.4,0,.2,1);
          box-shadow: 0 32px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(45,125,210,.1);
        }

        /* HEADER */
        .sp-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          background: var(--bg-base);
        }
        .sp-header-l { display: flex; align-items: center; gap: 10px; }
        .sp-title { font-family: var(--font-mono); font-size: 14px; font-weight: 500; color: var(--text-primary); letter-spacing: .08em; }
        .sp-close-btn {
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 6px; cursor: pointer;
          color: var(--text-muted); display: flex; align-items: center;
          transition: all .15s;
        }
        .sp-close-btn:hover { background: var(--bg-card-hover); color: var(--text-primary); border-color: var(--border-bright); }

        /* TABS */
        .sp-tabs {
          display: flex; gap: 0; border-bottom: 1px solid var(--border);
          background: var(--bg-base); flex-shrink: 0; padding: 0 4px;
        }
        .sp-tab {
          padding: 12px 18px; font-size: 12px; border: none;
          border-bottom: 2px solid transparent; color: var(--text-muted);
          background: none; cursor: pointer; font-family: var(--font-ui);
          transition: all .15s; display: flex; align-items: center; gap: 6px;
        }
        .sp-tab.act { color: var(--accent); border-bottom-color: var(--accent); }
        .sp-tab:hover:not(.act) { color: var(--text-secondary); }

        /* BODY scroll */
        .sp-body { flex: 1; overflow-y: auto; padding: 20px; }

        /* SECTION TITLES */
        .sp-section-title {
          font-size: 9px; letter-spacing: .15em; text-transform: uppercase;
          color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 10px;
        }

        /* GÉNÉRAL */
        .sp-general { display: flex; flex-direction: column; gap: 6px; max-width: 640px; }
        .sp-sliders { display: flex; flex-direction: column; gap: 18px; }
        .sp-slider-item { display: flex; flex-direction: column; gap: 8px; }
        .sp-slider-header { display: flex; align-items: center; justify-content: space-between; }
        .sp-slider-label { font-size: 13px; color: var(--text-secondary); }
        .sp-slider-val { font-family: var(--font-mono); font-size: 12px; color: var(--accent); min-width: 80px; text-align: right; }
        .sp-slider-item input[type=range] { width: 100%; accent-color: var(--accent); height: 4px; cursor: pointer; }

        .sp-compass-section {
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          padding: 16px; background: var(--bg-card); border: 1px solid var(--border);
          border-radius: var(--radius-md);
        }
        .sp-compass-hint {
          font-size: 11px; color: var(--text-muted); text-align: center;
          line-height: 1.5; margin-bottom: 8px;
        }

        /* LOCALISATION */
        .sp-location { display: grid; grid-template-columns: 300px 1fr; gap: 20px; height: 100%; min-height: 420px; }
        .sp-loc-right { display: flex; flex-direction: column; gap: 16px; }
        .sp-loc-controls { display: flex; flex-direction: column; gap: 8px; }
        .sp-field { display: flex; flex-direction: column; gap: 4px; }
        .sp-field label { font-size: 11px; color: var(--text-muted); }
        .sp-field input {
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 8px 10px;
          font-family: var(--font-mono); font-size: 12px; color: var(--text-primary);
          outline: none; transition: border-color .15s; width: 100%;
        }
        .sp-field input:focus { border-color: var(--accent); }
        .sp-field input::placeholder { color: var(--text-muted); font-family: var(--font-ui); }
        .sp-results { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; max-height: 160px; overflow-y: auto; }
        .sp-result-item {
          text-align: left; padding: 7px 10px;
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: var(--radius-sm); font-size: 11px; color: var(--text-secondary);
          cursor: pointer; transition: all .15s; font-family: var(--font-ui);
        }
        .sp-result-item:hover { border-color: var(--border-bright); color: var(--text-primary); background: var(--bg-card-hover); }
        .sp-coords-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .sp-loc-coord-info {
          display: flex; align-items: center; gap: 8px;
          font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);
          padding: 6px 0;
        }
        .sp-loc-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
        .sp-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 7px 14px; border-radius: var(--radius-sm);
          border: 1px solid var(--border); background: var(--bg-card);
          color: var(--text-secondary); font-size: 12px; cursor: pointer;
          transition: all .15s; font-family: var(--font-ui);
        }
        .sp-btn:hover { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
        .sp-btn--primary { background: var(--accent); color: #fff; border-color: var(--accent); }
        .sp-btn--primary:hover { background: #2268b3; }
        .sp-map-wrap {
          position: relative; border-radius: var(--radius-md);
          overflow: hidden; border: 1px solid var(--border);
          min-height: 260px; flex-shrink: 0;
        }
        .sp-map-hint {
          position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
          font-size: 10px; color: #fff; background: rgba(8,13,20,.85);
          padding: 4px 12px; border-radius: 20px;
          pointer-events: none; z-index: 600; white-space: nowrap;
        }

        /* FUSEAUX */
        .sp-timezones { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .sp-tz-col { display: flex; flex-direction: column; gap: 8px; }
        .sp-tz-search {
          width: 100%; background: var(--bg-card); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 8px 10px;
          font-family: var(--font-ui); font-size: 12px; color: var(--text-primary);
          outline: none; transition: border-color .15s;
        }
        .sp-tz-search:focus { border-color: var(--accent); }
        .sp-tz-search::placeholder { color: var(--text-muted); }
        .sp-tz-list {
          display: flex; flex-direction: column; gap: 2px;
          max-height: 340px; overflow-y: auto;
          scrollbar-width: thin; scrollbar-color: var(--border) transparent;
        }
        .sp-tz-item {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 10px; border-radius: var(--radius-sm);
          cursor: pointer; border: 1px solid transparent; transition: all .15s;
        }
        .sp-tz-item:hover { background: var(--bg-card-hover); border-color: var(--border); }
        .sp-tz-item.on { background: var(--bg-card); border-color: var(--border); }
        .sp-tz-check {
          width: 15px; height: 15px; border-radius: 3px;
          border: 1px solid var(--border); display: flex; align-items: center;
          justify-content: center; font-size: 9px; flex-shrink: 0;
        }
        .sp-tz-check.on { background: var(--accent); border-color: var(--accent); color: #fff; }
        .sp-tz-info { display: flex; flex-direction: column; flex: 1; gap: 1px; }
        .sp-tz-code { font-family: var(--font-mono); color: var(--text-primary); font-size: 11px; }
        .sp-tz-city { color: var(--text-muted); font-size: 10px; }
        .sp-tz-time { font-family: var(--font-mono); font-size: 11px; color: var(--accent); flex-shrink: 0; }
        .sp-tz-active-list {
          display: flex; flex-direction: column; gap: 3px;
          max-height: 340px; overflow-y: auto;
          scrollbar-width: thin; scrollbar-color: var(--border) transparent;
        }
        .sp-tz-active-item {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 10px; background: var(--bg-card);
          border: 1px solid var(--border); border-radius: var(--radius-sm);
        }
        .sp-tz-active-item.zulu { background: rgba(45,125,210,.07); border-color: var(--accent-glow); }
        .sp-tz-handle { color: var(--text-muted); font-size: 13px; flex-shrink: 0; }
        .sp-tz-del {
          background: none; border: none; color: var(--text-muted);
          cursor: pointer; font-size: 13px; padding: 0 2px; line-height: 1;
          transition: color .15s; flex-shrink: 0;
        }
        .sp-tz-del:hover { color: #ef4444; }
        .sp-tz-note { font-size: 10px; color: var(--text-muted); padding-top: 4px; }

        /* ANIMATIONS */
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }

        @media (max-width: 700px) {
          .sp-modal { max-width: 100%; width: 100%; max-height: 100%; border-radius: 14px 14px 0 0; top: auto; bottom: 0; }
          .sp-location { grid-template-columns: 1fr; }
          .sp-timezones { grid-template-columns: 1fr; }
          .sp-map-wrap { min-height: 220px; }
        }
      `}</style>
    </>
  )
}
