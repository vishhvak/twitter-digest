"use client"

import { useEffect, useRef } from "react"

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onCancel()
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-[340px] overflow-hidden rounded-2xl border"
        style={{
          background: "var(--color-bg-elevated)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="px-5 pt-5 pb-4">
          <h3
            className="text-[16px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {title}
          </h3>
          <p
            className="mt-1.5 text-[14px] leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {message}
          </p>
        </div>
        <div
          className="flex border-t"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <button
            onClick={onCancel}
            className="flex-1 py-3 text-[14px] font-medium transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--color-bg-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            Cancel
          </button>
          <div
            className="w-px"
            style={{ background: "var(--color-border-subtle)" }}
          />
          <button
            onClick={onConfirm}
            className="flex-1 py-3 text-[14px] font-semibold transition-colors"
            style={{ color: "var(--color-error)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(248, 113, 113, 0.08)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
