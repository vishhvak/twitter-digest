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
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(true)
  const observerRef = useRef<IntersectionObserver | null>(null)

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

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const { bookmarks: items, nextCursor } = await fetchPage(cursorRef.current)
      setBookmarks((prev) => [...prev, ...items])
      cursorRef.current = nextCursor
      hasMoreRef.current = !!nextCursor
      setHasMore(!!nextCursor)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [fetchPage])

  // Callback ref — fires whenever the sentinel element mounts/unmounts
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Disconnect previous observer
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }

      if (!node) return

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            loadMore()
          }
        },
        { rootMargin: "400px" }
      )

      observer.observe(node)
      observerRef.current = observer
    },
    [loadMore]
  )

  // Initial load
  useEffect(() => {
    setLoading(true)
    setBookmarks([])
    cursorRef.current = null
    hasMoreRef.current = true

    fetchPage()
      .then(({ bookmarks: items, nextCursor }) => {
        setBookmarks(items)
        cursorRef.current = nextCursor
        hasMoreRef.current = !!nextCursor
        setHasMore(!!nextCursor)
        setError(null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [fetchPage])

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  const removeBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const updateBookmark = useCallback((updated: Bookmark) => {
    setBookmarks((prev) => prev.map((b) => b.id === updated.id ? updated : b))
  }, [])

  // Pull-to-refresh: quick incremental sync then reload first page
  const [refreshing, setRefreshing] = useState(false)
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetch("/api/sync-quick", { method: "POST" })
      const { bookmarks: items, nextCursor } = await fetchPage()
      setBookmarks(items)
      cursorRef.current = nextCursor
      hasMoreRef.current = !!nextCursor
      setHasMore(!!nextCursor)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }, [fetchPage])

  return { bookmarks, loading, loadingMore, hasMore, error, sentinelRef, removeBookmark, updateBookmark, refreshing, refresh }
}
