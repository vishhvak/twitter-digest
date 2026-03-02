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
