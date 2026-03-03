const TWITTER_API_BASE = 'https://api.twitterapi.io'

interface TwitterApiTweet {
  type: string
  id: string
  url: string
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
    id: string
    username: string
    name: string
    profileImageUrl: string
    verified: boolean
  }
  entities: {
    hashtags: any[]
    urls: any[]
    mentions: any[]
    media?: {
      url: string
      type: string
      media_url_https?: string
      expanded_url?: string
    }[]
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
  quoted_tweet: TwitterApiTweet | null
  retweeted_tweet: TwitterApiTweet | null
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

    const res = await fetch(url.toString(), {
      headers: { 'x-api-key': this.apiKey },
    })

    if (!res.ok) {
      throw new Error(`TwitterAPI.io error: ${res.status} ${res.statusText}`)
    }

    return res.json()
  }

  /**
   * Fetch a single tweet by ID with full details.
   */
  async getTweet(tweetId: string): Promise<TwitterApiTweet | null> {
    const data = await this.fetch<TweetsResponse>('/twitter/tweets', {
      tweet_ids: tweetId,
    })

    if (data.status !== 'success' || !data.tweets?.length) return null
    return data.tweets[0]
  }

  /**
   * Fetch thread context for a tweet — returns all tweets in the conversation thread.
   * This includes parent tweets and replies. We filter to same-author tweets to get the thread.
   */
  async getThreadContext(tweetId: string): Promise<TwitterApiTweet[]> {
    const allTweets: TwitterApiTweet[] = []
    let cursor = ''

    // Paginate through thread context
    for (let page = 0; page < 10; page++) {
      const params: Record<string, string> = { tweetId }
      if (cursor) params.cursor = cursor

      const data = await this.fetch<ThreadContextResponse>(
        '/twitter/tweet/thread_context',
        params
      )

      if (data.status !== 'success') break
      if (data.replies?.length) {
        allTweets.push(...data.replies)
      }

      if (!data.has_next_page || !data.next_cursor) break
      cursor = data.next_cursor
    }

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

export type { TwitterApiTweet }
