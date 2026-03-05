import { NextResponse } from 'next/server'
import { getSyncProgress } from '@/lib/sync-progress'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(getSyncProgress())
}
