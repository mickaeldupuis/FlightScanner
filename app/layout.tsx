import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FlightWall — Radar de proximité',
  description: 'Visualisez les avions en temps réel autour de vous',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
