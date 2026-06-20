'use client'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

interface Props {
  center: [number, number]
  radius?: number          // km — dessine un cercle de détection
  onSelect: (lat: number, lon: number) => void
}

export default function LocationMap({ center, radius, onSelect }: Props) {
  const ref    = useRef<HTMLDivElement>(null)
  const mapRef    = useRef<import('leaflet').Map | null>(null)
  const markerRef = useRef<import('leaflet').Marker | null>(null)
  const circleRef = useRef<import('leaflet').Circle | null>(null)

  useEffect(() => {
    if (!ref.current) return
    import('leaflet').then(L => {
      if (mapRef.current) return

      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#2d7dd2;border:3px solid #fff;box-shadow:0 0 10px rgba(45,125,210,.8)"></div>`,
        className: '',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })

      const map = L.map(ref.current!, { zoomControl: true }).setView(center, 7)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 18,
      }).addTo(map)

      // Cercle de détection
      const circle = L.circle(center, {
        radius:      (radius ?? 100) * 1000,
        color:       '#2d7dd2',
        fillColor:   '#2d7dd2',
        fillOpacity: 0.06,
        weight:      1.5,
        dashArray:   '6 4',
      }).addTo(map)

      const marker = L.marker(center, { icon, draggable: true }).addTo(map)

      const updatePos = (lat: number, lng: number) => {
        marker.setLatLng([lat, lng])
        circle.setLatLng([lat, lng])
        onSelect(lat, lng)
      }

      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng()
        updatePos(lat, lng)
      })
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        updatePos(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current    = map
      markerRef.current = marker
      circleRef.current = circle
    })
  }, []) // eslint-disable-line

  // Sync position
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !circleRef.current) return
    markerRef.current.setLatLng(center)
    circleRef.current.setLatLng(center)
    mapRef.current.panTo(center)
  }, [center])

  // Sync radius
  useEffect(() => {
    if (!circleRef.current) return
    circleRef.current.setRadius((radius ?? 100) * 1000)
  }, [radius])

  return <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 380 }} />
}
