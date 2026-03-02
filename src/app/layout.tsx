import type { Metadata, Viewport } from "next"
import "./globals.css"
import { AppShell } from "@/components/layout/app-shell"

export const metadata: Metadata = {
  title: "Bookmarks",
  description: "Smart Twitter bookmarks with AI search and digests",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bookmarks",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0c0e",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
