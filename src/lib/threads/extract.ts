import { createAdminClient } from '@/lib/supabase/admin'
import {
  TwitterApiClient,
  extractMediaFromTweet,
  getAuthorHandle,
  getAuthorName,
  getAuthorAvatar,
  getAuthorId,
  TwitterApiTweet,
} from '@/lib/twitter/client'

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

    const authorId = getAuthorId(mainTweet)
    const authorHandle = getAuthorHandle(mainTweet)
    const authorName = getAuthorName(mainTweet)
    const authorAvatar = getAuthorAvatar(mainTweet)

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

    // 2. Determine conversation ID — if this tweet IS the root, its ID = conversationId
    //    If it's a reply in a thread, conversationId points to the root
    const conversationId = mainTweet.conversationId || tweetId

    // 3. Fetch all tweets by the same author in this conversation
    const conversationTweets = await twitter.getThreadTweets(conversationId, authorHandle)

    // Deduplicate and include the main tweet + root if not in results
    const threadTweets: TwitterApiTweet[] = []
    const seenIds = new Set<string>()

    // Add the main tweet
    threadTweets.push(mainTweet)
    seenIds.add(mainTweet.id)

    // If conversation root is different from main tweet, fetch and add it
    if (conversationId !== tweetId && !seenIds.has(conversationId)) {
      const rootTweet = await twitter.getTweet(conversationId)
      if (rootTweet && getAuthorId(rootTweet) === authorId) {
        threadTweets.push(rootTweet)
        seenIds.add(rootTweet.id)
      }
    }

    // Add conversation search results — only self-replies (replying to themselves)
    // Filter out replies to other users (e.g., author answering someone else in the convo)
    for (const tweet of conversationTweets) {
      if (seenIds.has(tweet.id)) continue

      // Include if: not a reply (root), or replying to themselves
      const isRootTweet = !tweet.isReply || !tweet.inReplyToId
      const isSelfReply = tweet.inReplyToUsername === authorHandle ||
        tweet.inReplyToUserId === authorId
      const isReplyToThreadTweet = tweet.inReplyToId && seenIds.has(tweet.inReplyToId)

      if (isRootTweet || isSelfReply || isReplyToThreadTweet) {
        threadTweets.push(tweet)
        seenIds.add(tweet.id)
      }
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
        author_handle: getAuthorHandle(tweet) || authorHandle,
        author_name: getAuthorName(tweet) || authorName,
        author_avatar_url: getAuthorAvatar(tweet) || authorAvatar,
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
        tweet_author: getAuthorHandle(tweet),
        tweet_author_name: getAuthorName(tweet),
        tweet_text: tweet.text,
        cover_image_url: getAuthorAvatar(tweet),
        media: media.map((m) => ({ url: m.url, type: m.type, alt_text: null })),
      })
      .eq('id', bookmarkId)
  } catch (e) {
    console.error(`Enrichment failed for ${tweetUrl}:`, e)
  }
}
