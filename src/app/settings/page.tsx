"use client"

import { useState, useEffect, useRef } from "react"
import {
  RefreshCw,
  BookOpen,
  Calendar,
  Database,
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Download,
} from "lucide-react"
import { SyncState } from "@/lib/supabase/types"
import { formatRelativeTime } from "@/lib/utils"

interface SyncLogEntry {
  time: string
  message: string
}

export default function SettingsPage() {
  const [syncState, setSyncState] = useState<SyncState | null>(null)
  const [totalBookmarks, setTotalBookmarks] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [generatingDigest, setGeneratingDigest] = useState<string | null>(null)
  const [toast, setToast] = useState<{
    message: string
    type: "success" | "error"
  } | null>(null)
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([])
  const [logsExpanded, setLogsExpanded] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const [twitterCredits, setTwitterCredits] = useState<number | null>(null)

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/sync-status")
      const data = await res.json()
      setSyncState(data.syncState)
      setTotalBookmarks(data.totalBookmarks)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const fetchTwitterCredits = async () => {
    try {
      const res = await fetch("/api/twitter-credits")
      const data = await res.json()
      setTwitterCredits(data.credits)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchStatus()
    fetchTwitterCredits()
  }, [])

  useEffect(() => {
    if (logsExpanded && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [syncLogs, logsExpanded])

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const [syncProgress, setSyncProgress] = useState<{
    status: string
    totalItems: number
    processedItems: number
    message: string
    logs: SyncLogEntry[]
  } | null>(null)

  const triggerSync = async (mode: "incremental" | "full" | "backfill-older" = "incremental") => {
    setSyncing(true)
    setSyncProgress(null)
    setSyncLogs([])
    setLogsExpanded(false)

    // Start polling progress
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/sync-progress")
        const progress = await res.json()
        if (progress.status !== "idle") {
          setSyncProgress(progress)
          if (progress.logs?.length) {
            setSyncLogs(progress.logs)
          }
        }
        if (progress.status === "done" || progress.status === "error") {
          clearInterval(pollInterval)
        }
      } catch {
        // ignore
      }
    }, 1000)

    const modeParam = mode !== "incremental" ? `?mode=${mode}` : ""

    try {
      const res = await fetch(`/api/cron/sync-raindrop${modeParam}`, {
        method: "POST",
        headers: process.env.NEXT_PUBLIC_CRON_SECRET ? { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}` } : {},
      })
      clearInterval(pollInterval)

      // Fetch final progress to get all logs
      try {
        const finalRes = await fetch("/api/sync-progress")
        const finalProgress = await finalRes.json()
        if (finalProgress.logs?.length) {
          setSyncLogs(finalProgress.logs)
        }
      } catch {
        // ignore
      }

      if (res.ok) {
        const data = await res.json()
        showToast(`Synced ${data.synced} bookmarks`, "success")
        await fetchStatus()
        fetchTwitterCredits()
      } else {
        showToast("Sync failed — check Settings for auth config", "error")
      }
    } catch {
      clearInterval(pollInterval)
      showToast("Sync failed", "error")
    } finally {
      setSyncing(false)
      setSyncProgress(null)
    }
  }

  const triggerDigest = async (type: "daily" | "weekly") => {
    setGeneratingDigest(type)
    try {
      const res = await fetch(`/api/cron/generate-digest?type=${type}`, {
        method: "POST",
        headers: process.env.NEXT_PUBLIC_CRON_SECRET ? { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}` } : {},
      })
      if (res.ok) {
        showToast(`${type} digest generation started`, "success")
      } else {
        showToast("Digest generation failed", "error")
      }
    } catch {
      showToast("Digest generation failed", "error")
    } finally {
      setGeneratingDigest(null)
    }
  }

  const formatLogTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString()
    } catch {
      return iso
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <h2
        className="mb-4 text-lg font-semibold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Settings
      </h2>

      {/* Sync Status */}
      <div className="card px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: "var(--color-accent-subtle)" }}
          >
            <Database size={16} style={{ color: "var(--color-accent)" }} />
          </div>
          <div>
            <h3
              className="text-[14px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Raindrop Sync
            </h3>
            <p
              className="text-[12px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Auto-syncs every 5 minutes via Vercel Cron
            </p>
          </div>
        </div>

        <div
          className="mt-3 grid grid-cols-3 gap-3 rounded-lg p-3"
          style={{ background: "var(--color-bg)" }}
        >
          <div>
            <div
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Bookmarks
            </div>
            <div
              className="mt-0.5 text-[18px] font-bold tabular-nums"
              style={{ color: "var(--color-text-primary)" }}
            >
              {loading ? "—" : totalBookmarks.toLocaleString()}
            </div>
          </div>
          <div>
            <div
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Last synced
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Clock size={12} style={{ color: "var(--color-text-tertiary)" }} />
              <span
                className="text-[13px]"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {loading
                  ? "—"
                  : syncState?.last_synced_at
                    ? formatRelativeTime(syncState.last_synced_at)
                    : "Never"}
              </span>
            </div>
          </div>
          <div>
            <div
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              API Credits
            </div>
            <div
              className="mt-0.5 text-[18px] font-bold tabular-nums"
              style={{
                color: twitterCredits !== null && twitterCredits < 100
                  ? "var(--color-error)"
                  : "var(--color-text-primary)",
              }}
            >
              {twitterCredits !== null ? twitterCredits.toLocaleString() : "—"}
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => triggerSync("incremental")}
            disabled={syncing}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition-colors"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-bg)",
              opacity: syncing ? 0.7 : 1,
            }}
          >
            {syncing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
          <button
            onClick={() => triggerSync("full")}
            disabled={syncing}
            className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-accent)",
              border: "1px solid var(--color-border)",
              opacity: syncing ? 0.7 : 1,
            }}
          >
            <Download size={14} />
            Full Sync
          </button>
        </div>

        {syncing && syncProgress && syncProgress.totalItems > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              <span>{syncProgress.message}</span>
              <span>{Math.round((syncProgress.processedItems / syncProgress.totalItems) * 100)}%</span>
            </div>
            <div
              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: "var(--color-bg)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  background: syncProgress.status === "threads" ? "var(--color-info)" : "var(--color-accent)",
                  width: `${(syncProgress.processedItems / syncProgress.totalItems) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {syncing && (!syncProgress || syncProgress.status === "fetching") && (
          <p className="mt-2 text-center text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            {syncProgress?.message || "Fetching bookmarks from Raindrop..."}
          </p>
        )}

        {/* Sync Logs */}
        {syncLogs.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setLogsExpanded(!logsExpanded)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
              style={{
                background: "var(--color-bg)",
                color: "var(--color-text-secondary)",
              }}
            >
              <span>Sync Log ({syncLogs.length} entries)</span>
              {logsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {logsExpanded && (
              <div
                className="mt-1 max-h-48 overflow-y-auto rounded-lg p-3 font-mono text-[11px] leading-relaxed"
                style={{
                  background: "var(--color-bg)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {syncLogs.map((entry, i) => (
                  <div key={i} className="whitespace-pre-wrap">
                    <span style={{ color: "var(--color-text-tertiary)" }}>
                      {formatLogTime(entry.time)}
                    </span>{" "}
                    {entry.message}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Digest Controls */}
      <div className="card mt-3 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: "rgba(96, 165, 250, 0.12)" }}
          >
            <BookOpen size={16} style={{ color: "var(--color-info)" }} />
          </div>
          <div>
            <h3
              className="text-[14px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              AI Digest
            </h3>
            <p
              className="text-[12px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Daily at 8 AM ET, weekly on Fridays at 6 PM ET
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => triggerDigest("daily")}
            disabled={!!generatingDigest}
            className="card card-hover flex items-center justify-center gap-2 py-2.5 text-[13px] font-medium"
            style={{
              color: "var(--color-info)",
              opacity: generatingDigest ? 0.7 : 1,
            }}
          >
            {generatingDigest === "daily" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <BookOpen size={14} />
            )}
            Generate Daily
          </button>
          <button
            onClick={() => triggerDigest("weekly")}
            disabled={!!generatingDigest}
            className="card card-hover flex items-center justify-center gap-2 py-2.5 text-[13px] font-medium"
            style={{
              color: "var(--color-accent)",
              opacity: generatingDigest ? 0.7 : 1,
            }}
          >
            {generatingDigest === "weekly" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Calendar size={14} />
            )}
            Generate Weekly
          </button>
        </div>
      </div>

      {/* App info */}
      <div
        className="mt-8 text-center text-[11px]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <p>Twitter Bookmarks AI</p>
        <p className="mt-0.5">
          Gemini embeddings · OpenAI digests · Supabase
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="glass fixed right-4 bottom-20 left-4 z-50 mx-auto flex max-w-sm items-center gap-2 rounded-xl px-4 py-3 fade-in"
          style={{
            borderColor: "var(--color-border)",
            border: "1px solid",
          }}
        >
          {toast.type === "success" ? (
            <CheckCircle size={16} style={{ color: "var(--color-success)" }} />
          ) : (
            <XCircle size={16} style={{ color: "var(--color-error)" }} />
          )}
          <span
            className="text-[13px] font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {toast.message}
          </span>
        </div>
      )}
    </div>
  )
}
