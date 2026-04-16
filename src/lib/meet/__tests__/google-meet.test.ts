import { describe, it, expect } from 'vitest'
import { MeetApiError, parseMeetingCodeFromUrl } from '../google-meet'

describe('parseMeetingCodeFromUrl', () => {
  it('extracts codes from canonical Meet URLs', () => {
    expect(parseMeetingCodeFromUrl('https://meet.google.com/abc-defg-hij')).toBe('abc-defg-hij')
    expect(parseMeetingCodeFromUrl('http://meet.google.com/eqo-syqm-sjn')).toBe('eqo-syqm-sjn')
    expect(parseMeetingCodeFromUrl('https://meet.google.com/abc-defg-hij?hs=1')).toBe('abc-defg-hij')
    expect(parseMeetingCodeFromUrl('https://meet.google.com/abc-defg-hij#attendee')).toBe('abc-defg-hij')
  })

  it('returns null for non-Meet URLs and unsupported shapes', () => {
    expect(parseMeetingCodeFromUrl(null)).toBeNull()
    expect(parseMeetingCodeFromUrl(undefined)).toBeNull()
    expect(parseMeetingCodeFromUrl('')).toBeNull()
    expect(parseMeetingCodeFromUrl('https://zoom.us/j/12345')).toBeNull()
    expect(parseMeetingCodeFromUrl('https://meet.google.com/lookup/abcdef')).toBeNull()
    expect(parseMeetingCodeFromUrl('https://meet.google.com/short')).toBeNull()
  })
})

describe('MeetApiError.recordingReason', () => {
  it('returns null for non-403 errors', () => {
    expect(new MeetApiError(500, 'boom').recordingReason).toBeNull()
    expect(new MeetApiError(401, 'auth').recordingReason).toBeNull()
    expect(new MeetApiError(404, 'nope').recordingReason).toBeNull()
  })

  it('classifies plan-related 403s as permission_denied_plan', () => {
    expect(new MeetApiError(403, 'recording is not available on your plan').recordingReason).toBe('permission_denied_plan')
    expect(new MeetApiError(403, 'Upgrade required for this feature').recordingReason).toBe('permission_denied_plan')
    expect(new MeetApiError(403, 'Feature not supported on this tier').recordingReason).toBe('permission_denied_plan')
    expect(new MeetApiError(403, 'Recording requires a qualifying license').recordingReason).toBe('permission_denied_plan')
  })

  it('classifies admin-policy 403s as permission_denied_admin_policy', () => {
    expect(new MeetApiError(403, 'Disabled by Workspace admin policy').recordingReason).toBe('permission_denied_admin_policy')
    expect(new MeetApiError(403, 'Organization policy prevents recording').recordingReason).toBe('permission_denied_admin_policy')
    expect(new MeetApiError(403, 'The admin has disabled this').recordingReason).toBe('permission_denied_admin_policy')
  })

  it('falls back to permission_denied_other for unrecognized 403s', () => {
    expect(new MeetApiError(403, 'Something weird').recordingReason).toBe('permission_denied_other')
    expect(new MeetApiError(403, '').recordingReason).toBe('permission_denied_other')
  })
})
