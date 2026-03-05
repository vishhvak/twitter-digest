import { createLogger } from '@/lib/logger'

const TWITTER_API_BASE = 'https://api.twitterapi.io'
const log = createLogger('twitter-api')

interface TwitterApiTweet {
  type: string
  id: string
  url: string
  twitterUrl?: string
  text: string
  source: string
  retweetCount: number
  replyCount: number
  likeCount: number
  quoteCount: number
  viewCount: number
  createdAt: string
  lang: string
  bookmarkCount: number
  isReply: boolean
  inReplyToId: string | null
  conversationId: string
  inReplyToUserId: string | null
  inReplyToUsername: string | null
  author: {
    type?: string
    id: string
    // API returns userName (camelCase), not username
    userName?: string
    username?: string
    name: string
    // API returns profilePicture, not profileImageUrl
    profilePicture?: string
    profileImageUrl?: string
    isBlueVerified?: boolean
    isVerified?: boolean
    verified?: boolean
    description?: string
    followers?: number
    following?: number
  }
  entities: {
    hashtags: any[]
    urls: any[]
    mentions: any[]
    media?: any[]
  }
  extendedEntities?: {
    media?: {
      media_url_https: string
      type: string
      video_info?: {
        variants: { url: string; bitrate?: number; content_type: string }[]
      }
    }[]
  }
  // Snake case variant the API sometimes returns
  extended_entities?: {
    media?: {
      media_url_https: string
      type: string
      video_info?: {
        variants: { url: string; bitrate?: number; content_type: string }[]
      }
    }[]
  }
  quoted_tweet: TwitterApiTweet | null
  retweeted_tweet: TwitterApiTweet | null
}

interface TwitterApiArticle {
  author: TwitterApiTweet['author']
  title: string
  preview_text: string
  cover_media_img_url: string | null
  contents: { text: string }[]
  replyCount: number
  likeCount: number
  quoteCount: number
  viewCount: number
  createdAt: string
}

interface ThreadContextResponse {
  replies: TwitterApiTweet[]
  has_next_page: boolean
  next_cursor: string
  status: string
  message: string
}

interface TweetsResponse {
  tweets: TwitterApiTweet[]
  status: string
  message: string
}

export class TwitterApiClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${TWITTER_API_BASE}${path}`)
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    }

    log.info(`→ ${path}`, params)
    const start = Date.now()

    const res = await fetch(url.toString(), {
      headers: { 'x-api-key': this.apiKey },
    })

    const elapsed = Date.now() - start

    if (!res.ok) {
      log.error(`← ${path} ${res.status} ${res.statusText} (${elapsed}ms)`)
      const err = new Error(`TwitterAPI.io error: ${res.status} ${res.statusText}`) as Error & { status: number }
      err.status = res.status
      throw err
    }

    const data = await res.json() as T
    log.info(`← ${path} ${res.status} (${elapsed}ms)`)
    return data
  }

  /**
   * Fetch a single tweet by ID with full details.
   */
  async getTweet(tweetId: string): Promise<TwitterApiTweet | null> {
    const data = await this.fetch<TweetsResponse>('/twitter/tweets', {
      tweet_ids: tweetId,
    })

    if (data.status !== 'success' || !data.tweets?.length) {
      log.warn(`getTweet(${tweetId}): API returned status=${data.status}, tweets=${data.tweets?.length || 0}`)
      return null
    }
    const tweet = data.tweets[0]
    log.info(`getTweet(${tweetId}): @${tweet.author?.userName || tweet.author?.username} — "${tweet.text?.slice(0, 80)}..."`)
    return tweet
  }

  /**
   * Fetch a Twitter article by tweet ID.
   */
  async getArticle(tweetId: string): Promise<TwitterApiArticle | null> {
    const data = await this.fetch<{ article: TwitterApiArticle | null; status: string }>(
      '/twitter/article',
      { tweet_id: tweetId }
    )
    if (data.status !== 'success' || !data.article) {
      log.warn(`getArticle(${tweetId}): API returned status=${data.status}, article=${!!data.article}`)
      return null
    }
    log.info(`getArticle(${tweetId}): "${data.article.title}" (${data.article.contents?.length || 0} blocks)`)
    return data.article
  }

  /**
   * Fetch all tweets in a thread by the same author using advanced_search.
   * Uses `conversation_id:{id} from:{author}` to get all self-replies.
   * This is more reliable than thread_context for detecting self-threads.
   */
  async getThreadTweets(conversationId: string, authorHandle: string): Promise<TwitterApiTweet[]> {
    const allTweets: TwitterApiTweet[] = []
    let cursor = ''

    for (let page = 0; page < 5; page++) {
      const params: Record<string, string> = {
        query: `conversation_id:${conversationId} from:${authorHandle}`,
        queryType: 'Latest',
      }
      if (cursor) params.cursor = cursor

      const data = await this.fetch<{
        tweets: TwitterApiTweet[]
        has_next_page: boolean
        next_cursor: string
      }>('/twitter/tweet/advanced_search', params)

      if (data.tweets?.length) {
        allTweets.push(...data.tweets)
      }

      log.info(`getThreadTweets(${conversationId}, @${authorHandle}): page ${page + 1} → ${data.tweets?.length || 0} tweets, hasNext=${data.has_next_page}`)

      if (!data.has_next_page || !data.next_cursor) break
      cursor = data.next_cursor
    }

    log.info(`getThreadTweets(${conversationId}, @${authorHandle}): total ${allTweets.length} tweets`)
    return allTweets
  }
}

/**
 * Extract media URLs from a tweet object.
 */
export function extractMediaFromTweet(tweet: TwitterApiTweet): { url: string; type: string }[] {
  const media: { url: string; type: string }[] = []

  // Check extendedEntities first (has full-size images and video)
  const extMedia = (tweet as any).extendedEntities?.media || (tweet as any).extended_entities?.media
  if (extMedia?.length) {
    for (const m of extMedia) {
      if (m.type === 'video' || m.type === 'animated_gif') {
        // Get best quality video variant
        const variants = m.video_info?.variants
          ?.filter((v: any) => v.content_type === 'video/mp4')
          ?.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))
        if (variants?.length) {
          media.push({ url: variants[0].url, type: m.type })
        } else {
          media.push({ url: m.media_url_https, type: m.type })
        }
      } else {
        media.push({ url: m.media_url_https, type: 'photo' })
      }
    }
    return media
  }

  // Fallback to entities.media
  if (tweet.entities?.media?.length) {
    for (const m of tweet.entities.media) {
      media.push({
        url: m.media_url_https || m.url,
        type: m.type || 'photo',
      })
    }
  }

  return media
}

/**
 * Normalize author fields — API inconsistently uses userName vs username,
 * profilePicture vs profileImageUrl.
 */
export function getAuthorHandle(tweet: TwitterApiTweet): string {
  return tweet.author?.userName || tweet.author?.username || ''
}

export function getAuthorName(tweet: TwitterApiTweet): string {
  return tweet.author?.name || ''
}

export function getAuthorAvatar(tweet: TwitterApiTweet): string {
  return tweet.author?.profilePicture || tweet.author?.profileImageUrl || ''
}

export function getAuthorId(tweet: TwitterApiTweet): string {
  return tweet.author?.id || ''
}

export type { TwitterApiTweet, TwitterApiArticle }
