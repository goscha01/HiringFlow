let loghubLog: ((opts: any) => Promise<any>) | null = null
try {
  // Optional: only available when @geos/loghub-client is installed
  loghubLog = require('@geos/loghub-client').loghubLog
} catch {}

const SERVICE = 'hiringflow'
const APP = 'hiringflow'
const ENV = process.env.NODE_ENV === 'production' ? 'prod' : 'dev'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export function log(
  level: LogLevel,
  message: string,
  attrs?: Record<string, any>
) {
  // Always log to console
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(`[${SERVICE}] [${level.toUpperCase()}] ${message}`, attrs || '')

  // Forward to LogHub (fire-and-forget, only works when @geos/loghub-client is installed)
  if (loghubLog) {
    loghubLog({
      service: SERVICE,
      app: APP,
      env: ENV,
      level,
      message,
      attrs,
    }).catch(() => {}) // never crash the app
  }
}

export const logger = {
  debug: (msg: string, attrs?: Record<string, any>) => log('debug', msg, attrs),
  info: (msg: string, attrs?: Record<string, any>) => log('info', msg, attrs),
  warn: (msg: string, attrs?: Record<string, any>) => log('warn', msg, attrs),
  error: (msg: string, attrs?: Record<string, any>) => log('error', msg, attrs),
}
