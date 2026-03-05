// In-memory sync progress tracker (single-instance, dev/serverless)
export interface SyncLogEntry {
  time: string
  message: string
}

export interface SyncProgress {
  status: 'idle' | 'fetching' | 'processing' | 'threads' | 'done' | 'error'
  totalItems: number
  processedItems: number
  message: string
  logs: SyncLogEntry[]
}

let progress: SyncProgress = {
  status: 'idle',
  totalItems: 0,
  processedItems: 0,
  message: '',
  logs: [],
}

export function getSyncProgress(): SyncProgress {
  return { ...progress, logs: [...progress.logs] }
}

export function updateSyncProgress(update: Partial<SyncProgress>) {
  progress = { ...progress, ...update }
}

export function appendSyncLog(message: string) {
  progress.logs.push({ time: new Date().toISOString(), message })
}

export function resetSyncProgress() {
  progress = { status: 'idle', totalItems: 0, processedItems: 0, message: '', logs: [] }
}
