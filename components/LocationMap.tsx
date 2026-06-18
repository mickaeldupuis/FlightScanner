'use client'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

interface Props {
  center: [number, number]
  onSelect: (lat: number, lon: number) => void
}

export default function LocationMap({ center, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const markerRef = useRef<import('leaflet').Marker | null>(null)

  useEffect(() => {
    if (!ref.current) return
    import('leaflet').then(L => {
      if (mapRef.current) return

      const icon = L.divIcon({
        html: `<div style="width:16px;height:16px;border-radius:50%;background:var(--accent,#2d7dd2);border:3px solid white;box-shadow:0 0 8px rgba(45,125,210,0.6)"></div>`,
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })

      const map = L.map(ref.current!, { zoomControl: true }).setView(center, 8)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      }).addTo(map)

      const marker = L.marker(center, { icon, draggable: true }).addTo(map)
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng()
        onSelect(lat, lng)
      })
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        marker.setLatLng(e.latlng)
        onSelect(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
      markerRef.current = marker
    })
  }, [])

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return
    markerRef.current.setLatLng(center)
    mapRef.current.panTo(center)
  }, [center])

  return <div ref={ref} style={{ width: '100%', height: '280px' }} />
}
