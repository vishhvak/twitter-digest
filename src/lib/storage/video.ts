import { createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/logger'

const log = createLogger('video-storage')
const BUCKET = 'tweet-videos'
const MAX_SIZE_MB = 50

/**
 * Download a video from a URL and upload it to Supabase Storage.
 * Returns the public URL, or null if the upload fails.
 */
export async function uploadVideoToStorage(
  videoUrl: string,
  bookmarkId: string,
  mediaIndex: number
): Promise<string | null> {
  try {
    // Clean query params from URL for logging
    const cleanUrl = videoUrl.split('?')[0]
    log.info(`Downloading video: ${cleanUrl} (bookmark=${bookmarkId}, index=${mediaIndex})`)

    const res = await fetch(videoUrl)
    if (!res.ok) {
      log.warn(`Failed to download video: ${res.status} ${res.statusText}`)
      return null
    }

    // Check content length before downloading fully
    const contentLength = res.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_SIZE_MB * 1024 * 1024) {
      log.warn(`Video too large (${Math.round(parseInt(contentLength) / 1024 / 1024)}MB), skipping`)
      return null
    }

    const buffer = Buffer.from(await res.arrayBuffer())

    if (buffer.length > MAX_SIZE_MB * 1024 * 1024) {
      log.warn(`Video too large after download (${Math.round(buffer.length / 1024 / 1024)}MB), skipping`)
      return null
    }

    const supabase = createAdminClient()
    const path = `${bookmarkId}/${mediaIndex}.mp4`

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: 'video/mp4',
        upsert: true,
      })

    if (error) {
      log.error(`Failed to upload video to storage: ${error.message}`)
      return null
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path)

    log.info(`Video uploaded: ${publicUrl} (${Math.round(buffer.length / 1024)}KB)`)
    return publicUrl
  } catch (e) {
    log.error(`Video upload failed for ${videoUrl}`, e)
    return null
  }
}

/**
 * Process an array of media items, uploading any videos to Supabase Storage.
 * Returns the media array with video URLs replaced by storage URLs.
 */
export async function processMediaVideos(
  media: { url: string; type: string; alt_text?: string | null }[],
  bookmarkId: string
): Promise<{ url: string; type: string; alt_text?: string | null }[]> {
  const result = await Promise.all(
    media.map(async (item, i) => {
      if (item.type === 'video' || item.type === 'animated_gif') {
        const storageUrl = await uploadVideoToStorage(item.url, bookmarkId, i)
        if (storageUrl) {
          return { ...item, url: storageUrl }
        }
      }
      return item
    })
  )
  return result
}
