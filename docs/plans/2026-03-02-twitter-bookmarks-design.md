# Twitter Bookmarks AI — Design Document

**Date**: 2026-03-02
**Status**: Approved

## Problem

Twitter bookmarks are hard to search and easy to forget. The current pipeline saves bookmarks to Raindrop.io via IFTTT, but there's no way to semantically search them, browse them with proper media rendering, or get AI-generated digests of what was saved.

## Solution

A mobile-first web app that:
1. Continuously syncs bookmarks from Raindrop.io into a Supabase database
2. Renders tweets with full media in a native-feeling mobile UI
3. Provides hybrid search (keyword + semantic)
4. Generates daily/weekly AI digests that research linked content

## Architecture

```
Raindrop.io ──(poll every 5min)──> Next.js API Route ──> Supabase (Postgres)
                                                              │
                                          ┌───────────────────┼───────────────────┐
                                          │                   │                   │
                                     pgvector           tsvector             pg_cron
                                    (semantic)          (keyword)           (scheduling)
                                          │                   │
                                          └─────────┬─────────┘
                                                    │
                                              Hybrid Search
                                              (RRF merge)

Content Pipeline (for digest):
  Tweet links ──> Readability (80%) ──┐
                  pdf-parse   (10%) ──┼──> OpenAI gpt-5-mini ──> Digest
                  Stagehand   (10%) ──┘
```

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15 (App Router) | SSR, API routes, Vercel Cron |
| Database | Supabase Postgres | pgvector + tsvector + pg_cron in one |
| Embeddings | Gemini `gemini-embedding-001` | Free, highest MTEB score (71.5), 768d reduced |
| Digest LLM | OpenAI `gpt-5-mini` | User preference, cost-effective |
| UI | Tailwind v4 + Radix primitives | Mobile-first, custom design, accessible |
| Content extraction | Readability / pdf-parse / Stagehand | Tiered: free-first, browser-fallback |
| Browser automation | Stagehand + Browserbase | For JS-heavy sites in digest pipeline |
| Deployment | Vercel | Cron jobs, edge functions, CDN |
| Search UX | cmdk | Command palette for fast keyboard search |

## Supabase Project

- **Project ID**: `zvvafebtvlkhitfxwxmn`
- **URL**: `https://zvvafebtvlkhitfxwxmn.supabase.co`
- **Region**: (from dashboard)
- **Keys**: New-format publishable + secret keys (not legacy JWT)

## Database Schema

### Extensions to enable
- `vector` (pgvector 0.8.0) — embedding storage and HNSW search
- `pg_cron` — scheduled jobs
- `pg_net` — async HTTP from within Postgres

### Tables

#### `bookmarks`
Primary table storing synced tweet bookmarks.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Auto-generated |
| raindrop_id | bigint UNIQUE | Raindrop's internal ID |
| url | text NOT NULL | Original tweet/link URL |
| title | text | Raindrop title |
| excerpt | text | Raindrop excerpt/description |
| note | text | User-added note in Raindrop |
| tweet_author | text | @handle |
| tweet_author_name | text | Display name |
| tweet_text | text | Full tweet content |
| tweet_type | text | tweet, thread, quote, retweet |
| content_type | text | link, article, image, video, document |
| tags | text[] | User tags from Raindrop |
| domain | text | Hostname of the link |
| cover_image_url | text | Cover/preview image |
| media | jsonb | Array of {url, type, alt_text} |
| is_thread | boolean | Whether it's a thread |
| thread_tweets | jsonb | Array of thread tweet objects |
| raindrop_created_at | timestamptz | When saved in Raindrop |
| raindrop_updated_at | timestamptz | Last modified in Raindrop |
| created_at | timestamptz | Row creation time |
| fts | tsvector (generated) | Weighted full-text search column |
| embedding | vector(768) | Gemini embedding (reduced dims) |

**Generated column for FTS:**
```sql
fts tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
  setweight(to_tsvector('english', coalesce(tweet_text,'')), 'B') ||
  setweight(to_tsvector('english', coalesce(excerpt,'')), 'C') ||
  setweight(to_tsvector('english', coalesce(note,'')), 'D')
) STORED
```

**Indexes:**
- `GIN` on `fts` — full-text search
- `HNSW` on `embedding` using `vector_cosine_ops` — semantic search
- `GIN` on `tags` — tag filtering
- `btree` on `raindrop_created_at DESC` — chronological feed
- `btree` on `raindrop_id` — dedup on sync

#### `extracted_content`
Content extracted from links found in tweets (for digest pipeline).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Auto-generated |
| bookmark_id | uuid FK→bookmarks | Parent bookmark |
| source_url | text NOT NULL | The URL that was extracted |
| extraction_method | text | readability, pdf, stagehand |
| title | text | Extracted title |
| content | text | Full extracted text |
| summary | text | LLM-generated summary |
| content_type | text | article, paper, video, tool |
| extracted_at | timestamptz | When extraction happened |

#### `digests`
AI-generated daily/weekly digests.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Auto-generated |
| digest_type | text NOT NULL | daily, weekly |
| period_start | timestamptz | Start of digest period |
| period_end | timestamptz | End of digest period |
| content | jsonb | Structured digest (sections, items, citations) |
| raw_markdown | text | Rendered markdown version |
| bookmark_ids | uuid[] | Which bookmarks were included |
| status | text | pending, generating, complete, failed |
| created_at | timestamptz | When digest was created |

#### `sync_state`
Tracks Raindrop sync cursor.

| Column | Type | Description |
|--------|------|-------------|
| id | int PK DEFAULT 1 | Singleton row |
| last_synced_at | timestamptz | Last successful sync time |
| last_raindrop_date | timestamptz | Most recent raindrop date seen |
| total_synced | int | Running count |

## Raindrop Sync Pipeline

**Trigger**: Vercel Cron → `POST /api/cron/sync-raindrop` every 5 minutes

**Flow**:
1. Read `sync_state.last_raindrop_date` from DB
2. Call Raindrop API: `GET /rest/v1/raindrops/0?search=created:>{last_date}&sort=-created&perpage=50`
3. Paginate through results (max 50 per page) until encountering known IDs or empty page
4. For each new raindrop: parse fields, upsert into `bookmarks`
5. For new rows: call Gemini `gemini-embedding-001` to generate embedding (768 dims)
6. Update `sync_state` with latest date and count

**Authentication**: Raindrop OAuth test token (non-expiring, for personal use)

**Backfill**: One-time `POST /api/admin/backfill` endpoint that pages through all ~5K existing bookmarks with the same logic.

**Rate limits**: Raindrop allows 120 req/min. At 50 items/page, backfill of 5K = 100 pages = ~1 minute.

## Hybrid Search

### Query Flow
1. User enters search query
2. API route `/api/search` runs two queries in parallel:

**Keyword search (tsvector)**:
```sql
SELECT id, ts_rank(fts, query) AS rank
FROM bookmarks, plainto_tsquery('english', $1) query
WHERE fts @@ query
ORDER BY rank DESC
LIMIT 20
```

**Semantic search (pgvector)**:
```sql
SELECT id, 1 - (embedding <=> $1) AS similarity
FROM bookmarks
ORDER BY embedding <=> $1
LIMIT 20
```

3. **Reciprocal Rank Fusion (RRF)** merge with k=60:
```
score(doc) = 1/(k + rank_keyword) + 1/(k + rank_semantic)
```

4. Return top 20 merged results, deduplicated.

### Embedding Strategy
- **Model**: Gemini `gemini-embedding-001`
- **Dimensions**: 768 (reduced from 3072 native, saves ~4x storage)
- **Input**: Concatenation of `title + " " + tweet_text + " " + excerpt`
- **Cost**: Free via Gemini API
- **Text-only**: No image embeddings (90%+ of searchability from text)

## Digest Pipeline

### Schedule
- **Daily**: Vercel Cron at 8:00 AM ET every day
- **Weekly**: Vercel Cron at 6:00 PM ET every Friday

### Flow
1. **Collect**: Fetch bookmarks from period (`last 24h` or `last 7 days`)
2. **Extract**: For each bookmark with external links:
   - **Tier 1 — Readability** (~80%): `@mozilla/readability` + `jsdom`. Fetch HTML, extract article content. Free, ~1s/link.
   - **Tier 2 — PDF** (~5-10%): If URL ends in `.pdf` or matches arxiv pattern → `pdf-parse`. Free, fast.
   - **Tier 3 — Stagehand** (~10-15%): If Readability returns <200 chars or throws → open in Browserbase via Stagehand, extract with AI. ~$20/mo Browserbase Developer plan.
3. **Store**: Save extracted content to `extracted_content` table with summaries
4. **Synthesize**: Send tweet texts + extracted content to **OpenAI gpt-5-mini**:
   - Group tweets by topic/theme
   - Generate insights (not just summaries)
   - Cite specific tweets and source URLs
   - Highlight key papers, tools, threads, and takes
5. **Store digest**: Save structured JSON + markdown to `digests` table
6. **Serve**: Render in the Digest reader view

### Content Router Logic
```
URL → resolve redirects (expand t.co) → check extension/domain
  ├─ .pdf or arxiv.org/pdf → Tier 2 (pdf-parse)
  ├─ try Readability → content.length > 200? → Tier 1 (done)
  └─ fallback → Tier 3 (Stagehand/Browserbase)
```

## UI Design

### Design Principles
- **Mobile-first**: Primary use case is phone browsing
- **Dark mode default**: Matches X aesthetic, easy on eyes
- **Information density**: Show maximum useful info per card without clutter
- **Fast interactions**: Instant search, smooth scrolling, optimistic updates

### Views

#### 1. Feed (Home) — `/`
- **Mobile**: Single column, infinite scroll. Cards are full-width.
- **Desktop**: 2-column masonry grid for better use of space
- Each tweet card:
  - Author row: avatar (32px) + name + @handle + relative time
  - Tweet text (truncated at 280 chars with "show more")
  - Media: images rendered inline (max 2 visible, "+N" badge), video thumbnails
  - Tags: small pills below content
  - Domain badge: favicon + domain name for linked content
  - Bottom bar: open original (external link icon), copy, bookmark category
- Sticky top bar: app title, search icon (opens cmdk), digest icon, settings

#### 2. Search — `Cmd+K` / search icon
- Command palette overlay (cmdk)
- Real-time results as you type (debounced 300ms)
- Two result sections: "Best matches" (RRF merged) shown as compact tweet cards
- Filter bar: tags (multi-select), content type, date range, author
- Full-page search view at `/search?q=...` for detailed browsing

#### 3. Digest — `/digest`
- List of digests (daily/weekly) with date headers
- Individual digest: reader-style layout (max-width 680px, centered)
- Sections grouped by topic with heading
- Each item: tweet preview card + summary + extracted insights
- Citations: inline links to original tweets and source articles
- Status indicator for digests being generated

#### 4. Settings — `/settings`
- Raindrop connection status + sync stats
- Manual sync trigger
- Digest preferences (enable/disable, time preferences)
- Theme toggle (dark/light)

### Design System
- **Tailwind v4**: Utility-first CSS with custom design tokens
- **Radix UI**: Accessible dialog, dropdown, popover, tooltip primitives
- **cmdk**: Command palette for search
- **Dark theme**: Gray-900 backgrounds, subtle borders, high-contrast text
- **Typography**: System font stack, 15px base on mobile, 16px desktop
- **Spacing**: 4px grid, generous padding on touch targets (min 44px)
- **Animations**: Subtle transitions, no heavy motion (respect prefers-reduced-motion)

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://zvvafebtvlkhitfxwxmn.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY

# Raindrop.io
RAINDROP_TEST_TOKEN=<from raindrop dev console>

# Embeddings
GOOGLE_GENERATIVE_AI_API_KEY=<existing key>

# Digest LLM
OPENAI_API_KEY=<existing key>
OPENAI_DIGEST_MODEL=gpt-5-mini

# Browser automation (for digest content extraction)
BROWSERBASE_API_KEY=<existing key>
BROWSERBASE_PROJECT_ID=<existing key>
STAGEHAND_ENV=BROWSERBASE

# App
CRON_SECRET=<random secret for Vercel Cron auth>
```

## Cost Estimates (monthly, personal use)

| Service | Cost | Notes |
|---------|------|-------|
| Supabase | $0 | Free tier (500MB, 500K edge fn calls) |
| Gemini embeddings | $0 | Free tier |
| OpenAI gpt-5-mini | ~$5-15 | ~30 digests/month, depends on content volume |
| Browserbase | $0-20 | Free 1hr/mo may suffice; Developer plan if needed |
| Vercel | $0 | Free tier (hobby) |
| **Total** | **~$5-35/mo** | |
