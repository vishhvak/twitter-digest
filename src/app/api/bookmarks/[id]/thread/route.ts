import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractThread } from '@/lib/threads/extract'

// GET: Fetch thread tweets for a bookmark
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('thread_tweets')
    .select('*')
    .eq('bookmark_id', id)
    .order('position', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ thread: data || [] })
}

// POST: Trigger thread detection for a specific bookmark
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  // Get the bookmark
  const { data: bookmark, error } = await supabase
    .from('bookmarks')
    .select('id, url, tweet_author')
    .eq('id', id)
    .single()

  if (error || !bookmark) {
    return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
  }

  // Check if it's a Twitter/X URL
  if (!bookmark.url.match(/(?:twitter|x)\.com\/\w+\/status/)) {
    return NextResponse.json({ error: 'Not a Twitter/X URL' }, { status: 400 })
  }

  try {
    const result = await extractThread(bookmark.id, bookmark.url, bookmark.tweet_author)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: 'Thread extraction failed' }, { status: 500 })
  }
}

export const maxDuration = 60
