import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/logger'

const log = createLogger('bookmark-api')

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  // Delete thread tweets first (foreign key)
  await supabase.from('thread_tweets').delete().eq('bookmark_id', id)

  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('id', id)

  if (error) {
    log.error(`Failed to delete bookmark ${id}`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  log.info(`Deleted bookmark ${id}`)
  return NextResponse.json({ success: true })
}
