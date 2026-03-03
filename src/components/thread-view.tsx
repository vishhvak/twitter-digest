"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react"
import { ThreadTweet, MediaItem } from "@/lib/supabase/types"
import { TweetMedia } from "./tweet-media"

interface ThreadViewProps {
  thread: ThreadTweet[]
  authorHandle: string | null
}

export function ThreadView({ thread, authorHandle }: ThreadViewProps) {
  const [expanded, setExpanded] = useState(false)

  if (!thread || thread.length <= 1) return null

  // Show first tweet + collapse indicator, or all tweets when expanded
  const visibleTweets = expanded ? thread : thread.slice(0, 1)
  const hiddenCount = thread.length - 1
  const author = authorHandle || thread[0]?.author_handle || "unknown"

  // Avatar color from handle
  const hue = author.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  const initial = author[0]?.toUpperCase() || "?"

  return (
    <div className="mt-3">
      {/* Thread indicator */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold transition-colors"
        style={{
          color: "var(--color-accent)",
          background: "var(--color-accent-subtle)",
        }}
      >
        <MessageSquare size={12} />
        Thread · {thread.length} tweets
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Thread tweets with connected line */}
      <div className="relative">
        {visibleTweets.map((tweet, i) => {
          const isLast = i === visibleTweets.length - 1 && expanded
          const showConnector = !isLast || !expanded

          return (
            <div key={tweet.id || i} className="relative flex gap-3">
              {/* Vertical thread line + avatar column */}
              <div className="flex flex-col items-center">
                {/* Avatar */}
                {tweet.author_avatar_url ? (
                  <img
                    src={tweet.author_avatar_url}
                    alt={tweet.author_handle || ""}
                    className="relative z-10 h-6 w-6 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                    style={{
                      background: `hsl(${hue}, 40%, 25%)`,
                      color: `hsl(${hue}, 60%, 75%)`,
                    }}
                  >
                    {initial}
                  </div>
                )}
                {/* Connector line */}
                {showConnector && (
                  <div
                    className="w-0.5 flex-1"
                    style={{
                      background: "var(--color-border)",
                      minHeight: "12px",
                    }}
                  />
                )}
              </div>

              {/* Tweet content */}
              <div className="min-w-0 flex-1 pb-3">
                {/* Author + position */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[13px] font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {tweet.author_name || `@${tweet.author_handle || author}`}
                  </span>
                  {tweet.author_handle && (
                    <span
                      className="text-[12px]"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      @{tweet.author_handle}
                    </span>
                  )}
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    · {tweet.position}/{thread.length}
                  </span>
                </div>

                {/* Tweet text */}
                <p
                  className="mt-0.5 whitespace-pre-wrap text-[14px] leading-[1.45]"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {tweet.tweet_text}
                </p>

                {/* Media */}
                {tweet.media && tweet.media.length > 0 && (
                  <div className="mt-2">
                    <TweetMedia media={tweet.media} />
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Collapsed indicator — shows remaining count */}
        {!expanded && hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="flex w-full items-center gap-3 rounded-lg py-2 transition-colors"
            style={{ color: "var(--color-accent)" }}
          >
            {/* Line stub */}
            <div className="flex w-6 justify-center">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  background: "var(--color-accent-subtle)",
                  color: "var(--color-accent)",
                }}
              >
                +{hiddenCount}
              </div>
            </div>
            <span className="text-[13px] font-medium">
              Show {hiddenCount} more tweet{hiddenCount > 1 ? "s" : ""} in thread
            </span>
          </button>
        )}

        {/* Collapse button when expanded */}
        {expanded && thread.length > 2 && (
          <button
            onClick={() => setExpanded(false)}
            className="mt-1 flex items-center gap-1.5 text-[12px] font-medium"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <ChevronUp size={12} />
            Collapse thread
          </button>
        )}
      </div>
    </div>
  )
}
