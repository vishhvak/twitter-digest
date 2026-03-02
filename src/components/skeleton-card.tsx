export function SkeletonCard() {
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-2.5">
        <div className="skeleton h-8 w-8 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-2.5 w-16" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-4/5" />
        <div className="skeleton h-3 w-3/5" />
      </div>
      <div className="mt-3">
        <div className="skeleton h-32 w-full rounded-xl" />
      </div>
    </div>
  )
}
