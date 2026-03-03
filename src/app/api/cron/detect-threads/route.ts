import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractThread } from '@/lib/threads/extract'

/**
 * Background job: detect threads for Twitter/X bookmarks that haven't been checked yet.
 * Uses twitterapi.io — processes up to 10 bookmarks per run (fast API calls, no browser).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10')

  // Find bookmarks that are Twitter/X URLs and haven't been thread-checked
  const { data: bookmarks, error } = await supabase
    .from('bookmarks')
    .select('id, url, tweet_author')
    .eq('thread_tweet_count', 0)
    .or('url.like.%twitter.com%,url.like.%x.com%')
    .order('raindrop_created_at', { ascending: false })
    .limit(limit)

  if (error || !bookmarks || bookmarks.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No unchecked bookmarks found' })
  }

  // Filter to actual tweet status URLs
  const tweetBookmarks = bookmarks.filter(bm =>
    bm.url.match(/(?:twitter|x)\.com\/\w+\/status/)
  )

  let processed = 0
  let threads = 0

  for (const bm of tweetBookmarks) {
    try {
      const result = await extractThread(bm.id, bm.url, bm.tweet_author)
      processed++
      if (result.isThread) threads++

      // If not a thread, mark as checked (count = 1 means single tweet, checked)
      if (!result.isThread) {
        await supabase
          .from('bookmarks')
          .update({ thread_tweet_count: 1 })
          .eq('id', bm.id)
      }
    } catch (e) {
      console.error(`Thread detection failed for ${bm.url}:`, e)
      // Mark as checked to avoid retrying forever
      await supabase
        .from('bookmarks')
        .update({ thread_tweet_count: -1 }) // -1 = error
        .eq('id', bm.id)
    }
  }

  return NextResponse.json({ processed, threads, total: tweetBookmarks.length })
}

export const maxDuration = 60
