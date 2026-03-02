import { NextRequest, NextResponse } from 'next/server'
import { generateDigest } from '@/lib/digest/generate'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const type = (searchParams.get('type') as 'daily' | 'weekly') || 'daily'

  try {
    const digestId = await generateDigest(type)
    return NextResponse.json({ digestId, type })
  } catch (error) {
    console.error('Digest generation failed:', error)
    return NextResponse.json({ error: 'Digest generation failed' }, { status: 500 })
  }
}

export const maxDuration = 300
