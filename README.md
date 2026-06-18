# FlightWall ✈️

Application de radar de proximité aérienne en temps réel, inspirée de TheFlightWall.

## Fonctionnalités

- **Radar en temps réel** via OpenSky Network (gratuit, sans clé API)
- **Affichage enrichi** : direction, altitude, vitesse, pays d'origine, variomètre
- **Photos d'appareils** via Planespotters.net
- **Suivi d'appareil** avec mini-carte et alertes d'atterrissage
- **Mode veille** : météo (Open-Meteo), lever/coucher du soleil, horloge mondiale opérationnelle
- **Paramètres** : rayon de détection, nombre max d'appareils, orientation du mur
- **Géolocalisation** : bouton "Me localiser" + sélecteur sur carte (Leaflet/OSM)

## Déploiement sur Vercel

```bash
# 1. Cloner / télécharger le projet
# 2. Installer les dépendances
npm install

# 3. (Optionnel) Configurer AviationStack pour enrichir les données
cp .env.example .env.local
# Éditer .env.local et ajouter votre clé AVIATIONSTACK_KEY

# 4. Lancer en dev
npm run dev

# 5. Déployer sur Vercel
npx vercel
```

## APIs utilisées

| API | Usage | Clé requise |
|-----|-------|-------------|
| OpenSky Network | Positions avions en temps réel | Non (anonyme) |
| Open-Meteo | Météo locale | Non |
| Sunrise-Sunset.org | Lever/coucher du soleil | Non |
| Planespotters.net | Photos d'appareils | Non |
| AviationStack | Détails vol (origine/dest/immat) | Oui (gratuit 100/mois) |

## Structure

```
app/
  page.tsx              — Page principale
  api/
    flights/            — Données OpenSky (positions)
    weather/            — Météo Open-Meteo
    sunrise/            — Éphémérides
    aircraft-photo/     — Photos Planespotters
    flight-info/        — Détails AviationStack
components/
  WorldClock.tsx        — Horloge mondiale ops center
  LocationMap.tsx       — Carte de sélection de position
  TrackingMap.tsx       — Mini-carte de suivi
lib/
  types.ts              — Types TypeScript
  utils.ts              — Utilitaires (conversion, formatage)
```
