import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    // Get URL parameters
    const url = new URL(request.url)
    const longitude = Number.parseFloat(url.searchParams.get("longitude") || "0")
    const latitude = Number.parseFloat(url.searchParams.get("latitude") || "0")
    const zoom = Number.parseInt(url.searchParams.get("zoom") || "10")

    // Validate coordinates
    if (isNaN(longitude) || isNaN(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 })
    }

    // Validate zoom
    if (isNaN(zoom) || zoom < 1 || zoom > 20) {
      return NextResponse.json({ error: "Invalid zoom level" }, { status: 400 })
    }

    // Get the Azure Maps key from server environment
    const apiKey = process.env.AZURE_MAPS_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "Map service configuration error" }, { status: 500 })
    }

    // Create a static map URL using Azure Maps REST API
    const mapUrl = `https://atlas.microsoft.com/map/static/png?api-version=1.0&layer=basic&style=main&zoom=${zoom}&center=${longitude},${latitude}&width=800&height=500&subscription-key=${apiKey}`

    // Return the URL
    return NextResponse.json({ url: mapUrl })
  } catch (error) {
    console.error("Error generating static map URL:", error)
    return NextResponse.json({ error: "Failed to generate map URL" }, { status: 500 })
  }
}

