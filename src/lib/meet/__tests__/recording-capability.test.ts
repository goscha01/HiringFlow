import { describe, it, expect } from 'vitest'
import { capabilityMessage } from '../recording-capability'

describe('capabilityMessage', () => {
  it('never uses "business account" wording — the product path must be plan-agnostic', () => {
    const messages: string[] = [
      capabilityMessage('probe_ok'),
      capabilityMessage('permission_denied_plan'),
      capabilityMessage('permission_denied_admin_policy'),
      capabilityMessage('permission_denied_other'),
      capabilityMessage('probe_error'),
      capabilityMessage('no_integration'),
      capabilityMessage('probe_not_run'),
      capabilityMessage(null),
      capabilityMessage(undefined),
    ]
    for (const msg of messages) {
      expect(msg.toLowerCase()).not.toContain('business account')
    }
  })

  it('plan message mentions qualifying Google plan', () => {
    expect(capabilityMessage('permission_denied_plan').toLowerCase()).toContain('qualifying google plan')
  })

  it('admin-policy message is distinct from plan message', () => {
    expect(capabilityMessage('permission_denied_admin_policy')).not.toBe(capabilityMessage('permission_denied_plan'))
    expect(capabilityMessage('permission_denied_admin_policy').toLowerCase()).toContain('admin')
  })

  it('probe_ok is a positive confirmation', () => {
    expect(capabilityMessage('probe_ok').toLowerCase()).toContain('available')
  })

  it('falls back to a neutral not-yet-checked message for unknown/null states', () => {
    expect(capabilityMessage('probe_not_run').toLowerCase()).toContain('check')
    expect(capabilityMessage(null).toLowerCase()).toContain('check')
    expect(capabilityMessage(undefined).toLowerCase()).toContain('check')
  })
})
