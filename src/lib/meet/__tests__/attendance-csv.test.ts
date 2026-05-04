import { describe, it, expect } from 'vitest'
import { parseAttendanceCsv, isAttendeePresent } from '../attendance-fallback'

describe('parseAttendanceCsv', () => {
  it('parses standard CSV with name + email + joined + left columns', () => {
    const csv = [
      'Name,Email,Joined,Left',
      'Heather Simmons,heather@example.com,2026-05-04T19:00:00Z,2026-05-04T19:25:00Z',
      'Georgiy Sayapin,georgiy@example.com,2026-05-04T18:58:00Z,2026-05-04T19:30:00Z',
    ].join('\n')
    const rows = parseAttendanceCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0].name).toBe('Heather Simmons')
    expect(rows[0].email).toBe('heather@example.com')
    expect(rows[0].joinedAt?.toISOString()).toBe('2026-05-04T19:00:00.000Z')
    expect(rows[0].leftAt?.toISOString()).toBe('2026-05-04T19:25:00.000Z')
  })

  it('accepts TSV (tab-separated) format', () => {
    const tsv = [
      'Name\tEmail',
      'Heather Simmons\theather@example.com',
    ].join('\n')
    const rows = parseAttendanceCsv(tsv)
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('heather@example.com')
  })

  it('accepts semicolon-delimited (some EU locales export this from Sheets)', () => {
    const semi = 'Name;Email\nDebra Veada;dveada@gmail.com'
    const rows = parseAttendanceCsv(semi)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Debra Veada')
  })

  it('strips UTF-8 BOM', () => {
    const csv = '﻿Name,Email\nHeather,h@example.com'
    const rows = parseAttendanceCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Heather')
  })

  it('handles quoted commas inside fields', () => {
    const csv = 'Name,Email\n"Simmons, Heather",heather@example.com'
    const rows = parseAttendanceCsv(csv)
    expect(rows[0].name).toBe('Simmons, Heather')
  })

  it('handles escaped quotes ("") inside quoted fields', () => {
    const csv = 'Name,Note\n"O""Brien","says ""hi"""'
    const rows = parseAttendanceCsv(csv)
    expect(rows[0].name).toBe('O"Brien')
  })

  it('lowercases email on parse so isAttendeePresent matches case-insensitively', () => {
    const csv = 'Name,Email\nHeather,HEATHER@Example.COM'
    const rows = parseAttendanceCsv(csv)
    expect(rows[0].email).toBe('heather@example.com')
  })

  it('skips rows with both name and email blank', () => {
    const csv = 'Name,Email\nHeather,h@x.com\n,\n,\n'
    const rows = parseAttendanceCsv(csv)
    expect(rows).toHaveLength(1)
  })

  it('returns empty array for header-only or empty input', () => {
    expect(parseAttendanceCsv('')).toEqual([])
    expect(parseAttendanceCsv('Name,Email')).toEqual([])
  })

  it('detects join column with case/variant header (e.g. "Time Joined")', () => {
    const csv = 'Full Name,Email Address,Time Joined\nHeather,h@x.com,2026-05-04T19:00:00Z'
    const rows = parseAttendanceCsv(csv)
    expect(rows[0].name).toBe('Heather')
    expect(rows[0].email).toBe('h@x.com')
    expect(rows[0].joinedAt?.toISOString()).toBe('2026-05-04T19:00:00.000Z')
  })

  it('infers leftAt from joinedAt + duration column when leave time missing', () => {
    const csv = 'Name,Joined,Duration\nHeather,2026-05-04T19:00:00Z,15'
    const rows = parseAttendanceCsv(csv)
    expect(rows[0].leftAt?.toISOString()).toBe('2026-05-04T19:15:00.000Z')
  })

  it('parses duration in m:ss form', () => {
    const csv = 'Name,Joined,Duration\nHeather,2026-05-04T19:00:00Z,12:30'
    const rows = parseAttendanceCsv(csv)
    expect(rows[0].leftAt?.toISOString()).toBe('2026-05-04T19:12:30.000Z')
  })

  it('parses duration with "min" suffix', () => {
    const csv = 'Name,Joined,Duration\nHeather,2026-05-04T19:00:00Z,20 min'
    const rows = parseAttendanceCsv(csv)
    expect(rows[0].leftAt?.toISOString()).toBe('2026-05-04T19:20:00.000Z')
  })

  it('handles CRLF line endings', () => {
    const csv = 'Name,Email\r\nHeather,h@x.com\r\n'
    const rows = parseAttendanceCsv(csv)
    expect(rows).toHaveLength(1)
  })

  it('parsed rows feed isAttendeePresent correctly (e2e shape check)', () => {
    const csv = 'Name,Email\nDebra Veada,dveada@gmail.com\nGeorgiy Sayapin,georgiy@example.com'
    const rows = parseAttendanceCsv(csv)
    expect(isAttendeePresent(rows, 'Debra Veada', 'dveada@gmail.com')).toBe(true)
    expect(isAttendeePresent(rows, 'Heather Simmons', 'h@x.com')).toBe(false)
  })
})
