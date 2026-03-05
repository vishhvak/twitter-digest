# Twitter Bookmarks AI

A personal webapp for searching, browsing, and digesting your Twitter/X bookmarks. Syncs from Raindrop.io, enriches tweets with thread detection and article extraction via the Twitter API, and generates AI-powered digests.

## Features

- **Bookmark sync** — Incremental, full, and backfill sync from Raindrop.io
- **Hybrid search** — Keyword + semantic search with author autocomplete (`@handle`)
- **Thread detection** — Automatically detects and displays Twitter threads with full conversation view
- **Article extraction** — Detects linked articles in tweets, fetches content, and formats with GPT
- **Quote tweets** — Renders embedded quoted tweets inline
- **AI summaries** — Tap any card to flip and see a GPT-generated summary
- **Digests** — Daily and weekly AI-generated digests that group bookmarks by theme
- **Pull-to-refresh** — Touch gesture sync on mobile, button sync on desktop
- **Delete & resync** — Remove bookmarks or re-fetch tweet data from the API

## Tech Stack

- **Frontend**: Next.js 16 (App Router), Tailwind CSS, Lucide icons
- **Database**: Supabase (Postgres + pgvector for embeddings)
- **Bookmark source**: Raindrop.io API
- **Tweet enrichment**: twitterapi.io (threads, articles, tweet data)
- **Embeddings**: Google Gemini API
- **AI (summaries, digests, formatting)**: OpenAI GPT-5-mini
- **Content extraction**: Mozilla Readability, Stagehand (fallback)

## Setup

### Prerequisites

- Node.js 18+
- Supabase project with pgvector extension
- API keys for: Raindrop.io, OpenAI, Google Gemini, twitterapi.io

### Environment Variables

Copy `.env.local.example` or create `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Raindrop.io
RAINDROP_TEST_TOKEN=

# Embeddings
GOOGLE_GENERATIVE_AI_API_KEY=

# AI (OpenAI)
OPENAI_API_KEY=
OPENAI_DIGEST_MODEL=gpt-5-mini

# Twitter API (twitterapi.io)
TWITTER_API_KEY=

# Cron auth (optional)
CRON_SECRET=
```

### Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Deploy

Deploy to Vercel. Add all environment variables in Settings > Environment Variables. Cron jobs for sync and digest generation are configured in `vercel.json`.

## Project Structure

```
src/
  app/
    page.tsx              # Home feed with search
    digest/               # Digest list and detail pages
    settings/             # Sync controls, digest generation
    api/
      bookmarks/          # CRUD, resync, summarize
      cron/               # Scheduled sync and digest generation
      digests/            # List, delete, regenerate
      search/             # Hybrid search endpoint
      sync-quick/         # Lightweight incremental sync
      authors/            # Author autocomplete
  components/
    tweet-card.tsx        # Main bookmark card with flip animation
    thread-view.tsx       # Thread conversation UI
    quoted-tweet.tsx      # Embedded quote tweet
    confirm-modal.tsx     # Reusable confirmation dialog
  lib/
    raindrop/             # Raindrop.io sync client
    threads/              # Thread detection and extraction
    digest/               # Digest generation and content extraction
    search.ts             # Hybrid search (keyword + semantic)
    supabase/             # DB client and types
```
