import { NextRequest, NextResponse } from 'next/server'
import { generateDigest } from '@/lib/digest/generate'
import { createLogger } from '@/lib/logger'

const log = createLogger('generate-digest-api')

export async function POST(request: NextRequest) {
  // Auth is optional — settings UI calls without auth, Vercel cron sends CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (authHeader && process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    log.warn(`Auth failed: invalid secret`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const type = (searchParams.get('type') as 'daily' | 'weekly') || 'daily'

  log.info(`Generating ${type} digest`)

  try {
    const digestId = await generateDigest(type)
    log.info(`Digest generated: ${digestId}`)
    return NextResponse.json({ digestId, type })
  } catch (error) {
    log.error('Digest generation failed', error)
    return NextResponse.json({ error: 'Digest generation failed', details: String(error) }, { status: 500 })
  }
}

export const maxDuration = 300
