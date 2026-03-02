"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Bookmark } from "@/lib/supabase/types"

export function useInfiniteBookmarks(tag?: string) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cursorRef = useRef<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const fetchPage = useCallback(
    async (cursor?: string | null) => {
      const params = new URLSearchParams({ limit: "20" })
      if (cursor) params.set("cursor", cursor)
      if (tag) params.set("tag", tag)

      const res = await fetch(`/api/bookmarks?${params}`)
      if (!res.ok) throw new Error("Failed to fetch bookmarks")
      return res.json() as Promise<{
        bookmarks: Bookmark[]
        nextCursor: string | null
      }>
    },
    [tag]
  )

  // Initial load
  useEffect(() => {
    setLoading(true)
    setBookmarks([])
    cursorRef.current = null

    fetchPage()
      .then(({ bookmarks: items, nextCursor }) => {
        setBookmarks(items)
        cursorRef.current = nextCursor
        setHasMore(!!nextCursor)
        setError(null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [fetchPage])

  // Load more via IntersectionObserver
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const { bookmarks: items, nextCursor } = await fetchPage(cursorRef.current)
      setBookmarks((prev) => [...prev, ...items])
      cursorRef.current = nextCursor
      setHasMore(!!nextCursor)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingMore(false)
    }
  }, [fetchPage, loadingMore, hasMore])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore()
      },
      { rootMargin: "200px" }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  return { bookmarks, loading, loadingMore, hasMore, error, sentinelRef }
}
