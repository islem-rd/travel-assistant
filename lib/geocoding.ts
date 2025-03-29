import type { Location } from "./types"
import { locationData } from "./locations"

// Function to validate coordinates
function validateCoordinates(lon: number, lat: number): boolean {
  return !isNaN(lon) && !isNaN(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
}

// Track the last request time to implement client-side rate limiting
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 2000 // 2 seconds between requests
const MAX_RETRIES = 2
const INITIAL_RETRY_DELAY = 2000 // 2 seconds

// Function to geocode a location name to coordinates using our API route
export async function geocodeLocation(
  locationName: string,
  retries = MAX_RETRIES,
  delay = INITIAL_RETRY_DELAY,
): Promise<Location | null> {
  try {
    // First check if it's in our predefined locations
    const predefinedLocation = detectPredefinedLocation(locationName)
    if (predefinedLocation) {
      return predefinedLocation
    }

    // Implement client-side rate limiting
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      // Wait until we can make another request
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
    }

    // Update the last request time
    lastRequestTime = Date.now()

    // If not found in predefined locations, use our API route
    const response = await fetch("/api/geocode", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: locationName }),
    })

    // Handle rate limiting responses specifically
    if (response.status === 429) {
      console.log("Geocoding API rate limited")

      // If we have retries left, wait and try again
      if (retries > 0) {
        console.log(`Rate limited. Retrying in ${delay}ms. Retries left: ${retries}`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        return geocodeLocation(locationName, retries - 1, delay * 2)
      }

      throw new Error("Too Many Requests: Service temporarily unavailable")
    }

    // For any non-OK response, handle it properly
    if (!response.ok) {
      // Get the content type to determine how to handle the response
      const contentType = response.headers.get("content-type") || ""

      let errorMessage = `Geocoding API error: ${response.status}`

      // If it's a text response, read it as text
      if (contentType.includes("text/")) {
        try {
          const errorText = await response.text()
          errorMessage = `Geocoding API error: ${response.status} - ${errorText}`
        } catch (textError) {
          console.error("Failed to read error text:", textError)
        }
      } else {
        // Otherwise, try to read it as JSON but be prepared for failure
        try {
          const errorData = await response.json()
          errorMessage = `Geocoding API error: ${response.status} - ${errorData.error || JSON.stringify(errorData)}`
        } catch (jsonError) {
          console.error("Failed to parse error JSON:", jsonError)
        }
      }

      // If we have retries left for server errors (5xx), try again
      if (retries > 0 && response.status >= 500) {
        console.log(`Server error (${response.status}). Retrying in ${delay}ms. Retries left: ${retries}`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        return geocodeLocation(locationName, retries - 1, delay * 2)
      }

      throw new Error(errorMessage)
    }

    // For successful responses, check content type before parsing
    const contentType = response.headers.get("content-type") || ""

    let responseData: any = null

    // Try to parse the response based on content type
    if (!contentType.includes("application/json")) {
      // If not JSON, try to read as text first
      try {
        const text = await response.text()

        // Check if the text looks like a rate limiting message
        if (text.includes("Too Many Requests") || text.includes("429")) {
          throw new Error("Too Many Requests: Service temporarily unavailable")
        }

        // Try to parse the text as JSON (in case the content-type header is wrong)
        try {
          responseData = JSON.parse(text)
        } catch (jsonError) {
          console.error("Response is not valid JSON:", text)
          throw new Error("Failed to parse response: Invalid format")
        }
      } catch (textError) {
        if (textError instanceof Error && textError.message.includes("Too Many Requests")) {
          throw textError
        }
        console.error("Failed to read response text:", textError)
        throw new Error("Failed to read response")
      }
    } else {
      // If content type is JSON, parse it normally
      try {
        responseData = await response.json()
      } catch (jsonError) {
        console.error("Failed to parse JSON response:", jsonError)

        // If JSON parsing fails, read the response as text to see what went wrong
        try {
          const text = await response.clone().text()
          console.error("Raw response:", text.substring(0, 200) + (text.length > 200 ? "..." : ""))

          // Check if the text looks like a rate limiting message
          if (text.includes("Too Many Requests") || text.includes("429")) {
            throw new Error("Too Many Requests: Service temporarily unavailable")
          }

          throw new Error(`Failed to parse response as JSON: ${jsonError}`)
        } catch (textError) {
          // If even reading as text fails, throw the original JSON error
          throw jsonError
        }
      }
    }

    // Validate the location data
    if (responseData && responseData.location) {
      // Check if coordinates exist and are valid
      if (Array.isArray(responseData.location.coordinates) && responseData.location.coordinates.length === 2) {
        const [lon, lat] = responseData.location.coordinates
        if (!validateCoordinates(lon, lat)) {
          console.error("Invalid coordinates from geocoding:", responseData.location.coordinates)
          return null
        }
      } else {
        console.error("Missing or invalid coordinates in location data:", responseData.location)
        return null
      }

      return responseData.location
    }

    // If we got a response but no location data, return null
    return null
  } catch (error) {
    console.error("Error geocoding location:", error)

    // Check if it's a rate limiting error and rethrow it so it can be handled upstream
    if (
      error instanceof Error &&
      (error.message.includes("Too Many Requests") ||
        error.message.includes("429") ||
        error.message.includes("rate limit"))
    ) {
      throw error // Rethrow rate limiting errors
    }

    // For other errors, if we have retries left, try again
    if (retries > 0) {
      console.log(`Error geocoding. Retrying in ${delay}ms. Retries left: ${retries}`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return geocodeLocation(locationName, retries - 1, delay * 2)
    }

    return null
  }
}

// Function to extract potential location names from text
export function extractLocationNames(text: string): string[] {
  // This is a simple implementation that could be improved with NLP
  // For now, we'll just look for words that start with uppercase letters
  // and are not at the beginning of sentences

  const words = text.split(/\s+/)
  const potentialLocations: string[] = []
  let currentPhrase: string[] = []

  for (let i = 0; i < words.length; i++) {
    const word = words[i].trim()

    // Skip empty words and words at the beginning of sentences
    if (!word || (i === 0 && word[0] === word[0].toUpperCase())) {
      continue
    }

    // If word starts with uppercase and is not after a period, it might be a location
    if (word[0] === word[0].toUpperCase() && (i === 0 || !words[i - 1].endsWith("."))) {
      currentPhrase.push(word)
    } else if (currentPhrase.length > 0) {
      // End of a potential location phrase
      potentialLocations.push(currentPhrase.join(" "))
      currentPhrase = []
    }
  }

  // Add the last phrase if there is one
  if (currentPhrase.length > 0) {
    potentialLocations.push(currentPhrase.join(" "))
  }

  return potentialLocations
}

// Function to detect and geocode locations from text
export async function detectAndGeocodeLocation(text: string): Promise<Location | null> {
  try {
    // First try with our predefined locations
    const predefinedLocation = detectPredefinedLocation(text)
    if (predefinedLocation) {
      return predefinedLocation
    }

    // Extract potential location names
    const potentialLocations = extractLocationNames(text)

    // Try to geocode each potential location
    for (const locationName of potentialLocations) {
      try {
        const location = await geocodeLocation(locationName)
        if (location) {
          return location
        }
      } catch (error) {
        // If it's a rate limiting error, stop trying and propagate the error
        if (
          error instanceof Error &&
          (error.message.includes("Too Many Requests") ||
            error.message.includes("429") ||
            error.message.includes("rate limit"))
        ) {
          throw error
        }
        // Otherwise continue with the next location
        console.warn(`Failed to geocode potential location "${locationName}":`, error)
      }
    }

    // If no locations were found from potential names, try geocoding the entire text
    // This might work for simple queries like "Paris" or "New York"
    try {
      return await geocodeLocation(text)
    } catch (error) {
      // If it's a rate limiting error, propagate it
      if (
        error instanceof Error &&
        (error.message.includes("Too Many Requests") ||
          error.message.includes("429") ||
          error.message.includes("rate limit"))
      ) {
        throw error
      }

      // For other errors, log and return null
      console.warn(`Failed to geocode full text "${text.substring(0, 50)}...":`, error)
      return null
    }
  } catch (error) {
    // Propagate rate limiting errors
    if (
      error instanceof Error &&
      (error.message.includes("Too Many Requests") ||
        error.message.includes("429") ||
        error.message.includes("rate limit"))
    ) {
      throw error
    }

    console.error("Error detecting location:", error)
    return null
  }
}

// Function to detect location from predefined list
export function detectPredefinedLocation(text: string): Location | null {
  const lowercaseText = text.toLowerCase()

  for (const [key, location] of Object.entries(locationData)) {
    if (lowercaseText.includes(key)) {
      return location
    }
  }

  return null
}

