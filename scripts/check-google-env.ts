// Inspects the GOOGLE_* env vars Next.js will see, without printing the values.
// Manual .env parsing to avoid dotenv dep.
import { readFileSync, existsSync } from 'fs'
import path from 'path'

function loadEnvFile(p: string): Record<string, string> {
  if (!existsSync(p)) return {}
  const raw = readFileSync(p, 'utf8')
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const k = trimmed.substring(0, eq).trim()
    let v = trimmed.substring(eq + 1)
    // Don't trim trailing whitespace — we want to detect it.
    // But strip surrounding quotes if present.
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

// Next.js precedence: .env.local overrides .env
const root = process.cwd()
const env = { ...loadEnvFile(path.join(root, '.env')), ...loadEnvFile(path.join(root, '.env.local')) }

function describe(name: string) {
  const v = env[name] || ''
  console.log(`${name}`)
  console.log(`  length: ${v.length}`)
  console.log(`  trailing whitespace: ${/\s$/.test(v)}`)
  console.log(`  contains newline: ${/\n|\r/.test(v)}`)
  console.log(`  starts with quote: ${v.startsWith('"') || v.startsWith("'")}`)
}

describe('GOOGLE_CLIENT_ID')
const id = env.GOOGLE_CLIENT_ID || ''
console.log(`  endsWith .apps.googleusercontent.com: ${id.endsWith('.apps.googleusercontent.com')}`)
console.log(`  prefix (first 10): ${JSON.stringify(id.substring(0, 10))}`)
console.log(`  suffix (last 35): ${JSON.stringify(id.substring(Math.max(0, id.length - 35)))}`)
console.log('')

describe('GOOGLE_CLIENT_SECRET')
const sec = env.GOOGLE_CLIENT_SECRET || ''
console.log(`  starts with GOCSPX-: ${sec.startsWith('GOCSPX-')}`)
console.log(`  prefix (first 7): ${JSON.stringify(sec.substring(0, 7))}`)
console.log('')

console.log(`GOOGLE_REDIRECT_URI: ${JSON.stringify(env.GOOGLE_REDIRECT_URI || '(not set)')}`)
console.log(`APP_URL: ${JSON.stringify(env.APP_URL || '(not set)')}`)
console.log(`NEXTAUTH_URL: ${JSON.stringify(env.NEXTAUTH_URL || '(not set)')}`)
