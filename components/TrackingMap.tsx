'use client'
import { useEffect, useRef } from 'react'
import type { Aircraft } from '@/lib/types'
import 'leaflet/dist/leaflet.css'

interface Props {
  aircraft: Aircraft
}

export default function TrackingMap({ aircraft }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const markerRef = useRef<import('leaflet').Marker | null>(null)

  useEffect(() => {
    if (!ref.current || !aircraft.latitude || !aircraft.longitude) return
    import('leaflet').then(L => {
      const pos: [number, number] = [aircraft.latitude!, aircraft.longitude!]

      const planeIcon = (track: number) => L.divIcon({
        html: `<div style="transform:rotate(${track}deg);color:#2d7dd2;font-size:22px;line-height:1;filter:drop-shadow(0 0 4px rgba(45,125,210,0.7))">✈</div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })

      if (!mapRef.current) {
        const map = L.map(ref.current!, { zoomControl: false, attributionControl: false }).setView(pos, 9)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map)
        const marker = L.marker(pos, { icon: planeIcon(aircraft.trueTrack ?? 0) }).addTo(map)
        marker.bindPopup(`<strong>${aircraft.callsign || aircraft.icao24}</strong><br/>${aircraft.originCountry}`, { closeButton: false })
        mapRef.current = map
        markerRef.current = marker
      } else {
        markerRef.current?.setLatLng(pos)
        markerRef.current?.setIcon(planeIcon(aircraft.trueTrack ?? 0))
        mapRef.current.panTo(pos)
      }
    })
  }, [aircraft])

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />
}
