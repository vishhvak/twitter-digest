import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const cursor = request.nextUrl.searchParams.get('cursor')
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20')
  const tag = request.nextUrl.searchParams.get('tag')

  const supabase = createAdminClient()

  let query = supabase
    .from('bookmarks')
    .select('*, thread_tweets_rel:thread_tweets(*)') // Join thread tweets
    .order('raindrop_created_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    query = query.lt('raindrop_created_at', cursor)
  }

  if (tag) {
    query = query.contains('tags', [tag])
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Map the joined thread_tweets_rel into the thread field, sorted by position
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookmarks = (data || []).map((bm: Record<string, any>) => {
    const threadTweets = (bm.thread_tweets_rel || []).sort(
      (a: { position: number }, b: { position: number }) => a.position - b.position
    )
    const { thread_tweets_rel, ...rest } = bm
    return { ...rest, thread: threadTweets.length > 0 ? threadTweets : undefined }
  })

  const hasMore = bookmarks.length > limit
  const items = hasMore ? bookmarks.slice(0, limit) : bookmarks
  const lastItem = items[items.length - 1]
  const nextCursor = hasMore && lastItem ? (lastItem as Record<string, unknown>).raindrop_created_at as string : null

  return NextResponse.json({ bookmarks: items, nextCursor })
}
