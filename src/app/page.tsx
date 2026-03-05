"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Search as SearchIcon, X, Bookmark as BookmarkIcon, RefreshCw } from "lucide-react"
import { useInfiniteBookmarks } from "@/hooks/use-infinite-bookmarks"
import { TweetCard } from "@/components/tweet-card"
import { SkeletonCard } from "@/components/skeleton-card"
import { Bookmark } from "@/lib/supabase/types"

interface SearchResult extends Bookmark {
  score: number
  match_type: "keyword" | "semantic" | "hybrid"
}

interface AuthorSuggestion {
  handle: string
  name: string | null
  avatar: string | null
  count: number
}

export default function FeedPage() {
  const { bookmarks, loading, loadingMore, hasMore, error, sentinelRef, removeBookmark, refreshing, refresh } =
    useInfiniteBookmarks()

  // Pull-to-refresh touch gesture
  const [pullDistance, setPullDistance] = useState(0)
  const touchStartY = useRef(0)
  const isPulling = useRef(false)

  useEffect(() => {
    const threshold = 80

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        touchStartY.current = e.touches[0].clientY
        isPulling.current = true
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!isPulling.current) return
      const dy = e.touches[0].clientY - touchStartY.current
      if (dy > 0) {
        setPullDistance(Math.min(dy * 0.5, 120))
      }
    }

    const onTouchEnd = () => {
      if (isPulling.current && pullDistance > threshold && !refreshing) {
        refresh()
      }
      isPulling.current = false
      setPullDistance(0)
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true })
    window.addEventListener("touchmove", onTouchMove, { passive: true })
    window.addEventListener("touchend", onTouchEnd)
    return () => {
      window.removeEventListener("touchstart", onTouchStart)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onTouchEnd)
    }
  }, [pullDistance, refreshing, refresh])

  // Search state
  const [query, setQuery] = useState("")
  const [authorFilter, setAuthorFilter] = useState<AuthorSuggestion | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  // Author autocomplete
  const [suggestions, setSuggestions] = useState<AuthorSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const isTypingMention = query.startsWith("@") && !authorFilter
  const mentionPrefix = isTypingMention ? query.slice(1) : ""
  const isSearchActive = searched || !!query || !!authorFilter

  // Fetch author suggestions
  useEffect(() => {
    if (!isTypingMention || mentionPrefix.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/authors?q=${encodeURIComponent(mentionPrefix)}`)
        const data = await res.json()
        setSuggestions(data.authors || [])
        setShowSuggestions((data.authors || []).length > 0)
        setSelectedIndex(0)
      } catch {
        setSuggestions([])
      }
    }, 200)

    return () => clearTimeout(timeout)
  }, [isTypingMention, mentionPrefix])

  const selectAuthor = useCallback((author: AuthorSuggestion) => {
    setAuthorFilter(author)
    setQuery("")
    setSuggestions([])
    setShowSuggestions(false)
    inputRef.current?.focus()
  }, [])

  const removeAuthor = useCallback(() => {
    setAuthorFilter(null)
    setResults([])
    setSearched(false)
    inputRef.current?.focus()
  }, [])

  // Search
  const search = useCallback(async (q: string, author: AuthorSuggestion | null) => {
    if (!q.trim() && !author) {
      setResults([])
      setSearched(false)
      return
    }

    setSearchLoading(true)
    setSearched(true)
    try {
      const params = new URLSearchParams({ limit: "20" })
      if (q.trim()) params.set("q", q)
      if (author) params.set("author", author.handle)

      const res = await fetch(`/api/search?${params}`)
      const data = await res.json()
      setResults(data.results || [])
    } catch {
      setResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    if (isTypingMention) return

    const timeout = setTimeout(() => search(query, authorFilter), 400)
    return () => clearTimeout(timeout)
  }, [query, authorFilter, search, isTypingMention])

  // Trigger search immediately when author is selected
  useEffect(() => {
    if (authorFilter) {
      search(query, authorFilter)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorFilter])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        selectAuthor(suggestions[selectedIndex])
      } else if (e.key === "Escape") {
        setShowSuggestions(false)
      }
      return
    }

    if (e.key === "Backspace" && !query && authorFilter) {
      removeAuthor()
    }
  }

  const handleClear = () => {
    setQuery("")
    setAuthorFilter(null)
    setResults([])
    setSearched(false)
    inputRef.current?.focus()
  }

  const matchColors: Record<string, string> = {
    keyword: "var(--color-keyword)",
    semantic: "var(--color-semantic)",
    hybrid: "var(--color-hybrid)",
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center gap-2 overflow-hidden transition-all"
          style={{ height: refreshing ? 40 : pullDistance > 0 ? Math.min(pullDistance, 60) : 0 }}
        >
          <RefreshCw
            size={16}
            className={refreshing ? "animate-spin" : ""}
            style={{
              color: "var(--color-accent)",
              transform: `rotate(${pullDistance * 3}deg)`,
              opacity: Math.min(pullDistance / 60, 1),
            }}
          />
          <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            {refreshing ? "Syncing..." : pullDistance > 80 ? "Release to sync" : "Pull to sync"}
          </span>
        </div>
      )}

      {/* Search bar */}
      <div className="relative mb-4">
        <div
          className="card flex items-center gap-2 px-4 py-3"
          style={{ borderColor: query || authorFilter ? "var(--color-accent)" : undefined }}
        >
          {!isSearchActive ? (
            <button
              onClick={refresh}
              disabled={refreshing}
              className="shrink-0"
              title="Sync latest bookmarks"
            >
              <RefreshCw
                size={18}
                className={refreshing ? "animate-spin" : ""}
                style={{ color: refreshing ? "var(--color-accent)" : "var(--color-text-tertiary)" }}
              />
            </button>
          ) : (
            <SearchIcon
              size={18}
              style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}
            />
          )}

          {authorFilter && (
            <button
              onClick={removeAuthor}
              className="flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2 text-[13px] font-medium"
              style={{
                background: "var(--color-accent-subtle)",
                color: "var(--color-accent)",
              }}
            >
              {authorFilter.avatar ? (
                <img
                  src={authorFilter.avatar}
                  alt=""
                  className="h-4 w-4 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}
                >
                  {authorFilter.handle[0]?.toUpperCase()}
                </span>
              )}
              @{authorFilter.handle}
              <X size={11} className="ml-0.5 opacity-60" />
            </button>
          )}

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={authorFilter ? "Search their tweets..." : "Search bookmarks... or @handle"}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--color-text-tertiary)]"
            style={{ color: "var(--color-text-primary)" }}
          />
          {(query || authorFilter) && (
            <button
              onClick={handleClear}
              className="shrink-0 text-[12px] font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Clear
            </button>
          )}
        </div>

        {showSuggestions && (
          <div
            className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border shadow-lg"
            style={{
              background: "var(--color-bg-elevated)",
              borderColor: "var(--color-border)",
            }}
          >
            {suggestions.map((author, i) => (
              <button
                key={author.handle}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectAuthor(author)
                }}
                onMouseEnter={() => setSelectedIndex(i)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors"
                style={{
                  background: i === selectedIndex ? "var(--color-bg-hover)" : "transparent",
                }}
              >
                {author.avatar ? (
                  <img
                    src={author.avatar}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{
                      background: "var(--color-bg-hover)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {author.handle[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {author.name && (
                      <span
                        className="truncate text-[13px] font-semibold"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {author.name}
                      </span>
                    )}
                    <span
                      className="truncate text-[12px]"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      @{author.handle}
                    </span>
                  </div>
                </div>
                <span
                  className="shrink-0 text-[11px]"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {author.count} {author.count === 1 ? "tweet" : "tweets"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search results */}
      {isSearchActive && (
        <div className="space-y-3">
          {searchLoading && (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}

          {!searchLoading && searched && results.length === 0 && (
            <div className="py-16 text-center">
              <p
                className="text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                No results{authorFilter ? ` from @${authorFilter.handle}` : ""}{query ? ` for \u201c${query}\u201d` : ""}
              </p>
            </div>
          )}

          {!searchLoading &&
            results.map((result, i) => (
              <div key={result.id}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="badge"
                    style={{
                      background: `${matchColors[result.match_type]}15`,
                      color: matchColors[result.match_type],
                    }}
                  >
                    {result.match_type}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {(result.score * 100).toFixed(1)}
                  </span>
                </div>
                <TweetCard bookmark={result} index={i} onDelete={(id) => {
                  setResults((prev) => prev.filter((r) => r.id !== id))
                }} />
              </div>
            ))}
        </div>
      )}

      {/* Feed (shown when not searching) */}
      {!isSearchActive && (
        <>
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
                <TweetCard key={bookmark.id} bookmark={bookmark} index={i} onDelete={removeBookmark} />
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
                  You&apos;ve reached the end
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
