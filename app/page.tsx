"use client"

import { useState, useEffect, useRef } from "react"
import { sendMessage } from "@/lib/api"
import type { Message, Location } from "@/lib/types"
import dynamic from "next/dynamic"
import { defaultLocation } from "@/lib/locations"
import { detectAndGeocodeLocation } from "@/lib/geocoding"
import MapFallback from "@/components/map-fallback"

// Dynamically import the Map component with no SSR to avoid hydration issues
const Map = dynamic(() => import("@/components/map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center">Chargement de la carte...</div>
  ),
})

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Bonjour ! Où souhaitez-vous voyager ?" },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<Location>(defaultLocation)
  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const [isInputDisabled, setIsInputDisabled] = useState(false)
  const [useMapFallback, setUseMapFallback] = useState(false)
  const [isGeocodingLoading, setIsGeocodingLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMapRateLimited, setIsMapRateLimited] = useState(false)
  const [isChatRateLimited, setIsChatRateLimited] = useState(false)
  const [geocodingError, setGeocodingError] = useState<string | null>(null)
  const rateLimitTimerRef = useRef<NodeJS.Timeout | null>(null)
  const chatRateLimitTimerRef = useRef<NodeJS.Timeout | null>(null)
  const geocodingErrorTimerRef = useRef<NodeJS.Timeout | null>(null)
  const consecutiveErrorsRef = useRef(0)
  const geocodingErrorsRef = useRef(0)

  // Reset map rate limiting after a cooldown period
  const setMapRateLimitWithCooldown = (limited: boolean) => {
    setIsMapRateLimited(limited)

    // Clear any existing timer
    if (rateLimitTimerRef.current) {
      clearTimeout(rateLimitTimerRef.current)
      rateLimitTimerRef.current = null
    }

    // Set a new timer if we're rate limited
    if (limited) {
      rateLimitTimerRef.current = setTimeout(() => {
        setIsMapRateLimited(false)
      }, 60000) // 1 minute cooldown
    }
  }

  // Reset chat rate limiting after a cooldown period
  const setChatRateLimitWithCooldown = (limited: boolean) => {
    setIsChatRateLimited(limited)

    // Clear any existing timer
    if (chatRateLimitTimerRef.current) {
      clearTimeout(chatRateLimitTimerRef.current)
      chatRateLimitTimerRef.current = null
    }

    // Set a new timer if we're rate limited
    if (limited) {
      chatRateLimitTimerRef.current = setTimeout(() => {
        setIsChatRateLimited(false)
      }, 60000) // 1 minute cooldown
    }
  }

  // Set geocoding error with auto-clear
  const setGeocodingErrorWithTimeout = (errorMessage: string | null) => {
    setGeocodingError(errorMessage)

    // Clear any existing timer
    if (geocodingErrorTimerRef.current) {
      clearTimeout(geocodingErrorTimerRef.current)
      geocodingErrorTimerRef.current = null
    }

    // Set a new timer if we have an error
    if (errorMessage) {
      geocodingErrorTimerRef.current = setTimeout(() => {
        setGeocodingError(null)
      }, 10000) // 10 second display
    }
  }

  // Clean up the timers on unmount
  useEffect(() => {
    return () => {
      if (rateLimitTimerRef.current) {
        clearTimeout(rateLimitTimerRef.current)
      }
      if (chatRateLimitTimerRef.current) {
        clearTimeout(chatRateLimitTimerRef.current)
      }
      if (geocodingErrorTimerRef.current) {
        clearTimeout(geocodingErrorTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }, [messages])

  const handleSendMessage = async () => {
    if (!input.trim()) return

    // Reset error state
    setError(null)
    setGeocodingErrorWithTimeout(null)

    // Add user message to chat
    const userMessage = { role: "user", content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)
    setIsGeocodingLoading(true)

    try {
      // Try to extract and geocode location from user message if not rate limited
      let detectedLocation = null
      if (!isMapRateLimited) {
        try {
          detectedLocation = await detectAndGeocodeLocation(input)
          if (detectedLocation) {
            setCurrentLocation(detectedLocation)
            // Reset consecutive errors counter on success
            geocodingErrorsRef.current = 0
          }
        } catch (geocodeError: any) {
          console.error("Error during geocoding:", geocodeError)

          // Check if it's a rate limiting error
          if (
            geocodeError instanceof Error &&
            (geocodeError.message.includes("Too Many Requests") ||
              geocodeError.message.includes("429") ||
              geocodeError.message.includes("rate limit"))
          ) {
            setMapRateLimitWithCooldown(true)
            console.log("Map rate limited, setting cooldown timer")
          } else {
            // For other errors, increment the counter and show a message
            geocodingErrorsRef.current += 1

            // Only show the error if we've had multiple failures
            if (geocodingErrorsRef.current >= 2) {
              setGeocodingErrorWithTimeout(
                geocodeError instanceof Error ? geocodeError.message : "Erreur lors de la recherche du lieu",
              )
            }
          }

          // Continue with the chat even if geocoding fails
        }
      }

      setIsGeocodingLoading(false)

      // If chat is rate limited, add a message and return early
      if (isChatRateLimited) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Je suis désolé, mais le service est temporairement surchargé. Veuillez réessayer dans quelques instants.",
          },
        ])
        setIsLoading(false)
        return
      }

      // Send message to API with exponential backoff for rate limiting
      const response = await sendMessage([...messages, userMessage])

      // Check if the response indicates rate limiting
      if (
        response.reply.includes("trop de demandes") ||
        response.reply.includes("surchargé") ||
        response.reply.includes("réessayer dans quelques instants")
      ) {
        // Increment consecutive errors counter
        consecutiveErrorsRef.current += 1

        // If we've seen multiple rate limiting messages in a row, set the rate limit flag
        if (consecutiveErrorsRef.current >= 2) {
          setChatRateLimitWithCooldown(true)
          console.log("Chat rate limited, setting cooldown timer")
        }
      } else {
        // Reset consecutive errors counter on success
        consecutiveErrorsRef.current = 0
      }

      // Add assistant response to chat
      if (response && response.reply) {
        const assistantMessage = { role: "assistant", content: response.reply }
        setMessages((prev) => [...prev, assistantMessage])

        // Also check the AI response for locations if we didn't find one in the user message
        // and we're not rate limited
        if (!detectedLocation && !isMapRateLimited) {
          setIsGeocodingLoading(true)
          try {
            const locationFromResponse = await detectAndGeocodeLocation(response.reply)
            if (locationFromResponse) {
              setCurrentLocation(locationFromResponse)
              // Reset geocoding errors on success
              geocodingErrorsRef.current = 0
            }
          } catch (geocodeError: any) {
            console.error("Error during response geocoding:", geocodeError)

            // Check if it's a rate limiting error
            if (
              geocodeError instanceof Error &&
              (geocodeError.message.includes("Too Many Requests") ||
                geocodeError.message.includes("429") ||
                geocodeError.message.includes("rate limit"))
            ) {
              setMapRateLimitWithCooldown(true)
              console.log("Map rate limited, setting cooldown timer")
            } else {
              // For other errors, increment the counter but don't show a message
              // for errors from the AI response (less important)
              geocodingErrorsRef.current += 1
            }
          } finally {
            setIsGeocodingLoading(false)
          }
        }
      } else {
        throw new Error("No valid reply received from API")
      }
    } catch (error: any) {
      console.error("Error sending message:", error)
      setError(error.message || "Une erreur s'est produite")

      // Check if it's a rate limiting error
      if (
        error.message &&
        (error.message.includes("Too Many Requests") ||
          error.message.includes("429") ||
          error.message.includes("rate limit"))
      ) {
        setChatRateLimitWithCooldown(true)
        console.log("Chat rate limited, setting cooldown timer")

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Je suis désolé, mais le service est temporairement surchargé. Veuillez réessayer dans quelques instants.",
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Désolé, une erreur s'est produite. Veuillez réessayer dans quelques instants.",
          },
        ])
      }
    } finally {
      setIsLoading(false)
      setIsGeocodingLoading(false)
    }
  }

  // Calculate if we should show a rate limit warning
  const showRateLimitWarning = isMapRateLimited || isChatRateLimited

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-center text-3xl font-bold text-[#2a5885] mb-8 flex items-center justify-center gap-2">
        <span className="text-4xl">🌍</span> Travel Assistant
      </h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-md">
          <p>Erreur: {error}</p>
        </div>
      )}

      {geocodingError && (
        <div className="mb-4 p-3 bg-orange-100 border border-orange-300 text-orange-700 rounded-md">
          <p>Erreur de géocodage: {geocodingError}</p>
        </div>
      )}

      {showRateLimitWarning && (
        <div className="mb-4 p-3 bg-amber-100 border border-amber-300 text-amber-700 rounded-md">
          <p>
            <strong>Avis:</strong>{" "}
            {isMapRateLimited && isChatRateLimited
              ? "Les services de géocodage et de chat sont temporairement indisponibles en raison d'un trop grand nombre de requêtes."
              : isMapRateLimited
                ? "Le service de géocodage est temporairement indisponible en raison d'un trop grand nombre de requêtes."
                : "Le service de chat est temporairement indisponible en raison d'un trop grand nombre de requêtes."}{" "}
            Veuillez patienter quelques minutes.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chat Container */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col h-[500px]">
          <div className="bg-[#2a5885] text-white p-4 text-center">
            <h2 className="text-xl font-semibold">Assistant Voyage</h2>
          </div>

          <div ref={chatMessagesRef} className="flex-1 p-4 overflow-y-auto">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`mb-3 p-3 rounded-2xl max-w-[80%] ${
                  message.role === "assistant"
                    ? "bg-[#e3f2fd] self-start mr-auto"
                    : "bg-[#2a5885] text-white self-end ml-auto"
                }`}
              >
                {message.content}
              </div>
            ))}
            {isLoading && (
              <div className="bg-[#e3f2fd] self-start p-3 rounded-2xl max-w-[80%]">
                <div className="flex gap-1">
                  <div
                    className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-gray-200 flex">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isLoading && !isInputDisabled) {
                  e.preventDefault()
                  handleSendMessage()
                  setIsInputDisabled(true)
                  setTimeout(() => setIsInputDisabled(false), 2000) // Disable for 2 seconds
                }
              }}
              placeholder="Poser une question..."
              disabled={isLoading || isInputDisabled}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#2a5885] disabled:opacity-50"
            />
            <button
              onClick={() => {
                if (!isLoading && !isInputDisabled) {
                  handleSendMessage()
                  setIsInputDisabled(true)
                  setTimeout(() => setIsInputDisabled(false), 2000) // Disable for 2 seconds
                }
              }}
              disabled={isLoading || isInputDisabled || !input.trim()}
              className="ml-2 px-5 py-2 bg-[#2a5885] text-white rounded-full hover:bg-[#1e4060] transition-colors disabled:opacity-50"
            >
              Envoyer
            </button>
          </div>
        </div>

        {/* Map Container */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden h-[500px] relative">
          {useMapFallback ? (
            <MapFallback location={currentLocation} />
          ) : (
            <Map location={currentLocation} onError={() => setUseMapFallback(true)} />
          )}

          {/* Geocoding loading indicator */}
          {isGeocodingLoading && (
            <div className="absolute top-4 right-4 bg-white px-3 py-2 rounded-lg shadow-md z-10 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
              <span className="text-sm">Recherche du lieu...</span>
            </div>
          )}

          {/* Rate limiting indicators */}
          {isMapRateLimited && !isGeocodingLoading && (
            <div className="absolute top-4 right-4 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg shadow-md z-10">
              <p className="text-sm text-amber-600">Service de carte limité</p>
            </div>
          )}

          {isChatRateLimited && (
            <div className="absolute top-16 right-4 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg shadow-md z-10">
              <p className="text-sm text-amber-600">Service de chat limité</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

