import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractContent } from './extract'
import { Bookmark, DigestContent } from '@/lib/supabase/types'
import { createLogger } from '@/lib/logger'

const log = createLogger('digest')

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

export async function generateDigest(type: 'daily' | 'weekly'): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const supabase = createAdminClient()
  const now = new Date()
  const periodStart = new Date(now)

  if (type === 'daily') {
    periodStart.setDate(periodStart.getDate() - 1)
  } else {
    periodStart.setDate(periodStart.getDate() - 7)
  }

  log.info(`Generating ${type} digest: ${periodStart.toISOString()} → ${now.toISOString()}`)

  const { data: digest, error: insertError } = await supabase
    .from('digests')
    .insert({
      digest_type: type,
      period_start: periodStart.toISOString(),
      period_end: now.toISOString(),
      status: 'generating',
    })
    .select()
    .single()

  if (insertError || !digest) {
    log.error('Failed to create digest row', insertError)
    throw new Error(`Failed to create digest: ${insertError?.message}`)
  }

  log.info(`Digest row created: ${digest.id}`)

  try {
    const { data: bookmarks } = await supabase
      .from('bookmarks')
      .select('*')
      .gte('raindrop_created_at', periodStart.toISOString())
      .lte('raindrop_created_at', now.toISOString())
      .order('raindrop_created_at', { ascending: false })

    log.info(`Found ${bookmarks?.length || 0} bookmarks in period`)

    if (!bookmarks || bookmarks.length === 0) {
      await supabase
        .from('digests')
        .update({
          status: 'complete',
          content: { title: 'No bookmarks this period', sections: [] },
          raw_markdown: 'No bookmarks saved during this period.',
        })
        .eq('id', digest.id)
      return digest.id
    }

    const extractions: { bookmark: Bookmark; extracted: string | null }[] = []

    for (const bm of bookmarks) {
      const isTwitterLink = bm.url.match(/(?:twitter|x)\.com\/\w+\/status/)
      if (isTwitterLink) {
        extractions.push({ bookmark: bm, extracted: null })
        continue
      }

      try {
        const result = await extractContent(bm.url)
        if (result) {
          await supabase.from('extracted_content').insert({
            bookmark_id: bm.id,
            source_url: bm.url,
            extraction_method: result.method,
            title: result.title,
            content: result.content.slice(0, 10000),
            content_type: result.contentType,
          })
          extractions.push({ bookmark: bm, extracted: result.content })
        } else {
          extractions.push({ bookmark: bm, extracted: null })
        }
      } catch (e) {
        log.warn(`Content extraction failed for ${bm.url}: ${e}`)
        extractions.push({ bookmark: bm, extracted: null })
      }
    }

    const bookmarkSummaries = extractions
      .map(({ bookmark, extracted }, i) => {
        let entry = `[${i + 1}] Tweet by @${bookmark.tweet_author || 'unknown'}: "${bookmark.tweet_text || bookmark.title || bookmark.excerpt || 'No text'}"\n   URL: ${bookmark.url}`
        if (bookmark.tags.length > 0) entry += `\n   Tags: ${bookmark.tags.join(', ')}`
        if (bookmark.is_thread && bookmark.thread_tweets?.length > 0) {
          const threadText = bookmark.thread_tweets
            .map((t: { text?: string }, j: number) => `   [Thread ${j + 1}]: ${t.text || ''}`)
            .join('\n')
          entry += `\n${threadText}`
        }
        if (bookmark.article_content?.body) {
          const body = bookmark.article_content.body.slice(0, 2000)
          entry += `\n   Article: ${bookmark.article_content.title || ''}\n   ${body}`
        }
        if (extracted) entry += `\n   Linked content: ${extracted.slice(0, 2000)}`
        return entry
      })
      .join('\n\n')

    const systemPrompt = `You are a research digest assistant. You analyze a user's saved Twitter bookmarks and their linked content to produce an insightful digest.

Rules:
- Group bookmarks by topic/theme (AI, engineering, design, etc.)
- For each theme, synthesize insights — don't just summarize individual tweets
- Cite specific tweets using [N] notation matching the input numbering
- Highlight key papers, tools, threads, and notable takes
- Be concise but substantive — each section should teach something
- Keep insights brief (1-2 sentences each). Do NOT repeat full tweet text in the output — just reference with [N]
- Output valid JSON matching the schema below`

    const userPrompt = `Generate a ${type} digest for ${bookmarks.length} bookmarks saved between ${periodStart.toLocaleDateString()} and ${now.toLocaleDateString()}.

Bookmarks:
${bookmarkSummaries}

Output JSON schema:
{
  "title": "string — digest title",
  "sections": [
    {
      "theme": "string — topic name",
      "summary": "string — 2-3 sentence synthesis of this theme",
      "items": [
        {
          "bookmark_id": "string — UUID from bookmark",
          "tweet_text": "string — short excerpt (max 100 chars)",
          "tweet_author": "string — @handle",
          "insight": "string — what's notable about this",
          "sources": [
            { "title": "string", "url": "string", "type": "tweet|article|paper|website" }
          ]
        }
      ]
    }
  ]
}`

    const inputTokens = estimateTokens(systemPrompt + userPrompt)
    log.info(`Sending to OpenAI: model=${process.env.OPENAI_DIGEST_MODEL || 'gpt-5-mini'}, ~${inputTokens} input tokens, ${bookmarks.length} bookmarks, ${bookmarkSummaries.length} chars`)

    const start = Date.now()
    let response
    try {
      response = await openai.chat.completions.create({
        model: process.env.OPENAI_DIGEST_MODEL || 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 32000,
      })
    } catch (apiError: unknown) {
      const err = apiError as { message?: string; status?: number; code?: string; type?: string }
      log.error('OpenAI API call failed', {
        message: err.message,
        status: err.status,
        code: err.code,
        type: err.type,
      })
      throw apiError
    }
    const elapsed = Date.now() - start

    const usage = response.usage
    log.info(`OpenAI response in ${elapsed}ms — prompt_tokens: ${usage?.prompt_tokens}, completion_tokens: ${usage?.completion_tokens}, total: ${usage?.total_tokens}, finish_reason: ${response.choices[0]?.finish_reason}`)

    const choice = response.choices[0]
    const rawContent = choice?.message?.content
    if (!rawContent) {
      log.error('OpenAI returned empty content', {
        finish_reason: choice?.finish_reason,
        refusal: choice?.message?.refusal,
        choices_count: response.choices?.length,
        usage: response.usage,
      })
      throw new Error(`OpenAI returned empty content (finish_reason: ${choice?.finish_reason})`)
    }

    log.info(`Raw response length: ${rawContent.length} chars`)

    const digestContent = JSON.parse(rawContent) as DigestContent

    log.info(`Parsed digest: "${digestContent.title}", ${digestContent.sections?.length || 0} sections`)

    const markdown = renderDigestMarkdown(digestContent, type, periodStart, now)

    await supabase
      .from('digests')
      .update({
        content: digestContent,
        raw_markdown: markdown,
        bookmark_ids: bookmarks.map((b: { id: string }) => b.id),
        status: 'complete',
      })
      .eq('id', digest.id)

    log.info(`Digest ${digest.id} complete`)
    return digest.id
  } catch (error) {
    log.error('Digest generation failed', error)
    await supabase.from('digests').update({ status: 'failed' }).eq('id', digest.id)
    throw error
  }
}

function renderDigestMarkdown(
  content: DigestContent,
  type: string,
  start: Date,
  end: Date
): string {
  let md = `# ${content.title}\n\n`
  md += `*${type === 'daily' ? 'Daily' : 'Weekly'} digest: ${start.toLocaleDateString()} — ${end.toLocaleDateString()}*\n\n---\n\n`

  for (const section of content.sections) {
    md += `## ${section.theme}\n\n`
    md += `${section.summary}\n\n`

    for (const item of section.items) {
      md += `**@${item.tweet_author}**: ${item.tweet_text?.slice(0, 200)}\n\n`
      md += `> ${item.insight}\n\n`

      if (item.sources?.length) {
        for (const source of item.sources) {
          md += `- [${source.title}](${source.url}) *(${source.type})*\n`
        }
        md += '\n'
      }
    }
    md += '---\n\n'
  }

  return md
}
