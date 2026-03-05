import { NextRequest, NextResponse } from 'next/server'
import { syncRaindrops, SyncMode } from '@/lib/raindrop/sync'
import { createLogger } from '@/lib/logger'

const log = createLogger('sync-api')

const VALID_MODES: SyncMode[] = ['incremental', 'full', 'backfill-older']

async function handleSync(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader && process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const modeParam = request.nextUrl.searchParams.get('mode') || 'incremental'
  const mode = VALID_MODES.includes(modeParam as SyncMode) ? (modeParam as SyncMode) : 'incremental'

  log.info(`Sync triggered with mode: ${mode}`)

  try {
    const result = await syncRaindrops({ mode })
    return NextResponse.json(result)
  } catch (error) {
    log.error('Sync failed', error)
    return NextResponse.json(
      { error: 'Sync failed', message: String(error) },
      { status: 500 }
    )
  }
}

// Vercel crons send GET requests
export async function GET(request: NextRequest) {
  return handleSync(request)
}

export async function POST(request: NextRequest) {
  return handleSync(request)
}

export const maxDuration = 300
