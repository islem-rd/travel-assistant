import type { Location } from "./types"

// Map of common locations with their coordinates, zoom levels, and descriptions
export const locationData: Record<string, Location> = {
  paris: {
    name: "Paris",
    coordinates: [2.3522, 48.8566],
    zoom: 12,
    description: "La capitale de la France, connue pour la Tour Eiffel et le Louvre.",
  },
  londres: {
    name: "Londres",
    coordinates: [-0.1278, 51.5074],
    zoom: 12,
    description: "La capitale du Royaume-Uni, célèbre pour Big Ben et Buckingham Palace.",
  },
  "new york": {
    name: "New York",
    coordinates: [-74.006, 40.7128],
    zoom: 12,
    description: "La plus grande ville des États-Unis, connue pour Times Square et la Statue de la Liberté.",
  },
  tokyo: {
    name: "Tokyo",
    coordinates: [139.6917, 35.6895],
    zoom: 12,
    description: "La capitale du Japon, mélange de culture traditionnelle et de technologie moderne.",
  },
  rome: {
    name: "Rome",
    coordinates: [12.4964, 41.9028],
    zoom: 12,
    description: "La capitale de l'Italie, célèbre pour le Colisée et le Vatican.",
  },
  tunisie: {
    name: "Tunisie",
    coordinates: [9.5375, 33.8869],
    zoom: 7,
    description: "Pays d'Afrique du Nord connu pour ses plages méditerranéennes et ses sites archéologiques.",
  },
  maroc: {
    name: "Maroc",
    coordinates: [-7.0926, 31.7917],
    zoom: 6,
    description: "Pays d'Afrique du Nord connu pour ses médinas, ses déserts et sa cuisine.",
  },
  barcelone: {
    name: "Barcelone",
    coordinates: [2.1734, 41.3851],
    zoom: 12,
    description: "Ville espagnole connue pour son architecture unique et ses plages.",
  },
  berlin: {
    name: "Berlin",
    coordinates: [13.405, 52.52],
    zoom: 12,
    description: "La capitale de l'Allemagne, connue pour son histoire et sa scène culturelle.",
  },
  amsterdam: {
    name: "Amsterdam",
    coordinates: [4.9041, 52.3676],
    zoom: 12,
    description: "La capitale des Pays-Bas, connue pour ses canaux et ses musées.",
  },
  venise: {
    name: "Venise",
    coordinates: [12.3155, 45.4408],
    zoom: 13,
    description: "Ville italienne construite sur des îles et connue pour ses canaux et son architecture.",
  },
  bangkok: {
    name: "Bangkok",
    coordinates: [100.5018, 13.7563],
    zoom: 12,
    description: "La capitale de la Thaïlande, connue pour ses temples et sa street food.",
  },
  sydney: {
    name: "Sydney",
    coordinates: [151.2093, -33.8688],
    zoom: 12,
    description: "La plus grande ville d'Australie, connue pour son opéra et son port.",
  },
  "rio de janeiro": {
    name: "Rio de Janeiro",
    coordinates: [-43.1729, -22.9068],
    zoom: 12,
    description: "Ville brésilienne connue pour ses plages, le Christ Rédempteur et le carnaval.",
  },
  "le caire": {
    name: "Le Caire",
    coordinates: [31.2357, 30.0444],
    zoom: 12,
    description: "La capitale de l'Égypte, proche des pyramides de Gizeh.",
  },
  istanbul: {
    name: "Istanbul",
    coordinates: [28.9784, 41.0082],
    zoom: 12,
    description: "Ville turque à cheval sur deux continents, connue pour ses mosquées et bazars.",
  },
  dubai: {
    name: "Dubaï",
    coordinates: [55.2708, 25.2048],
    zoom: 12,
    description: "Ville des Émirats arabes unis connue pour ses gratte-ciels et son luxe.",
  },
  singapour: {
    name: "Singapour",
    coordinates: [103.8198, 1.3521],
    zoom: 12,
    description: "Cité-État asiatique connue pour sa propreté, sa modernité et sa cuisine.",
  },
  hawaii: {
    name: "Hawaii",
    coordinates: [-157.8583, 21.3069],
    zoom: 10,
    description: "État insulaire américain connu pour ses plages et ses volcans.",
  },
  maldives: {
    name: "Maldives",
    coordinates: [73.2207, 3.2028],
    zoom: 9,
    description: "Archipel de l'océan Indien connu pour ses plages et ses récifs coralliens.",
  },
  alpes: {
    name: "Alpes",
    coordinates: [8.2275, 46.8182],
    zoom: 8,
    description: "Chaîne de montagnes européenne populaire pour les sports d'hiver.",
  },
}

// Function to detect location from text
export function detectLocation(text: string): Location | null {
  const lowercaseText = text.toLowerCase()

  for (const [key, location] of Object.entries(locationData)) {
    if (lowercaseText.includes(key)) {
      return location
    }
  }

  return null
}

// Default location (Paris)
export const defaultLocation: Location = {
  name: "Paris",
  coordinates: [2.3522, 48.8566],
  zoom: 12,
  description: "La capitale de la France, connue pour la Tour Eiffel et le Louvre.",
}

