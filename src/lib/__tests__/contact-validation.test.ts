import { describe, it, expect } from 'vitest'
import { validateEmail, validatePhone, normalizeToE164 } from '../contact-validation'

describe('validateEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(validateEmail('foo@example.com').ok).toBe(true)
    expect(validateEmail('Foo.Bar+tag@sub.example.co').ok).toBe(true)
    expect(validateEmail('first.last@photography').ok).toBe(false) // single-segment, no dot
    expect(validateEmail('first.last@gallery.photography').ok).toBe(true)
  })

  it("rejects Daphney's @gmail.comd typo with a did-you-mean hint", () => {
    const r = validateEmail('damanshacleaningservices@gmail.comd')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Did you mean damanshacleaningservices@gmail.com?')
  })

  it.each([
    ['foo@gmail.con',  'foo@gmail.com'],
    ['foo@gmail.cmo',  'foo@gmail.com'],
    ['foo@yahoo.comm', 'foo@yahoo.com'],
    ['foo@hotmail.cm', 'foo@hotmail.com'],
  ])('catches common TLD typo %s → %s', (bad, fixed) => {
    const r = validateEmail(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe(`Did you mean ${fixed}?`)
  })

  it('rejects structural problems', () => {
    expect(validateEmail('').ok).toBe(false)
    expect(validateEmail('plainstring').ok).toBe(false)
    expect(validateEmail('foo@').ok).toBe(false)
    expect(validateEmail('foo@gmail').ok).toBe(false)        // no TLD
    expect(validateEmail('foo@gmail.').ok).toBe(false)       // empty TLD
    expect(validateEmail('foo@@gmail.com').ok).toBe(false)
    expect(validateEmail('foo@gmail..com').ok).toBe(false)   // double dot
    expect(validateEmail('foo @gmail.com').ok).toBe(false)   // space
  })

  it('lowercases + trims', () => {
    const r = validateEmail('  Foo@Example.COM  ')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('foo@example.com')
  })
})

describe('validatePhone', () => {
  it('normalizes US 10-digit and 11-digit input to E.164', () => {
    expect(validatePhone('5551234567')).toEqual({ ok: true, value: '+15551234567' })
    expect(validatePhone('15551234567')).toEqual({ ok: true, value: '+15551234567' })
    expect(validatePhone('(555) 123-4567')).toEqual({ ok: true, value: '+15551234567' })
    expect(validatePhone('+15551234567')).toEqual({ ok: true, value: '+15551234567' })
  })

  it('rejects malformed phones', () => {
    expect(validatePhone('').ok).toBe(false)
    expect(validatePhone('abc').ok).toBe(false)
    expect(validatePhone('123').ok).toBe(false)
    expect(validatePhone('+0123456').ok).toBe(false) // E.164 forbids leading 0
  })

  it('passes through valid international E.164', () => {
    const r = validatePhone('+447700900123') // UK mobile
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('+447700900123')
  })
})

describe('normalizeToE164 (re-exported)', () => {
  it('matches the sms.ts behaviour', () => {
    expect(normalizeToE164('5551234567')).toBe('+15551234567')
    expect(normalizeToE164('not a phone')).toBeNull()
  })
})
