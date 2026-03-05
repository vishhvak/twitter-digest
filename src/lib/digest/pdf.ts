import * as pdfParseModule from 'pdf-parse'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfParse = (pdfParseModule as Record<string, any>).default || pdfParseModule

export async function extractFromPdf(url: string): Promise<{
  text: string
  pages: number
} | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
    const buffer = Buffer.from(await res.arrayBuffer())
    const data = await pdfParse(buffer)
    return { text: data.text, pages: data.numpages }
  } catch {
    return null
  }
}
