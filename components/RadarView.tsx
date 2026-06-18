'use client'
import type { Aircraft } from '@/lib/types'
import { compassPoint } from '@/lib/utils'

interface Props {
  aircraft: Aircraft[]
  orientation: number
  radius: number
  selectedIcao: string | null
  trackedIcao: string | null
  onSelect: (icao: string) => void
}

export default function RadarView({ aircraft, orientation, radius, selectedIcao, trackedIcao, onSelect }: Props) {
  const SIZE = 280
  const CX = SIZE / 2
  const CY = SIZE / 2
  const R = SIZE / 2 - 20

  function acToXY(ac: Aircraft): [number, number] | null {
    if (ac.bearing == null || ac.distance == null) return null
    const bearingRad = ((ac.bearing - orientation - 90) * Math.PI) / 180
    const dist = Math.min(ac.distance / radius, 1)
    const x = CX + Math.cos(bearingRad) * dist * R
    const y = CY + Math.sin(bearingRad) * dist * R
    return [x, y]
  }

  const rings = [0.33, 0.66, 1]
  const compassDirs = ['N', 'E', 'S', 'O']
  const compassAngles = [0, 90, 180, 270]

  return (
    <div className="radar-wrap">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ overflow: 'visible' }}>
        {/* Rings */}
        {rings.map((r, i) => (
          <circle key={i} cx={CX} cy={CY} r={r * R} fill="none" stroke="rgba(56,100,160,0.2)" strokeWidth="0.5" strokeDasharray={i < 2 ? '3 4' : ''}/>
        ))}
        {/* Cross hairs */}
        <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} stroke="rgba(56,100,160,0.12)" strokeWidth="0.5"/>
        <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke="rgba(56,100,160,0.12)" strokeWidth="0.5"/>

        {/* Ring labels */}
        <text x={CX + 4} y={CY - R * 0.33 - 3} fontSize="8" fill="rgba(122,155,191,0.5)" fontFamily="monospace">{Math.round(radius * 0.33)} km</text>
        <text x={CX + 4} y={CY - R * 0.66 - 3} fontSize="8" fill="rgba(122,155,191,0.5)" fontFamily="monospace">{Math.round(radius * 0.66)} km</text>
        <text x={CX + 4} y={CY - R - 3} fontSize="8" fill="rgba(122,155,191,0.5)" fontFamily="monospace">{radius} km</text>

        {/* Compass labels */}
        {compassDirs.map((d, i) => {
          const angle = ((compassAngles[i] - orientation) * Math.PI) / 180
          const lx = CX + Math.sin(angle) * (R + 14)
          const ly = CY - Math.cos(angle) * (R + 14)
          return (
            <text key={d} x={lx} y={ly} fontSize="10" fontFamily="monospace" fontWeight="500"
              fill={d === 'N' ? 'var(--accent)' : 'rgba(122,155,191,0.7)'}
              textAnchor="middle" dominantBaseline="middle">
              {d}
            </text>
          )
        })}

        {/* Sweep line */}
        <line x1={CX} y1={CY} x2={CX} y2={CY - R} stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.3"/>

        {/* Observer */}
        <circle cx={CX} cy={CY} r="4" fill="var(--accent)" fillOpacity="0.9"/>
        <circle cx={CX} cy={CY} r="8" fill="none" stroke="var(--accent)" strokeWidth="0.5" strokeOpacity="0.5"/>

        {/* Aircraft dots */}
        {aircraft.map(ac => {
          const pos = acToXY(ac)
          if (!pos) return null
          const [x, y] = pos
          const isSelected = selectedIcao === ac.icao24
          const isTracked = trackedIcao === ac.icao24
          const color = isTracked ? 'var(--green)' : isSelected ? 'var(--accent)' : ac.onGround ? '#f59e0b' : '#e2eaf5'
          const size = isSelected || isTracked ? 7 : 5

          return (
            <g key={ac.icao24} style={{ cursor: 'pointer' }} onClick={() => onSelect(ac.icao24)}>
              {/* Halo for selected/tracked */}
              {(isSelected || isTracked) && (
                <circle cx={x} cy={y} r={size + 4} fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.4"/>
              )}
              {/* Plane icon triangle */}
              <polygon
                points={`${x},${y - size} ${x - size * 0.6},${y + size * 0.7} ${x},${y + size * 0.3} ${x + size * 0.6},${y + size * 0.7}`}
                fill={color}
                transform={`rotate(${(ac.trueTrack ?? 0) - orientation}, ${x}, ${y})`}
                fillOpacity={0.9}
              />
              {/* Callsign label */}
              {isSelected && (
                <text x={x + 9} y={y} fontSize="9" fontFamily="monospace" fill="var(--accent)" dominantBaseline="middle">
                  {ac.callsign || ac.icao24.toUpperCase()}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <div className="radar-legend">
        <span><span className="dot" style={{ background: 'var(--text-primary)' }}/> En vol</span>
        <span><span className="dot" style={{ background: 'var(--amber)' }}/> Au sol</span>
        <span><span className="dot" style={{ background: 'var(--green)' }}/> Suivi</span>
      </div>

      <style jsx>{`
        .radar-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px; }
        .radar-legend { display: flex; gap: 14px; font-size: 10px; color: var(--text-muted); font-family: monospace; }
        .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
      `}</style>
    </div>
  )
}
