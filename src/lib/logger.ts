type LogLevel = 'info' | 'warn' | 'error'

function timestamp(): string {
  return new Date().toISOString()
}

function format(level: LogLevel, tag: string, message: string, data?: unknown): string {
  const prefix = `[${timestamp()}] [${level.toUpperCase()}] [${tag}]`
  if (data !== undefined) {
    return `${prefix} ${message} ${JSON.stringify(data)}`
  }
  return `${prefix} ${message}`
}

export function createLogger(tag: string) {
  return {
    info(message: string, data?: unknown) {
      console.log(format('info', tag, message, data))
    },
    warn(message: string, data?: unknown) {
      console.warn(format('warn', tag, message, data))
    },
    error(message: string, data?: unknown) {
      console.error(format('error', tag, message, data))
    },
  }
}
