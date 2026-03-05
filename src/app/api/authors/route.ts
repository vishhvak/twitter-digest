import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const prefix = request.nextUrl.searchParams.get('q')?.toLowerCase() || ''
  if (prefix.length < 2) {
    return NextResponse.json({ authors: [] })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('bookmarks')
    .select('tweet_author, tweet_author_name, cover_image_url')
    .ilike('tweet_author', `${prefix}%`)
    .not('tweet_author', 'is', null)
    .order('raindrop_created_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ authors: [] })
  }

  // Deduplicate and count
  const authorMap = new Map<string, { handle: string; name: string | null; avatar: string | null; count: number }>()
  for (const row of data || []) {
    const handle = row.tweet_author!.toLowerCase()
    const existing = authorMap.get(handle)
    if (existing) {
      existing.count++
      if (!existing.name && row.tweet_author_name) existing.name = row.tweet_author_name
      if (!existing.avatar && row.cover_image_url?.includes('profile_images')) existing.avatar = row.cover_image_url
    } else {
      authorMap.set(handle, {
        handle: row.tweet_author!,
        name: row.tweet_author_name,
        avatar: row.cover_image_url?.includes('profile_images') ? row.cover_image_url : null,
        count: 1,
      })
    }
  }

  const authors = Array.from(authorMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return NextResponse.json({ authors })
}
