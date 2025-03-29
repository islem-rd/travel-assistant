"use client"

import { useState, useEffect } from "react"
import type { Location } from "@/lib/types"
import Image from "next/image"

interface MapFallbackProps {
  location: Location
}

export default function MapFallback({ location }: MapFallbackProps) {
  const [imageError, setImageError] = useState(false)
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [mapUrl, setMapUrl] = useState<string>("")

  useEffect(() => {
    const fetchMapUrl = async () => {
      try {
        const [longitude, latitude] = location.coordinates
        const zoom = location.zoom || 10

        // Validate coordinates
        const validCoordinates =
          !isNaN(longitude) &&
          !isNaN(latitude) &&
          longitude >= -180 &&
          longitude <= 180 &&
          latitude >= -90 &&
          latitude <= 90

        if (!validCoordinates) {
          setImageError(true)
          return
        }

        // Try to get Azure Maps static image URL from our API
        try {
          const response = await fetch(`/api/static-map?longitude=${longitude}&latitude=${latitude}&zoom=${zoom}`)

          if (response.status === 429) {
            // If rate limited, use OpenStreetMap instead
            console.log("Static map API is rate limited, using OpenStreetMap")
            const osmUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=${zoom}&size=600x400&maptype=mapnik&markers=${latitude},${longitude},red-pushpin`
            setMapUrl(osmUrl)
            return
          }

          if (!response.ok) {
            throw new Error(`Failed to get static map URL: ${response.status}`)
          }

          const data = await response.json()

          if (!data.url) {
            throw new Error("No URL returned from static map API")
          }

          setMapUrl(data.url)
        } catch (error) {
          console.error("Error fetching Azure Maps static image:", error)
          // Fallback to OpenStreetMap
          const osmUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=${zoom}&size=600x400&maptype=mapnik&markers=${latitude},${longitude},red-pushpin`
          setMapUrl(osmUrl)
        }
      } catch (error) {
        console.error("Error setting up map:", error)
        setImageError(true)
      }
    }

    fetchMapUrl()
  }, [location])

  // If we have invalid coordinates or an image error, show an error message
  if (imageError || isRateLimited) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 p-4">
        <div className="text-6xl mb-4">🗺️</div>
        <h3 className="text-xl font-semibold mb-2">{location.name}</h3>
        <p className="text-gray-600 text-center">
          {isRateLimited ? "Service de carte temporairement indisponible (trop de requêtes)" : "Carte non disponible"}
        </p>
        {location.description && (
          <p className="text-sm text-gray-500 mt-4 text-center max-w-md">{location.description}</p>
        )}
      </div>
    )
  }

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="relative flex-1">
        {mapUrl ? (
          <Image
            src={mapUrl || "/placeholder.svg"}
            alt={`Carte de ${location.name}`}
            fill
            style={{ objectFit: "cover" }}
            onError={() => {
              console.error("Fallback map image failed to load")
              setImageError(true)
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        )}
      </div>
      <div className="bg-white p-4 border-t border-gray-200">
        <h3 className="font-semibold text-lg">{location.name}</h3>
        {location.description && <p className="text-gray-600 mt-1">{location.description}</p>}
      </div>
    </div>
  )
}

