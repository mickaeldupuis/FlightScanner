'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { AppSettings } from '@/lib/types'
import { compassPoint } from '@/lib/utils'
import { ALL_TZ } from '@/components/WorldClock'

const MiniMap = dynamic(() => import('@/components/LocationMap'), { ssr: false })

interface Props {
  settings: AppSettings
  activeTZ: string[]
  onSettings: (s: AppSettings) => void
  onTZ: (tz: string[]) => void
  onClose: () => void
}

type Tab = 'general' | 'location' | 'timezones'

export default function SettingsPanel({ settings, activeTZ, onSettings, onTZ, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('general')
  const [tzFilter, setTzFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState(settings.location.label || '')
  const [searchResults, setSearchResults] = useState<{ lat: string; lon: string; display: string }[]>([])
  const [tempLat, setTempLat] = useState(settings.location.lat.toFixed(4))
  const [tempLon, setTempLon] = useState(settings.location.lon.toFixed(4))
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync lat/lon inputs when location changes externally
  useEffect(() => {
    setTempLat(settings.location.lat.toFixed(4))
    setTempLon(settings.location.lon.toFixed(4))
  }, [settings.location])

  // Nominatim search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 3) { setSearchResults([]); return }
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=fr`)
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
    onSettings({ ...settings, location: { lat, lon, label: searchQuery || `${tempLat}°, ${tempLon}°` } })
  }

  const locateMe = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude.toFixed(4)
      const lon = pos.coords.longitude.toFixed(4)
      setTempLat(lat); setTempLon(lon); setSearchQuery('Ma position')
      onSettings({ ...settings, location: { lat: parseFloat(lat), lon: parseFloat(lon), label: 'Ma position' } })
    })
  }

  const toggleTZ = (tz: string) => {
    if (tz === 'UTC') return
    const next = activeTZ.includes(tz) ? activeTZ.filter(t => t !== tz) : [...activeTZ, tz]
    onTZ(next)
  }

  const removeTZ = (tz: string) => onTZ(activeTZ.filter(t => t !== tz))

  const nowShort = (tz: string) =>
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz })

  const filteredTZ = ALL_TZ.filter(z => {
    if (z.tz === 'UTC') return false
    if (!tzFilter) return true
    const q = tzFilter.toLowerCase()
    return z.label.toLowerCase().includes(q) || z.city.toLowerCase().includes(q) || z.tz.toLowerCase().includes(q)
  })

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'general', label: 'Général', icon: '⚙️' },
    { id: 'location', label: 'Localisation', icon: '📍' },
    { id: 'timezones', label: 'Fuseaux horaires', icon: '🕐' },
  ]

  return (
    <div className="sp-root fade-up">
      {/* Tab bar */}
      <div className="sp-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`sp-tab${tab === t.id ? ' sp-tab--act' : ''}`} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
        <button className="sp-close" onClick={onClose} aria-label="Fermer">✕</button>
      </div>

      {/* ── GENERAL ── */}
      {tab === 'general' && (
        <div className="sp-body">
          <div className="sp-grid">
            {([
              ['Rayon de détection', 'radius', 10, 500, 10, (v: number) => `${v} km`],
              ['Appareils max', 'maxAircraft', 1, 50, 1, (v: number) => `${v}`],
              ['Orientation du mur', 'orientation', 0, 359, 1, (v: number) => `${v}° ${compassPoint(v)}`],
              ['Alerte atterrissage', 'alertMinutes', 1, 30, 1, (v: number) => `${v} min`],
            ] as [string, keyof AppSettings, number, number, number, (v: number) => string][]).map(([label, key, min, max, step, fmt]) => (
              <label key={key} className="sp-sitem">
                <span>{label}</span>
                <div className="sp-sctl">
                  <input type="range" min={min} max={max} step={step}
                    value={settings[key] as number}
                    onChange={e => onSettings({ ...settings, [key]: +e.target.value })} />
                  <span className="sp-sval">{fmt(settings[key] as number)}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── LOCATION ── */}
      {tab === 'location' && (
        <div className="sp-body">
          <div className="sp-loc-layout">
            {/* Left: inputs */}
            <div className="sp-loc-fields">
              <div className="sp-field">
                <label>Rechercher un lieu</label>
                <input
                  type="text" placeholder="Ex: Papeete, Tokyo, LFPG…"
                  value={searchQuery} onChange={e => handleSearchInput(e.target.value)}
                />
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
              <div className="sp-coords">
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
              <div className="sp-loc-coord-display">
                {parseFloat(tempLat).toFixed(4)}° {parseFloat(tempLat) >= 0 ? 'N' : 'S'} /&nbsp;
                {parseFloat(tempLon).toFixed(4)}° {parseFloat(tempLon) >= 0 ? 'E' : 'O'}
              </div>
              <div className="sp-loc-actions">
                <button className="sp-lbtn" onClick={locateMe}>📍 Me localiser</button>
                <button className="sp-lbtn sp-lbtn--primary" onClick={applyLocation}>✓ Appliquer</button>
              </div>
            </div>

            {/* Right: mini map */}
            <div className="sp-map-wrap">
              <MiniMap
                center={[parseFloat(tempLat) || settings.location.lat, parseFloat(tempLon) || settings.location.lon]}
                onSelect={(lat, lon) => {
                  setTempLat(lat.toFixed(4))
                  setTempLon(lon.toFixed(4))
                }}
              />
              <div className="sp-map-hint">Cliquer ou glisser le marqueur</div>
            </div>
          </div>
        </div>
      )}

      {/* ── TIMEZONES ── */}
      {tab === 'timezones' && (
        <div className="sp-body">
          <div className="sp-tz-layout">
            {/* Available */}
            <div>
              <div className="sp-tz-col-title">Fuseaux disponibles</div>
              <input className="sp-tz-search" type="text" placeholder="Rechercher ville ou fuseau…"
                value={tzFilter} onChange={e => setTzFilter(e.target.value)} />
              <div className="sp-tz-list">
                {filteredTZ.map(z => {
                  const on = activeTZ.includes(z.tz)
                  return (
                    <div key={z.tz} className={`sp-tz-item${on ? ' on' : ''}`} onClick={() => toggleTZ(z.tz)}>
                      <div className="sp-tz-item-l">
                        <div className={`sp-tz-check${on ? ' on' : ''}`}>{on ? '✓' : ''}</div>
                        <div>
                          <div className="sp-tz-name">{z.label}</div>
                          <div className="sp-tz-city">{z.city}</div>
                        </div>
                      </div>
                      <span className="sp-tz-cur">{nowShort(z.tz)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Active */}
            <div>
              <div className="sp-tz-col-title">Actifs dans l'horloge</div>
              <div className="sp-tz-active-list">
                {activeTZ.map(tz => {
                  const z = ALL_TZ.find(a => a.tz === tz)
                  if (!z) return null
                  return (
                    <div key={tz} className={`sp-tz-active-item${tz === 'UTC' ? ' zulu' : ''}`}>
                      {tz !== 'UTC' && <span className="sp-tz-handle">⠿</span>}
                      {tz === 'UTC' && <span style={{ width: 18 }} />}
                      <span className="sp-tz-active-name">
                        {z.label} <span className="sp-tz-active-city">{z.city}</span>
                      </span>
                      <span className="sp-tz-active-time">{nowShort(tz)}</span>
                      {tz !== 'UTC' && (
                        <button className="sp-tz-del" onClick={() => removeTZ(tz)} title="Retirer">✕</button>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="sp-tz-note">ZULU (UTC) est toujours affiché en premier.</p>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .sp-root { background:var(--bg-panel); border-bottom:1px solid var(--border); }

        /* TABS */
        .sp-tabs { display:flex; align-items:center; border-bottom:1px solid var(--border); padding:0 16px; gap:0; }
        .sp-tab { padding:10px 14px; font-size:11px; border:none; border-bottom:2px solid transparent; color:var(--text-muted); background:none; cursor:pointer; font-family:var(--font-ui); transition:all .15s; display:flex; align-items:center; gap:5px; white-space:nowrap; }
        .sp-tab--act { color:var(--accent); border-bottom-color:var(--accent); }
        .sp-tab:hover:not(.sp-tab--act) { color:var(--text-secondary); }
        .sp-close { margin-left:auto; background:none; border:1px solid var(--border); border-radius:var(--radius-sm); padding:4px 8px; color:var(--text-muted); cursor:pointer; font-size:12px; transition:all .15s; }
        .sp-close:hover { background:var(--bg-card); color:var(--text-primary); }

        /* BODY */
        .sp-body { padding:16px; }

        /* GENERAL */
        .sp-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:14px; }
        .sp-sitem { display:flex; flex-direction:column; gap:5px; font-size:12px; color:var(--text-secondary); }
        .sp-sctl { display:flex; align-items:center; gap:10px; }
        .sp-sctl input[type=range] { flex:1; accent-color:var(--accent); height:3px; cursor:pointer; }
        .sp-sval { font-family:var(--font-mono); font-size:11px; color:var(--accent); min-width:72px; text-align:right; }

        /* LOCATION */
        .sp-loc-layout { display:grid; grid-template-columns:1fr 300px; gap:16px; align-items:start; }
        .sp-loc-fields { display:flex; flex-direction:column; gap:10px; }
        .sp-field { display:flex; flex-direction:column; gap:4px; }
        .sp-field label { font-size:11px; color:var(--text-secondary); }
        .sp-field input { background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-sm); padding:7px 10px; font-family:var(--font-mono); font-size:12px; color:var(--text-primary); outline:none; transition:border-color .15s; width:100%; }
        .sp-field input:focus { border-color:var(--accent); }
        .sp-field input::placeholder { color:var(--text-muted); font-family:var(--font-ui); }
        .sp-coords { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .sp-results { display:flex; flex-direction:column; gap:3px; margin-top:4px; }
        .sp-result-item { text-align:left; padding:6px 10px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-sm); font-size:11px; color:var(--text-secondary); cursor:pointer; transition:all .15s; font-family:var(--font-ui); }
        .sp-result-item:hover { border-color:var(--border-bright); color:var(--text-primary); }
        .sp-loc-coord-display { font-size:11px; color:var(--text-muted); font-family:var(--font-mono); padding:2px 0; }
        .sp-loc-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:2px; }
        .sp-lbtn { padding:6px 12px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-card); color:var(--text-secondary); font-size:11px; cursor:pointer; transition:all .15s; font-family:var(--font-ui); }
        .sp-lbtn:hover { background:var(--accent-soft); color:var(--accent); border-color:var(--accent); }
        .sp-lbtn--primary { background:var(--accent); color:#fff; border-color:var(--accent); }
        .sp-lbtn--primary:hover { background:#2268b3; }
        .sp-map-wrap { position:relative; border-radius:var(--radius-md); overflow:hidden; border:1px solid var(--border); height:220px; }
        .sp-map-hint { position:absolute; bottom:8px; left:50%; transform:translateX(-50%); font-size:10px; color:#fff; background:rgba(8,13,20,.8); padding:3px 10px; border-radius:20px; pointer-events:none; z-index:500; white-space:nowrap; }

        /* TIMEZONES */
        .sp-tz-layout { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .sp-tz-col-title { font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:var(--text-muted); font-family:var(--font-mono); margin-bottom:8px; }
        .sp-tz-search { width:100%; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-sm); padding:7px 10px; font-family:var(--font-ui); font-size:12px; color:var(--text-primary); outline:none; margin-bottom:8px; transition:border-color .15s; }
        .sp-tz-search:focus { border-color:var(--accent); }
        .sp-tz-search::placeholder { color:var(--text-muted); }
        .sp-tz-list { display:flex; flex-direction:column; gap:3px; max-height:200px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
        .sp-tz-item { display:flex; align-items:center; justify-content:space-between; padding:5px 8px; border-radius:var(--radius-sm); cursor:pointer; border:1px solid transparent; transition:all .15s; user-select:none; }
        .sp-tz-item:hover { background:var(--bg-card-hover); border-color:var(--border); }
        .sp-tz-item.on { background:var(--bg-card); border-color:var(--border); }
        .sp-tz-item-l { display:flex; align-items:center; gap:8px; flex:1; }
        .sp-tz-check { width:14px; height:14px; border-radius:3px; border:1px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:9px; flex-shrink:0; }
        .sp-tz-check.on { background:var(--accent); border-color:var(--accent); color:#fff; }
        .sp-tz-name { font-family:var(--font-mono); color:var(--text-primary); font-size:11px; }
        .sp-tz-city { color:var(--text-muted); font-size:10px; margin-top:1px; }
        .sp-tz-cur { font-family:var(--font-mono); font-size:10px; color:var(--text-muted); flex-shrink:0; }
        .sp-tz-active-list { display:flex; flex-direction:column; gap:3px; max-height:230px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
        .sp-tz-active-item { display:flex; align-items:center; gap:7px; padding:6px 8px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-sm); }
        .sp-tz-active-item.zulu { background:rgba(45,125,210,.07); border-color:var(--accent-glow); }
        .sp-tz-handle { color:var(--text-muted); cursor:grab; font-size:13px; flex-shrink:0; }
        .sp-tz-active-name { font-family:var(--font-mono); color:var(--text-primary); flex:1; font-size:11px; }
        .sp-tz-active-city { color:var(--text-muted); font-size:10px; }
        .sp-tz-active-time { font-family:var(--font-mono); font-size:11px; color:var(--accent); flex-shrink:0; }
        .sp-tz-del { background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:13px; padding:0 2px; line-height:1; transition:color .15s; }
        .sp-tz-del:hover { color:var(--red); }
        .sp-tz-note { font-size:10px; color:var(--text-muted); margin-top:8px; }

        @media (max-width: 700px) {
          .sp-loc-layout, .sp-tz-layout { grid-template-columns:1fr; }
          .sp-map-wrap { height:180px; }
        }
      `}</style>
    </div>
  )
}
