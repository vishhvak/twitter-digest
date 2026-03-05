export interface ArticleContent {
  title: string
  preview_text: string
  cover_image_url: string | null
  body: string
}

export interface QuotedTweet {
  url: string
  text: string
  author_handle: string
  author_name: string
  author_avatar_url: string
  media: MediaItem[]
}

export interface Bookmark {
  id: string
  raindrop_id: number
  url: string
  title: string | null
  excerpt: string | null
  note: string | null
  tweet_author: string | null
  tweet_author_name: string | null
  tweet_text: string | null
  tweet_type: string | null
  content_type: string | null
  tags: string[]
  domain: string | null
  cover_image_url: string | null
  media: MediaItem[]
  is_thread: boolean
  thread_tweets: ThreadTweetLegacy[]
  thread_tweet_count: number
  quoted_tweet: QuotedTweet | null
  article_content: ArticleContent | null
  raindrop_created_at: string | null
  raindrop_updated_at: string | null
  created_at: string
  embedding?: number[]
  // Joined from thread_tweets table
  thread?: ThreadTweet[]
}

export interface MediaItem {
  url: string
  type?: string
  alt_text?: string
}

export interface ThreadTweetLegacy {
  author?: string
  text?: string
  media?: MediaItem[]
}

export interface ThreadTweet {
  id: string
  bookmark_id: string
  position: number
  tweet_url: string | null
  author_handle: string | null
  author_name: string | null
  author_avatar_url: string | null
  tweet_text: string
  media: MediaItem[]
  tweet_created_at: string | null
  created_at: string
}

export interface ExtractedContent {
  id: string
  bookmark_id: string
  source_url: string
  extraction_method: string | null
  title: string | null
  content: string | null
  summary: string | null
  content_type: string | null
  extracted_at: string
}

export interface Digest {
  id: string
  digest_type: 'daily' | 'weekly'
  period_start: string | null
  period_end: string | null
  content: DigestContent | null
  raw_markdown: string | null
  bookmark_ids: string[]
  status: 'pending' | 'generating' | 'complete' | 'failed'
  created_at: string
}

export interface DigestContent {
  title: string
  sections: DigestSection[]
}

export interface DigestSection {
  theme: string
  summary: string
  items: DigestItem[]
}

export interface DigestItem {
  bookmark_id: string
  tweet_text: string
  tweet_author: string
  insight: string
  sources: DigestSource[]
}

export interface DigestSource {
  title: string
  url: string
  type: 'tweet' | 'article' | 'paper' | 'website'
}

export interface SyncState {
  id: number
  last_synced_at: string | null
  last_raindrop_date: string | null
  total_synced: number
}
