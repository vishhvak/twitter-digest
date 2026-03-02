"use client"

import { MediaItem } from "@/lib/supabase/types"

interface TweetMediaProps {
  media: MediaItem[]
}

export function TweetMedia({ media }: TweetMediaProps) {
  const items = media.filter((m) => m.url)
  if (items.length === 0) return null

  if (items.length === 1) {
    return (
      <div className="overflow-hidden rounded-xl">
        <img
          src={items[0].url}
          alt={items[0].alt_text || ""}
          className="w-full object-cover"
          style={{ maxHeight: "300px" }}
          loading="lazy"
        />
      </div>
    )
  }

  if (items.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-xl">
        {items.map((item, i) => (
          <img
            key={i}
            src={item.url}
            alt={item.alt_text || ""}
            className="h-40 w-full object-cover"
            loading="lazy"
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
          <img
            src={item.url}
            alt={item.alt_text || ""}
            className="h-28 w-full object-cover"
            loading="lazy"
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
