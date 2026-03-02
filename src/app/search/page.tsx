"use client"

import { useState, useEffect, useCallback } from "react"
import { Search as SearchIcon } from "lucide-react"
import { TweetCard } from "@/components/tweet-card"
import { SkeletonCard } from "@/components/skeleton-card"
import { Bookmark } from "@/lib/supabase/types"

interface SearchResult extends Bookmark {
  score: number
  match_type: "keyword" | "semantic" | "hybrid"
}

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setSearched(false)
      return
    }

    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`)
      const data = await res.json()
      setResults(data.results || [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => search(query), 400)
    return () => clearTimeout(timeout)
  }, [query, search])

  const matchColors: Record<string, string> = {
    keyword: "var(--color-keyword)",
    semantic: "var(--color-semantic)",
    hybrid: "var(--color-hybrid)",
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      {/* Search input */}
      <div
        className="card flex items-center gap-3 px-4 py-3"
        style={{ borderColor: query ? "var(--color-accent)" : undefined }}
      >
        <SearchIcon
          size={18}
          style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bookmarks..."
          autoFocus
          className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--color-text-tertiary)]"
          style={{ color: "var(--color-text-primary)" }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-[12px] font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Results */}
      <div className="mt-4 space-y-3">
        {loading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="py-16 text-center">
            <p
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              No results for &ldquo;{query}&rdquo;
            </p>
          </div>
        )}

        {!loading &&
          results.map((result, i) => (
            <div key={result.id}>
              {/* Match type badge */}
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
              <TweetCard bookmark={result} index={i} />
            </div>
          ))}
      </div>

      {/* Search tips when empty */}
      {!searched && !query && (
        <div className="mt-12 space-y-4 px-2">
          <p
            className="text-center text-[13px] font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Search uses keyword + semantic matching
          </p>
          <div className="grid grid-cols-2 gap-2">
            {["AI papers", "React hooks", "startup advice", "system design"].map(
              (example) => (
                <button
                  key={example}
                  onClick={() => setQuery(example)}
                  className="card card-hover px-3 py-2 text-left text-[13px]"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {example}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
