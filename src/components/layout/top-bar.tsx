"use client"

import { Bookmark } from "lucide-react"

export function TopBar() {
  return (
    <header
      className="glass fixed top-0 right-0 left-0 z-40 border-b"
      style={{
        borderColor: "var(--color-border-subtle)",
        paddingTop: "var(--sat, 0px)",
      }}
    >
      <div className="mx-auto flex h-[52px] max-w-2xl items-center px-4">
        <div className="flex items-center gap-2">
          <Bookmark
            size={18}
            style={{ color: "var(--color-accent)" }}
            fill="currentColor"
          />
          <h1
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            Bookmarks
          </h1>
        </div>
      </div>
    </header>
  )
}
