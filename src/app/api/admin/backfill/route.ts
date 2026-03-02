import { NextRequest, NextResponse } from 'next/server'
import { syncRaindrops } from '@/lib/raindrop/sync'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncRaindrops({ fullBackfill: true })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Backfill failed:', error)
    return NextResponse.json(
      { error: 'Backfill failed', message: String(error) },
      { status: 500 }
    )
  }
}

export const maxDuration = 300
