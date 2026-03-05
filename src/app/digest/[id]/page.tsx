"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react"
import { Digest } from "@/lib/supabase/types"
import { ConfirmModal } from "@/components/confirm-modal"

export default function DigestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [digest, setDigest] = useState<Digest | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [showRegenModal, setShowRegenModal] = useState(false)

  useEffect(() => {
    if (!params.id) return
    fetch(`/api/digests/${params.id}`)
      .then((r) => r.json())
      .then((data) => setDigest(data.digest || null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="mx-auto max-w-[680px] px-4 py-6">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton mt-4 h-4 w-full" />
        <div className="skeleton mt-2 h-4 w-3/4" />
        <div className="skeleton mt-6 h-4 w-32" />
        <div className="skeleton mt-3 h-4 w-full" />
        <div className="skeleton mt-2 h-4 w-5/6" />
      </div>
    )
  }

  if (!digest) {
    return (
      <div className="py-20 text-center">
        <p style={{ color: "var(--color-text-secondary)" }}>Digest not found</p>
      </div>
    )
  }

  const handleRegenerate = async () => {
    setShowRegenModal(false)
    setRegenerating(true)
    try {
      const res = await fetch(`/api/digests/${params.id}/regenerate`, { method: "POST" })
      const data = await res.json()
      if (data.digestId) {
        router.replace(`/digest/${data.digestId}`)
      }
    } catch {
      // ignore
    } finally {
      setRegenerating(false)
    }
  }

  const content = digest.content

  return (
    <div className="mx-auto max-w-[680px] px-4 py-4">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <button
          onClick={() => setShowRegenModal(true)}
          disabled={regenerating}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors"
          style={{
            color: "var(--color-text-secondary)",
            opacity: regenerating ? 0.5 : 1,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <RefreshCw size={13} className={regenerating ? "animate-spin" : ""} />
          {regenerating ? "Regenerating..." : "Regenerate"}
        </button>
      </div>

      {/* Header */}
      <header className="mb-6">
        <h1
          className="text-xl font-bold leading-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          {content?.title || "Digest"}
        </h1>
        <div className="mt-2 flex items-center gap-2">
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
            {digest.period_start &&
              new Date(digest.period_start).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
              })}
            {" — "}
            {digest.period_end &&
              new Date(digest.period_end).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
          </span>
        </div>
      </header>

      {/* Sections */}
      {content?.sections?.map((section, si) => (
        <section key={si} className="mb-8">
          <h2
            className="mb-2 text-[16px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {section.theme}
          </h2>
          <p
            className="mb-4 text-[14px] leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {section.summary}
          </p>

          <div className="space-y-4">
            {section.items?.map((item, ii) => (
              <div key={ii} className="card px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[13px] font-semibold"
                    style={{ color: "var(--color-accent)" }}
                  >
                    @{item.tweet_author}
                  </span>
                </div>
                {item.tweet_text && (
                  <p
                    className="mt-1.5 text-[14px] leading-relaxed"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {item.tweet_text.slice(0, 280)}
                  </p>
                )}
                <div
                  className="mt-2 rounded-lg px-3 py-2 text-[13px] leading-relaxed"
                  style={{
                    background: "var(--color-bg-hover)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {item.insight}
                </div>
                {item.sources && item.sources.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {item.sources.map((source, si2) => (
                      <a
                        key={si2}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[12px] transition-colors hover:underline"
                        style={{ color: "var(--color-info)" }}
                      >
                        <ExternalLink size={11} />
                        {source.title}
                        <span
                          className="badge"
                          style={{
                            background: "var(--color-bg-active)",
                            color: "var(--color-text-tertiary)",
                            fontSize: "10px",
                          }}
                        >
                          {source.type}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {si < (content?.sections?.length || 0) - 1 && (
            <div
              className="my-6 h-px"
              style={{ background: "var(--color-border-subtle)" }}
            />
          )}
        </section>
      ))}

      {/* Fallback: show raw markdown as plain text if no structured content */}
      {(!content?.sections || content.sections.length === 0) &&
        digest.raw_markdown && (
          <pre
            className="whitespace-pre-wrap text-[14px] leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {digest.raw_markdown}
          </pre>
        )}

      <ConfirmModal
        open={showRegenModal}
        title="Regenerate digest?"
        message="The current digest will be replaced with a freshly generated one."
        confirmLabel="Regenerate"
        onConfirm={handleRegenerate}
        onCancel={() => setShowRegenModal(false)}
      />
    </div>
  )
}
