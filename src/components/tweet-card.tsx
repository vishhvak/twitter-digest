"use client"

import { useState } from "react"
import { ExternalLink, Copy, Check } from "lucide-react"
import { Bookmark } from "@/lib/supabase/types"
import { formatRelativeTime, truncateText, extractDomain } from "@/lib/utils"
import { TweetMedia } from "./tweet-media"
import { TagPill } from "./tag-pill"

interface TweetCardProps {
  bookmark: Bookmark
  index?: number
  compact?: boolean
}

export function TweetCard({ bookmark, index = 0, compact = false }: TweetCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const text = bookmark.tweet_text || bookmark.excerpt || bookmark.title || ""
  const isLong = text.length > 280
  const displayText = expanded || !isLong ? text : truncateText(text, 280)
  const domain = bookmark.domain || extractDomain(bookmark.url)
  const author = bookmark.tweet_author || "unknown"
  const initial = author[0]?.toUpperCase() || "?"

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(bookmark.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Deterministic avatar color from author handle
  const hue = author.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360

  return (
    <article
      className="card card-hover fade-in px-4 py-3"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Author row */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{
            background: `hsl(${hue}, 40%, 25%)`,
            color: `hsl(${hue}, 60%, 75%)`,
          }}
        >
          {initial}
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          {bookmark.tweet_author_name && (
            <span
              className="truncate text-[14px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {bookmark.tweet_author_name}
            </span>
          )}
          <span
            className="truncate text-[13px]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            @{author}
          </span>
          <span
            className="text-[13px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            ·
          </span>
          <span
            className="shrink-0 text-[13px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {bookmark.raindrop_created_at
              ? formatRelativeTime(bookmark.raindrop_created_at)
              : ""}
          </span>
        </div>
      </div>

      {/* Tweet text */}
      {text && (
        <div className="mt-2">
          <p
            className="whitespace-pre-wrap text-[15px] leading-[1.45]"
            style={{ color: "var(--color-text-primary)" }}
          >
            {displayText}
          </p>
          {isLong && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-1 text-[13px] font-medium"
              style={{ color: "var(--color-accent)" }}
            >
              Show more
            </button>
          )}
        </div>
      )}

      {/* Media */}
      {!compact && bookmark.media && bookmark.media.length > 0 && (
        <div className="mt-2.5">
          <TweetMedia media={bookmark.media} />
        </div>
      )}

      {/* Cover image fallback */}
      {!compact &&
        (!bookmark.media || bookmark.media.length === 0) &&
        bookmark.cover_image_url && (
          <div className="mt-2.5 overflow-hidden rounded-xl">
            <img
              src={bookmark.cover_image_url}
              alt=""
              className="h-40 w-full object-cover"
              loading="lazy"
            />
          </div>
        )}

      {/* Domain badge */}
      {domain && !domain.includes("twitter.com") && !domain.includes("x.com") && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
            alt=""
            className="h-3.5 w-3.5 rounded-sm"
          />
          <span
            className="text-[12px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {domain}
          </span>
        </div>
      )}

      {/* Tags */}
      {bookmark.tags && bookmark.tags.length > 0 && (
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto scrollbar-none">
          {bookmark.tags.map((tag) => (
            <TagPill key={tag} tag={tag} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div
        className="mt-2.5 flex items-center gap-1 border-t pt-2.5"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--color-bg-hover)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <ExternalLink size={13} />
          Open
        </a>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--color-bg-hover)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </article>
  )
}
