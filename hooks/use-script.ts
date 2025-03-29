"use client"

import { useState, useEffect } from "react"

type ScriptStatus = "idle" | "loading" | "ready" | "error"

export function useScript(src: string): ScriptStatus {
  const [status, setStatus] = useState<ScriptStatus>(src ? "loading" : "idle")

  useEffect(() => {
    if (!src) {
      setStatus("idle")
      return
    }

    // Prevent duplicate script loading
    let script = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement

    if (!script) {
      // Create script element
      script = document.createElement("script")
      script.src = src
      script.async = true
      script.setAttribute("data-status", "loading")

      // Add error handling
      const handleError = () => {
        script.setAttribute("data-status", "error")
        setStatus("error")
      }

      // Add load handling
      const handleLoad = () => {
        script.setAttribute("data-status", "ready")
        setStatus("ready")
      }

      script.addEventListener("error", handleError)
      script.addEventListener("load", handleLoad)

      // Add script to document
      document.body.appendChild(script)

      // Clean up event listeners on unmount
      return () => {
        script.removeEventListener("error", handleError)
        script.removeEventListener("load", handleLoad)
      }
    } else {
      // Script already exists, set status based on its data attribute
      const status = script.getAttribute("data-status") as ScriptStatus
      setStatus(status || "loading")
    }
  }, [src])

  return status
}

