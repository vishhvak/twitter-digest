import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractContent } from './extract'
import { Bookmark, DigestContent } from '@/lib/supabase/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateDigest(type: 'daily' | 'weekly'): Promise<string> {
  const supabase = createAdminClient()
  const now = new Date()
  const periodStart = new Date(now)

  if (type === 'daily') {
    periodStart.setDate(periodStart.getDate() - 1)
  } else {
    periodStart.setDate(periodStart.getDate() - 7)
  }

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
    throw new Error(`Failed to create digest: ${insertError?.message}`)
  }

  try {
    const { data: bookmarks } = await supabase
      .from('bookmarks')
      .select('*')
      .gte('raindrop_created_at', periodStart.toISOString())
      .lte('raindrop_created_at', now.toISOString())
      .order('raindrop_created_at', { ascending: false })

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
        extractions.push({ bookmark: bm, extracted: result.content.slice(0, 3000) })
      } else {
        extractions.push({ bookmark: bm, extracted: null })
      }
    }

    const bookmarkSummaries = extractions
      .map(({ bookmark, extracted }, i) => {
        let entry = `[${i + 1}] Tweet by @${bookmark.tweet_author || 'unknown'}: "${bookmark.tweet_text || bookmark.title || bookmark.excerpt || 'No text'}"\n   URL: ${bookmark.url}`
        if (bookmark.tags.length > 0) entry += `\n   Tags: ${bookmark.tags.join(', ')}`
        if (extracted) entry += `\n   Linked content: ${extracted.slice(0, 1000)}`
        return entry
      })
      .join('\n\n')

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_DIGEST_MODEL || 'gpt-5-mini',
      messages: [
        {
          role: 'system',
          content: `You are a research digest assistant. You analyze a user's saved Twitter bookmarks and their linked content to produce an insightful digest.

Rules:
- Group bookmarks by topic/theme (AI, engineering, design, etc.)
- For each theme, synthesize insights — don't just summarize individual tweets
- Cite specific tweets using [N] notation matching the input numbering
- Highlight key papers, tools, threads, and notable takes
- Be concise but substantive — each section should teach something
- Output valid JSON matching the schema below`,
        },
        {
          role: 'user',
          content: `Generate a ${type} digest for ${bookmarks.length} bookmarks saved between ${periodStart.toLocaleDateString()} and ${now.toLocaleDateString()}.

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
          "tweet_text": "string — original tweet text",
          "tweet_author": "string — @handle",
          "insight": "string — what's notable about this",
          "sources": [
            { "title": "string", "url": "string", "type": "tweet|article|paper|website" }
          ]
        }
      ]
    }
  ]
}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 4000,
    })

    const digestContent = JSON.parse(
      response.choices[0].message.content || '{}'
    ) as DigestContent

    const markdown = renderDigestMarkdown(digestContent, type, periodStart, now)

    await supabase
      .from('digests')
      .update({
        content: digestContent,
        raw_markdown: markdown,
        bookmark_ids: bookmarks.map((b: any) => b.id),
        status: 'complete',
      })
      .eq('id', digest.id)

    return digest.id
  } catch (error) {
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
