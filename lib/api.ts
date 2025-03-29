import type { Message } from "./types"

// Track the last request time to implement client-side rate limiting
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 2000 // 2 seconds between requests
const MAX_RETRIES = 2
const INITIAL_RETRY_DELAY = 2000 // 2 seconds

export async function sendMessage(messages: Message[], retries = MAX_RETRIES, delay = INITIAL_RETRY_DELAY) {
  try {
    // Implement client-side rate limiting
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      // Wait until we can make another request
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
    }

    // Update the last request time
    lastRequestTime = Date.now()

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    })

    // Check for rate limiting response
    if (response.status === 429 && retries > 0) {
      console.log(`Rate limited. Retrying in ${delay}ms. Retries left: ${retries}`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return sendMessage(messages, retries - 1, delay * 2)
    }

    if (!response.ok) {
      // If we get a non-200 response, try to parse the error
      let errorMessage = `HTTP error! status: ${response.status}`

      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
      } catch (jsonError) {
        // If JSON parsing fails, try to get the error as text
        try {
          const errorText = await response.text()
          errorMessage = errorText || errorMessage
        } catch (textError) {
          // If even text reading fails, just use the status
        }
      }

      throw new Error(errorMessage)
    }

    // Parse the response
    let data
    try {
      data = await response.json()
    } catch (jsonError) {
      console.error("Error parsing API response:", jsonError)
      return {
        reply: "Je suis désolé, une erreur s'est produite lors du traitement de la réponse. Veuillez réessayer.",
      }
    }

    // Validate the response format
    if (!data || typeof data.reply !== "string") {
      console.error("Invalid response format from API:", data)
      return {
        reply: "Je suis désolé, une erreur s'est produite lors du traitement de la réponse. Veuillez réessayer.",
      }
    }

    return data
  } catch (error) {
    console.error("API error:", error)

    // Check if it's a rate limiting error
    if (
      error instanceof Error &&
      (error.message.includes("429") ||
        error.message.includes("Too Many Requests") ||
        error.message.includes("rate limit"))
    ) {
      // If we have retries left, try again after a delay
      if (retries > 0) {
        console.log(`Rate limited. Retrying in ${delay}ms. Retries left: ${retries}`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        return sendMessage(messages, retries - 1, delay * 2)
      }

      // If we're out of retries, return a friendly message
      return {
        reply:
          "Je suis désolé, mais le service est temporairement surchargé. Veuillez réessayer dans quelques instants.",
      }
    }

    // Return a user-friendly error message
    return {
      reply: "Je suis désolé, une erreur s'est produite. Veuillez réessayer dans quelques instants.",
    }
  }
}

