"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Lock, Loader2 } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push("/settings")
    router.refresh()
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col items-center justify-center px-4">
      <div
        className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "var(--color-accent-subtle)" }}
      >
        <Lock size={24} style={{ color: "var(--color-accent)" }} />
      </div>

      <h1
        className="mb-1 text-lg font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Admin Login
      </h1>
      <p
        className="mb-6 text-[13px]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        Sign in to access settings and admin controls
      </p>

      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="card w-full px-4 py-3 text-[15px] outline-none placeholder:text-[var(--color-text-tertiary)]"
          style={{ color: "var(--color-text-primary)" }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="card w-full px-4 py-3 text-[15px] outline-none placeholder:text-[var(--color-text-tertiary)]"
          style={{ color: "var(--color-text-primary)" }}
        />

        {error && (
          <p className="text-[13px]" style={{ color: "var(--color-error)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold transition-colors"
          style={{
            background: "var(--color-accent)",
            color: "var(--color-bg)",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  )
}
