import type React from "react"
import "./globals.css"
import "./map.css"
import type { Metadata } from "next"
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Travel Assistant",
  description: "Your AI-powered travel companion",
  generator: "v0.dev",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className={`${inter.className} bg-[#f5f5f5]`}>{children}</body>
    </html>
  )
}



import './globals.css'