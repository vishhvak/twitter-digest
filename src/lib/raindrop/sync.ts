import { createAdminClient } from '@/lib/supabase/admin'
import { RaindropClient } from './client'
import { RaindropItem } from './types'
import { generateEmbedding, buildEmbeddingText } from '@/lib/embeddings'

function mapRaindropToBookmark(item: RaindropItem) {
  const twitterMatch = item.link.match(/(?:twitter|x)\.com\/(\w+)\/status/)
  const tweetAuthor = twitterMatch ? twitterMatch[1] : null

  return {
    raindrop_id: item._id,
    url: item.link,
    title: item.title || null,
    excerpt: item.excerpt || null,
    note: item.note || null,
    tweet_author: tweetAuthor,
    tweet_author_name: null,
    tweet_text: item.excerpt || null,
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

  const { data: syncState } = await supabase
    .from('sync_state')
    .select('*')
    .eq('id', 1)
    .single()

  let items: RaindropItem[]

  if (options?.fullBackfill || !syncState?.last_raindrop_date) {
    items = await raindrop.getAllRaindrops()
  } else {
    const sinceDate = syncState.last_raindrop_date.split('T')[0]
    items = await raindrop.getAllRaindropsSince(sinceDate)
  }

  if (items.length === 0) {
    await supabase
      .from('sync_state')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', 1)
    return { synced: 0, total: syncState?.total_synced || 0 }
  }

  let syncedCount = 0

  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10)
    const bookmarks = batch.map(mapRaindropToBookmark)

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
