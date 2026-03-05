"use client"

import { useState, useRef, useEffect } from "react"
import { ExternalLink, Copy, Check, MessageSquare, RefreshCw, FileText, Trash2, Sparkles } from "lucide-react"
import { Bookmark } from "@/lib/supabase/types"
import { formatRelativeTime, truncateText, extractDomain } from "@/lib/utils"
import { TweetMedia } from "./tweet-media"
import { TagPill } from "./tag-pill"
import { LinkifyText } from "./linkify-text"
import { ThreadView } from "./thread-view"
import { QuotedTweet } from "./quoted-tweet"
import { ConfirmModal } from "./confirm-modal"
import Markdown from "react-markdown"

interface TweetCardProps {
  bookmark: Bookmark
  index?: number
  compact?: boolean
  onUpdate?: (updated: Bookmark) => void
  onDelete?: (id: string) => void
}

export function TweetCard({ bookmark, index = 0, compact = false, onUpdate, onDelete }: TweetCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [articleExpanded, setArticleExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const frontRef = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState<number | undefined>(undefined)

  // Measure front card height so back matches
  useEffect(() => {
    if (frontRef.current) {
      setCardHeight(frontRef.current.offsetHeight)
    }
  }, [bookmark, expanded, articleExpanded])

  const handleFlip = async () => {
    if (flipped) {
      setFlipped(false)
      return
    }
    setFlipped(true)
    if (!summary) {
      setSummaryLoading(true)
      try {
        const res = await fetch(`/api/bookmarks/${bookmark.id}/summarize`, { method: "POST" })
        const data = await res.json()
        setSummary(data.summary || "Could not generate summary.")
      } catch {
        setSummary("Failed to generate summary.")
      } finally {
        setSummaryLoading(false)
      }
    }
  }

  const isArticle = !!bookmark.article_content

  // For threads, only show the first tweet — the rest are in the thread view
  const firstTweetText = bookmark.is_thread && bookmark.thread?.length
    ? bookmark.thread[0].tweet_text
    : null
  const text = firstTweetText || bookmark.tweet_text || bookmark.excerpt || bookmark.title || ""
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

  const isTwitterUrl = bookmark.url.match(/(?:twitter|x)\.com\/\w+\/(?:status|article)/)

  const handleResync = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setSyncing(true)
    try {
      const res = await fetch(`/api/bookmarks/${bookmark.id}/resync`, { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        if (data.bookmark && onUpdate) {
          onUpdate(data.bookmark)
        }
      }
    } catch {
      // ignore
    } finally {
      setSyncing(false)
    }
  }

  const handleDelete = async () => {
    setShowDeleteModal(false)
    setDeleting(true)
    try {
      const res = await fetch(`/api/bookmarks/${bookmark.id}`, { method: "DELETE" })
      if (res.ok && onDelete) {
        onDelete(bookmark.id)
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false)
    }
  }

  // Deterministic avatar color from author handle
  const hue = author.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360

  // Filter out profile images from media — Raindrop often includes the author's
  // profile pic as a media item or cover for tweets that have no actual media
  const isProfileImage = (url: string) =>
    url.includes("profile_images") || url.includes("profile_banners")
  const filteredMedia = (bookmark.media || []).filter((m) => m.url && !isProfileImage(m.url))
  const coverIsProfileImage = bookmark.cover_image_url && isProfileImage(bookmark.cover_image_url)


  return (
    <div
      className="flip-container fade-in"
      style={{ animationDelay: `${index * 40}ms`, height: flipped && cardHeight ? cardHeight : undefined }}
    >
      <div className={`flip-inner${flipped ? " flipped" : ""}`} style={{ height: flipped && cardHeight ? cardHeight : undefined }}>
        {/* Back side — AI Summary */}
        <div
          className="flip-back card px-4 py-3 cursor-pointer overflow-auto"
          onClick={handleFlip}
          style={{ height: cardHeight }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} style={{ color: "var(--color-accent)" }} />
            <span className="text-[13px] font-semibold" style={{ color: "var(--color-accent)" }}>
              AI Summary
            </span>
            <span className="text-[11px] ml-auto" style={{ color: "var(--color-text-tertiary)" }}>
              Tap to flip back
            </span>
          </div>
          {summaryLoading ? (
            <div className="space-y-2 mt-4">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-5/6" />
              <div className="skeleton h-4 w-4/6" />
            </div>
          ) : (
            <p
              className="text-[15px] leading-[1.6] whitespace-pre-wrap"
              style={{ color: "var(--color-text-primary)" }}
            >
              {summary}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {bookmark.cover_image_url && bookmark.cover_image_url.includes('profile_images') ? (
              <img src={bookmark.cover_image_url} alt="" className="h-5 w-5 rounded-full object-cover" />
            ) : null}
            <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              @{bookmark.tweet_author || "unknown"}
            </span>
          </div>
        </div>

        {/* Front side — Original tweet card */}
        <div ref={frontRef} className="flip-front">
    <article
      className="card card-hover px-4 py-3 cursor-pointer"
      onClick={handleFlip}
    >
      {/* Author row */}
      <div className="flex items-center gap-2.5">
        {bookmark.cover_image_url && bookmark.cover_image_url.includes('profile_images') ? (
          <img
            src={bookmark.cover_image_url}
            alt={author}
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{
              background: `hsl(${hue}, 40%, 25%)`,
              color: `hsl(${hue}, 60%, 75%)`,
            }}
          >
            {initial}
          </div>
        )}
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
          {bookmark.is_thread && bookmark.thread_tweet_count > 1 && (
            <span
              className="badge ml-1 shrink-0"
              style={{
                background: "var(--color-accent-subtle)",
                color: "var(--color-accent)",
              }}
            >
              <MessageSquare size={9} className="mr-1" />
              {bookmark.thread_tweet_count}
            </span>
          )}
          {isArticle && (
            <span
              className="badge ml-1 shrink-0"
              style={{
                background: "var(--color-accent-subtle)",
                color: "var(--color-accent)",
              }}
            >
              <FileText size={9} className="mr-1" />
              Article
            </span>
          )}
        </div>
        {bookmark.raindrop_created_at && (
          <span
            className="ml-auto shrink-0 text-[11px]"
            style={{ color: "var(--color-text-tertiary)" }}
            title={new Date(bookmark.raindrop_created_at).toLocaleString()}
          >
            Saved {formatRelativeTime(bookmark.raindrop_created_at)}
          </span>
        )}
      </div>

      {/* Article content — replaces tweet text + media for articles */}
      {!compact && isArticle && bookmark.article_content && (
        <div className="mt-2.5">
          <div
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--color-border-subtle)" }}
          >
            {bookmark.article_content.cover_image_url && (
              <img
                src={bookmark.article_content.cover_image_url}
                alt=""
                className="h-48 w-full object-cover"
                loading="lazy"
              />
            )}
            <div className="px-3.5 py-3">
              <p
                className="text-[16px] font-semibold leading-snug"
                style={{ color: "var(--color-text-primary)" }}
              >
                {bookmark.article_content.title}
              </p>
              {!articleExpanded && bookmark.article_content.preview_text && (
                <p
                  className="mt-1.5 text-[14px] leading-relaxed"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {truncateText(bookmark.article_content.preview_text, 200)}
                </p>
              )}
              {articleExpanded && bookmark.article_content.body && (
                <div
                  className="article-body mt-3 text-[14px] leading-[1.7]"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <Markdown>{bookmark.article_content.body}</Markdown>
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setArticleExpanded(!articleExpanded) }}
                className="mt-2 text-[13px] font-medium"
                style={{ color: "var(--color-accent)" }}
              >
                {articleExpanded ? "Collapse" : "Read article"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tweet text — hidden for articles */}
      {!isArticle && text && (
        <div className="mt-2">
          <p
            className="whitespace-pre-wrap text-[15px] leading-[1.45]"
            style={{ color: "var(--color-text-primary)" }}
          >
            <LinkifyText text={displayText} />
          </p>
          {isLong && !expanded && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(true) }}
              className="mt-1 text-[13px] font-medium"
              style={{ color: "var(--color-accent)" }}
            >
              Show more
            </button>
          )}
        </div>
      )}

      {/* Media — hidden for articles */}
      {!compact && !isArticle && filteredMedia.length > 0 && (
        <div className="mt-2.5">
          <TweetMedia media={filteredMedia} />
        </div>
      )}

      {/* Cover image fallback — hidden for articles */}
      {!compact &&
        !isArticle &&
        filteredMedia.length === 0 &&
        bookmark.cover_image_url &&
        !coverIsProfileImage && (
          <div className="mt-2.5 overflow-hidden rounded-xl">
            <img
              src={bookmark.cover_image_url}
              alt=""
              className="h-40 w-full object-cover"
              loading="lazy"
            />
          </div>
        )}

      {/* Quoted tweet */}
      {!compact && bookmark.quoted_tweet && (
        <QuotedTweet quote={bookmark.quoted_tweet} />
      )}

      {/* Thread view */}
      {!compact && bookmark.is_thread && bookmark.thread && bookmark.thread.length > 1 && (
        <ThreadView thread={bookmark.thread} authorHandle={bookmark.tweet_author} />
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
        onClick={(e) => e.stopPropagation()}
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
        {isTwitterUrl && (
          <button
            onClick={handleResync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors"
            style={{ color: "var(--color-text-secondary)", opacity: syncing ? 0.5 : 1 }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--color-bg-hover)")
            }
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing" : "Sync"}
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setShowDeleteModal(true) }}
          disabled={deleting}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors"
          style={{ color: "var(--color-text-tertiary)", opacity: deleting ? 0.5 : 1 }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(248, 113, 113, 0.08)"
            e.currentTarget.style.color = "var(--color-error)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent"
            e.currentTarget.style.color = "var(--color-text-tertiary)"
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <ConfirmModal
        open={showDeleteModal}
        title="Delete bookmark?"
        message="This bookmark will be permanently removed. This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
      />
    </article>
        </div>
      </div>
    </div>
  )
}
