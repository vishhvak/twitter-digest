export function TagPill({ tag }: { tag: string }) {
  return (
    <span
      className="badge shrink-0"
      style={{
        background: "var(--color-accent-subtle)",
        color: "var(--color-accent)",
      }}
    >
      {tag}
    </span>
  )
}
