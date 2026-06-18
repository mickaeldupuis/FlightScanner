'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { Aircraft, AppSettings, WeatherData, SunData } from '@/lib/types'
import { formatAlt, formatSpeed, compassPoint, weatherDesc, weatherIcon, getAirlineName, vertRateLabel, formatDayLength } from '@/lib/utils'
import { DEFAULT_TZ } from '@/components/WorldClock'
import FlightDetail from '@/components/FlightDetail'
import RadarView from '@/components/RadarView'

const WorldClock = dynamic(() => import('@/components/WorldClock'), { ssr: false })
const SettingsPanel = dynamic(() => import('@/components/SettingsPanel'), { ssr: false })
const TrackingMap = dynamic(() => import('@/components/TrackingMap'), { ssr: false })

const LS_SETTINGS = 'fw_settings'
const LS_TZ = 'fw_active_tz'

const DEFAULT_SETTINGS: AppSettings = {
  location: { lat: 48.8566, lon: 2.3522, label: 'Paris, France' },
  radius: 100,
  maxAircraft: 20,
  orientation: 0,
  trackedIcao: null,
  alertMinutes: 5,
}

type ViewMode = 'list' | 'radar'

export default function FlightWall() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [activeTZ, setActiveTZ] = useState<string[]>(DEFAULT_TZ)
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [sun, setSun] = useState<SunData | null>(null)
  const [selectedIcao, setSelectedIcao] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Record<string, { photoUrl: string | null; photographer: string | null; link: string | null }>>({})
  const [showSettings, setShowSettings] = useState(false)
  const [alertFired, setAlertFired] = useState<Record<string, boolean>>({})
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [localTime, setLocalTime] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Persist settings
  useEffect(() => {
    try {
      const s = localStorage.getItem(LS_SETTINGS)
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s), trackedIcao: null })
      const tz = localStorage.getItem(LS_TZ)
      if (tz) setActiveTZ(JSON.parse(tz))
    } catch { /* ignore */ }
  }, [])

  const updateSettings = (s: AppSettings) => {
    setSettings(s)
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)) } catch { /* ignore */ }
  }
  const updateTZ = (tz: string[]) => {
    setActiveTZ(tz)
    try { localStorage.setItem(LS_TZ, JSON.stringify(tz)) } catch { /* ignore */ }
  }

  // Local clock
  useEffect(() => {
    const id = setInterval(() => {
      setLocalTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)
    setLocalTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    return () => clearInterval(id)
  }, [])

  const fetchFlights = useCallback(async () => {
    setLoading(true)
    try {
      const { lat, lon } = settings.location
      const res = await fetch(`/api/flights?lat=${lat}&lon=${lon}&radius=${settings.radius}&max=${settings.maxAircraft}`)
      const data = await res.json()
      setAircraft(data.aircraft || [])
      setLastUpdate(new Date())
    } catch { /* silent */ }
    setLoading(false)
  }, [settings.location, settings.radius, settings.maxAircraft])

  const fetchAmbient = useCallback(async () => {
    const { lat, lon } = settings.location
    const [wRes, sRes] = await Promise.all([
      fetch(`/api/weather?lat=${lat}&lon=${lon}`),
      fetch(`/api/sunrise?lat=${lat}&lon=${lon}`),
    ])
    setWeather(await wRes.json())
    setSun(await sRes.json())
  }, [settings.location])

  useEffect(() => {
    fetchFlights()
    fetchAmbient()
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(fetchFlights, 20000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchFlights, fetchAmbient])

  // Photos
  useEffect(() => {
    aircraft.forEach(ac => {
      if (!photos[ac.icao24]) {
        fetch(`/api/aircraft-photo?icao=${ac.icao24}`)
          .then(r => r.json())
          .then(d => setPhotos(prev => ({ ...prev, [ac.icao24]: d })))
          .catch(() => {})
      }
    })
  }, [aircraft]) // eslint-disable-line

  // Landing alert
  useEffect(() => {
    if (!settings.trackedIcao) return
    const tracked = aircraft.find(a => a.icao24 === settings.trackedIcao)
    if (!tracked || tracked.onGround) return
    const { altitude: alt, verticalRate: vr } = tracked
    if (alt && vr && vr < -1 && !alertFired[settings.trackedIcao]) {
      const etaMin = Math.abs(alt / vr / 60)
      if (etaMin <= settings.alertMinutes) {
        setAlertFired(prev => ({ ...prev, [settings.trackedIcao!]: true }))
        if (typeof window !== 'undefined' && 'Notification' in window) {
          Notification.requestPermission().then(p => {
            if (p === 'granted') new Notification(`✈️ ${tracked.callsign || tracked.icao24}`, {
              body: `Atterrissage dans ~${Math.round(etaMin)} min`,
            })
          })
        }
      }
    }
  }, [aircraft, settings.trackedIcao, settings.alertMinutes, alertFired])

  const locateMe = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(pos => {
      updateSettings({ ...settings, location: { lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Ma position' } })
    })
  }

  const toggleTrack = (icao: string) => {
    updateSettings({ ...settings, trackedIcao: settings.trackedIcao === icao ? null : icao })
    setAlertFired({})
  }

  const noFlights = aircraft.length === 0
  const trackedAc = aircraft.find(a => a.icao24 === settings.trackedIcao)
  const selectedAc = aircraft.find(a => a.icao24 === selectedIcao)

  return (
    <div className="fw-shell">

      {/* ══ TOPBAR ══ */}
      <header className="fw-topbar">
        <div className="fw-topbar-l">
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path d="M11 2L14.5 8.5H20L15.5 13L17 20L11 16L5 20L6.5 13L2 8.5H7.5L11 2Z" fill="var(--accent)"/>
          </svg>
          <span className="fw-logo">FLIGHT<span>WALL</span></span>
          <span className="fw-chip">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
            {settings.location.label || `${settings.location.lat.toFixed(3)}°, ${settings.location.lon.toFixed(3)}°`}
          </span>
        </div>
        <div className="fw-topbar-r">
          <div className="fw-vtog">
            <button className={`fw-vbtn${viewMode === 'list' ? ' act' : ''}`} onClick={() => setViewMode('list')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              Liste
            </button>
            <button className={`fw-vbtn${viewMode === 'radar' ? ' act' : ''}`} onClick={() => setViewMode('radar')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/></svg>
              Radar
            </button>
          </div>
          {lastUpdate && (
            <span className="fw-upd">
              <span className={`fw-dot${loading ? ' loading' : ''}`}/>
              {loading ? 'Actualisation…' : lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button className="fw-ibtn" onClick={locateMe} title="Me localiser">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
            Localiser
          </button>
          <button className={`fw-ibtn${showSettings ? ' act' : ''}`} onClick={() => setShowSettings(s => !s)} title="Paramètres">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            Paramètres
          </button>
          <button className="fw-ibtn" onClick={fetchFlights} title="Actualiser">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
        </div>
      </header>

      {/* ══ SETTINGS ══ */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          activeTZ={activeTZ}
          onSettings={updateSettings}
          onTZ={updateTZ}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ══ CLOCK STRIP ══ */}
      <WorldClock activeTZ={activeTZ} />

      {/* ══ MAIN ══ */}
      <main className="fw-main">

        {/* TRACKING */}
        {trackedAc && (
          <div className="fw-track fade-up">
            <div className="fw-track-hd">
              <span className="fw-track-ttl">
                <span className="fw-tpulse"/>
                Suivi actif — <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{trackedAc.callsign || trackedAc.icao24.toUpperCase()}</span>
                <span className="fw-badge fw-badge--air" style={{ fontSize: 10 }}>{getAirlineName(trackedAc.callsign)}</span>
              </span>
              <button className="fw-ibtn" onClick={() => toggleTrack(trackedAc.icao24)}>✕ Arrêter</button>
            </div>
            <div className="fw-track-body">
              <div className="fw-tstats">
                {([
                  ['Alt', formatAlt(trackedAc.altitude)],
                  ['Vitesse', formatSpeed(trackedAc.velocity)],
                  ['Distance', `${trackedAc.distance} km`],
                  ['Cap', trackedAc.trueTrack != null ? `${Math.round(trackedAc.trueTrack)}° ${compassPoint(trackedAc.trueTrack)}` : '—'],
                  ['V/S', vertRateLabel(trackedAc.verticalRate)],
                  ['État', trackedAc.onGround ? 'Au sol' : 'En vol'],
                  ['Alerte', `< ${settings.alertMinutes} min`],
                  ['Pays', trackedAc.originCountry],
                ] as [string, string][]).map(([l, v]) => (
                  <div className="fw-tstat" key={l}>
                    <span>{l}</span>
                    <strong style={l === 'État' ? { color: trackedAc.onGround ? 'var(--amber)' : 'var(--green)' } : undefined}>{v}</strong>
                  </div>
                ))}
              </div>
              <div className="fw-tmap-wrap">
                <TrackingMap aircraft={trackedAc} />
              </div>
            </div>
          </div>
        )}

        {/* NO FLIGHTS */}
        {noFlights ? (
          <div className="fw-idle fade-up">
            <div className="fw-idle-radar">
              <svg className="fw-radar-anim" width="110" height="110" viewBox="0 0 110 110" aria-hidden="true">
                <circle cx="55" cy="55" r="52" fill="none" stroke="rgba(56,100,160,.25)" strokeWidth="1"/>
                <circle cx="55" cy="55" r="36" fill="none" stroke="rgba(56,100,160,.18)" strokeWidth=".5"/>
                <circle cx="55" cy="55" r="18" fill="none" stroke="rgba(56,100,160,.15)" strokeWidth=".5"/>
                <line x1="55" y1="55" x2="55" y2="3" stroke="var(--accent)" strokeWidth="1.5" strokeOpacity=".5"/>
                <path d="M55 55 L55 3 A52 52 0 0 1 107 62 Z" fill="var(--accent)" fillOpacity=".07"/>
              </svg>
              <span className="fw-idle-lbl">Aucun appareil dans {settings.radius} km</span>
            </div>
            <div className="fw-idle-panels">
              {weather && (
                <div className="fw-icard fade-up fade-up-d1">
                  <div className="fw-icard-t">MÉTÉO LOCALE</div>
                  <div className="fw-icard-m">{weatherIcon(weather.weatherCode)} {weather.temperature}°C</div>
                  <div className="fw-icard-s">{weatherDesc(weather.weatherCode)}</div>
                  <div className="fw-icard-row">
                    <span>💨 {weather.windSpeed} km/h {weather.windDirection != null ? compassPoint(weather.windDirection) : ''}</span>
                    <span>💧 {weather.humidity}%</span>
                  </div>
                </div>
              )}
              {sun && (
                <div className="fw-icard fade-up fade-up-d2">
                  <div className="fw-icard-t">ÉPHÉMÉRIDES</div>
                  {([['🌅', 'Lever', sun.sunrise], ['☀️', 'Zénith', sun.solarNoon], ['🌇', 'Coucher', sun.sunset], ['⏱', 'Durée du jour', formatDayLength(sun.dayLength)]] as [string, string, string][]).map(([e, l, v]) => (
                    <div className="fw-sun-row" key={l}>
                      <span>{e}</span><span className="fw-sun-lbl">{l}</span><strong>{v}</strong>
                    </div>
                  ))}
                </div>
              )}
              <div className="fw-icard fade-up fade-up-d3">
                <div className="fw-icard-t">HEURE LOCALE</div>
                <div className="fw-lclock">{localTime}</div>
                <div className="fw-icard-s">{settings.location.label}</div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Coordonnées</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                    {settings.location.lat.toFixed(4)}° N / {settings.location.lon.toFixed(4)}° E
                  </div>
                </div>
              </div>
            </div>
          </div>

        ) : viewMode === 'radar' ? (
          /* RADAR */
          <div className="fw-radar-layout">
            <div className="fw-radar-panel">
              <div className="fw-panel-lbl">RADAR — {settings.radius} km · {settings.orientation}° {compassPoint(settings.orientation)}</div>
              <RadarView
                aircraft={aircraft}
                orientation={settings.orientation}
                radius={settings.radius}
                selectedIcao={selectedIcao}
                trackedIcao={settings.trackedIcao}
                onSelect={icao => setSelectedIcao(prev => prev === icao ? null : icao)}
              />
            </div>
            {selectedAc ? (
              <div className="fw-radar-detail">
                <div className="fw-radar-detail-hd">
                  <div>
                    <span className="fw-ac-cs">{selectedAc.callsign || selectedAc.icao24.toUpperCase()}</span>
                    <span className="fw-ac-al">{getAirlineName(selectedAc.callsign)}</span>
                  </div>
                  <div className="fw-badges">
                    <span className={`fw-badge ${selectedAc.onGround ? 'fw-badge--gnd' : 'fw-badge--air'}`}>{selectedAc.onGround ? 'Au sol' : 'En vol'}</span>
                    {settings.trackedIcao === selectedAc.icao24 && <span className="fw-badge fw-badge--trk">Suivi</span>}
                  </div>
                </div>
                {photos[selectedAc.icao24]?.photoUrl && (
                  <div className="fw-radar-photo">
                    <img src={photos[selectedAc.icao24].photoUrl!} alt="" loading="lazy"/>
                    {photos[selectedAc.icao24].photographer && <span className="fw-photo-credit">© {photos[selectedAc.icao24].photographer}</span>}
                  </div>
                )}
                <FlightDetail aircraft={selectedAc} onTrack={() => toggleTrack(selectedAc.icao24)} isTracked={settings.trackedIcao === selectedAc.icao24} photoLink={photos[selectedAc.icao24]?.link} photographer={photos[selectedAc.icao24]?.photographer}/>
              </div>
            ) : (
              <div className="fw-radar-hint">
                <p>Cliquer sur un appareil pour voir ses détails</p>
                <div className="fw-mini-list">
                  {aircraft.map(ac => (
                    <div key={ac.icao24} className="fw-mini-item" onClick={() => setSelectedIcao(ac.icao24)}>
                      <span className="fw-mini-cs">{ac.callsign || ac.icao24.toUpperCase()}</span>
                      <span className="fw-mini-dist">{ac.distance} km</span>
                      <span className={`fw-badge ${ac.onGround ? 'fw-badge--gnd' : 'fw-badge--air'}`} style={{ fontSize: 9, padding: '1px 6px' }}>{ac.onGround ? 'Sol' : 'Vol'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        ) : (
          /* LIST */
          <div className="fw-ac-grid">
            {aircraft.map((ac, i) => {
              const photo = photos[ac.icao24]
              const isSel = selectedIcao === ac.icao24
              const isTrk = settings.trackedIcao === ac.icao24
              return (
                <article key={ac.icao24} className={`fw-ac-card fade-up${isSel ? ' sel' : ''}${isTrk ? ' trk' : ''}`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                  onClick={() => setSelectedIcao(isSel ? null : ac.icao24)}>
                  {photo?.photoUrl && (
                    <div className="fw-ac-photo">
                      <img src={photo.photoUrl} alt="" loading="lazy"/>
                      {photo.photographer && <span className="fw-photo-credit">© {photo.photographer}</span>}
                    </div>
                  )}
                  <div className="fw-ac-hd">
                    <div><span className="fw-ac-cs">{ac.callsign || ac.icao24.toUpperCase()}</span><span className="fw-ac-al">{getAirlineName(ac.callsign)}</span></div>
                    <div className="fw-badges">
                      <span className={`fw-badge ${ac.onGround ? 'fw-badge--gnd' : 'fw-badge--air'}`}>{ac.onGround ? 'Au sol' : 'En vol'}</span>
                      {isTrk && <span className="fw-badge fw-badge--trk">Suivi</span>}
                    </div>
                  </div>
                  <div className="fw-ac-dir">
                    <div style={{ transform: `rotate(${ac.trueTrack ?? 0}deg)`, flexShrink: 0 }}>
                      <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 3.5L18.5 16H14.5V24.5H13.5V16H9.5L14 3.5Z" fill="var(--accent)" fillOpacity=".88"/></svg>
                    </div>
                    <div>
                      <div className="fw-dir-deg">{ac.trueTrack != null ? `${Math.round(ac.trueTrack)}°` : '—'}</div>
                      <div className="fw-dir-lbl">{ac.trueTrack != null ? compassPoint(ac.trueTrack) : ''}</div>
                    </div>
                    <div className="fw-dist-pill">{ac.distance} km</div>
                  </div>
                  <div className="fw-ac-stats">
                    {([['Altitude', formatAlt(ac.altitude)], ['Vitesse', formatSpeed(ac.velocity)], ['V/S', vertRateLabel(ac.verticalRate)], ['Pays', ac.originCountry]] as [string,string][]).map(([l, v]) => (
                      <div className="fw-stat" key={l}>
                        <span className="fw-stat-l">{l}</span>
                        <span className="fw-stat-v" style={{ fontSize: l === 'Pays' || l === 'V/S' ? 11 : 12 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  {isSel && (
                    <div onClick={e => e.stopPropagation()}>
                      <FlightDetail aircraft={ac} onTrack={() => toggleTrack(ac.icao24)} isTracked={isTrk} photoLink={photo?.link} photographer={photo?.photographer}/>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}

        {/* STATUS BAR */}
        {!noFlights && (
          <div className="fw-status">
            <span>{aircraft.length} appareil{aircraft.length > 1 ? 's' : ''} · rayon {settings.radius} km</span>
            {weather && <span>{weatherIcon(weather.weatherCode)} {weather.temperature}°C · 💨 {weather.windSpeed} km/h</span>}
            {sun && <span>🌅 {sun.sunrise} — 🌇 {sun.sunset}</span>}
            <span className="fw-status-r">MàJ auto 20s · OpenSky Network</span>
          </div>
        )}
      </main>

      <style jsx>{`
        .fw-shell { display:flex; flex-direction:column; min-height:100vh; background:var(--bg-base); }
        .fw-topbar { display:flex; align-items:center; justify-content:space-between; padding:0 16px; height:50px; background:var(--bg-panel); border-bottom:1px solid var(--border); position:sticky; top:0; z-index:200; gap:12px; flex-shrink:0; }
        .fw-topbar-l { display:flex; align-items:center; gap:10px; min-width:0; }
        .fw-topbar-r { display:flex; align-items:center; gap:6px; flex-shrink:0; }
        .fw-logo { font-family:var(--font-mono); font-size:14px; font-weight:500; letter-spacing:.14em; color:var(--text-primary); flex-shrink:0; }
        .fw-logo span { color:var(--accent); }
        .fw-chip { display:flex; align-items:center; gap:5px; font-size:11px; color:var(--text-muted); background:var(--bg-card); padding:3px 10px; border-radius:20px; border:1px solid var(--border); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:220px; }
        .fw-upd { display:flex; align-items:center; gap:5px; font-size:11px; color:var(--text-muted); font-family:var(--font-mono); white-space:nowrap; }
        .fw-dot { width:6px; height:6px; border-radius:50%; background:var(--green); flex-shrink:0; animation:pulse-dot 2s infinite; }
        .fw-dot.loading { background:var(--amber); animation:blink .7s infinite; }
        .fw-ibtn { background:transparent; border:1px solid var(--border); border-radius:var(--radius-sm); padding:5px 8px; cursor:pointer; color:var(--text-secondary); display:flex; align-items:center; gap:5px; font-size:11px; font-family:var(--font-ui); transition:all .15s; white-space:nowrap; }
        .fw-ibtn:hover { background:var(--bg-card); color:var(--text-primary); border-color:var(--border-bright); }
        .fw-ibtn.act { background:var(--accent-soft); color:var(--accent); border-color:var(--accent-glow); }
        .fw-vtog { display:flex; border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; }
        .fw-vbtn { padding:5px 10px; font-size:11px; background:transparent; border:none; cursor:pointer; color:var(--text-muted); font-family:var(--font-ui); transition:all .15s; display:flex; align-items:center; gap:4px; }
        .fw-vbtn.act { background:var(--accent-soft); color:var(--accent); }
        .fw-vbtn:hover:not(.act) { background:var(--bg-card); color:var(--text-secondary); }
        .fw-main { flex:1; padding:16px; display:flex; flex-direction:column; gap:14px; max-width:1600px; width:100%; margin:0 auto; }
        /* TRACKING */
        .fw-track { background:var(--bg-panel); border:1px solid rgba(39,200,122,.35); border-radius:var(--radius-md); overflow:hidden; }
        .fw-track-hd { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--border); }
        .fw-track-ttl { display:flex; align-items:center; gap:10px; font-size:13px; color:var(--text-secondary); }
        .fw-tpulse { width:8px; height:8px; border-radius:50%; background:var(--green); flex-shrink:0; animation:pulse-dot 1.4s infinite; }
        .fw-track-body { display:grid; grid-template-columns:1fr 260px; }
        .fw-tstats { display:grid; grid-template-columns:repeat(auto-fill,minmax(90px,1fr)); gap:1px; background:var(--border); border-right:1px solid var(--border); }
        .fw-tstat { background:var(--bg-card); padding:9px 12px; }
        .fw-tstat span { display:block; font-size:9px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.1em; margin-bottom:3px; font-family:var(--font-mono); }
        .fw-tstat strong { font-family:var(--font-mono); font-size:12px; font-weight:400; color:var(--text-primary); }
        .fw-tmap-wrap { min-height:160px; }
        /* IDLE */
        .fw-idle { display:flex; flex-direction:column; align-items:center; gap:28px; padding:40px 0; }
        .fw-idle-radar { display:flex; flex-direction:column; align-items:center; gap:14px; }
        .fw-radar-anim { animation:scan 4s linear infinite; transform-origin:55px 55px; }
        .fw-idle-lbl { font-size:12px; color:var(--text-muted); letter-spacing:.1em; text-transform:uppercase; font-family:var(--font-mono); }
        .fw-idle-panels { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; width:100%; max-width:780px; }
        .fw-icard { background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--radius-md); padding:18px 20px; flex:1; min-width:200px; }
        .fw-icard-t { font-size:9px; letter-spacing:.18em; color:var(--text-muted); text-transform:uppercase; font-family:var(--font-mono); margin-bottom:10px; }
        .fw-icard-m { font-size:32px; font-weight:300; color:var(--text-primary); margin-bottom:4px; }
        .fw-icard-s { font-size:12px; color:var(--text-secondary); }
        .fw-icard-row { display:flex; gap:14px; font-size:12px; color:var(--text-muted); margin-top:10px; }
        .fw-sun-row { display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--border); font-size:13px; }
        .fw-sun-row:last-child { border-bottom:none; }
        .fw-sun-lbl { flex:1; color:var(--text-secondary); font-size:12px; }
        .fw-sun-row strong { font-family:var(--font-mono); color:var(--text-primary); font-weight:400; font-size:14px; }
        .fw-lclock { font-family:var(--font-mono); font-size:28px; font-weight:300; color:var(--text-primary); letter-spacing:.04em; margin-bottom:4px; }
        /* BADGES */
        .fw-badges { display:flex; gap:4px; flex-wrap:wrap; flex-shrink:0; }
        .fw-badge { font-size:10px; padding:2px 7px; border-radius:20px; font-family:var(--font-mono); }
        .fw-badge--air { background:var(--green-soft); color:var(--green); border:1px solid rgba(39,200,122,.2); }
        .fw-badge--gnd { background:var(--amber-soft); color:var(--amber); border:1px solid rgba(245,158,11,.2); }
        .fw-badge--trk { background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent-glow); }
        /* LIST */
        .fw-ac-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(285px,1fr)); gap:10px; }
        .fw-ac-card { background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-md); overflow:hidden; cursor:pointer; transition:border-color .18s,background .18s; }
        .fw-ac-card:hover { border-color:var(--border-bright); background:var(--bg-card-hover); }
        .fw-ac-card.sel { border-color:var(--accent)!important; }
        .fw-ac-card.trk { border-color:rgba(39,200,122,.45)!important; }
        .fw-ac-photo { height:130px; overflow:hidden; position:relative; }
        .fw-ac-photo img { width:100%; height:100%; object-fit:cover; display:block; }
        .fw-photo-credit { position:absolute; bottom:4px; right:6px; font-size:9px; color:rgba(255,255,255,.5); background:rgba(0,0,0,.55); padding:1px 5px; border-radius:3px; }
        .fw-ac-hd { display:flex; align-items:flex-start; justify-content:space-between; padding:10px 12px 6px; }
        .fw-ac-cs { font-family:var(--font-mono); font-size:15px; font-weight:500; color:var(--text-primary); letter-spacing:.06em; display:block; }
        .fw-ac-al { font-size:11px; color:var(--text-muted); display:block; margin-top:1px; }
        .fw-ac-dir { display:flex; align-items:center; gap:10px; padding:2px 12px 8px; }
        .fw-dir-deg { font-family:var(--font-mono); font-size:14px; color:var(--accent); line-height:1.2; }
        .fw-dir-lbl { font-size:10px; color:var(--text-muted); letter-spacing:.08em; }
        .fw-dist-pill { margin-left:auto; font-size:11px; font-family:var(--font-mono); color:var(--text-muted); background:var(--bg-base); padding:2px 8px; border-radius:20px; border:1px solid var(--border); }
        .fw-ac-stats { display:grid; grid-template-columns:1fr 1fr; gap:1px; border-top:1px solid var(--border); background:var(--border); }
        .fw-stat { background:var(--bg-card); padding:7px 12px; }
        .fw-stat-l { display:block; font-size:9px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.1em; margin-bottom:2px; font-family:var(--font-mono); }
        .fw-stat-v { font-family:var(--font-mono); color:var(--text-primary); }
        /* RADAR */
        .fw-radar-layout { display:grid; grid-template-columns:auto 1fr; gap:12px; align-items:start; }
        .fw-radar-panel { background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--radius-md); }
        .fw-panel-lbl { font-size:9px; letter-spacing:.15em; text-transform:uppercase; color:var(--text-muted); font-family:var(--font-mono); padding:10px 14px 0; }
        .fw-radar-detail { background:var(--bg-card); border:1px solid var(--accent); border-radius:var(--radius-md); overflow:hidden; }
        .fw-radar-detail-hd { display:flex; align-items:flex-start; justify-content:space-between; padding:12px 14px 8px; border-bottom:1px solid var(--border); }
        .fw-radar-photo { height:120px; overflow:hidden; position:relative; }
        .fw-radar-photo img { width:100%; height:100%; object-fit:cover; display:block; }
        .fw-radar-hint { background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--radius-md); padding:14px; display:flex; flex-direction:column; gap:10px; }
        .fw-radar-hint p { font-size:12px; color:var(--text-muted); text-align:center; }
        .fw-mini-list { display:flex; flex-direction:column; gap:4px; }
        .fw-mini-item { display:flex; align-items:center; gap:8px; padding:6px 10px; background:var(--bg-card); border-radius:var(--radius-sm); cursor:pointer; border:1px solid var(--border); transition:border-color .15s; }
        .fw-mini-item:hover { border-color:var(--border-bright); }
        .fw-mini-cs { font-family:var(--font-mono); font-size:12px; color:var(--text-primary); flex:1; }
        .fw-mini-dist { font-size:11px; color:var(--text-muted); }
        /* STATUS */
        .fw-status { display:flex; align-items:center; gap:16px; padding:8px 14px; background:var(--bg-panel); border:1px solid var(--border); font-size:11px; color:var(--text-muted); border-radius:var(--radius-md); flex-wrap:wrap; }
        .fw-status-r { margin-left:auto; font-family:var(--font-mono); font-size:10px; }
        @media (max-width:700px) {
          .fw-track-body { grid-template-columns:1fr; }
          .fw-tmap-wrap { height:150px; }
          .fw-radar-layout { grid-template-columns:1fr; }
          .fw-chip { display:none; }
        }
      `}</style>
    </div>
  )
}
