"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Home, BookOpen, Settings, LogIn, LogOut } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { isAdmin, loading } = useAuth()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <nav
      className="glass fixed right-0 bottom-0 left-0 z-40 border-t"
      style={{
        borderColor: "var(--color-border-subtle)",
        paddingBottom: "var(--sab, 0px)",
      }}
    >
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-around px-2">
        {/* Feed */}
        <Link
          href="/"
          className="flex min-w-[56px] flex-col items-center gap-0.5 py-1"
          style={{
            color: pathname === "/" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
            transition: "color 150ms ease",
          }}
        >
          <div className="relative">
            <Home size={20} strokeWidth={pathname === "/" ? 2.2 : 1.8} />
            {pathname === "/" && (
              <div
                className="absolute -top-1.5 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full"
                style={{ background: "var(--color-accent)" }}
              />
            )}
          </div>
          <span className="text-[10px] font-medium">Feed</span>
        </Link>

        {/* Digest */}
        <Link
          href="/digest"
          className="flex min-w-[56px] flex-col items-center gap-0.5 py-1"
          style={{
            color: pathname.startsWith("/digest") ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
            transition: "color 150ms ease",
          }}
        >
          <div className="relative">
            <BookOpen size={20} strokeWidth={pathname.startsWith("/digest") ? 2.2 : 1.8} />
            {pathname.startsWith("/digest") && (
              <div
                className="absolute -top-1.5 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full"
                style={{ background: "var(--color-accent)" }}
              />
            )}
          </div>
          <span className="text-[10px] font-medium">Digest</span>
        </Link>

        {/* Settings — only when logged in */}
        {isAdmin && (
          <Link
            href="/settings"
            className="flex min-w-[56px] flex-col items-center gap-0.5 py-1"
            style={{
              color: pathname === "/settings" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
              transition: "color 150ms ease",
            }}
          >
            <div className="relative">
              <Settings size={20} strokeWidth={pathname === "/settings" ? 2.2 : 1.8} />
              {pathname === "/settings" && (
                <div
                  className="absolute -top-1.5 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full"
                  style={{ background: "var(--color-accent)" }}
                />
              )}
            </div>
            <span className="text-[10px] font-medium">Settings</span>
          </Link>
        )}

        {/* Login / Logout */}
        {!loading && (
          isAdmin ? (
            <button
              onClick={handleLogout}
              className="flex min-w-[56px] flex-col items-center gap-0.5 py-1"
              style={{ color: "var(--color-text-tertiary)", transition: "color 150ms ease" }}
            >
              <LogOut size={20} strokeWidth={1.8} />
              <span className="text-[10px] font-medium">Logout</span>
            </button>
          ) : (
            <Link
              href="/login"
              className="flex min-w-[56px] flex-col items-center gap-0.5 py-1"
              style={{
                color: pathname === "/login" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                transition: "color 150ms ease",
              }}
            >
              <div className="relative">
                <LogIn size={20} strokeWidth={pathname === "/login" ? 2.2 : 1.8} />
                {pathname === "/login" && (
                  <div
                    className="absolute -top-1.5 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full"
                    style={{ background: "var(--color-accent)" }}
                  />
                )}
              </div>
              <span className="text-[10px] font-medium">Login</span>
            </Link>
          )
        )}
      </div>
    </nav>
  )
}
