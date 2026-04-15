import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

// Symmetric encryption for tokens at rest. Key is derived from env secret.
// Format: <ivHex>:<authTagHex>:<cipherHex>
const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY
    || process.env.NEXTAUTH_SECRET
    || ''
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY or NEXTAUTH_SECRET required')
  return createHash('sha256').update(secret).digest()
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split(':')
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid encrypted payload')
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()])
  return dec.toString('utf8')
}
