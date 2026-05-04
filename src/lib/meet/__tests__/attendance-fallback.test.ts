import { describe, it, expect } from 'vitest'
import { isAttendeePresent, type AttendanceRow } from '../attendance-fallback'

const row = (name: string | null, email: string | null = null): AttendanceRow => ({
  name, email, joinedAt: null, leftAt: null,
})

describe('isAttendeePresent', () => {
  it('returns false on empty rows', () => {
    expect(isAttendeePresent([], 'Heather', 'h@example.com')).toBe(false)
  })

  it('matches by exact email (rows are pre-lowercased by parseAttendanceRows; needle is normalized)', () => {
    const rows = [row('Heather Simmons', 'heather@example.com')]
    expect(isAttendeePresent(rows, null, 'HEATHER@Example.com')).toBe(true)
  })

  it('matches by name substring in either direction', () => {
    expect(isAttendeePresent([row('Heather Simmons')], 'Heather', null)).toBe(true)
    expect(isAttendeePresent([row('Heather')], 'Heather Simmons', null)).toBe(true)
  })

  it('does not false-match unrelated rows', () => {
    const rows = [row('Georgiy Sayapin', 'g@example.com'), row('Bob Other')]
    expect(isAttendeePresent(rows, 'Heather Simmons', 'heather@example.com')).toBe(false)
  })

  it('email match wins even when name is missing on the row', () => {
    const rows = [row(null, 'heather@example.com')]
    expect(isAttendeePresent(rows, 'Heather Simmons', 'heather@example.com')).toBe(true)
  })

  it('trims whitespace on the candidate identifiers before matching', () => {
    const rows = [row('Heather Simmons', 'heather@example.com')]
    expect(isAttendeePresent(rows, '  heather  ', '  heather@example.com  ')).toBe(true)
  })

  it('returns false when candidate identifiers are both null', () => {
    expect(isAttendeePresent([row('Heather Simmons')], null, null)).toBe(false)
  })
})
