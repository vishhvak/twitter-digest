import { createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/logger'
import { generateQueryEmbedding } from '@/lib/embeddings'
import { Bookmark } from '@/lib/supabase/types'

const log = createLogger('search')

interface SearchResult extends Bookmark {
  score: number
  match_type: 'keyword' | 'semantic' | 'hybrid'
}

const RRF_K = 60

export async function hybridSearch(query: string, limit = 20, author?: string | null): Promise<SearchResult[]> {
  const supabase = createAdminClient()
  const start = Date.now()

  log.info(`Search: query="${query || ''}" author=${author || 'none'} limit=${limit}`)

  // Author-only search: return their tweets sorted by date
  if (author && !query) {
    const { data } = await supabase
      .from('bookmarks')
      .select('*')
      .ilike('tweet_author', author)
      .order('raindrop_created_at', { ascending: false })
      .limit(limit)

    const elapsed = Date.now() - start
    log.info(`Author-only search: ${data?.length || 0} results for @${author} (${elapsed}ms)`)

    return (data || []).map((b: Bookmark, i: number) => ({
      ...b,
      score: 1 / (RRF_K + i + 1),
      match_type: 'keyword' as const,
    }))
  }

  const [keywordResults, semanticResults] = await Promise.all([
    keywordSearch(supabase, query, limit, author),
    semanticSearch(supabase, query, limit, author),
  ])

  log.info(`Keyword: ${keywordResults.length} results, Semantic: ${semanticResults.length} results`)

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

  const merged = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, bookmark, types }) => ({
      ...bookmark,
      score,
      match_type: (types.size > 1 ? 'hybrid' : types.values().next().value) as 'keyword' | 'semantic' | 'hybrid',
    }))

  const elapsed = Date.now() - start
  const hybridCount = merged.filter(r => r.match_type === 'hybrid').length
  log.info(`Hybrid search: ${merged.length} results (${hybridCount} hybrid, ${merged.length - hybridCount} single-source) (${elapsed}ms)`)

  return merged
}

async function keywordSearch(supabase: ReturnType<typeof createAdminClient>, query: string, limit: number, author?: string | null): Promise<Bookmark[]> {
  const start = Date.now()
  let q = supabase
    .from('bookmarks')
    .select('*')
    .textSearch('fts', query, { type: 'websearch' })

  if (author) {
    q = q.ilike('tweet_author', author)
  }

  const { data, error } = await q
    .order('raindrop_created_at', { ascending: false })
    .limit(limit)

  const elapsed = Date.now() - start
  if (error) {
    log.error(`Keyword search failed (${elapsed}ms)`, error)
    return []
  }
  log.info(`Keyword search: "${query}" → ${data?.length || 0} results (${elapsed}ms)`)
  return data || []
}

async function semanticSearch(supabase: ReturnType<typeof createAdminClient>, query: string, limit: number, author?: string | null): Promise<Bookmark[]> {
  const start = Date.now()
  try {
    const embedding = await generateQueryEmbedding(query)
    const embeddingElapsed = Date.now() - start

    // Fetch extra results when filtering by author since we filter client-side
    const { data, error } = await supabase.rpc('semantic_search', {
      query_embedding: `[${embedding.join(',')}]`,
      match_count: author ? limit * 5 : limit,
    })

    const elapsed = Date.now() - start
    if (error) {
      log.error(`Semantic search failed (${elapsed}ms)`, error)
      return []
    }

    let results: Bookmark[] = data || []
    if (author) {
      const before = results.length
      results = results.filter(
        (b) => b.tweet_author?.toLowerCase() === author.toLowerCase()
      ).slice(0, limit)
      log.info(`Semantic search: "${query}" → ${before} results, ${results.length} after @${author} filter (embedding: ${embeddingElapsed}ms, total: ${elapsed}ms)`)
    } else {
      log.info(`Semantic search: "${query}" → ${results.length} results (embedding: ${embeddingElapsed}ms, total: ${elapsed}ms)`)
    }
    return results
  } catch (e) {
    const elapsed = Date.now() - start
    log.error(`Semantic search failed (${elapsed}ms)`, e)
    return []
  }
}
