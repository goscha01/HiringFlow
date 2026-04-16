import { describe, it, expect } from 'vitest'
import { MeetApiError } from '../google-meet'

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
