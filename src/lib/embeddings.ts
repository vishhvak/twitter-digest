import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

  const result = await model.embedContent({
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT' as any,
    outputDimensionality: 768,
  } as any)

  return result.embedding.values
}

export async function generateQueryEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

  const result = await model.embedContent({
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_QUERY' as any,
    outputDimensionality: 768,
  } as any)

  return result.embedding.values
}

export function buildEmbeddingText(bookmark: {
  title?: string | null
  tweet_text?: string | null
  excerpt?: string | null
}): string {
  return [bookmark.title, bookmark.tweet_text, bookmark.excerpt]
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000)
}
