import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/logger'
import { extractThread, extractArticle, isArticleUrl } from '@/lib/threads/extract'
import { requireAuth } from '@/lib/supabase/auth'

const log = createLogger('resync')

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authenticated } = await requireAuth()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const start = Date.now()
  log.info(`Resync requested: bookmark=${id}`)

  const supabase = createAdminClient()

  const { data: bookmark, error } = await supabase
    .from('bookmarks')
    .select('id, url, tweet_author')
    .eq('id', id)
    .single()

  if (error || !bookmark) {
    log.warn(`Bookmark not found: ${id}`)
    return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
  }

  log.info(`Resync: url=${bookmark.url} author=${bookmark.tweet_author}`)

  const isTwitter = bookmark.url.match(/(?:twitter|x)\.com\/\w+\/(?:status|article)/)
  if (!isTwitter) {
    log.warn(`Not a Twitter/X URL: ${bookmark.url}`)
    return NextResponse.json({ error: 'Not a Twitter/X URL' }, { status: 400 })
  }

  // Reset so extraction re-processes fully
  await supabase
    .from('bookmarks')
    .update({ thread_tweet_count: 0 })
    .eq('id', id)

  // Delete existing thread tweets to allow re-extraction
  await supabase.from('thread_tweets').delete().eq('bookmark_id', id)

  try {
    if (isArticleUrl(bookmark.url)) {
      log.info(`URL is article, routing to extractArticle`)
      await extractArticle(bookmark.id, bookmark.url)
    } else {
      log.info(`URL is status, routing to extractThread`)
      const result = await extractThread(bookmark.id, bookmark.url, bookmark.tweet_author)

      log.info(`extractThread result: isThread=${result.isThread} tweetCount=${result.tweetCount}`)

      if (!result.isThread) {
        await supabase
          .from('bookmarks')
          .update({ thread_tweet_count: 1 })
          .eq('id', id)
      }
    }

    // Fetch the updated bookmark to return
    const { data: updated } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('id', id)
      .single()

    // Also fetch thread tweets if it's a thread
    let thread = null
    if (updated?.is_thread) {
      const { data: threadTweets } = await supabase
        .from('thread_tweets')
        .select('*')
        .eq('bookmark_id', id)
        .order('position')
      thread = threadTweets
    }

    const elapsed = Date.now() - start
    log.info(`Resync complete: bookmark=${id} type=${updated?.tweet_type || 'tweet'} isThread=${updated?.is_thread} (${elapsed}ms)`)

    return NextResponse.json({
      bookmark: updated ? { ...updated, thread } : null,
    })
  } catch (e) {
    const elapsed = Date.now() - start
    log.error(`Resync failed: bookmark=${id} (${elapsed}ms)`, e)
    await supabase
      .from('bookmarks')
      .update({ thread_tweet_count: -1 })
      .eq('id', id)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
