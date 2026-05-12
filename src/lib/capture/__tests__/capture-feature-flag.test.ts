import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isCaptureStepsEnabled,
  isCaptureStepsEnabledForSettings,
  isCaptureStepsEnabledForWorkspace,
} from '../capture-feature-flag'

const ENV_KEYS = ['CAPTURE_STEPS_ENABLED', 'NEXT_PUBLIC_CAPTURE_STEPS_ENABLED'] as const
const original: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) original[k] = process.env[k]
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k]
    else process.env[k] = original[k]
  }
})

// ── Global flag (env-level) ──────────────────────────────────────────

describe('isCaptureStepsEnabled (global)', () => {
  it('defaults to enabled when unset', () => {
    for (const k of ENV_KEYS) delete process.env[k]
    expect(isCaptureStepsEnabled()).toBe(true)
  })

  it('treats "true" / "1" / "yes" as enabled', () => {
    for (const value of ['true', '1', 'yes', 'on', 'TRUE']) {
      process.env.CAPTURE_STEPS_ENABLED = value
      expect(isCaptureStepsEnabled()).toBe(true)
    }
  })

  it('treats "false" / "0" / "no" / "off" as disabled', () => {
    for (const value of ['false', '0', 'no', 'off', 'FALSE']) {
      process.env.CAPTURE_STEPS_ENABLED = value
      expect(isCaptureStepsEnabled()).toBe(false)
    }
  })

  it('server-only var wins over NEXT_PUBLIC_ var', () => {
    process.env.CAPTURE_STEPS_ENABLED = 'false'
    process.env.NEXT_PUBLIC_CAPTURE_STEPS_ENABLED = 'true'
    expect(isCaptureStepsEnabled()).toBe(false)
  })

  it('falls back to NEXT_PUBLIC_ when server var is unset', () => {
    delete process.env.CAPTURE_STEPS_ENABLED
    process.env.NEXT_PUBLIC_CAPTURE_STEPS_ENABLED = 'false'
    expect(isCaptureStepsEnabled()).toBe(false)
  })
})

// ── Workspace-settings parser ─────────────────────────────────────────

describe('isCaptureStepsEnabledForSettings (workspace opt-in)', () => {
  it('returns false for null / undefined settings', () => {
    expect(isCaptureStepsEnabledForSettings(null)).toBe(false)
    expect(isCaptureStepsEnabledForSettings(undefined)).toBe(false)
  })

  it('returns false for empty object (missing key)', () => {
    expect(isCaptureStepsEnabledForSettings({})).toBe(false)
  })

  it('returns true only on strict === true', () => {
    expect(isCaptureStepsEnabledForSettings({ captureStepsEnabled: true })).toBe(true)
  })

  it('rejects truthy non-true values (strict opt-in)', () => {
    // Defends against accidental enabling via JSON shape drift.
    expect(isCaptureStepsEnabledForSettings({ captureStepsEnabled: 'true' })).toBe(false)
    expect(isCaptureStepsEnabledForSettings({ captureStepsEnabled: 1 })).toBe(false)
    expect(isCaptureStepsEnabledForSettings({ captureStepsEnabled: 'yes' })).toBe(false)
  })

  it('rejects falsy values', () => {
    expect(isCaptureStepsEnabledForSettings({ captureStepsEnabled: false })).toBe(false)
    expect(isCaptureStepsEnabledForSettings({ captureStepsEnabled: 0 })).toBe(false)
    expect(isCaptureStepsEnabledForSettings({ captureStepsEnabled: null })).toBe(false)
  })

  it('ignores non-object inputs', () => {
    expect(isCaptureStepsEnabledForSettings('captureStepsEnabled')).toBe(false)
    expect(isCaptureStepsEnabledForSettings(42)).toBe(false)
    expect(isCaptureStepsEnabledForSettings(true)).toBe(false)
  })

  it('coexists with other settings keys', () => {
    expect(
      isCaptureStepsEnabledForSettings({
        indeed: { partnerId: 'x' },
        funnelStages: [],
        captureStepsEnabled: true,
      })
    ).toBe(true)
  })
})

// ── Composite check (the contract API routes + UI consume) ────────────

describe('isCaptureStepsEnabledForWorkspace (composite, AND-combined)', () => {
  it('global off + workspace enabled → disabled', () => {
    process.env.CAPTURE_STEPS_ENABLED = 'false'
    expect(
      isCaptureStepsEnabledForWorkspace({
        workspaceSettings: { captureStepsEnabled: true },
      })
    ).toBe(false)
  })

  it('global on + workspace setting missing → disabled', () => {
    process.env.CAPTURE_STEPS_ENABLED = 'true'
    expect(
      isCaptureStepsEnabledForWorkspace({
        workspaceSettings: {},
      })
    ).toBe(false)
    expect(
      isCaptureStepsEnabledForWorkspace({
        workspaceSettings: null,
      })
    ).toBe(false)
    expect(
      isCaptureStepsEnabledForWorkspace({
        workspaceSettings: undefined,
      })
    ).toBe(false)
  })

  it('global on + workspace setting false → disabled', () => {
    process.env.CAPTURE_STEPS_ENABLED = 'true'
    expect(
      isCaptureStepsEnabledForWorkspace({
        workspaceSettings: { captureStepsEnabled: false },
      })
    ).toBe(false)
  })

  it('global on + workspace setting true → ENABLED', () => {
    process.env.CAPTURE_STEPS_ENABLED = 'true'
    expect(
      isCaptureStepsEnabledForWorkspace({
        workspaceSettings: { captureStepsEnabled: true },
      })
    ).toBe(true)
  })

  it('global default (unset) + workspace setting true → ENABLED', () => {
    // Dev/local case: unset env means the global flag defaults to ON, and
    // the workspace opt-in still gates.
    for (const k of ENV_KEYS) delete process.env[k]
    expect(
      isCaptureStepsEnabledForWorkspace({
        workspaceSettings: { captureStepsEnabled: true },
      })
    ).toBe(true)
  })

  it('global default (unset) + workspace setting missing → disabled', () => {
    for (const k of ENV_KEYS) delete process.env[k]
    expect(
      isCaptureStepsEnabledForWorkspace({
        workspaceSettings: null,
      })
    ).toBe(false)
  })

  it('global on + truthy non-true workspace value → disabled (strict opt-in)', () => {
    process.env.CAPTURE_STEPS_ENABLED = 'true'
    expect(
      isCaptureStepsEnabledForWorkspace({
        workspaceSettings: { captureStepsEnabled: 'true' as unknown as boolean },
      })
    ).toBe(false)
  })
})
