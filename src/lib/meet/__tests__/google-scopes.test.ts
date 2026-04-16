import { describe, it, expect } from 'vitest'
import { hasMeetScopes, REQUIRED_MEET_SCOPES } from '../../google'

describe('hasMeetScopes', () => {
  it('returns false for null/undefined/empty', () => {
    expect(hasMeetScopes(null)).toBe(false)
    expect(hasMeetScopes(undefined)).toBe(false)
    expect(hasMeetScopes('')).toBe(false)
  })

  it('returns false when only a subset is granted', () => {
    expect(hasMeetScopes('https://www.googleapis.com/auth/meetings.space.created https://www.googleapis.com/auth/userinfo.email')).toBe(false)
    // missing calendar.events
    expect(hasMeetScopes([REQUIRED_MEET_SCOPES[0], REQUIRED_MEET_SCOPES[1]].join(' '))).toBe(false)
  })

  it('returns true when all required scopes are present (in any order, with extras)', () => {
    const shuffled = [...REQUIRED_MEET_SCOPES].reverse()
    expect(hasMeetScopes(shuffled.join(' '))).toBe(true)
    expect(hasMeetScopes(`https://www.googleapis.com/auth/userinfo.email ${REQUIRED_MEET_SCOPES.join(' ')} https://extra`)).toBe(true)
  })

  it('tolerates multiple whitespace separators', () => {
    expect(hasMeetScopes(REQUIRED_MEET_SCOPES.join('\n\t '))).toBe(true)
  })
})
