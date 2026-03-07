"use client"

import { MediaItem } from "@/lib/supabase/types"

interface TweetMediaProps {
  media: MediaItem[]
}

function isVideo(item: MediaItem): boolean {
  return item.type === "video" || item.type === "animated_gif"
}

function MediaElement({ item, className }: { item: MediaItem; className?: string }) {
  if (isVideo(item)) {
    const isGif = item.type === "animated_gif"
    return (
      <video
        src={item.url}
        className={className}
        controls={!isGif}
        autoPlay={isGif}
        loop={isGif}
        muted={isGif}
        playsInline
        preload="metadata"
      />
    )
  }

  return (
    <img
      src={item.url}
      alt={item.alt_text || ""}
      className={className}
      loading="lazy"
    />
  )
}

export function TweetMedia({ media }: TweetMediaProps) {
  const items = media.filter((m) => m.url)
  if (items.length === 0) return null

  if (items.length === 1) {
    return (
      <div className="overflow-hidden rounded-xl">
        <MediaElement
          item={items[0]}
          className="w-full object-cover"
        />
      </div>
    )
  }

  if (items.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-xl">
        {items.map((item, i) => (
          <MediaElement
            key={i}
            item={item}
            className="h-40 w-full object-cover"
          />
        ))}
      </div>
    )
  }

  // 3 or more: 2x2 grid
  const visible = items.slice(0, 4)
  const remaining = items.length - 4

  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl">
      {visible.map((item, i) => (
        <div key={i} className="relative">
          <MediaElement
            item={item}
            className="h-28 w-full object-cover"
          />
          {i === 3 && remaining > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <span className="text-lg font-bold text-white">+{remaining}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
