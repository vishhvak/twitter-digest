import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

export async function extractWithReadability(url: string): Promise<{
  title: string
  content: string
  excerpt: string
  byline: string
} | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookmarkDigest/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await res.text()
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    if (!article) return null
    return {
      title: article.title || '',
      content: article.textContent || '',
      excerpt: article.excerpt || '',
      byline: article.byline || '',
    }
  } catch {
    return null
  }
}
