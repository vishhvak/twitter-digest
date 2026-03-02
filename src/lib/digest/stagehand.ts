import { z } from 'zod'

export async function extractWithStagehand(url: string): Promise<{
  title: string
  content: string
  author: string | null
} | null> {
  // Dynamic import to avoid build-time resolution issues
  // Stagehand has native dependencies that don't bundle well with Next.js
  let Stagehand: any
  try {
    const mod = await import('@browserbasehq/stagehand')
    Stagehand = mod.Stagehand
  } catch {
    console.warn('Stagehand not available, skipping browser extraction')
    return null
  }

  let stagehand: any = null

  try {
    stagehand = new Stagehand({
      env: 'BROWSERBASE',
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
    })

    await stagehand.init()
    const page = stagehand.context.pages()[0]
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })

    const article = await stagehand.extract({
      instruction: 'Extract the main article content including title, author, and body text',
      schema: z.object({
        title: z.string().describe('The article headline/title'),
        content: z.string().describe('The full article body text'),
        author: z.string().nullable().describe('Author name if present'),
      }),
    })

    return article
  } catch (e) {
    console.error(`Stagehand extraction failed for ${url}:`, e)
    return null
  } finally {
    await stagehand?.close().catch(() => {})
  }
}
