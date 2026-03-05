import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/logger'
import { generateDigest } from '@/lib/digest/generate'

const log = createLogger('digest-regenerate')

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: old, error } = await supabase
    .from('digests')
    .select('id, digest_type')
    .eq('id', id)
    .single()

  if (error || !old) {
    return NextResponse.json({ error: 'Digest not found' }, { status: 404 })
  }

  const type = old.digest_type as 'daily' | 'weekly'
  log.info(`Regenerating ${type} digest (replacing ${id})`)

  // Delete old digest
  await supabase.from('digests').delete().eq('id', id)

  try {
    const newId = await generateDigest(type)
    log.info(`Regenerated: old=${id} → new=${newId}`)
    return NextResponse.json({ digestId: newId })
  } catch (e) {
    log.error('Regeneration failed', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export const maxDuration = 300
