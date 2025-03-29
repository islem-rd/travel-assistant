import { NextResponse } from "next/server"
import type { Message } from "@/lib/types"

// Retry configuration
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second
const MAX_RETRY_DELAY = 10000 // 10 seconds maximum delay

// Rate limiting configuration
let lastOpenAIRequestTime = 0
const MIN_OPENAI_REQUEST_INTERVAL = 1000 // 1 second between requests

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES, delay = INITIAL_RETRY_DELAY) {
  try {
    // Implement rate limiting for OpenAI requests
    const now = Date.now()
    const timeSinceLastRequest = now - lastOpenAIRequestTime

    if (timeSinceLastRequest < MIN_OPENAI_REQUEST_INTERVAL) {
      // Wait until we can make another request
      await new Promise((resolve) => setTimeout(resolve, MIN_OPENAI_REQUEST_INTERVAL - timeSinceLastRequest))
    }

    // Update the last request time
    lastOpenAIRequestTime = Date.now()

    const response = await fetch(url, options)

    // If we get a 429 (Too Many Requests) and have retries left
    if (response.status === 429 && retries > 0) {
      console.log(`Rate limited by OpenAI. Retrying in ${delay}ms. Retries left: ${retries}`)

      // Wait for the specified delay
      await new Promise((resolve) => setTimeout(resolve, delay))

      // Retry with exponential backoff (double the delay for next retry, but cap it)
      return fetchWithRetry(url, options, retries - 1, Math.min(delay * 2, MAX_RETRY_DELAY))
    }

    return response
  } catch (error) {
    if (retries > 0) {
      console.log(`Request failed. Retrying in ${delay}ms. Retries left: ${retries}`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return fetchWithRetry(url, options, retries - 1, Math.min(delay * 2, MAX_RETRY_DELAY))
    }
    throw error
  }
}

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages: Message[] }

    // Validate environment variables
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT
    const key = process.env.AZURE_OPENAI_KEY
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT

    if (!endpoint || !key || !deployment) {
      console.error("Missing Azure OpenAI configuration")
      return NextResponse.json({ error: "Service configuration error" }, { status: 500 })
    }

    // Add system message if not present
    const systemMessage: Message = {
      role: "system",
      content:
        "Tu es un expert en voyages. Réponds de manière concise et utile en français. Limite tes réponses à 100 mots maximum.",
    }

    const messagesWithSystem = messages.some((m) => m.role === "system") ? messages : [systemMessage, ...messages]

    // Keep only the last 5 messages to reduce token usage
    const recentMessages = messagesWithSystem.slice(-5)

    // Call Azure OpenAI API with retry logic
    const response = await fetchWithRetry(
      `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2023-05-15`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": key,
        },
        body: JSON.stringify({
          messages: recentMessages,
          max_tokens: 150, // Reduced from 800 to limit token usage
          temperature: 0.7,
        }),
      },
    )

    // Handle non-OK responses
    if (!response.ok) {
      // Try to get the error details
      let errorMessage = `Error ${response.status}: ${response.statusText}`
      let errorData: any = null

      try {
        // Try to parse the error response as JSON
        errorData = await response.json()
        console.error("Azure OpenAI API error:", errorData)

        // If it's a rate limit error (429)
        if (response.status === 429) {
          return NextResponse.json(
            {
              reply:
                "Je suis désolé, mais je reçois trop de demandes en ce moment. Veuillez réessayer dans quelques instants.",
            },
            { status: 200 }, // Return 200 to the client with a friendly message
          )
        }
      } catch (jsonError) {
        // If JSON parsing fails, try to get the error as text
        try {
          const errorText = await response.text()
          errorMessage = `Error ${response.status}: ${errorText}`
          console.error("Azure OpenAI API error (text):", errorMessage)
        } catch (textError) {
          // If even text reading fails, just use the status
          console.error("Azure OpenAI API error (status only):", response.status, response.statusText)
        }
      }

      // Return a user-friendly error message
      return NextResponse.json(
        {
          reply:
            "Je suis désolé, mais je rencontre des difficultés à traiter votre demande. Veuillez réessayer dans quelques instants.",
        },
        { status: 200 }, // Return 200 to the client with a friendly message
      )
    }

    // Parse the successful response
    let data
    try {
      data = await response.json()
    } catch (jsonError) {
      console.error("Error parsing OpenAI response:", jsonError)
      return NextResponse.json(
        {
          reply: "Je suis désolé, j'ai reçu une réponse que je ne peux pas interpréter. Veuillez réessayer.",
        },
        { status: 200 },
      )
    }

    // Add proper null/undefined checks
    if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error("Invalid response format from Azure OpenAI:", data)
      return NextResponse.json(
        {
          reply: "Je suis désolé, j'ai reçu une réponse invalide. Veuillez réessayer.",
        },
        { status: 200 }, // Return 200 to the client with a friendly message
      )
    }

    // Check if the first choice has a message with content
    if (!data.choices[0].message || typeof data.choices[0].message.content !== "string") {
      console.error("Invalid message format in Azure OpenAI response:", data.choices[0])
      return NextResponse.json(
        {
          reply: "Je suis désolé, j'ai reçu une réponse dans un format inattendu. Veuillez réessayer.",
        },
        { status: 200 },
      )
    }

    return NextResponse.json({ reply: data.choices[0].message.content })
  } catch (error) {
    console.error("Error processing request:", error)
    return NextResponse.json(
      {
        reply: "Je suis désolé, une erreur s'est produite. Veuillez réessayer dans quelques instants.",
      },
      { status: 200 }, // Return 200 to the client with a friendly message
    )
  }
}

