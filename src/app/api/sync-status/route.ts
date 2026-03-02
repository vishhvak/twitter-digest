import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()

  const [syncResult, countResult] = await Promise.all([
    supabase.from('sync_state').select('*').eq('id', 1).single(),
    supabase.from('bookmarks').select('id', { count: 'exact', head: true }),
  ])

  return NextResponse.json({
    syncState: syncResult.data,
    totalBookmarks: countResult.count || 0,
  })
}
