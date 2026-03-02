"use client"

import { usePathname } from "next/navigation"
import { BottomNav } from "./bottom-nav"
import { TopBar } from "./top-bar"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isDigestDetail = pathname.startsWith("/digest/") && pathname !== "/digest"

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: "var(--color-bg)" }}>
      {!isDigestDetail && <TopBar />}
      <main
        className="flex-1 pb-20"
        style={{ paddingTop: isDigestDetail ? "0" : "calc(52px + var(--sat, 0px))" }}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
