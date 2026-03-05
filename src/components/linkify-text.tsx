"use client"

const URL_REGEX = /(https?:\/\/[^\s]+)/g

export function LinkifyText({ text }: { text: string }) {
  const parts = text.split(URL_REGEX)
  return (
    <>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-1 underline-offset-2"
            style={{ color: "var(--color-accent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {part.replace(/^https?:\/\//, "").slice(0, 40)}
            {part.replace(/^https?:\/\//, "").length > 40 ? "..." : ""}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}
