import { createAdminClient } from '@/lib/supabase/admin'
import { TwitterApiClient, extractMediaFromTweet, TwitterApiTweet } from '@/lib/twitter/client'

/**
 * Extract tweet ID from a Twitter/X URL.
 */
function extractTweetId(url: string): string | null {
  const match = url.match(/(?:twitter|x)\.com\/\w+\/status\/(\d+)/)
  return match ? match[1] : null
}

/**
 * Detect if a bookmarked tweet is a thread and extract all thread tweets.
 * Uses twitterapi.io API — fast, no browser needed.
 */
export async function extractThread(
  bookmarkId: string,
  tweetUrl: string,
  expectedAuthor: string | null
): Promise<{ isThread: boolean; tweetCount: number }> {
  const apiKey = process.env.TWITTER_API_KEY
  if (!apiKey) {
    console.warn('TWITTER_API_KEY not set, skipping thread detection')
    return { isThread: false, tweetCount: 0 }
  }

  const tweetId = extractTweetId(tweetUrl)
  if (!tweetId) {
    return { isThread: false, tweetCount: 0 }
  }

  const twitter = new TwitterApiClient(apiKey)
  const supabase = createAdminClient()

  try {
    // 1. Fetch the bookmarked tweet to get author info
    const mainTweet = await twitter.getTweet(tweetId)
    if (!mainTweet) {
      console.error(`Could not fetch tweet ${tweetId}`)
      return { isThread: false, tweetCount: 0 }
    }

    const authorId = mainTweet.author.id
    const authorHandle = mainTweet.author.username
    const authorName = mainTweet.author.name
    const authorAvatar = mainTweet.author.profileImageUrl

    // Also update the bookmark with richer tweet data from the API
    await supabase
      .from('bookmarks')
      .update({
        tweet_author: authorHandle,
        tweet_author_name: authorName,
        tweet_text: mainTweet.text,
        cover_image_url: authorAvatar,
      })
      .eq('id', bookmarkId)

    // 2. Fetch thread context
    const allTweets = await twitter.getThreadContext(tweetId)

    // 3. Filter to only tweets by the same author (this is the thread)
    // Include the main tweet if not already in the results
    const threadTweets: TwitterApiTweet[] = []
    const seenIds = new Set<string>()

    // The thread_context endpoint returns the conversation tree.
    // We need tweets by the same author that form a chain (reply-to-self).
    for (const tweet of allTweets) {
      if (tweet.author?.id === authorId && !seenIds.has(tweet.id)) {
        threadTweets.push(tweet)
        seenIds.add(tweet.id)
      }
    }

    // Ensure the main tweet is included
    if (!seenIds.has(mainTweet.id)) {
      threadTweets.push(mainTweet)
    }

    // Sort chronologically (oldest first)
    threadTweets.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    const isThread = threadTweets.length > 1

    if (!isThread) {
      // Single tweet, not a thread — mark as checked
      return { isThread: false, tweetCount: 1 }
    }

    // 4. Store thread tweets in DB
    // Delete any existing thread tweets for this bookmark (re-extraction)
    await supabase.from('thread_tweets').delete().eq('bookmark_id', bookmarkId)

    const threadRows = threadTweets.map((tweet, index) => {
      const media = extractMediaFromTweet(tweet)
      return {
        bookmark_id: bookmarkId,
        position: index + 1,
        tweet_url: tweet.url || `https://x.com/${authorHandle}/status/${tweet.id}`,
        author_handle: tweet.author?.username || authorHandle,
        author_name: tweet.author?.name || authorName,
        author_avatar_url: tweet.author?.profileImageUrl || authorAvatar,
        tweet_text: tweet.text,
        media: media.map((m) => ({ url: m.url, type: m.type, alt_text: null })),
        tweet_created_at: tweet.createdAt ? new Date(tweet.createdAt).toISOString() : null,
      }
    })

    const { error } = await supabase.from('thread_tweets').insert(threadRows)

    if (error) {
      console.error(`Failed to insert thread tweets for bookmark ${bookmarkId}:`, error)
      return { isThread: false, tweetCount: 0 }
    }

    // 5. Update the parent bookmark
    await supabase
      .from('bookmarks')
      .update({
        is_thread: true,
        thread_tweet_count: threadTweets.length,
        // Concatenate all thread text for better search
        tweet_text: threadTweets.map((t) => t.text).join('\n\n'),
      })
      .eq('id', bookmarkId)

    console.log(`Thread detected for bookmark ${bookmarkId}: ${threadTweets.length} tweets by @${authorHandle}`)

    return { isThread: true, tweetCount: threadTweets.length }
  } catch (e) {
    console.error(`Thread extraction failed for ${tweetUrl}:`, e)
    return { isThread: false, tweetCount: 0 }
  }
}

/**
 * Also enrich a single-tweet bookmark with data from the Twitter API
 * (author name, avatar, full text, media).
 */
export async function enrichBookmarkFromTwitter(
  bookmarkId: string,
  tweetUrl: string
): Promise<void> {
  const apiKey = process.env.TWITTER_API_KEY
  if (!apiKey) return

  const tweetId = extractTweetId(tweetUrl)
  if (!tweetId) return

  const twitter = new TwitterApiClient(apiKey)
  const supabase = createAdminClient()

  try {
    const tweet = await twitter.getTweet(tweetId)
    if (!tweet) return

    const media = extractMediaFromTweet(tweet)

    await supabase
      .from('bookmarks')
      .update({
        tweet_author: tweet.author.username,
        tweet_author_name: tweet.author.name,
        tweet_text: tweet.text,
        cover_image_url: tweet.author.profileImageUrl,
        media: media.map((m) => ({ url: m.url, type: m.type, alt_text: null })),
      })
      .eq('id', bookmarkId)
  } catch (e) {
    console.error(`Enrichment failed for ${tweetUrl}:`, e)
  }
}
