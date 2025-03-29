import { NextResponse } from "next/server"
import type { Location } from "@/lib/types"

// Function to validate coordinates
function validateCoordinates(lon: number, lat: number): boolean {
  return !isNaN(lon) && !isNaN(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
}

// Simple rate limiting for the geocode API
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 1000 // 1 second between requests
const MAX_RETRIES = 2

export async function POST(request: Request) {
  try {
    // Parse the request body
    let query: string
    try {
      const body = await request.json()
      query = body.query
    } catch (parseError) {
      console.error("Error parsing request body:", parseError)
      return NextResponse.json({ error: "Invalid request format" }, { status: 400 })
    }

    if (!query) {
      return NextResponse.json({ error: "Query parameter is required" }, { status: 400 })
    }

    const apiKey = process.env.AZURE_MAPS_KEY
    if (!apiKey) {
      console.error("Azure Maps API key is missing")
      return NextResponse.json({ error: "Configuration error" }, { status: 500 })
    }

    // Implement server-side rate limiting
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      // Wait until we can make another request
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
    }

    // Update the last request time
    lastRequestTime = Date.now()

    // Function to make the request with retries
    const makeRequestWithRetry = async (retries: number): Promise<any> => {
      try {
        // Construct the URL with proper encoding
        const encodedQuery = encodeURIComponent(query)
        const url = `https://atlas.microsoft.com/search/address/json?api-version=1.0&query=${encodedQuery}&subscription-key=${apiKey}&language=fr`

        console.log(`Geocoding request for: "${query}" (encoded: "${encodedQuery}")`)

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        })

        if (response.status === 429 && retries > 0) {
          // If rate limited, wait and retry
          console.log(`Rate limited. Retrying in ${MIN_REQUEST_INTERVAL * 2}ms. Retries left: ${retries}`)
          await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL * 2))
          return makeRequestWithRetry(retries - 1)
        }

        // For any non-OK response, log detailed information
        if (!response.ok) {
          const contentType = response.headers.get("content-type") || ""
          console.error(`Azure Maps API error: Status ${response.status}, Content-Type: ${contentType}`)

          let errorDetails = ""

          // Try to get more details about the error
          if (contentType.includes("application/json")) {
            try {
              const errorJson = await response.json()
              errorDetails = JSON.stringify(errorJson)
              console.error("Error details (JSON):", errorDetails)
            } catch (jsonError) {
              console.error("Failed to parse error JSON:", jsonError)
            }
          } else {
            try {
              const errorText = await response.text()
              errorDetails = errorText
              console.error("Error details (text):", errorText)
            } catch (textError) {
              console.error("Failed to read error text:", textError)
            }
          }

          // Return a structured error response
          if (response.status === 429) {
            throw new Error("Too Many Requests")
          } else {
            throw new Error(`API error: ${response.status}${errorDetails ? ` - ${errorDetails}` : ""}`)
          }
        }

        // For successful responses, try to parse as JSON
        try {
          const data = await response.json()
          console.log(`Geocoding response received with ${data.results?.length || 0} results`)
          return data
        } catch (jsonError) {
          console.error("Failed to parse successful response as JSON:", jsonError)

          // Try to read the response as text for debugging
          try {
            const text = await response.clone().text()
            console.error("Raw response:", text.substring(0, 200) + (text.length > 200 ? "..." : ""))
          } catch (textError) {
            console.error("Failed to read response as text:", textError)
          }

          throw new Error("Failed to parse response as JSON")
        }
      } catch (error) {
        if (
          retries > 0 &&
          error instanceof Error &&
          (error.message.includes("429") ||
            error.message.includes("Too Many Requests") ||
            error.message.includes("rate limit"))
        ) {
          // If it's a rate limit error and we have retries left
          console.log(`Rate limited. Retrying in ${MIN_REQUEST_INTERVAL * 2}ms. Retries left: ${retries}`)
          await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL * 2))
          return makeRequestWithRetry(retries - 1)
        }
        throw error
      }
    }

    // Make the request with retries
    let data
    try {
      data = await makeRequestWithRetry(MAX_RETRIES)
    } catch (error) {
      console.error("Error fetching geocode data:", error)

      // Always return a JSON response, even for errors
      // Check if it's a rate limiting error
      if (
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("Too Many Requests") ||
          error.message.includes("rate limit"))
      ) {
        return NextResponse.json({ error: "Too Many Requests: Service temporarily unavailable" }, { status: 429 })
      }

      return NextResponse.json(
        { error: error instanceof Error ? error.message : "An unexpected error occurred" },
        { status: 500 },
      )
    }

    // Check if we got any results
    if (data.results && data.results.length > 0) {
      const result = data.results[0]

      // Validate the position data
      if (!result.position || typeof result.position.lon !== "number" || typeof result.position.lat !== "number") {
        console.error("Invalid position data in result:", result)
        return NextResponse.json({ error: "Invalid position data in geocoding result" }, { status: 500 })
      }

      // Validate coordinates
      if (!validateCoordinates(result.position.lon, result.position.lat)) {
        console.error(`Invalid coordinates: ${result.position.lon}, ${result.position.lat}`)
        return NextResponse.json(
          { error: `Invalid coordinates: ${result.position.lon}, ${result.position.lat}` },
          { status: 400 },
        )
      }

      // Determine appropriate zoom level based on entity type
      let zoom = 12 // Default for cities

      if (result.entityType === "Country") {
        zoom = 5
      } else if (result.entityType === "CountrySubdivision") {
        zoom = 7
      } else if (result.entityType === "Municipality") {
        zoom = 10
      } else if (result.entityType === "PostalCodeArea") {
        zoom = 11
      } else if (result.entityType === "Neighbourhood") {
        zoom = 14
      } else if (result.entityType === "Street") {
        zoom = 15
      } else if (result.entityType === "Address" || result.entityType === "POI") {
        zoom = 16
      }

      // Ensure we have a valid address object
      if (!result.address) {
        result.address = { freeformAddress: query }
      }

      // Create a location object with the geocoding result
      const location: Location = {
        name: result.address.freeformAddress || query,
        coordinates: [result.position.lon, result.position.lat],
        zoom,
        description: result.address.country
          ? `${result.address.freeformAddress || ""}, ${result.address.country}`
          : result.address.freeformAddress || query,
      }

      return NextResponse.json({ location })
    }

    // If no results were found, return null location
    return NextResponse.json({ location: null })
  } catch (error) {
    console.error("Unhandled error in geocode API:", error)

    // Always return a JSON response, even for unexpected errors
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 },
    )
  }
}

