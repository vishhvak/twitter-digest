import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/logger'

const log = createLogger('summarize')

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: bookmark, error } = await supabase
    .from('bookmarks')
    .select('*, thread_tweets:thread_tweets(*)')
    .eq('id', id)
    .single()

  if (error || !bookmark) {
    log.error(`Bookmark not found: ${id}`)
    return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
  }

  // Return cached summary if available
  if (bookmark.ai_summary) {
    log.info(`Returning cached summary for ${id}`)
    return NextResponse.json({ summary: bookmark.ai_summary })
  }

  // Build content for summarization
  let content = ''

  if (bookmark.article_content?.body) {
    content = `Article: ${bookmark.article_content.title || ''}\n\n${bookmark.article_content.body}`
  } else if (bookmark.is_thread && bookmark.thread_tweets?.length > 0) {
    const sorted = bookmark.thread_tweets.sort((a: { position: number }, b: { position: number }) => a.position - b.position)
    content = `Thread by @${bookmark.tweet_author || 'unknown'}:\n\n` +
      sorted.map((t: { tweet_text: string }, i: number) => `[${i + 1}/${sorted.length}] ${t.tweet_text}`).join('\n\n')
  } else {
    content = bookmark.tweet_text || bookmark.excerpt || bookmark.title || ''
  }

  if (!content.trim()) {
    return NextResponse.json({ summary: 'No content available to summarize.' })
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const start = Date.now()

    const res = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      max_completion_tokens: 500,
      messages: [
        {
          role: 'system',
          content: `You are a concise summarizer. Given a tweet, thread, or article, produce a clear, insightful summary in 2-4 sentences. Focus on the key takeaway or insight. Be direct and substantive — no filler.`,
        },
        {
          role: 'user',
          content,
        },
      ],
    })

    const summary = res.choices[0]?.message?.content || 'Could not generate summary.'
    log.info(`Summarized bookmark ${id} in ${Date.now() - start}ms`)

    // Save to DB
    await supabase
      .from('bookmarks')
      .update({ ai_summary: summary })
      .eq('id', id)

    return NextResponse.json({ summary })
  } catch (e) {
    log.error(`Summary generation failed for ${id}`, e)
    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    )
  }
}

export const maxDuration = 60
