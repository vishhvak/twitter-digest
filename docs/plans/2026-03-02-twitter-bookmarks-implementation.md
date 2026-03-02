# Twitter Bookmarks AI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a mobile-first web app that syncs Twitter bookmarks from Raindrop.io, provides hybrid search (keyword + semantic), and generates AI-powered daily/weekly digests.

**Architecture:** Next.js 15 App Router frontend talks to Supabase Postgres (pgvector + tsvector). Vercel Cron triggers a sync pipeline that polls Raindrop.io every 5 min and a digest pipeline daily/weekly. Gemini embeddings power semantic search, OpenAI gpt-5-mini generates digests.

**Tech Stack:** Next.js 15, TypeScript, Tailwind v4, Radix UI, cmdk, Supabase (Postgres + pgvector), Gemini embeddings, OpenAI gpt-5-mini, Stagehand/Browserbase, Vercel

**Design doc:** `docs/plans/2026-03-02-twitter-bookmarks-design.md`

---

## Phase 1: Project Scaffolding & Database

### Task 1: Initialize Next.js project

**Files:**
- Create: project root via `create-next-app`

**Step 1: Create Next.js app**

Run:
```bash
cd /Users/vish/Repos/twitter-bookmarks-ai
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --yes
```

Expected: Next.js project scaffolded with TypeScript, Tailwind CSS, ESLint, App Router, src/ directory.

**Step 2: Verify it runs**

Run:
```bash
npm run dev
```

Expected: Dev server starts on localhost:3000. Kill it after confirming.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 project with TypeScript, Tailwind, App Router"
```

---

### Task 2: Install core dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Supabase, Radix, cmdk, and utility packages**

```bash
npm install @supabase/supabase-js @supabase/ssr @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tooltip @radix-ui/react-toggle @radix-ui/react-separator @radix-ui/react-scroll-area @radix-ui/react-tabs cmdk clsx tailwind-merge date-fns lucide-react
```

**Step 2: Install AI/extraction packages**

```bash
npm install openai @google/generative-ai @mozilla/readability jsdom pdf-parse @browserbasehq/stagehand zod
```

**Step 3: Install dev dependencies**

```bash
npm install -D @types/jsdom @types/pdf-parse
```

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install core dependencies (Supabase, Radix, AI, extraction)"
```

---

### Task 3: Set up environment variables

**Files:**
- Create: `.env.local`
- Create: `.env.example`
- Modify: `.gitignore`

**Step 1: Create `.env.local`**

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://zvvafebtvlkhitfxwxmn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2dmFmZWJ0dmxraGl0Znh3eG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0ODgwODksImV4cCI6MjA4ODA2NDA4OX0.YFp74Vp3buPCqffnV3GIMDqqFSSxzKEqzaSzmP_eEzE
SUPABASE_SERVICE_ROLE_KEY=<from dashboard - service_role secret key>

# Raindrop.io
RAINDROP_TEST_TOKEN=<from raindrop dev console>

# Embeddings (Gemini)
GOOGLE_GENERATIVE_AI_API_KEY=YOUR_GOOGLE_API_KEY

# Digest LLM (OpenAI)
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_DIGEST_MODEL=gpt-5-mini

# Browser automation
BROWSERBASE_API_KEY=YOUR_BROWSERBASE_API_KEY
BROWSERBASE_PROJECT_ID=a744b5a7-c956-43b4-bea3-a057a4f0a8c3
STAGEHAND_ENV=BROWSERBASE

# Cron auth
CRON_SECRET=<generate a random 32-char string>
```

Note: We use the legacy `anon` JWT key as `NEXT_PUBLIC_SUPABASE_ANON_KEY` because the `@supabase/ssr` library sends it as a Bearer token internally, which requires JWT format. The new `sb_publishable_` format doesn't work as a Bearer token. For server-side admin operations, use `SUPABASE_SERVICE_ROLE_KEY` (the legacy `service_role` JWT or new `sb_secret_` key).

**Step 2: Create `.env.example`** (no real secrets)

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RAINDROP_TEST_TOKEN=your-raindrop-token
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-key
OPENAI_API_KEY=your-openai-key
OPENAI_DIGEST_MODEL=gpt-5-mini
BROWSERBASE_API_KEY=your-browserbase-key
BROWSERBASE_PROJECT_ID=your-project-id
STAGEHAND_ENV=BROWSERBASE
CRON_SECRET=your-cron-secret
```

**Step 3: Ensure `.env.local` is in `.gitignore`** (should be by default from create-next-app, verify)

**Step 4: Commit**

```bash
git add .env.example .gitignore
git commit -m "feat: add environment variable template"
```

---

### Task 4: Create Supabase database schema

**Files:**
- Database migration via Supabase MCP

**Step 1: Enable required extensions**

Apply migration `enable_extensions`:
```sql
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

**Step 2: Create bookmarks table**

Apply migration `create_bookmarks_table`:
```sql
CREATE TABLE public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raindrop_id bigint UNIQUE NOT NULL,
  url text NOT NULL,
  title text,
  excerpt text,
  note text,
  tweet_author text,
  tweet_author_name text,
  tweet_text text,
  tweet_type text,
  content_type text,
  tags text[] DEFAULT '{}',
  domain text,
  cover_image_url text,
  media jsonb DEFAULT '[]'::jsonb,
  is_thread boolean DEFAULT false,
  thread_tweets jsonb DEFAULT '[]'::jsonb,
  raindrop_created_at timestamptz,
  raindrop_updated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  fts tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(tweet_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(note, '')), 'D')
  ) STORED,
  embedding vector(768)
);

-- Indexes
CREATE INDEX idx_bookmarks_fts ON public.bookmarks USING gin(fts);
CREATE INDEX idx_bookmarks_embedding ON public.bookmarks USING hnsw(embedding vector_cosine_ops);
CREATE INDEX idx_bookmarks_tags ON public.bookmarks USING gin(tags);
CREATE INDEX idx_bookmarks_raindrop_created ON public.bookmarks(raindrop_created_at DESC);
CREATE INDEX idx_bookmarks_raindrop_id ON public.bookmarks(raindrop_id);
```

**Step 3: Create extracted_content table**

Apply migration `create_extracted_content_table`:
```sql
CREATE TABLE public.extracted_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmark_id uuid REFERENCES public.bookmarks(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  extraction_method text,
  title text,
  content text,
  summary text,
  content_type text,
  extracted_at timestamptz DEFAULT now()
);

CREATE INDEX idx_extracted_content_bookmark ON public.extracted_content(bookmark_id);
```

**Step 4: Create digests table**

Apply migration `create_digests_table`:
```sql
CREATE TABLE public.digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_type text NOT NULL,
  period_start timestamptz,
  period_end timestamptz,
  content jsonb,
  raw_markdown text,
  bookmark_ids uuid[] DEFAULT '{}',
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_digests_type_date ON public.digests(digest_type, created_at DESC);
```

**Step 5: Create sync_state table**

Apply migration `create_sync_state_table`:
```sql
CREATE TABLE public.sync_state (
  id int PRIMARY KEY DEFAULT 1,
  last_synced_at timestamptz,
  last_raindrop_date timestamptz,
  total_synced int DEFAULT 0
);

-- Insert singleton row
INSERT INTO public.sync_state (id, last_synced_at, last_raindrop_date, total_synced)
VALUES (1, NULL, NULL, 0);
```

**Step 6: Verify tables exist**

Run SQL: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`

Expected: `bookmarks`, `digests`, `extracted_content`, `sync_state`

---

### Task 5: Create Supabase client utilities

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/supabase/types.ts`

**Step 1: Create TypeScript types for database**

`src/lib/supabase/types.ts`:
```typescript
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
```

**Step 2: Create browser client**

`src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 3: Create server client**

`src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll can fail in Server Components — safe to ignore
          }
        },
      },
    }
  )
}
```

**Step 4: Create admin client** (for server-side operations that bypass RLS)

`src/lib/supabase/admin.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

**Step 5: Commit**

```bash
git add src/lib/supabase/
git commit -m "feat: add Supabase client utilities (browser, server, admin)"
```

---

### Task 6: Create utility functions

**Files:**
- Create: `src/lib/utils.ts`

**Step 1: Create shared utility functions**

`src/lib/utils.ts`:
```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const d = new Date(date)
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + '...'
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return ''
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/utils.ts
git commit -m "feat: add shared utility functions (cn, time formatting, text utils)"
```

---

## Phase 2: Raindrop Sync Pipeline

### Task 7: Create Raindrop API client

**Files:**
- Create: `src/lib/raindrop/client.ts`
- Create: `src/lib/raindrop/types.ts`

**Step 1: Create Raindrop types**

`src/lib/raindrop/types.ts`:
```typescript
export interface RaindropItem {
  _id: number
  link: string
  title: string
  excerpt: string
  note: string
  type: string
  tags: string[]
  cover: string
  media: { link: string }[]
  domain: string
  created: string
  lastUpdate: string
  collection: { $id: number }
  important: boolean
}

export interface RaindropsResponse {
  result: boolean
  items: RaindropItem[]
  count: number
}
```

**Step 2: Create Raindrop API client**

`src/lib/raindrop/client.ts`:
```typescript
import { RaindropItem, RaindropsResponse } from './types'

const RAINDROP_API_BASE = 'https://api.raindrop.io/rest/v1'

export class RaindropClient {
  private token: string

  constructor(token: string) {
    this.token = token
  }

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${RAINDROP_API_BASE}${path}`)
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}` },
    })

    if (!res.ok) {
      throw new Error(`Raindrop API error: ${res.status} ${res.statusText}`)
    }

    return res.json()
  }

  async getRaindrops(options: {
    collectionId?: number
    page?: number
    perpage?: number
    sort?: string
    search?: string
  } = {}): Promise<RaindropsResponse> {
    const { collectionId = 0, page = 0, perpage = 50, sort = '-created', search } = options
    const params: Record<string, string> = {
      page: String(page),
      perpage: String(perpage),
      sort,
    }
    if (search) params.search = search

    return this.fetch<RaindropsResponse>(`/raindrops/${collectionId}`, params)
  }

  async getAllRaindropsSince(sinceDate: string): Promise<RaindropItem[]> {
    const all: RaindropItem[] = []
    let page = 0

    while (true) {
      const response = await this.getRaindrops({
        page,
        search: `created:>${sinceDate}`,
        sort: '-created',
      })

      if (!response.items.length) break
      all.push(...response.items)
      page++

      // Safety: don't fetch more than 200 pages (10K items)
      if (page >= 200) break
    }

    return all
  }

  async getAllRaindrops(): Promise<RaindropItem[]> {
    const all: RaindropItem[] = []
    let page = 0

    while (true) {
      const response = await this.getRaindrops({ page, sort: '-created' })
      if (!response.items.length) break
      all.push(...response.items)
      page++
      if (page >= 200) break
    }

    return all
  }
}
```

**Step 3: Commit**

```bash
git add src/lib/raindrop/
git commit -m "feat: add Raindrop.io API client with pagination support"
```

---

### Task 8: Create embedding generation utility

**Files:**
- Create: `src/lib/embeddings.ts`

**Step 1: Create Gemini embedding function**

`src/lib/embeddings.ts`:
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

  const result = await model.embedContent({
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT' as any,
    outputDimensionality: 768,
  } as any)

  return result.embedding.values
}

export async function generateQueryEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

  const result = await model.embedContent({
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_QUERY' as any,
    outputDimensionality: 768,
  } as any)

  return result.embedding.values
}

export function buildEmbeddingText(bookmark: {
  title?: string | null
  tweet_text?: string | null
  excerpt?: string | null
}): string {
  return [bookmark.title, bookmark.tweet_text, bookmark.excerpt]
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000) // Gemini max ~2048 tokens, stay safe with chars
}
```

**Step 2: Commit**

```bash
git add src/lib/embeddings.ts
git commit -m "feat: add Gemini embedding generation (768d, document + query modes)"
```

---

### Task 9: Create Raindrop sync API route

**Files:**
- Create: `src/app/api/cron/sync-raindrop/route.ts`
- Create: `src/lib/raindrop/sync.ts`

**Step 1: Create sync logic**

`src/lib/raindrop/sync.ts`:
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { RaindropClient } from './client'
import { RaindropItem } from './types'
import { generateEmbedding, buildEmbeddingText } from '@/lib/embeddings'

function mapRaindropToBookmark(item: RaindropItem) {
  // Parse tweet author from title or URL patterns
  const twitterMatch = item.link.match(/(?:twitter|x)\.com\/(\w+)\/status/)
  const tweetAuthor = twitterMatch ? twitterMatch[1] : null

  return {
    raindrop_id: item._id,
    url: item.link,
    title: item.title || null,
    excerpt: item.excerpt || null,
    note: item.note || null,
    tweet_author: tweetAuthor,
    tweet_author_name: null, // Raindrop doesn't provide this
    tweet_text: item.excerpt || null, // Best approximation from Raindrop
    tweet_type: null,
    content_type: item.type || null,
    tags: item.tags || [],
    domain: item.domain || null,
    cover_image_url: item.cover || null,
    media: (item.media || []).map((m) => ({ url: m.link, type: null, alt_text: null })),
    is_thread: false,
    thread_tweets: [],
    raindrop_created_at: item.created,
    raindrop_updated_at: item.lastUpdate,
  }
}

export async function syncRaindrops(options?: { fullBackfill?: boolean }) {
  const supabase = createAdminClient()
  const raindrop = new RaindropClient(process.env.RAINDROP_TEST_TOKEN!)

  // Get sync state
  const { data: syncState } = await supabase
    .from('sync_state')
    .select('*')
    .eq('id', 1)
    .single()

  let items: RaindropItem[]

  if (options?.fullBackfill || !syncState?.last_raindrop_date) {
    // Full backfill: get everything
    items = await raindrop.getAllRaindrops()
  } else {
    // Incremental: only get new items since last sync
    const sinceDate = syncState.last_raindrop_date.split('T')[0] // YYYY-MM-DD
    items = await raindrop.getAllRaindropsSince(sinceDate)
  }

  if (items.length === 0) {
    // Update last_synced_at even if no new items
    await supabase
      .from('sync_state')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', 1)
    return { synced: 0, total: syncState?.total_synced || 0 }
  }

  let syncedCount = 0

  // Process in batches of 10 to avoid overwhelming embedding API
  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10)
    const bookmarks = batch.map(mapRaindropToBookmark)

    // Generate embeddings for the batch
    const embeddingsPromises = bookmarks.map(async (bm) => {
      const text = buildEmbeddingText(bm)
      if (!text.trim()) return null
      try {
        return await generateEmbedding(text)
      } catch (e) {
        console.error(`Embedding failed for raindrop ${bm.raindrop_id}:`, e)
        return null
      }
    })

    const embeddings = await Promise.all(embeddingsPromises)

    // Upsert bookmarks with embeddings
    for (let j = 0; j < bookmarks.length; j++) {
      const bookmark = bookmarks[j]
      const embedding = embeddings[j]

      const { error } = await supabase
        .from('bookmarks')
        .upsert(
          {
            ...bookmark,
            embedding: embedding ? `[${embedding.join(',')}]` : null,
          },
          { onConflict: 'raindrop_id' }
        )

      if (error) {
        console.error(`Upsert failed for raindrop ${bookmark.raindrop_id}:`, error)
      } else {
        syncedCount++
      }
    }
  }

  // Update sync state
  const latestDate = items[0]?.created || new Date().toISOString()
  await supabase
    .from('sync_state')
    .update({
      last_synced_at: new Date().toISOString(),
      last_raindrop_date: latestDate,
      total_synced: (syncState?.total_synced || 0) + syncedCount,
    })
    .eq('id', 1)

  return { synced: syncedCount, total: (syncState?.total_synced || 0) + syncedCount }
}
```

**Step 2: Create cron API route**

`src/app/api/cron/sync-raindrop/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { syncRaindrops } from '@/lib/raindrop/sync'

export async function POST(request: NextRequest) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncRaindrops()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Sync failed:', error)
    return NextResponse.json(
      { error: 'Sync failed', message: String(error) },
      { status: 500 }
    )
  }
}
```

**Step 3: Create backfill route**

Create `src/app/api/admin/backfill/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { syncRaindrops } from '@/lib/raindrop/sync'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncRaindrops({ fullBackfill: true })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Backfill failed:', error)
    return NextResponse.json(
      { error: 'Backfill failed', message: String(error) },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 min timeout for backfill
```

**Step 4: Commit**

```bash
git add src/lib/raindrop/sync.ts src/app/api/cron/ src/app/api/admin/
git commit -m "feat: add Raindrop sync pipeline with incremental + backfill modes"
```

---

### Task 10: Create Vercel cron config

**Files:**
- Create: `vercel.json`

**Step 1: Create Vercel config with cron schedules**

`vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/sync-raindrop",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Note: Digest crons will be added in Phase 5.

**Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat: add Vercel cron config for Raindrop sync (every 5 min)"
```

---

## Phase 3: Hybrid Search

### Task 11: Create search API route

**Files:**
- Create: `src/app/api/search/route.ts`
- Create: `src/lib/search.ts`

**Step 1: Create search logic with RRF fusion**

`src/lib/search.ts`:
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { generateQueryEmbedding } from '@/lib/embeddings'
import { Bookmark } from '@/lib/supabase/types'

interface SearchResult extends Bookmark {
  score: number
  match_type: 'keyword' | 'semantic' | 'hybrid'
}

const RRF_K = 60

export async function hybridSearch(query: string, limit = 20): Promise<SearchResult[]> {
  const supabase = createAdminClient()

  // Run keyword and semantic search in parallel
  const [keywordResults, semanticResults] = await Promise.all([
    keywordSearch(supabase, query, limit),
    semanticSearch(supabase, query, limit),
  ])

  // Build RRF score map
  const scoreMap = new Map<string, { score: number; bookmark: Bookmark; types: Set<string> }>()

  keywordResults.forEach((item, index) => {
    const existing = scoreMap.get(item.id) || { score: 0, bookmark: item, types: new Set() }
    existing.score += 1 / (RRF_K + index + 1)
    existing.types.add('keyword')
    scoreMap.set(item.id, existing)
  })

  semanticResults.forEach((item, index) => {
    const existing = scoreMap.get(item.id) || { score: 0, bookmark: item, types: new Set() }
    existing.score += 1 / (RRF_K + index + 1)
    existing.types.add('semantic')
    scoreMap.set(item.id, existing)
  })

  // Sort by combined score and return
  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, bookmark, types }) => ({
      ...bookmark,
      score,
      match_type: types.size > 1 ? 'hybrid' : (types.values().next().value as any),
    }))
}

async function keywordSearch(supabase: any, query: string, limit: number): Promise<Bookmark[]> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .textSearch('fts', query, { type: 'websearch' })
    .limit(limit)

  if (error) {
    console.error('Keyword search error:', error)
    return []
  }
  return data || []
}

async function semanticSearch(supabase: any, query: string, limit: number): Promise<Bookmark[]> {
  try {
    const embedding = await generateQueryEmbedding(query)

    const { data, error } = await supabase.rpc('semantic_search', {
      query_embedding: `[${embedding.join(',')}]`,
      match_count: limit,
    })

    if (error) {
      console.error('Semantic search error:', error)
      return []
    }
    return data || []
  } catch (e) {
    console.error('Embedding generation failed:', e)
    return []
  }
}
```

**Step 2: Create semantic search RPC function in Supabase**

Apply migration `create_semantic_search_function`:
```sql
CREATE OR REPLACE FUNCTION public.semantic_search(
  query_embedding vector(768),
  match_count int DEFAULT 20
)
RETURNS SETOF public.bookmarks
LANGUAGE sql STABLE
AS $$
  SELECT *
  FROM public.bookmarks
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

**Step 3: Create search API route**

`src/app/api/search/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { hybridSearch } from '@/lib/search'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20')

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 })
  }

  try {
    const results = await hybridSearch(query, limit)
    return NextResponse.json({ results, count: results.length })
  } catch (error) {
    console.error('Search failed:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
```

**Step 4: Commit**

```bash
git add src/lib/search.ts src/app/api/search/
git commit -m "feat: add hybrid search with RRF fusion (keyword + semantic)"
```

---

## Phase 4: Mobile-First UI

### Task 12: Set up design system and layout

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/app/layout.tsx` (modify existing)
- Create: `src/components/layout/app-shell.tsx`
- Create: `src/components/layout/bottom-nav.tsx`
- Create: `src/components/layout/top-bar.tsx`

**Step 1: Set up global CSS with dark theme tokens**

Replace `src/app/globals.css` with custom theme setup using Tailwind v4 CSS variables and a dark-first palette. Define color tokens, spacing, typography, and safe-area insets for mobile.

**Step 2: Create app shell**

`src/components/layout/app-shell.tsx`: Responsive shell with:
- Sticky top bar (44px on mobile) with app title + search icon + digest icon
- Main content area with safe-area padding
- Bottom navigation bar (mobile only, 4 tabs: Feed, Search, Digest, Settings)
- No sidebar on mobile; optional sidebar on desktop >=1024px

**Step 3: Create bottom nav** (mobile)

`src/components/layout/bottom-nav.tsx`: Fixed bottom bar with 4 icons using `lucide-react`:
- Home (feed), Search, BookOpen (digest), Settings
- Active state indicator
- 56px height with safe-area-inset-bottom padding

**Step 4: Create top bar**

`src/components/layout/top-bar.tsx`: Sticky header with:
- App title "Bookmarks" on left
- Search icon (triggers cmdk) and filter icon on right
- Blur backdrop on scroll

**Step 5: Update root layout**

Modify `src/app/layout.tsx` to wrap children in AppShell, set dark class on html, configure viewport for mobile.

**Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/components/layout/
git commit -m "feat: add mobile-first app shell with bottom nav, top bar, dark theme"
```

---

### Task 13: Create tweet card component

**Files:**
- Create: `src/components/tweet-card.tsx`
- Create: `src/components/tweet-media.tsx`
- Create: `src/components/tag-pill.tsx`

**Step 1: Create tag pill**

`src/components/tag-pill.tsx`: Small rounded pill showing a tag name. Dark background, muted text, compact padding.

**Step 2: Create tweet media component**

`src/components/tweet-media.tsx`: Renders media array from bookmark:
- Single image: full-width rounded
- 2 images: side-by-side grid
- 3+ images: 2x2 grid with "+N" overlay on 4th
- Video thumbnails with play icon overlay
- Lazy loading with `loading="lazy"`

**Step 3: Create tweet card**

`src/components/tweet-card.tsx`: Full tweet card component:
- Author row: 32px avatar placeholder (colored circle with initials) + name + @handle + relative time
- Tweet text with "Show more" for >280 chars (use `truncateText`)
- TweetMedia component
- Tags row (horizontal scroll, no wrap)
- Domain badge if `domain` exists (favicon via `https://www.google.com/s2/favicons?domain=...`)
- Bottom action bar: external link icon (opens tweet URL), copy link
- Full-width on mobile, card with subtle border on desktop
- Tap anywhere opens expanded view or original tweet

**Step 4: Commit**

```bash
git add src/components/tweet-card.tsx src/components/tweet-media.tsx src/components/tag-pill.tsx
git commit -m "feat: add tweet card component with media grid, tags, and actions"
```

---

### Task 14: Create feed page with infinite scroll

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/api/bookmarks/route.ts`
- Create: `src/hooks/use-infinite-bookmarks.ts`

**Step 1: Create bookmarks API route**

`src/app/api/bookmarks/route.ts`: GET endpoint that returns paginated bookmarks:
- Query params: `cursor` (raindrop_created_at of last item), `limit` (default 20), `tag` (optional filter)
- Returns `{ bookmarks: Bookmark[], nextCursor: string | null }`
- Uses admin client to query bookmarks ordered by `raindrop_created_at DESC`

**Step 2: Create infinite scroll hook**

`src/hooks/use-infinite-bookmarks.ts`: Custom hook using `useEffect` + `IntersectionObserver`:
- Fetches first page on mount
- When sentinel element (last card) enters viewport, fetch next page
- Manages loading/error/hasMore state
- Tag filter support

**Step 3: Build feed page**

`src/app/page.tsx`:
- Uses `useInfiniteBookmarks` hook
- Renders single-column list of TweetCards on mobile
- Skeleton loading cards while fetching
- "No bookmarks yet" empty state with sync prompt
- Pull-to-refresh (optional, native mobile feel)

**Step 4: Commit**

```bash
git add src/app/page.tsx src/app/api/bookmarks/ src/hooks/
git commit -m "feat: add feed page with infinite scroll and bookmark API"
```

---

### Task 15: Create search interface

**Files:**
- Create: `src/components/search/search-dialog.tsx`
- Create: `src/components/search/search-results.tsx`
- Create: `src/app/search/page.tsx`

**Step 1: Create search dialog (cmdk)**

`src/components/search/search-dialog.tsx`:
- Uses `cmdk` package for command palette
- Opens via `Cmd+K` (desktop) or search icon tap (mobile)
- On mobile: full-screen overlay with search input at top
- On desktop: centered dialog overlay
- Debounced input (300ms) triggers `/api/search?q=...`
- Shows compact results inline
- Enter or tap result navigates to full search page or opens tweet

**Step 2: Create search results component**

`src/components/search/search-results.tsx`:
- Renders list of search results as compact tweet cards
- Shows match_type badge (keyword / semantic / hybrid)
- Highlights matching text for keyword results

**Step 3: Create full search page**

`src/app/search/page.tsx`:
- URL: `/search?q=...`
- Full-page search with persistent input
- Filter chips: tags, content type, date range
- Results rendered with TweetCard component

**Step 4: Commit**

```bash
git add src/components/search/ src/app/search/
git commit -m "feat: add search with cmdk command palette and full-page view"
```

---

## Phase 5: Digest Pipeline

### Task 16: Create content extraction pipeline

**Files:**
- Create: `src/lib/digest/extract.ts`
- Create: `src/lib/digest/readability.ts`
- Create: `src/lib/digest/pdf.ts`
- Create: `src/lib/digest/stagehand.ts`

**Step 1: Create Readability extractor**

`src/lib/digest/readability.ts`:
```typescript
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

export async function extractWithReadability(url: string): Promise<{
  title: string
  content: string
  excerpt: string
  byline: string
} | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookmarkDigest/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await res.text()
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    if (!article) return null
    return {
      title: article.title || '',
      content: article.textContent || '',
      excerpt: article.excerpt || '',
      byline: article.byline || '',
    }
  } catch {
    return null
  }
}
```

**Step 2: Create PDF extractor**

`src/lib/digest/pdf.ts`:
```typescript
import pdfParse from 'pdf-parse'

export async function extractFromPdf(url: string): Promise<{
  text: string
  pages: number
} | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
    const buffer = Buffer.from(await res.arrayBuffer())
    const data = await pdfParse(buffer)
    return { text: data.text, pages: data.numpages }
  } catch {
    return null
  }
}
```

**Step 3: Create Stagehand extractor**

`src/lib/digest/stagehand.ts`:
```typescript
import { Stagehand } from '@browserbasehq/stagehand'
import { z } from 'zod'

export async function extractWithStagehand(url: string): Promise<{
  title: string
  content: string
  author: string | null
} | null> {
  const stagehand = new Stagehand({
    env: 'BROWSERBASE',
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
  })

  try {
    await stagehand.init()
    const page = stagehand.context.pages()[0]
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })

    const article = await stagehand.extract({
      instruction: 'Extract the main article content including title, author, and body text',
      schema: z.object({
        title: z.string().describe('The article headline/title'),
        content: z.string().describe('The full article body text'),
        author: z.string().nullable().describe('Author name if present'),
      }),
    })

    return article
  } catch (e) {
    console.error(`Stagehand extraction failed for ${url}:`, e)
    return null
  } finally {
    await stagehand.close().catch(() => {})
  }
}
```

**Step 4: Create content router**

`src/lib/digest/extract.ts`:
```typescript
import { extractWithReadability } from './readability'
import { extractFromPdf } from './pdf'
import { extractWithStagehand } from './stagehand'

export interface ExtractedResult {
  title: string
  content: string
  method: 'readability' | 'pdf' | 'stagehand'
  contentType: string
}

async function resolveUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) })
    return res.url
  } catch {
    return url
  }
}

export async function extractContent(url: string): Promise<ExtractedResult | null> {
  const resolved = await resolveUrl(url)

  // Tier 2: PDF
  if (resolved.match(/\.pdf($|\?)|arxiv\.org\/pdf/i)) {
    const pdf = await extractFromPdf(resolved)
    if (pdf) {
      return {
        title: '',
        content: pdf.text.slice(0, 50000), // Cap at 50K chars
        method: 'pdf',
        contentType: 'paper',
      }
    }
  }

  // Tier 1: Readability
  const article = await extractWithReadability(resolved)
  if (article && article.content.length > 200) {
    return {
      title: article.title,
      content: article.content.slice(0, 50000),
      method: 'readability',
      contentType: 'article',
    }
  }

  // Tier 3: Stagehand (fallback)
  const stagehandResult = await extractWithStagehand(resolved)
  if (stagehandResult) {
    return {
      title: stagehandResult.title,
      content: stagehandResult.content.slice(0, 50000),
      method: 'stagehand',
      contentType: 'article',
    }
  }

  return null
}
```

**Step 5: Commit**

```bash
git add src/lib/digest/
git commit -m "feat: add tiered content extraction (Readability → PDF → Stagehand)"
```

---

### Task 17: Create digest generation pipeline

**Files:**
- Create: `src/lib/digest/generate.ts`
- Create: `src/app/api/cron/generate-digest/route.ts`

**Step 1: Create digest generator**

`src/lib/digest/generate.ts`:
```typescript
import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractContent } from './extract'
import { Bookmark, DigestContent } from '@/lib/supabase/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateDigest(type: 'daily' | 'weekly'): Promise<string> {
  const supabase = createAdminClient()
  const now = new Date()
  const periodStart = new Date(now)

  if (type === 'daily') {
    periodStart.setDate(periodStart.getDate() - 1)
  } else {
    periodStart.setDate(periodStart.getDate() - 7)
  }

  // Create digest record
  const { data: digest, error: insertError } = await supabase
    .from('digests')
    .insert({
      digest_type: type,
      period_start: periodStart.toISOString(),
      period_end: now.toISOString(),
      status: 'generating',
    })
    .select()
    .single()

  if (insertError || !digest) {
    throw new Error(`Failed to create digest: ${insertError?.message}`)
  }

  try {
    // Fetch bookmarks from period
    const { data: bookmarks } = await supabase
      .from('bookmarks')
      .select('*')
      .gte('raindrop_created_at', periodStart.toISOString())
      .lte('raindrop_created_at', now.toISOString())
      .order('raindrop_created_at', { ascending: false })

    if (!bookmarks || bookmarks.length === 0) {
      await supabase
        .from('digests')
        .update({ status: 'complete', content: { title: 'No bookmarks this period', sections: [] }, raw_markdown: 'No bookmarks saved during this period.' })
        .eq('id', digest.id)
      return digest.id
    }

    // Extract content from linked URLs (skip twitter.com/x.com links — those ARE the tweets)
    const extractions: { bookmark: Bookmark; extracted: string | null }[] = []

    for (const bm of bookmarks) {
      const isTwitterLink = bm.url.match(/(?:twitter|x)\.com\/\w+\/status/)
      if (isTwitterLink) {
        extractions.push({ bookmark: bm, extracted: null })
        continue
      }

      const result = await extractContent(bm.url)
      if (result) {
        // Store extracted content
        await supabase.from('extracted_content').insert({
          bookmark_id: bm.id,
          source_url: bm.url,
          extraction_method: result.method,
          title: result.title,
          content: result.content.slice(0, 10000), // Store first 10K
          content_type: result.contentType,
        })
        extractions.push({ bookmark: bm, extracted: result.content.slice(0, 3000) })
      } else {
        extractions.push({ bookmark: bm, extracted: null })
      }
    }

    // Build prompt for digest generation
    const bookmarkSummaries = extractions.map(({ bookmark, extracted }, i) => {
      let entry = `[${i + 1}] Tweet by @${bookmark.tweet_author || 'unknown'}: "${bookmark.tweet_text || bookmark.title || bookmark.excerpt || 'No text'}"\n   URL: ${bookmark.url}`
      if (bookmark.tags.length > 0) entry += `\n   Tags: ${bookmark.tags.join(', ')}`
      if (extracted) entry += `\n   Linked content summary: ${extracted.slice(0, 1000)}`
      return entry
    }).join('\n\n')

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_DIGEST_MODEL || 'gpt-5-mini',
      messages: [
        {
          role: 'system',
          content: `You are a research digest assistant. You analyze a user's saved Twitter bookmarks and their linked content to produce an insightful digest.

Rules:
- Group bookmarks by topic/theme (AI, engineering, design, etc.)
- For each theme, synthesize insights — don't just summarize individual tweets
- Cite specific tweets using [N] notation matching the input numbering
- Highlight key papers, tools, threads, and notable takes
- Be concise but substantive — each section should teach something
- Output valid JSON matching the schema below`
        },
        {
          role: 'user',
          content: `Generate a ${type} digest for ${bookmarks.length} bookmarks saved between ${periodStart.toLocaleDateString()} and ${now.toLocaleDateString()}.

Bookmarks:
${bookmarkSummaries}

Output JSON schema:
{
  "title": "string — digest title",
  "sections": [
    {
      "theme": "string — topic name",
      "summary": "string — 2-3 sentence synthesis of this theme",
      "items": [
        {
          "bookmark_id": "string — UUID from bookmark",
          "tweet_text": "string — original tweet text",
          "tweet_author": "string — @handle",
          "insight": "string — what's notable about this",
          "sources": [
            { "title": "string", "url": "string", "type": "tweet|article|paper|website" }
          ]
        }
      ]
    }
  ]
}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 4000,
    })

    const digestContent = JSON.parse(response.choices[0].message.content || '{}') as DigestContent

    // Generate markdown version
    const markdown = renderDigestMarkdown(digestContent, type, periodStart, now)

    // Update digest record
    await supabase
      .from('digests')
      .update({
        content: digestContent,
        raw_markdown: markdown,
        bookmark_ids: bookmarks.map((b) => b.id),
        status: 'complete',
      })
      .eq('id', digest.id)

    return digest.id
  } catch (error) {
    await supabase
      .from('digests')
      .update({ status: 'failed' })
      .eq('id', digest.id)
    throw error
  }
}

function renderDigestMarkdown(content: DigestContent, type: string, start: Date, end: Date): string {
  let md = `# ${content.title}\n\n`
  md += `*${type === 'daily' ? 'Daily' : 'Weekly'} digest: ${start.toLocaleDateString()} — ${end.toLocaleDateString()}*\n\n---\n\n`

  for (const section of content.sections) {
    md += `## ${section.theme}\n\n`
    md += `${section.summary}\n\n`

    for (const item of section.items) {
      md += `**@${item.tweet_author}**: ${item.tweet_text?.slice(0, 200)}\n\n`
      md += `> ${item.insight}\n\n`

      if (item.sources?.length) {
        for (const source of item.sources) {
          md += `- [${source.title}](${source.url}) *(${source.type})*\n`
        }
        md += '\n'
      }
    }
    md += '---\n\n'
  }

  return md
}
```

**Step 2: Create digest cron route**

`src/app/api/cron/generate-digest/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { generateDigest } from '@/lib/digest/generate'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const type = (searchParams.get('type') as 'daily' | 'weekly') || 'daily'

  try {
    const digestId = await generateDigest(type)
    return NextResponse.json({ digestId, type })
  } catch (error) {
    console.error('Digest generation failed:', error)
    return NextResponse.json({ error: 'Digest generation failed' }, { status: 500 })
  }
}

export const maxDuration = 300 // 5 min timeout
```

**Step 3: Update vercel.json with digest crons**

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-raindrop",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/generate-digest?type=daily",
      "schedule": "0 13 * * *"
    },
    {
      "path": "/api/cron/generate-digest?type=weekly",
      "schedule": "0 23 * * 5"
    }
  ]
}
```

Note: Cron times are UTC. 13:00 UTC = 8:00 AM ET. 23:00 UTC Friday = 6:00 PM ET Friday.

**Step 4: Commit**

```bash
git add src/lib/digest/generate.ts src/app/api/cron/generate-digest/ vercel.json
git commit -m "feat: add AI digest generation pipeline (daily + weekly)"
```

---

## Phase 5: Digest & Settings UI

### Task 18: Create digest page

**Files:**
- Create: `src/app/digest/page.tsx`
- Create: `src/app/digest/[id]/page.tsx`
- Create: `src/app/api/digests/route.ts`
- Create: `src/components/digest/digest-card.tsx`
- Create: `src/components/digest/digest-reader.tsx`

**Step 1: Create digests list API**

`src/app/api/digests/route.ts`: GET endpoint returning recent digests ordered by `created_at DESC`, with limit param.

**Step 2: Create digest card**

`src/components/digest/digest-card.tsx`: Card showing digest type badge (daily/weekly), date range, section count, status. Tappable to open reader.

**Step 3: Create digest reader**

`src/components/digest/digest-reader.tsx`: Reader-style component:
- Max-width 680px centered
- Renders structured digest content
- Themed section headings
- Inline tweet preview cards for cited tweets
- Linked sources with favicons
- Markdown rendering for raw_markdown fallback

**Step 4: Create digest list page**

`src/app/digest/page.tsx`: Lists all digests with DigestCard. Status indicator for generating digests.

**Step 5: Create individual digest page**

`src/app/digest/[id]/page.tsx`: Fetches single digest by ID, renders with DigestReader.

**Step 6: Commit**

```bash
git add src/app/digest/ src/app/api/digests/ src/components/digest/
git commit -m "feat: add digest list and reader pages"
```

---

### Task 19: Create settings page

**Files:**
- Create: `src/app/settings/page.tsx`
- Create: `src/app/api/sync-status/route.ts`

**Step 1: Create sync status API**

`src/app/api/sync-status/route.ts`: Returns sync_state data + total bookmark count.

**Step 2: Create settings page**

`src/app/settings/page.tsx`:
- Sync status card: last synced time, total bookmarks, sync button
- Manual sync trigger (calls `/api/cron/sync-raindrop` with auth)
- Manual digest trigger (daily/weekly buttons)
- Theme toggle (dark/light using `next-themes` or class-based)
- App info / version

**Step 3: Commit**

```bash
git add src/app/settings/ src/app/api/sync-status/
git commit -m "feat: add settings page with sync status and manual triggers"
```

---

## Phase 6: Polish & Deploy

### Task 20: Add loading states and error handling

**Files:**
- Create: `src/components/skeleton-card.tsx`
- Create: `src/components/error-boundary.tsx`
- Modify: various pages

**Step 1:** Create skeleton tweet card (animated pulse placeholder matching tweet card dimensions).

**Step 2:** Add error boundaries to each page with retry buttons.

**Step 3:** Add toast notifications for sync success/failure.

**Step 4: Commit**

```bash
git add src/components/skeleton-card.tsx src/components/error-boundary.tsx
git commit -m "feat: add loading skeletons, error boundaries, and toasts"
```

---

### Task 21: PWA and mobile optimizations

**Files:**
- Create: `src/app/manifest.ts`
- Modify: `src/app/layout.tsx`

**Step 1: Add web app manifest**

`src/app/manifest.ts`:
```typescript
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bookmarks AI',
    short_name: 'Bookmarks',
    description: 'Smart Twitter bookmarks with AI search and digests',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
```

**Step 2: Add viewport meta and theme-color to layout**

Update `src/app/layout.tsx` metadata to include:
- `viewport: { width: 'device-width', initialScale: 1, viewportFit: 'cover' }`
- `themeColor: '#0a0a0a'`
- `appleWebApp: { capable: true, statusBarStyle: 'black-translucent' }`

**Step 3: Commit**

```bash
git add src/app/manifest.ts src/app/layout.tsx
git commit -m "feat: add PWA manifest and mobile viewport config"
```

---

### Task 22: Deploy to Vercel

**Step 1: Initialize Vercel project**

```bash
npx vercel link
```

**Step 2: Set environment variables in Vercel dashboard**

Add all vars from `.env.local` to Vercel project settings.

**Step 3: Deploy**

```bash
npx vercel --prod
```

**Step 4: Test cron endpoints**

Verify `/api/cron/sync-raindrop` runs on schedule via Vercel dashboard Cron tab.

**Step 5: Run initial backfill**

```bash
curl -X POST https://your-app.vercel.app/api/admin/backfill \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Step 6: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: deploy configuration and final polish"
```

---

## Task Dependency Graph

```
Task 1 (scaffold) → Task 2 (deps) → Task 3 (env) → Task 4 (DB schema)
                                                          ↓
Task 5 (Supabase clients) → Task 6 (utils)
                                   ↓
                    ┌──────────────┼──────────────┐
                    ↓              ↓              ↓
              Task 7 (raindrop) Task 8 (embed) Task 11 (search)
                    ↓              ↓              ↓
              Task 9 (sync)────────┘         Task 15 (search UI)
                    ↓
              Task 10 (cron)
                    ↓
              Task 12 (design system) → Task 13 (tweet card) → Task 14 (feed)
                                                                     ↓
                    Task 16 (extraction) → Task 17 (digest gen) → Task 18 (digest UI)
                                                                     ↓
                                                              Task 19 (settings)
                                                                     ↓
                                                Task 20 (polish) → Task 21 (PWA) → Task 22 (deploy)
```
