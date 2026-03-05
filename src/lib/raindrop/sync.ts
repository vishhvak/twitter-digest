import { createAdminClient } from '@/lib/supabase/admin'
import { RaindropClient } from './client'
import { RaindropItem } from './types'
import { generateEmbedding, buildEmbeddingText } from '@/lib/embeddings'
import { updateSyncProgress, appendSyncLog, resetSyncProgress } from '@/lib/sync-progress'
import { createLogger } from '@/lib/logger'
import { extractThread, extractArticle, isArticleUrl } from '@/lib/threads/extract'

const log = createLogger('sync')

export type SyncMode = 'incremental' | 'full' | 'backfill-older'

function mapRaindropToBookmark(item: RaindropItem) {
  const twitterMatch = item.link.match(/(?:twitter|x)\.com\/(\w+)\/(?:status|article)/)
  const tweetAuthor = twitterMatch ? twitterMatch[1] : null
  const tweetType = isArticleUrl(item.link) ? 'article' : null

  return {
    raindrop_id: item._id,
    url: item.link,
    title: item.title || null,
    excerpt: item.excerpt || null,
    note: item.note || null,
    tweet_author: tweetAuthor,
    tweet_author_name: null,
    tweet_text: item.excerpt || null,
    tweet_type: tweetType,
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

export async function syncRaindrops(options?: { mode?: SyncMode }) {
  const mode = options?.mode || 'incremental'
  const supabase = createAdminClient()
  const raindrop = new RaindropClient(process.env.RAINDROP_TEST_TOKEN!)

  log.info(`Starting sync in "${mode}" mode`)
  appendSyncLog(`Starting sync (mode: ${mode})`)

  const { data: syncState } = await supabase
    .from('sync_state')
    .select('*')
    .eq('id', 1)
    .single()

  let items: RaindropItem[]

  updateSyncProgress({ status: 'fetching', message: 'Fetching bookmarks from Raindrop...', logs: [] })

  const onPageFetched = ({ page, totalSoFar }: { page: number; itemsOnPage: number; totalSoFar: number }) => {
    updateSyncProgress({
      message: `Fetching page ${page + 1}... (${totalSoFar} bookmarks so far)`,
    })
    appendSyncLog(`Fetched page ${page + 1} — ${totalSoFar} bookmarks so far`)
  }

  if (mode === 'full' || !syncState?.last_raindrop_date) {
    log.info('Fetching all bookmarks from Raindrop')
    appendSyncLog('Fetching all bookmarks from Raindrop...')
    items = await raindrop.getAllRaindrops(onPageFetched)
  } else if (mode === 'backfill-older') {
    const { data: oldestRow } = await supabase
      .from('bookmarks')
      .select('raindrop_created_at')
      .order('raindrop_created_at', { ascending: true })
      .limit(1)
      .single()

    if (oldestRow?.raindrop_created_at) {
      const oldestDate = oldestRow.raindrop_created_at.split('T')[0]
      log.info(`Backfilling bookmarks older than ${oldestDate}`)
      appendSyncLog(`Fetching bookmarks older than ${oldestDate}...`)
      items = await raindrop.getAllRaindropsBefore(oldestDate, onPageFetched)
    } else {
      log.info('No existing bookmarks found, doing full fetch')
      appendSyncLog('No existing bookmarks — doing full fetch')
      items = await raindrop.getAllRaindrops(onPageFetched)
    }
  } else {
    const sinceDate = syncState.last_raindrop_date.split('T')[0]
    log.info(`Fetching bookmarks since ${sinceDate}`)
    appendSyncLog(`Fetching bookmarks newer than ${sinceDate}...`)
    items = await raindrop.getAllRaindropsSince(sinceDate, onPageFetched)
  }

  log.info(`Fetched ${items.length} bookmarks from Raindrop`)
  appendSyncLog(`Fetched ${items.length} bookmarks total`)

  if (items.length === 0) {
    await supabase
      .from('sync_state')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', 1)
    log.info('No new bookmarks to sync')
    appendSyncLog('No new bookmarks to sync')
    // Still run thread detection for any unchecked bookmarks from previous runs
    await detectThreadsPhase(supabase)
    return { synced: 0, total: syncState?.total_synced || 0 }
  }

  // Look up which raindrop_ids already have embeddings to skip re-computing
  const raindropIds = items.map((item) => item._id)
  const { data: existingRows } = await supabase
    .from('bookmarks')
    .select('raindrop_id')
    .in('raindrop_id', raindropIds)
    .not('embedding', 'is', null)

  const idsWithEmbedding = new Set((existingRows || []).map((r) => r.raindrop_id))
  const skippedCount = idsWithEmbedding.size
  if (skippedCount > 0) {
    log.info(`${skippedCount} bookmarks already have embeddings — will skip embedding generation for those`)
    appendSyncLog(`Skipping embedding generation for ${skippedCount} existing bookmarks`)
  }

  updateSyncProgress({
    status: 'processing',
    totalItems: items.length,
    processedItems: 0,
    message: `Processing 0 / ${items.length} bookmarks...`,
  })

  let syncedCount = 0

  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10)
    const bookmarks = batch.map(mapRaindropToBookmark)

    const embeddingsPromises = bookmarks.map(async (bm) => {
      if (idsWithEmbedding.has(bm.raindrop_id)) return 'skip'

      const text = buildEmbeddingText(bm)
      if (!text.trim()) return null
      try {
        return await generateEmbedding(text)
      } catch (e) {
        log.error(`Embedding failed for raindrop ${bm.raindrop_id}`, e)
        return null
      }
    })

    const embeddings = await Promise.all(embeddingsPromises)

    for (let j = 0; j < bookmarks.length; j++) {
      const bookmark = bookmarks[j]
      const embedding = embeddings[j]

      const upsertData =
        embedding === 'skip'
          ? { ...bookmark }
          : { ...bookmark, embedding: embedding ? `[${(embedding as number[]).join(',')}]` : null }

      const { error } = await supabase.from('bookmarks').upsert(upsertData, { onConflict: 'raindrop_id' })

      if (error) {
        log.error(`Upsert failed for raindrop ${bookmark.raindrop_id}`, error)
      } else {
        syncedCount++
      }
    }

    const processed = Math.min(i + 10, items.length)
    updateSyncProgress({
      processedItems: processed,
      message: `Processing ${processed} / ${items.length} bookmarks...`,
    })

    if (processed % 100 === 0 || processed === items.length) {
      appendSyncLog(`Processed ${processed} / ${items.length} bookmarks`)
    }
  }

  // Update sync state
  const latestDate = items[0]?.created || new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
    total_synced: (syncState?.total_synced || 0) + syncedCount,
  }
  if (mode !== 'backfill-older') {
    updatePayload.last_raindrop_date = latestDate
  }
  await supabase.from('sync_state').update(updatePayload).eq('id', 1)

  log.info(`Sync complete: ${syncedCount} bookmarks synced`)
  appendSyncLog(`Sync complete — ${syncedCount} bookmarks synced`)

  // Phase 3: Thread detection for all unchecked Twitter/X bookmarks
  await detectThreadsPhase(supabase)

  return { synced: syncedCount, total: (syncState?.total_synced || 0) + syncedCount }
}

/**
 * Detect threads for all unchecked Twitter/X bookmarks (thread_tweet_count = 0).
 * Skips bookmarks already processed. Resumes naturally if interrupted since
 * only unchecked bookmarks are queried.
 */
async function detectThreadsPhase(supabase: ReturnType<typeof createAdminClient>) {
  if (!process.env.TWITTER_API_KEY) {
    log.warn('TWITTER_API_KEY not set, skipping thread detection')
    appendSyncLog('Skipping thread detection (no Twitter API key)')
    updateSyncProgress({ status: 'done', message: 'Sync complete (thread detection skipped)' })
    return
  }

  // Count unchecked Twitter/X bookmarks (tweets and articles)
  const { count } = await supabase
    .from('bookmarks')
    .select('id', { count: 'exact', head: true })
    .eq('thread_tweet_count', 0)
    .or('url.like.%twitter.com%/*/status/%,url.like.%x.com%/*/status/%,url.like.%x.com%/*/article/%,url.like.%twitter.com%/*/article/%')

  const total = count || 0
  if (total === 0) {
    log.info('No unchecked bookmarks for thread detection')
    appendSyncLog('No unchecked bookmarks — thread detection skipped')
    updateSyncProgress({ status: 'done', message: 'Sync complete' })
    return
  }

  log.info(`Starting thread detection for ${total} unchecked bookmarks`)
  appendSyncLog(`Detecting threads for ${total} unchecked bookmarks...`)

  updateSyncProgress({
    status: 'threads',
    totalItems: total,
    processedItems: 0,
    message: `Detecting threads: 0 / ${total}...`,
  })

  let processed = 0
  let threadsFound = 0

  // Process in pages — query unchecked each time so we naturally skip
  // anything already done (e.g. if resumed after interruption)
  while (true) {
    const { data: bookmarks } = await supabase
      .from('bookmarks')
      .select('id, url, tweet_author')
      .eq('thread_tweet_count', 0)
      .or('url.like.%twitter.com%/*/status/%,url.like.%x.com%/*/status/%,url.like.%x.com%/*/article/%,url.like.%twitter.com%/*/article/%')
      .order('raindrop_created_at', { ascending: false })
      .limit(20)

    if (!bookmarks || bookmarks.length === 0) break

    let rateLimited = false
    for (const bm of bookmarks) {
      try {
        if (isArticleUrl(bm.url)) {
          await extractArticle(bm.id, bm.url)
        } else {
          const result = await extractThread(bm.id, bm.url, bm.tweet_author)
          if (result.isThread) {
            threadsFound++
          } else if (!result.isThread) {
            // Mark as checked (1 = single tweet)
            await supabase
              .from('bookmarks')
              .update({ thread_tweet_count: 1 })
              .eq('id', bm.id)
          }
        }
      } catch (e: unknown) {
        // Abort on payment/rate limit errors to avoid wasting remaining calls
        const status = (e as { status?: number })?.status
        if (status === 402 || status === 429) {
          log.warn(`Twitter API ${status} — stopping thread detection (credits exhausted or rate limited)`)
          appendSyncLog(`Twitter API ${status} — stopping thread detection`)
          rateLimited = true
          break
        }
        log.error(`Thread detection failed for ${bm.url}`, e)
        // Mark as error to avoid retrying forever
        await supabase
          .from('bookmarks')
          .update({ thread_tweet_count: -1 })
          .eq('id', bm.id)
      }

      processed++
      updateSyncProgress({
        processedItems: processed,
        message: `Detecting threads: ${processed} / ${total} (${threadsFound} found)...`,
      })
    }
    if (rateLimited) break

    appendSyncLog(`Thread detection: ${processed} / ${total} checked, ${threadsFound} threads found`)
  }

  log.info(`Thread detection complete: ${processed} checked, ${threadsFound} threads found`)
  appendSyncLog(`Thread detection complete — ${threadsFound} threads found in ${processed} bookmarks`)

  updateSyncProgress({
    status: 'done',
    processedItems: processed,
    message: `Done — ${threadsFound} threads detected`,
  })
}
