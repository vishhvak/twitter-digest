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
  thread_tweets: ThreadTweet[]
  raindrop_created_at: string | null
  raindrop_updated_at: string | null
  created_at: string
  embedding?: number[]
}

export interface MediaItem {
  url: string
  type?: string
  alt_text?: string
}

export interface ThreadTweet {
  author?: string
  text?: string
  media?: MediaItem[]
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
