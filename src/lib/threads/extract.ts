import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/logger'
import {
  TwitterApiClient,
  extractMediaFromTweet,
  getAuthorHandle,
  getAuthorName,
  getAuthorAvatar,
  getAuthorId,
  TwitterApiTweet,
} from '@/lib/twitter/client'

const log = createLogger('extract')

/**
 * Extract tweet ID from a Twitter/X URL (status or article).
 */
function extractTweetId(url: string): string | null {
  const match = url.match(/(?:twitter|x)\.com\/\w+\/(?:status|article)\/(\d+)/)
  return match ? match[1] : null
}

/**
 * Check if a URL is a Twitter article.
 */
export function isArticleUrl(url: string): boolean {
  return /(?:twitter|x)\.com\/\w+\/article\//.test(url)
}

/**
 * Run plain-text article body through GPT to add markdown formatting.
 * Preserves all original content — only adds structure (headings, bold, lists, etc.).
 */
async function formatArticleBody(rawBody: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    log.warn('OPENAI_API_KEY not set, skipping article formatting')
    return rawBody
  }

  const charCount = rawBody.length
  log.info(`Formatting article body with GPT (${charCount} chars)`)
  const start = Date.now()

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const res = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      max_completion_tokens: 4000,
      messages: [
        {
          role: 'system',
          content:
            'You are a text formatter. Given plain text from an article, add markdown formatting to improve readability. Add headings (##, ###), bold for key terms, bullet/numbered lists where appropriate. Do NOT change, summarize, or omit any content. Return only the formatted markdown, nothing else.',
        },
        { role: 'user', content: rawBody },
      ],
    })
    const elapsed = Date.now() - start
    const formatted = res.choices[0]?.message?.content || rawBody
    log.info(`Article formatted in ${elapsed}ms (${rawBody.length} → ${formatted.length} chars, tokens: ${res.usage?.total_tokens || '?'})`)
    return formatted
  } catch (e) {
    log.error('Article formatting failed, using raw text', e)
    return rawBody
  }
}

/**
 * Check if a tweet's entity URLs contain a link to a Twitter article.
 * Handles the case where a /status/ tweet contains a t.co link to /article/.
 */
function findLinkedArticleUrl(tweet: TwitterApiTweet): string | null {
  const urls = tweet.entities?.urls
  if (!urls?.length) return null
  for (const u of urls) {
    const expanded = u.expanded_url || u.url || ''
    if (isArticleUrl(expanded)) {
      log.info(`Found linked article URL in tweet entities: ${expanded}`)
      return expanded
    }
  }
  return null
}

/**
 * Detect if a bookmarked tweet is a thread and extract all thread tweets.
 * Uses twitterapi.io API — fast, no browser needed.
 */
export async function extractThread(
  bookmarkId: string,
  tweetUrl: string,
  _expectedAuthor: string | null
): Promise<{ isThread: boolean; tweetCount: number }> {
  const apiKey = process.env.TWITTER_API_KEY
  if (!apiKey) {
    log.warn('TWITTER_API_KEY not set, skipping thread detection')
    return { isThread: false, tweetCount: 0 }
  }

  const tweetId = extractTweetId(tweetUrl)
  if (!tweetId) {
    log.warn(`Could not extract tweet ID from URL: ${tweetUrl}`)
    return { isThread: false, tweetCount: 0 }
  }

  log.info(`extractThread: bookmark=${bookmarkId} tweet=${tweetId} url=${tweetUrl}`)
  const start = Date.now()

  const twitter = new TwitterApiClient(apiKey)
  const supabase = createAdminClient()

  try {
    // 1. Fetch the bookmarked tweet to get author info
    const mainTweet = await twitter.getTweet(tweetId)
    if (!mainTweet) {
      log.error(`Could not fetch tweet ${tweetId}`)
      return { isThread: false, tweetCount: 0 }
    }

    const authorId = getAuthorId(mainTweet)
    const authorHandle = getAuthorHandle(mainTweet)
    const authorName = getAuthorName(mainTweet)
    const authorAvatar = getAuthorAvatar(mainTweet)

    log.info(`Tweet fetched: @${authorHandle} (${authorName}), conversationId=${mainTweet.conversationId}, isReply=${mainTweet.isReply}, replyCount=${mainTweet.replyCount}`)

    // Extract quoted tweet data if present
    let quotedTweet = null
    let tweetType: string | null = null
    if (mainTweet.quoted_tweet) {
      const qt = mainTweet.quoted_tweet
      quotedTweet = {
        url: qt.url || `https://x.com/${getAuthorHandle(qt)}/status/${qt.id}`,
        text: qt.text,
        author_handle: getAuthorHandle(qt),
        author_name: getAuthorName(qt),
        author_avatar_url: getAuthorAvatar(qt),
        media: extractMediaFromTweet(qt).map((m) => ({ url: m.url, type: m.type })),
      }
      tweetType = 'quote'
      log.info(`Quote tweet detected: @${getAuthorHandle(qt)} — "${qt.text?.slice(0, 60)}..."`)
    }

    // Check if this tweet links to an article (t.co -> /article/ URL)
    const articleUrl = findLinkedArticleUrl(mainTweet)
    if (articleUrl) {
      log.info(`Tweet links to article, routing to extractArticle (bookmark=${bookmarkId})`)
      // Update bookmark with tweet data first, then extract the article
      await supabase
        .from('bookmarks')
        .update({
          tweet_author: authorHandle,
          tweet_author_name: authorName,
          tweet_text: mainTweet.text,
          cover_image_url: authorAvatar,
        })
        .eq('id', bookmarkId)

      // The article API needs the tweet ID, not the article URL's ID.
      // Use the original tweet URL which has the correct ID.
      const success = await extractArticle(bookmarkId, tweetUrl)
      if (!success) {
        log.warn(`Could not fetch article for tweet ${tweetId}`)
      }
      return { isThread: false, tweetCount: 1 }
    }

    // Also update the bookmark with richer tweet data from the API
    await supabase
      .from('bookmarks')
      .update({
        tweet_author: authorHandle,
        tweet_author_name: authorName,
        tweet_text: mainTweet.text,
        cover_image_url: authorAvatar,
        ...(quotedTweet && { quoted_tweet: quotedTweet, tweet_type: tweetType }),
      })
      .eq('id', bookmarkId)

    // 2. Determine conversation ID — if this tweet IS the root, its ID = conversationId
    //    If it's a reply in a thread, conversationId points to the root
    const conversationId = mainTweet.conversationId || tweetId

    // 3. Early exit: root tweet with no replies can't be a thread — skip expensive search
    if (conversationId === tweetId && mainTweet.replyCount === 0) {
      const elapsed = Date.now() - start
      log.info(`Single tweet (no replies), skipping thread search (${elapsed}ms)`)
      return { isThread: false, tweetCount: 1 }
    }

    log.info(`Potential thread: conversationId=${conversationId}, replyCount=${mainTweet.replyCount} — searching for self-replies`)

    // 4. Fetch all tweets by the same author in this conversation
    const conversationTweets = await twitter.getThreadTweets(conversationId, authorHandle)

    // Deduplicate and include the main tweet + root if not in results
    const threadTweets: TwitterApiTweet[] = []
    const seenIds = new Set<string>()

    // Add the main tweet
    threadTweets.push(mainTweet)
    seenIds.add(mainTweet.id)

    // If conversation root is different from main tweet, fetch and add it
    if (conversationId !== tweetId && !seenIds.has(conversationId)) {
      log.info(`Fetching conversation root tweet ${conversationId}`)
      const rootTweet = await twitter.getTweet(conversationId)
      if (rootTweet && getAuthorId(rootTweet) === authorId) {
        threadTweets.push(rootTweet)
        seenIds.add(rootTweet.id)
      } else {
        log.info(`Root tweet ${conversationId} not by same author or not found`)
      }
    }

    // Add conversation search results — only self-replies (replying to themselves)
    let addedFromSearch = 0
    for (const tweet of conversationTweets) {
      if (seenIds.has(tweet.id)) continue

      const isRootTweet = !tweet.isReply || !tweet.inReplyToId
      const isSelfReply = tweet.inReplyToUsername === authorHandle ||
        tweet.inReplyToUserId === authorId
      const isReplyToThreadTweet = tweet.inReplyToId && seenIds.has(tweet.inReplyToId)

      if (isRootTweet || isSelfReply || isReplyToThreadTweet) {
        threadTweets.push(tweet)
        seenIds.add(tweet.id)
        addedFromSearch++
      }
    }

    log.info(`Thread assembly: ${threadTweets.length} total (1 main + ${addedFromSearch} from search, ${conversationTweets.length - addedFromSearch} filtered out)`)

    // Sort chronologically (oldest first)
    threadTweets.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    const isThread = threadTweets.length > 1

    if (!isThread) {
      const elapsed = Date.now() - start
      log.info(`Not a thread (only 1 tweet after dedup/filter) (${elapsed}ms)`)
      return { isThread: false, tweetCount: 1 }
    }

    // 4. Store thread tweets in DB
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
      log.error(`Failed to insert thread tweets for bookmark ${bookmarkId}`, error)
      return { isThread: false, tweetCount: 0 }
    }

    // 5. Update the parent bookmark
    await supabase
      .from('bookmarks')
      .update({
        is_thread: true,
        thread_tweet_count: threadTweets.length,
        tweet_text: threadTweets.map((t) => t.text).join('\n\n'),
      })
      .eq('id', bookmarkId)

    const elapsed = Date.now() - start
    log.info(`Thread detected: bookmark=${bookmarkId}, ${threadTweets.length} tweets by @${authorHandle} (${elapsed}ms)`)

    return { isThread: true, tweetCount: threadTweets.length }
  } catch (e) {
    log.error(`Thread extraction failed for ${tweetUrl}`, e)
    return { isThread: false, tweetCount: 0 }
  }
}

/**
 * Fetch and store a Twitter article's content.
 */
export async function extractArticle(
  bookmarkId: string,
  articleUrl: string
): Promise<boolean> {
  const apiKey = process.env.TWITTER_API_KEY
  if (!apiKey) {
    log.warn('TWITTER_API_KEY not set, skipping article extraction')
    return false
  }

  const tweetId = extractTweetId(articleUrl)
  if (!tweetId) {
    log.warn(`Could not extract tweet ID from article URL: ${articleUrl}`)
    return false
  }

  log.info(`extractArticle: bookmark=${bookmarkId} tweetId=${tweetId} url=${articleUrl}`)
  const start = Date.now()

  const twitter = new TwitterApiClient(apiKey)
  const supabase = createAdminClient()

  try {
    const article = await twitter.getArticle(tweetId)
    if (!article) {
      log.warn(`Article API returned null for tweetId=${tweetId}`)
      return false
    }

    const authorHandle = article.author?.userName || article.author?.username || ''
    const authorName = article.author?.name || ''
    const authorAvatar = article.author?.profilePicture || article.author?.profileImageUrl || ''

    log.info(`Article fetched: "${article.title}" by @${authorHandle} (${article.contents?.length || 0} content blocks)`)

    // Concatenate article body — filter out whitespace-only spacer blocks
    const rawBody = article.contents
      .map((c) => c.text)
      .filter((t) => t.trim())
      .join('\n\n')

    // Format with GPT to add markdown structure (headings, bold, lists, etc.)
    const body = await formatArticleBody(rawBody)

    const articleContent = {
      title: article.title,
      preview_text: article.preview_text,
      cover_image_url: article.cover_media_img_url,
      body,
    }

    await supabase
      .from('bookmarks')
      .update({
        tweet_author: authorHandle,
        tweet_author_name: authorName,
        tweet_text: article.preview_text,
        tweet_type: 'article',
        cover_image_url: authorAvatar,
        article_content: articleContent,
        thread_tweet_count: 1,
      })
      .eq('id', bookmarkId)

    const elapsed = Date.now() - start
    log.info(`Article stored: bookmark=${bookmarkId}, "${article.title}" by @${authorHandle} (${elapsed}ms)`)
    return true
  } catch (e) {
    log.error(`Article extraction failed for ${articleUrl}`, e)
    return false
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

  log.info(`enrichBookmark: bookmark=${bookmarkId} tweet=${tweetId}`)

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

    log.info(`Enriched bookmark ${bookmarkId}: @${getAuthorHandle(tweet)}, ${media.length} media`)
  } catch (e) {
    log.error(`Enrichment failed for ${tweetUrl}`, e)
  }
}
