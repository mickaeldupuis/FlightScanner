'use client'
import { useRef, useCallback, useState, useEffect } from 'react'
import { compassPoint } from '@/lib/utils'

interface Props {
  value: number                    // degrés 0-359
  onChange: (deg: number) => void
}

const SIZE = 200
const CX = SIZE / 2
const CY = SIZE / 2
const R_OUTER = 92
const R_TICKS = 80
const R_LABELS = 66

export default function CompassDial({ value, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState(false)
  const [hoverDeg, setHoverDeg] = useState<number | null>(null)

  const angleFromEvent = useCallback((clientX: number, clientY: number): number => {
    const svg = svgRef.current
    if (!svg) return value
    const rect = svg.getBoundingClientRect()
    const x = clientX - rect.left - rect.width / 2
    const y = clientY - rect.top - rect.height / 2
    // 0° = haut (nord), sens horaire
    let deg = (Math.atan2(x, -y) * 180) / Math.PI
    if (deg < 0) deg += 360
    return Math.round(deg)
  }, [value])

  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true)
    ;(e.target as Element).setPointerCapture(e.pointerId)
    onChange(angleFromEvent(e.clientX, e.clientY))
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    onChange(angleFromEvent(e.clientX, e.clientY))
  }
  const handlePointerUp = (e: React.PointerEvent) => {
    setDragging(false)
    try { (e.target as Element).releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  // Snap buttons N/E/S/O
  const snapTo = (deg: number) => onChange(deg)

  const needleRad = ((value - 90) * Math.PI) / 180
  const tipX = CX + Math.cos(needleRad) * (R_TICKS - 4)
  const tipY = CY + Math.sin(needleRad) * (R_TICKS - 4)
  const tailX = CX - Math.cos(needleRad) * 26
  const tailY = CY - Math.sin(needleRad) * 26

  const ticks = []
  for (let deg = 0; deg < 360; deg += 10) {
    const major = deg % 90 === 0
    const mid   = deg % 30 === 0
    const rOut  = R_TICKS
    const rIn   = major ? R_TICKS - 12 : mid ? R_TICKS - 8 : R_TICKS - 5
    const rad   = ((deg - 90) * Math.PI) / 180
    ticks.push(
      <line
        key={deg}
        x1={CX + Math.cos(rad) * rOut} y1={CY + Math.sin(rad) * rOut}
        x2={CX + Math.cos(rad) * rIn}  y2={CY + Math.sin(rad) * rIn}
        stroke={major ? 'var(--accent)' : 'rgba(122,155,191,0.35)'}
        strokeWidth={major ? 1.6 : 1}
      />
    )
  }

  const dirLabels = [
    { d: 'N', deg: 0 }, { d: 'NE', deg: 45 }, { d: 'E', deg: 90 }, { d: 'SE', deg: 135 },
    { d: 'S', deg: 180 }, { d: 'SO', deg: 225 }, { d: 'O', deg: 270 }, { d: 'NO', deg: 315 },
  ]

  return (
    <div className="cd-wrap">
      <svg
        ref={svgRef}
        width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="cd-svg"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHoverDeg(null)}
        style={{ touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab' }}
      >
        {/* Cercle externe */}
        <circle cx={CX} cy={CY} r={R_OUTER} fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1.5"/>
        <circle cx={CX} cy={CY} r={R_OUTER - 1} fill="none" stroke="rgba(45,125,210,0.08)" strokeWidth="14"/>

        {/* Graduations */}
        {ticks}

        {/* Labels cardinaux/intercardinaux */}
        {dirLabels.map(({ d, deg }) => {
          const rad = ((deg - 90) * Math.PI) / 180
          const x = CX + Math.cos(rad) * R_LABELS
          const y = CY + Math.sin(rad) * R_LABELS
          const major = d.length === 1
          return (
            <text
              key={d}
              x={x} y={y}
              fontSize={major ? 13 : 9.5}
              fontWeight={major ? 600 : 400}
              fontFamily="var(--font-mono)"
              fill={d === 'N' ? 'var(--accent)' : major ? 'var(--text-primary)' : 'var(--text-muted)'}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {d}
            </text>
          )
        })}

        {/* Centre */}
        <circle cx={CX} cy={CY} r="4" fill="var(--text-muted)" />

        {/* Aiguille */}
        <g style={{ pointerEvents: 'none' }}>
          <line x1={tailX} y1={tailY} x2={tipX} y2={tipY} stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"/>
          <polygon
            points={`${tipX},${tipY} ${CX + Math.cos(needleRad + 2.7) * 10},${CY + Math.sin(needleRad + 2.7) * 10} ${CX + Math.cos(needleRad - 2.7) * 10},${CY + Math.sin(needleRad - 2.7) * 10}`}
            fill="var(--accent)"
          />
          <circle cx={CX} cy={CY} r="6" fill="var(--bg-panel)" stroke="var(--accent)" strokeWidth="2"/>
        </g>
      </svg>

      {/* Valeur + snap buttons */}
      <div className="cd-info">
        <div className="cd-value">
          <span className="cd-deg">{value}°</span>
          <span className="cd-point">{compassPoint(value)}</span>
        </div>
        <div className="cd-snaps">
          {[['N', 0], ['E', 90], ['S', 180], ['O', 270]].map(([label, deg]) => (
            <button
              key={label}
              type="button"
              className={`cd-snap-btn${value === deg ? ' act' : ''}`}
              onClick={() => snapTo(deg as number)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <style jsx>{`
        .cd-wrap { display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .cd-svg { user-select: none; -webkit-user-select: none; }
        .cd-info { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .cd-value { display: flex; align-items: baseline; gap: 8px; }
        .cd-deg { font-family: var(--font-mono); font-size: 22px; font-weight: 500; color: var(--accent); letter-spacing: 0.02em; }
        .cd-point { font-family: var(--font-mono); font-size: 13px; color: var(--text-muted); letter-spacing: 0.08em; }
        .cd-snaps { display: flex; gap: 6px; }
        .cd-snap-btn {
          width: 30px; height: 26px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-secondary);
          font-family: var(--font-mono);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .cd-snap-btn:hover { border-color: var(--border-bright); color: var(--text-primary); }
        .cd-snap-btn.act { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
      `}</style>
    </div>
  )
}
