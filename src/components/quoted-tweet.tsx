"use client"

import { QuotedTweet as QuotedTweetType } from "@/lib/supabase/types"
import { LinkifyText } from "./linkify-text"
import { TweetMedia } from "./tweet-media"

interface QuotedTweetProps {
  quote: QuotedTweetType
}

export function QuotedTweet({ quote }: QuotedTweetProps) {
  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if user clicked a link inside the quote
    if ((e.target as HTMLElement).closest("a")) return
    window.open(quote.url, "_blank", "noopener,noreferrer")
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter") handleClick(e as any) }}
      className="mt-2.5 cursor-pointer rounded-xl border p-3 transition-colors"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-bg-subtle)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--color-bg-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "var(--color-bg-subtle)")
      }
    >
      {/* Author row */}
      <div className="flex items-center gap-2">
        {quote.author_avatar_url ? (
          <img
            src={quote.author_avatar_url}
            alt={quote.author_handle}
            className="h-5 w-5 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={{
              background: "var(--color-bg-hover)",
              color: "var(--color-text-secondary)",
            }}
          >
            {quote.author_handle[0]?.toUpperCase() || "?"}
          </div>
        )}
        {quote.author_name && (
          <span
            className="truncate text-[13px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {quote.author_name}
          </span>
        )}
        <span
          className="truncate text-[12px]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          @{quote.author_handle}
        </span>
      </div>

      {/* Text */}
      {quote.text && (
        <p
          className="mt-1.5 whitespace-pre-wrap text-[14px] leading-[1.4]"
          style={{ color: "var(--color-text-primary)" }}
        >
          <LinkifyText text={quote.text} />
        </p>
      )}

      {/* Media */}
      {quote.media && quote.media.length > 0 && (
        <div className="mt-2">
          <TweetMedia media={quote.media} />
        </div>
      )}
    </div>
  )
}
