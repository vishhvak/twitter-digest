"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, BookOpen, Settings } from "lucide-react"

const navItems = [
  { href: "/", label: "Feed", icon: Home },
  { href: "/digest", label: "Digest", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="glass fixed right-0 bottom-0 left-0 z-40 border-t"
      style={{
        borderColor: "var(--color-border-subtle)",
        paddingBottom: "var(--sab, 0px)",
      }}
    >
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-around px-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex min-w-[56px] flex-col items-center gap-0.5 py-1"
              style={{
                color: isActive
                  ? "var(--color-text-primary)"
                  : "var(--color-text-tertiary)",
                transition: "color 150ms ease",
              }}
            >
              <div className="relative">
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                {isActive && (
                  <div
                    className="absolute -top-1.5 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full"
                    style={{ background: "var(--color-accent)" }}
                  />
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
