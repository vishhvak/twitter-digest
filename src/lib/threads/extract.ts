import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

const ThreadTweetSchema = z.object({
  author_handle: z.string().describe('The @handle of the tweet author, without the @'),
  author_name: z.string().describe('The display name of the tweet author'),
  tweet_text: z.string().describe('The full text content of this tweet'),
  media_urls: z.array(z.string()).describe('URLs of any images or videos in this tweet'),
})

const ThreadExtractionSchema = z.object({
  is_thread: z.boolean().describe('True if the bookmarked tweet is part of a multi-tweet thread by the SAME author'),
  tweets: z.array(ThreadTweetSchema).describe('All tweets in the thread in chronological order, including the bookmarked tweet itself. Only include tweets by the SAME author as the original tweet — ignore replies from other users.'),
})

/**
 * Detect if a bookmarked tweet is a thread and extract all thread tweets.
 * Uses Stagehand/Browserbase to navigate to the tweet and analyze it.
 */
export async function extractThread(bookmarkId: string, tweetUrl: string, expectedAuthor: string | null): Promise<{
  isThread: boolean
  tweetCount: number
}> {
  // Dynamic import Stagehand
  let Stagehand: any
  try {
    const mod = await import('@browserbasehq/stagehand')
    Stagehand = mod.Stagehand
  } catch {
    console.warn('Stagehand not available, skipping thread detection')
    return { isThread: false, tweetCount: 0 }
  }

  let stagehand: any = null
  const supabase = createAdminClient()

  try {
    stagehand = new Stagehand({
      env: 'BROWSERBASE',
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
    })

    await stagehand.init()
    const page = stagehand.context.pages()[0]

    // Navigate to the tweet
    await page.goto(tweetUrl, { waitUntil: 'networkidle', timeout: 25000 })

    // Wait a moment for thread to render
    await page.waitForTimeout(2000)

    // Extract thread data
    const authorHint = expectedAuthor ? ` The bookmarked tweet is by @${expectedAuthor}.` : ''
    const result = await stagehand.extract({
      instruction: `Analyze this Twitter/X page. Determine if the displayed tweet is part of a thread (multiple consecutive tweets by the SAME author, connected with a thread line).${authorHint}

If it IS a thread, extract ALL tweets in the thread by that same author in chronological order (oldest first). Include the bookmarked tweet itself. Do NOT include replies from other users — only tweets from the thread author.

If it is NOT a thread (just a single tweet, or a tweet with replies from others), set is_thread to false and include just the single tweet in the tweets array.`,
      schema: ThreadExtractionSchema,
    })

    if (!result || !result.tweets || result.tweets.length === 0) {
      return { isThread: false, tweetCount: 0 }
    }

    const isThread = result.is_thread && result.tweets.length > 1

    if (isThread) {
      // Delete any existing thread tweets for this bookmark (in case of re-extraction)
      await supabase
        .from('thread_tweets')
        .delete()
        .eq('bookmark_id', bookmarkId)

      // Insert thread tweets
      const threadRows = result.tweets.map((tweet: any, index: number) => ({
        bookmark_id: bookmarkId,
        position: index + 1,
        author_handle: tweet.author_handle?.replace('@', '') || expectedAuthor,
        author_name: tweet.author_name || null,
        tweet_text: tweet.tweet_text,
        media: (tweet.media_urls || []).map((url: string) => ({ url, type: null, alt_text: null })),
      }))

      const { error } = await supabase
        .from('thread_tweets')
        .insert(threadRows)

      if (error) {
        console.error(`Failed to insert thread tweets for bookmark ${bookmarkId}:`, error)
        return { isThread: false, tweetCount: 0 }
      }

      // Update the bookmark
      await supabase
        .from('bookmarks')
        .update({
          is_thread: true,
          thread_tweet_count: result.tweets.length,
          // Update tweet_text to be the full thread concatenated (better for search)
          tweet_text: result.tweets.map((t: any) => t.tweet_text).join('\n\n'),
        })
        .eq('id', bookmarkId)

      console.log(`Thread detected for bookmark ${bookmarkId}: ${result.tweets.length} tweets`)
    }

    return { isThread, tweetCount: result.tweets.length }
  } catch (e) {
    console.error(`Thread extraction failed for ${tweetUrl}:`, e)
    return { isThread: false, tweetCount: 0 }
  } finally {
    await stagehand?.close().catch(() => {})
  }
}

/**
 * Process thread detection for newly synced bookmarks that are Twitter/X URLs.
 * Runs as a background job after sync completes.
 */
export async function detectThreadsForNewBookmarks(bookmarkIds: string[]) {
  const supabase = createAdminClient()

  // Fetch bookmarks that are Twitter/X links and haven't been thread-checked yet
  const { data: bookmarks } = await supabase
    .from('bookmarks')
    .select('id, url, tweet_author, thread_tweet_count')
    .in('id', bookmarkIds)
    .eq('thread_tweet_count', 0)

  if (!bookmarks || bookmarks.length === 0) return

  // Filter to only Twitter/X URLs
  const twitterBookmarks = bookmarks.filter(bm =>
    bm.url.match(/(?:twitter|x)\.com\/\w+\/status/)
  )

  // Process sequentially to avoid overwhelming Browserbase
  for (const bm of twitterBookmarks) {
    try {
      await extractThread(bm.id, bm.url, bm.tweet_author)
    } catch (e) {
      console.error(`Thread detection failed for ${bm.url}:`, e)
    }
  }
}
