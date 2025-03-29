import { NextResponse } from "next/server"

export async function GET() {
  try {
    // Get the Azure Maps key from server environment
    const apiKey = process.env.AZURE_MAPS_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "Map service configuration error" }, { status: 500 })
    }

    // Return the authentication options
    return NextResponse.json({
      authOptions: {
        authType: "subscriptionKey",
        subscriptionKey: apiKey,
      },
    })
  } catch (error) {
    console.error("Error generating map authentication:", error)
    return NextResponse.json({ error: "Failed to generate map authentication" }, { status: 500 })
  }
}

