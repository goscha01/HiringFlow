import { describe, it, expect } from 'vitest'
import { selectRecorder, GoogleMeetRecorder, RecallAiRecorderStub } from '../meeting-recorder'

describe('selectRecorder', () => {
  it('returns disabled when record=false', () => {
    const s = selectRecorder({ record: false, capable: true })
    expect(s.recordingEnabled).toBe(false)
    if (!s.recordingEnabled) expect(s.reason).toBe('not_requested')
  })

  it('picks google_meet when recording is requested and capable', () => {
    const s = selectRecorder({ record: true, capable: true })
    expect(s.recordingEnabled).toBe(true)
    if (s.recordingEnabled) expect(s.provider).toBe('google_meet')
  })

  it('falls back to recall_ai when not capable but Recall is enabled', () => {
    const s = selectRecorder({ record: true, capable: false, recallAiEnabled: true })
    expect(s.recordingEnabled).toBe(true)
    if (s.recordingEnabled) expect(s.provider).toBe('recall_ai')
  })

  it('returns capability_denied when not capable and no Recall', () => {
    const s = selectRecorder({ record: true, capable: false })
    expect(s.recordingEnabled).toBe(false)
    if (!s.recordingEnabled) expect(s.reason).toBe('capability_denied')
  })

  it('treats unknown capability (null) the same as denied — we only record when we know we can', () => {
    const s = selectRecorder({ record: true, capable: null })
    expect(s.recordingEnabled).toBe(false)
    if (!s.recordingEnabled) expect(s.reason).toBe('capability_denied')
  })
})

describe('GoogleMeetRecorder', () => {
  it('exposes the right provider tag', () => {
    expect(new GoogleMeetRecorder().provider).toBe('google_meet')
  })
  it('start is a no-op (recording is driven by the Meet space config)', async () => {
    const r = new GoogleMeetRecorder()
    const out = await r.start({ meetingUri: 'https://meet.google.com/abc', workspaceId: 'ws' })
    expect(out.recordingRef).toBeNull()
  })
})

describe('RecallAiRecorderStub', () => {
  it('throws until the integration is implemented', async () => {
    const r = new RecallAiRecorderStub()
    await expect(r.start({ meetingUri: 'x', workspaceId: 'y' })).rejects.toThrow()
    await expect(r.fetchArtifacts(null)).rejects.toThrow()
  })
})
