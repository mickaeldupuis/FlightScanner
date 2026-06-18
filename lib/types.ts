export interface Aircraft {
  icao24: string
  callsign: string | null
  originCountry: string
  longitude: number | null
  latitude: number | null
  altitude: number | null   // metres (baro)
  onGround: boolean
  velocity: number | null   // m/s
  trueTrack: number | null  // degrees (0=N)
  verticalRate: number | null
  squawk: string | null
  category: number
  // enriched
  distance: number          // km from observer
  bearing: number           // degrees from observer
  registration?: string
  airline?: string
  flightNumber?: string
  origin?: string
  destination?: string
  aircraftType?: string
  photoUrl?: string
  eta?: number              // minutes to landing
}

export interface Location {
  lat: number
  lon: number
  label?: string
}

export interface WeatherData {
  temperature: number | null
  weatherCode: number
  windSpeed: number | null
  windDirection: number | null
  humidity: number | null
}

export interface SunData {
  sunrise: string
  sunset: string
  solarNoon: string
  dayLength: number | null  // seconds
}

export interface AppSettings {
  location: Location
  radius: number       // km
  maxAircraft: number
  orientation: number  // degrees, direction the "wall" faces
  trackedIcao: string | null
  alertMinutes: number
}
