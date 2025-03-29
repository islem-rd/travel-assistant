export interface Message {
  role: "user" | "assistant" | "system"
  content: string
}

export interface Location {
  name: string
  coordinates: [number, number]
  zoom: number
  description?: string
  mapStyle?: string // Optional now
}

