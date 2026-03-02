import { extractWithReadability } from './readability'
import { extractFromPdf } from './pdf'
import { extractWithStagehand } from './stagehand'

export interface ExtractedResult {
  title: string
  content: string
  method: 'readability' | 'pdf' | 'stagehand'
  contentType: string
}

async function resolveUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) })
    return res.url
  } catch {
    return url
  }
}

export async function extractContent(url: string): Promise<ExtractedResult | null> {
  const resolved = await resolveUrl(url)

  // Tier 2: PDF
  if (resolved.match(/\.pdf($|\?)|arxiv\.org\/pdf/i)) {
    const pdf = await extractFromPdf(resolved)
    if (pdf) {
      return {
        title: '',
        content: pdf.text.slice(0, 50000),
        method: 'pdf',
        contentType: 'paper',
      }
    }
  }

  // Tier 1: Readability
  const article = await extractWithReadability(resolved)
  if (article && article.content.length > 200) {
    return {
      title: article.title,
      content: article.content.slice(0, 50000),
      method: 'readability',
      contentType: 'article',
    }
  }

  // Tier 3: Stagehand (fallback)
  const stagehandResult = await extractWithStagehand(resolved)
  if (stagehandResult) {
    return {
      title: stagehandResult.title,
      content: stagehandResult.content.slice(0, 50000),
      method: 'stagehand',
      contentType: 'article',
    }
  }

  return null
}
