import { describe, expect, it } from 'vitest'
import {
  CAPTURE_STATUSES,
  canTransition,
} from '../capture-response.service'

// Pure-logic tests for the status machine. The DB-backed integration tests
// for createCaptureForUpload / finalizeCaptureUpload / loadCaptureForWorkspace
// (cross-workspace upload blocked, wrong session/step blocked, signed
// playback requires workspace access) are intentionally deferred until after
// the Phase 1A `prisma db push` is approved and run — they require the
// capture_responses table to exist in the DB the test suite hits. See
// capture-response-db.test.ts (added in the same commit as the schema push).

describe('CAPTURE_STATUSES', () => {
  it('lists the six lifecycle states', () => {
    expect(CAPTURE_STATUSES).toEqual([
      'draft',
      'uploading',
      'uploaded',
      'processing',
      'processed',
      'failed',
    ])
  })
})

describe('canTransition — forward edges', () => {
  it('allows draft → uploading', () => {
    expect(canTransition('draft', 'uploading')).toBe(true)
  })

  it('allows uploading → uploaded', () => {
    expect(canTransition('uploading', 'uploaded')).toBe(true)
  })

  it('allows uploaded → processing and uploaded → processed', () => {
    expect(canTransition('uploaded', 'processing')).toBe(true)
    expect(canTransition('uploaded', 'processed')).toBe(true)
  })

  it('allows processing → processed', () => {
    expect(canTransition('processing', 'processed')).toBe(true)
  })
})

describe('canTransition — failure edges', () => {
  it('allows draft → failed', () => {
    expect(canTransition('draft', 'failed')).toBe(true)
  })

  it('allows uploading → failed', () => {
    expect(canTransition('uploading', 'failed')).toBe(true)
  })

  it('allows uploaded → failed', () => {
    expect(canTransition('uploaded', 'failed')).toBe(true)
  })

  it('allows processing → failed', () => {
    expect(canTransition('processing', 'failed')).toBe(true)
  })
})

describe('canTransition — terminal states', () => {
  it('processed is terminal', () => {
    for (const to of CAPTURE_STATUSES) {
      expect(canTransition('processed', to)).toBe(false)
    }
  })

  it('failed is terminal', () => {
    for (const to of CAPTURE_STATUSES) {
      expect(canTransition('failed', to)).toBe(false)
    }
  })
})

describe('canTransition — invalid jumps', () => {
  it('does not allow skipping uploaded from draft', () => {
    expect(canTransition('draft', 'uploaded')).toBe(false)
    expect(canTransition('draft', 'processed')).toBe(false)
  })

  it('does not allow backwards transitions', () => {
    expect(canTransition('uploaded', 'uploading')).toBe(false)
    expect(canTransition('uploading', 'draft')).toBe(false)
    expect(canTransition('processed', 'uploaded')).toBe(false)
  })
})
