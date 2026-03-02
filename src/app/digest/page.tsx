"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { BookOpen, Calendar, ChevronRight, Loader2 } from "lucide-react"
import { Digest } from "@/lib/supabase/types"

export default function DigestListPage() {
  const [digests, setDigests] = useState<Digest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/digests?limit=20")
      .then((r) => r.json())
      .then((data) => setDigests(data.digests || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <h2
        className="mb-4 text-lg font-semibold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Digests
      </h2>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card px-4 py-4">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton mt-2 h-3 w-48" />
            </div>
          ))}
        </div>
      )}

      {!loading && digests.length === 0 && (
        <div className="flex flex-col items-center py-20">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: "var(--color-accent-subtle)" }}
          >
            <BookOpen size={28} style={{ color: "var(--color-accent)" }} />
          </div>
          <h2
            className="mt-4 text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            No digests yet
          </h2>
          <p
            className="mt-1.5 max-w-[260px] text-center text-[13px]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Digests are generated daily at 8 AM and weekly on Fridays. You can
            also trigger one from Settings.
          </p>
        </div>
      )}

      {!loading && digests.length > 0 && (
        <div className="space-y-2">
          {digests.map((digest) => (
            <Link key={digest.id} href={`/digest/${digest.id}`}>
              <div className="card card-hover flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{
                      background:
                        digest.digest_type === "weekly"
                          ? "var(--color-accent-subtle)"
                          : "rgba(96, 165, 250, 0.12)",
                    }}
                  >
                    {digest.digest_type === "weekly" ? (
                      <Calendar
                        size={16}
                        style={{ color: "var(--color-accent)" }}
                      />
                    ) : (
                      <BookOpen
                        size={16}
                        style={{ color: "var(--color-info)" }}
                      />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[14px] font-medium"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {digest.content?.title ||
                          `${digest.digest_type === "weekly" ? "Weekly" : "Daily"} Digest`}
                      </span>
                      {digest.status === "generating" && (
                        <Loader2
                          size={12}
                          className="animate-spin"
                          style={{ color: "var(--color-accent)" }}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="badge"
                        style={{
                          background:
                            digest.digest_type === "weekly"
                              ? "var(--color-accent-subtle)"
                              : "rgba(96, 165, 250, 0.12)",
                          color:
                            digest.digest_type === "weekly"
                              ? "var(--color-accent)"
                              : "var(--color-info)",
                        }}
                      >
                        {digest.digest_type}
                      </span>
                      <span
                        className="text-[12px]"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        {digest.period_start && formatDate(digest.period_start)}
                        {digest.period_end && ` — ${formatDate(digest.period_end)}`}
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  style={{ color: "var(--color-text-tertiary)" }}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
