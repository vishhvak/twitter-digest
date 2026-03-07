import { NextResponse } from 'next/server'
import { syncRaindrops } from '@/lib/raindrop/sync'
import { createLogger } from '@/lib/logger'
import { requireAuth } from '@/lib/supabase/auth'

const log = createLogger('quick-sync')

export async function POST() {
  const { authenticated } = await requireAuth()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
