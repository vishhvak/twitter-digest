import { NextResponse } from 'next/server'
import { syncRaindrops } from '@/lib/raindrop/sync'
import { createLogger } from '@/lib/logger'

const log = createLogger('quick-sync')

export async function POST() {
  log.info('Quick incremental sync triggered')

  try {
    const result = await syncRaindrops({ mode: 'incremental' })
    log.info(`Quick sync done: ${result.synced} new bookmarks`)
    return NextResponse.json(result)
  } catch (error) {
    log.error('Quick sync failed', error)
    return NextResponse.json(
      { error: 'Sync failed', message: String(error) },
      { status: 500 }
    )
  }
}

export const maxDuration = 300
