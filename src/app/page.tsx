"use client"

import { useInfiniteBookmarks } from "@/hooks/use-infinite-bookmarks"
import { TweetCard } from "@/components/tweet-card"
import { SkeletonCard } from "@/components/skeleton-card"
import { Bookmark as BookmarkIcon } from "lucide-react"

export default function FeedPage() {
  const { bookmarks, loading, loadingMore, hasMore, error, sentinelRef } =
    useInfiniteBookmarks()

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {error && (
        <div
          className="card px-4 py-8 text-center"
          style={{ color: "var(--color-error)" }}
        >
          <p className="text-sm">Failed to load bookmarks</p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            {error}
          </p>
        </div>
      )}

      {!loading && !error && bookmarks.length === 0 && (
        <div className="flex flex-col items-center py-20">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: "var(--color-accent-subtle)" }}
          >
            <BookmarkIcon size={28} style={{ color: "var(--color-accent)" }} />
          </div>
          <h2
            className="mt-4 text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            No bookmarks yet
          </h2>
          <p
            className="mt-1.5 max-w-[260px] text-center text-[13px]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Head to Settings to trigger your first sync from Raindrop.io
          </p>
        </div>
      )}

      {!loading && bookmarks.length > 0 && (
        <div className="space-y-3">
          {bookmarks.map((bookmark, i) => (
            <TweetCard key={bookmark.id} bookmark={bookmark} index={i} />
          ))}

          {hasMore && (
            <div ref={sentinelRef}>
              {loadingMore && (
                <div className="space-y-3">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              )}
            </div>
          )}

          {!hasMore && bookmarks.length > 0 && (
            <p
              className="py-8 text-center text-[13px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              You've reached the end
            </p>
          )}
        </div>
      )}
    </div>
  )
}
