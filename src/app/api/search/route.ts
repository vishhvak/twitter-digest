import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'
import { hybridSearch } from '@/lib/search'

const log = createLogger('search-api')

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')
  const author = request.nextUrl.searchParams.get('author') || null
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20')

  if (!query && !author) {
    return NextResponse.json({ error: 'Missing query or author parameter' }, { status: 400 })
  }

  const start = Date.now()
  log.info(`GET /api/search — q="${query || ''}" author=${author || 'none'} limit=${limit}`)

  try {
    const results = await hybridSearch(query || '', limit, author)
    const elapsed = Date.now() - start
    log.info(`Search returned ${results.length} results (${elapsed}ms)`)
    return NextResponse.json({ results, count: results.length })
  } catch (error) {
    const elapsed = Date.now() - start
    log.error(`Search failed (${elapsed}ms)`, error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
