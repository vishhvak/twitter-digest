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

  const [keywordResults, semanticResults] = await Promise.all([
    keywordSearch(supabase, query, limit),
    semanticSearch(supabase, query, limit),
  ])

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

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, bookmark, types }) => ({
      ...bookmark,
      score,
      match_type: types.size > 1 ? 'hybrid' : (types.values().next().value as 'keyword' | 'semantic'),
    }))
}

async function keywordSearch(supabase: any, query: string, limit: number): Promise<Bookmark[]> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .textSearch('fts', query, { type: 'websearch' })
    .order('raindrop_created_at', { ascending: false })
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
