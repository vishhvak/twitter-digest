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
  const bookmarks = (data || []).map((bm: any) => {
    const threadTweets = (bm.thread_tweets_rel || []).sort(
      (a: any, b: any) => a.position - b.position
    )
    const { thread_tweets_rel, ...rest } = bm
    return { ...rest, thread: threadTweets.length > 0 ? threadTweets : undefined }
  })

  const hasMore = bookmarks.length > limit
  const items = hasMore ? bookmarks.slice(0, limit) : bookmarks
  const nextCursor = hasMore ? items[items.length - 1]?.raindrop_created_at : null

  return NextResponse.json({ bookmarks: items, nextCursor })
}
