"use client"

import { useEffect, useRef, useState } from "react"
import { useScript } from "@/hooks/use-script"
import type { Location } from "@/lib/types"
import Image from "next/image"

interface MapProps {
  location: Location
  onError?: () => void
}

export default function Map({ location, onError }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [errorDetails, setErrorDetails] = useState<string>("")
  const [staticMapUrl, setStaticMapUrl] = useState("")
  const [isRateLimited, setIsRateLimited] = useState(false)
  const lastRequestTimeRef = useRef<number>(0)
  const MIN_REQUEST_INTERVAL = 2000 // 2 seconds between requests

  // Load the Azure Maps SDK
  const status = useScript("https://atlas.microsoft.com/sdk/javascript/mapcontrol/2/atlas.min.js")

  // Generate a static map URL as fallback via server API
  useEffect(() => {
    const generateStaticMap = async () => {
      try {
        const zoom = location.zoom || 10 // Default zoom if not provided
        const [longitude, latitude] = location.coordinates || [0, 0] // Default to 0,0 if not provided

        // Validate coordinates
        if (
          isNaN(longitude) ||
          isNaN(latitude) ||
          longitude < -180 ||
          longitude > 180 ||
          latitude < -90 ||
          latitude > 90
        ) {
          console.error("Invalid coordinates:", longitude, latitude)
          setErrorDetails(`Coordonnées invalides: ${longitude}, ${latitude}`)
          setHasError(true)
          if (onError) onError()
          return
        }

        // Implement client-side rate limiting for static map requests
        const now = Date.now()
        const timeSinceLastRequest = now - lastRequestTimeRef.current

        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
          // Wait until we can make another request
          await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
        }

        // Update the last request time
        lastRequestTimeRef.current = Date.now()

        // Get the static map URL from our API route
        const response = await fetch(`/api/static-map?longitude=${longitude}&latitude=${latitude}&zoom=${zoom}`)

        if (response.status === 429) {
          console.log("Static map API is rate limited")
          setIsRateLimited(true)
          setErrorDetails("Service temporairement indisponible (trop de requêtes)")
          setHasError(true)
          if (onError) onError()
          return
        }

        if (!response.ok) {
          throw new Error(`Failed to get static map URL: ${response.status}`)
        }

        const data = await response.json()

        if (!data.url) {
          throw new Error("No URL returned from static map API")
        }

        setStaticMapUrl(data.url)
      } catch (error) {
        console.error("Error generating static map:", error)
        setHasError(true)
        if (onError) onError()
      }
    }

    generateStaticMap()
  }, [location, onError])

  // Initialize or update the map
  useEffect(() => {
    // If script failed to load or we already have an error, don't try to initialize
    if (status === "error" || hasError || isRateLimited) {
      console.error("Azure Maps SDK failed to load or previous error occurred:", errorDetails)
      setHasError(true)
      setIsLoading(false)
      if (onError) onError()
      return
    }

    // Wait for the script to be ready and the DOM element to exist
    if (status !== "ready" || !mapRef.current) {
      return
    }

    const initializeMap = async () => {
      try {
        setIsLoading(true)

        // Get the atlas namespace from window
        const atlas = (window as any).atlas
        if (!atlas) {
          throw new Error("Azure Maps SDK not available")
        }

        // Validate coordinates
        const [longitude, latitude] = location.coordinates
        if (
          isNaN(longitude) ||
          isNaN(latitude) ||
          longitude < -180 ||
          longitude > 180 ||
          latitude < -90 ||
          latitude > 90
        ) {
          throw new Error(`Invalid coordinates: ${longitude}, ${latitude}`)
        }

        // Implement client-side rate limiting for map initialization
        const now = Date.now()
        const timeSinceLastRequest = now - lastRequestTimeRef.current

        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
          // Wait until we can make another request
          await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
        }

        // Update the last request time
        lastRequestTimeRef.current = Date.now()

        // If map is already initialized, dispose it to prevent issues
        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.dispose()
            mapInstanceRef.current = null
          } catch (disposeError) {
            console.error("Error disposing map:", disposeError)
            // Continue even if dispose fails
          }
        }

        // Get authentication token from server
        const authResponse = await fetch("/api/map-auth")
        if (!authResponse.ok) {
          throw new Error(`Failed to get map authentication: ${authResponse.status}`)
        }

        const authData = await authResponse.json()

        if (!authData.authOptions) {
          throw new Error("No authentication options returned from server")
        }

        // Initialize the map with minimal options
        const mapOptions = {
          center: location.coordinates,
          zoom: location.zoom || 10,
          authOptions: authData.authOptions,
          showFeedbackLink: false,
          showLogo: false,
        }

        console.log(
          "Initializing map with options:",
          JSON.stringify({
            center: mapOptions.center,
            zoom: mapOptions.zoom,
          }),
        )

        const map = new atlas.Map(mapRef.current, mapOptions)

        // Wait for the map to load
        map.events.add("ready", () => {
          console.log("Map is ready")

          // Add a simple pin at the location
          try {
            // Only add marker if map is still mounted
            if (mapRef.current) {
              const marker = new atlas.HtmlMarker({
                position: location.coordinates,
              })
              map.markers.add(marker)
            }
          } catch (markerError) {
            console.error("Error adding marker:", markerError)
            // Continue even if marker fails
          }

          setIsLoading(false)
        })

        // Handle map errors with better logging
        map.events.add("error", (e: any) => {
          // Try to extract error message, handling both object and string formats
          let errorMessage = "Unknown error"

          try {
            if (typeof e === "string") {
              errorMessage = e
            } else if (e && e.error) {
              if (typeof e.error === "string") {
                errorMessage = e.error
              } else if (typeof e.error.message === "string") {
                errorMessage = e.error.message
              } else {
                errorMessage = JSON.stringify(e.error)
              }
            } else if (e && typeof e.message === "string") {
              errorMessage = e.message
            } else {
              errorMessage = JSON.stringify(e)
            }
          } catch (parseError) {
            errorMessage = "Error parsing error message"
            console.error("Error parsing Azure Maps error:", parseError)
          }

          // Check for rate limiting errors
          if (
            errorMessage.includes("Too Many Requests") ||
            errorMessage.includes("429") ||
            errorMessage.includes("rate limit")
          ) {
            setIsRateLimited(true)
            errorMessage = "Service temporairement indisponible (trop de requêtes)"
          }

          console.error("Azure Maps error:", errorMessage)
          setErrorDetails(`Erreur de carte: ${errorMessage}`)
          setHasError(true)
          setIsLoading(false)
          if (onError) onError()
        })

        // Store the map instance
        mapInstanceRef.current = map
      } catch (error: any) {
        const errorMessage = error?.message || "Unknown error"
        console.error("Error initializing map:", errorMessage, error)

        // Check for rate limiting errors in the caught exception
        if (
          errorMessage.includes("Too Many Requests") ||
          errorMessage.includes("429") ||
          errorMessage.includes("rate limit")
        ) {
          setIsRateLimited(true)
          setErrorDetails("Service temporairement indisponible (trop de requêtes)")
        } else {
          setErrorDetails(`Erreur d'initialisation: ${errorMessage}`)
        }

        setHasError(true)
        setIsLoading(false)
        if (onError) onError()
      }
    }

    initializeMap()

    // Cleanup function
    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.dispose()
          mapInstanceRef.current = null
        } catch (error) {
          console.error("Error disposing map:", error)
        }
      }
    }
  }, [status, location, hasError, errorDetails, isRateLimited, onError])

  // If we have an error, are rate limited, or the SDK failed to load, show the static map or error message
  if (hasError || isRateLimited || status === "error") {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-gray-100">
        {staticMapUrl && !isRateLimited ? (
          <div className="relative w-full h-full">
            <Image
              src={staticMapUrl || "/placeholder.svg"}
              alt={`Carte de ${location.name}`}
              fill
              style={{ objectFit: "cover" }}
              onError={() => {
                console.error("Static map image failed to load")
                setStaticMapUrl("")
              }}
            />
            <div className="absolute top-4 left-4 bg-white px-3 py-2 rounded-lg shadow-md">
              <h3 className="font-semibold">{location.name}</h3>
              {location.description && <p className="text-sm text-gray-600 mt-1">{location.description}</p>}
            </div>
          </div>
        ) : (
          <div className="text-center p-4">
            <div className="text-6xl mb-4">🗺️</div>
            <h3 className="text-xl font-semibold mb-2">{location.name}</h3>
            <p className="text-gray-600">Carte non disponible</p>
            {errorDetails && <p className="text-red-500 text-sm mt-2">{errorDetails}</p>}
            {isRateLimited && (
              <p className="text-amber-600 text-sm mt-2">
                Trop de requêtes ont été envoyées. Veuillez réessayer dans quelques instants.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      {/* Map container */}
      <div ref={mapRef} className="w-full h-full" />

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-70">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p>Chargement de la carte...</p>
          </div>
        </div>
      )}

      {/* Location info overlay */}
      <div className="absolute top-4 left-4 bg-white px-3 py-2 rounded-lg shadow-md z-10">
        <h3 className="font-semibold">{location.name}</h3>
        {location.description && <p className="text-sm text-gray-600 mt-1">{location.description}</p>}
      </div>
    </div>
  )
}

