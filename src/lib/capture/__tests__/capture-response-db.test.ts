// DB-backed integration tests for the Capture Engine service layer. These
// run against a real Postgres (same convention as workspace-isolation.test.ts
// and analytics.test.ts) and exercise the security boundaries that pure unit
// tests can't reach: cross-workspace upload blocking, wrong-session/step
// blocking, MIME and size guards, signed-playback workspace scoping, retake
// policy, and non-regression on existing FlowStep types.
//
// These tests require a Postgres reachable at $DATABASE_URL (the project's
// vitest.config.ts runs them in Node mode). They fail to *start* with
// `Can't reach database server` when the local DB isn't up — matching the
// behaviour of the other DB-backed test files. They are NOT mocked.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { nanoid } from 'nanoid'
import {
  CaptureError,
  createCaptureForUpload,
  failCapture,
  finalizeCaptureUpload,
  listSessionCaptures,
  loadCaptureForWorkspace,
} from '../capture-response.service'
import {
  buildCaptureStorageKey,
  parseCaptureStorageKey,
} from '../capture-storage.service'

const prisma = new PrismaClient()

// ── Shared fixtures ─────────────────────────────────────────────────
// Two workspaces with their own flows + capture steps + sessions, plus a
// non-capture step on workspace A to verify non-regression.

let workspaceA: { id: string }
let workspaceB: { id: string }
let userA: { id: string }
let userB: { id: string }
let flowA: { id: string }
let flowB: { id: string }
let captureStepA: { id: string }
let captureStepB: { id: string }
let captureStepANoRetake: { id: string }
let questionStepA: { id: string }
let sessionA: { id: string }
let sessionB: { id: string }
let sessionANoRetake: { id: string }
let sessionAFinished: { id: string }

const tag = nanoid(6)

beforeAll(async () => {
  userA = await prisma.user.create({
    data: { email: `cap-a-${tag}@test.com`, passwordHash: 'x', name: 'A' },
  })
  userB = await prisma.user.create({
    data: { email: `cap-b-${tag}@test.com`, passwordHash: 'x', name: 'B' },
  })

  workspaceA = await prisma.workspace.create({
    data: { name: 'Cap WS A', slug: `cap-a-${tag}` },
  })
  workspaceB = await prisma.workspace.create({
    data: { name: 'Cap WS B', slug: `cap-b-${tag}` },
  })

  await prisma.workspaceMember.createMany({
    data: [
      { userId: userA.id, workspaceId: workspaceA.id, role: 'owner' },
      { userId: userB.id, workspaceId: workspaceB.id, role: 'owner' },
    ],
  })

  flowA = await prisma.flow.create({
    data: { workspaceId: workspaceA.id, createdById: userA.id, name: 'Flow A', slug: `flow-a-${tag}` },
  })
  flowB = await prisma.flow.create({
    data: { workspaceId: workspaceB.id, createdById: userB.id, name: 'Flow B', slug: `flow-b-${tag}` },
  })

  captureStepA = await prisma.flowStep.create({
    data: {
      flowId: flowA.id,
      title: 'Tell us about yourself',
      stepType: 'capture',
      captureConfig: {
        mode: 'audio',
        prompt: 'Record a 30s intro',
        required: true,
        allowRetake: true,
        maxRetakes: 2,
        transcriptionEnabled: false,
        aiAnalysisEnabled: false,
      },
    },
  })

  captureStepANoRetake = await prisma.flowStep.create({
    data: {
      flowId: flowA.id,
      title: 'One-shot answer',
      stepType: 'capture',
      captureConfig: {
        mode: 'audio',
        prompt: 'No retakes',
        allowRetake: false,
      },
    },
  })

  captureStepB = await prisma.flowStep.create({
    data: {
      flowId: flowB.id,
      title: 'B prompt',
      stepType: 'capture',
      captureConfig: { mode: 'audio', allowRetake: true },
    },
  })

  questionStepA = await prisma.flowStep.create({
    data: {
      flowId: flowA.id,
      title: 'Pick one',
      stepType: 'question',
      questionText: 'Are you over 18?',
    },
  })

  sessionA = await prisma.session.create({
    data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: 'Candidate A' },
  })
  sessionB = await prisma.session.create({
    data: { workspaceId: workspaceB.id, flowId: flowB.id, candidateName: 'Candidate B' },
  })
  sessionANoRetake = await prisma.session.create({
    data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: 'Candidate A NR' },
  })
  sessionAFinished = await prisma.session.create({
    data: {
      workspaceId: workspaceA.id,
      flowId: flowA.id,
      candidateName: 'Candidate Done',
      finishedAt: new Date(),
    },
  })
})

afterAll(async () => {
  // Cascade-by-hand. captureResponses → sessions → flows → workspaces → users.
  await prisma.captureResponse.deleteMany({
    where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
  })
  await prisma.session.deleteMany({
    where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
  })
  await prisma.flowStep.deleteMany({
    where: { flowId: { in: [flowA.id, flowB.id] } },
  })
  await prisma.flow.deleteMany({
    where: { id: { in: [flowA.id, flowB.id] } },
  })
  await prisma.workspaceMember.deleteMany({
    where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
  })
  await prisma.workspace.deleteMany({
    where: { id: { in: [workspaceA.id, workspaceB.id] } },
  })
  await prisma.user.deleteMany({
    where: { id: { in: [userA.id, userB.id] } },
  })
  await prisma.$disconnect()
})

// Helper to grab the most recently created capture for a session — service
// returns the row, but several tests want to re-fetch state after a status
// transition.
async function reload(id: string) {
  return prisma.captureResponse.findUnique({ where: { id } })
}

// ── Happy path ──────────────────────────────────────────────────────

describe('createCaptureForUpload — happy path', () => {
  it('creates a tenant-scoped row in uploading state with a deterministic key', async () => {
    const { capture, storageKey, config } = await createCaptureForUpload({
      sessionId: sessionA.id,
      stepId: captureStepA.id,
      mode: 'audio',
      mimeType: 'audio/webm',
    })

    expect(capture.workspaceId).toBe(workspaceA.id)
    expect(capture.flowId).toBe(flowA.id)
    expect(capture.stepId).toBe(captureStepA.id)
    expect(capture.sessionId).toBe(sessionA.id)
    expect(capture.status).toBe('uploading')
    expect(capture.captureOrdinal).toBe(1)
    expect(config.mode).toBe('audio')

    // Storage key is derived from the row id and tenant ids — round-tripping
    // through parseCaptureStorageKey must return the same parts.
    const parsed = parseCaptureStorageKey(storageKey)
    expect(parsed).toEqual({
      workspaceId: workspaceA.id,
      sessionId: sessionA.id,
      stepId: captureStepA.id,
      captureResponseId: capture.id,
    })
    expect(storageKey).toBe(
      buildCaptureStorageKey({
        workspaceId: workspaceA.id,
        sessionId: sessionA.id,
        stepId: captureStepA.id,
        captureResponseId: capture.id,
        mimeType: 'audio/webm',
      })
    )
  })
})

// ── Cross-workspace / wrong session-step blocking ──────────────────

describe('createCaptureForUpload — tenant boundary', () => {
  it('blocks creating a capture against a step that belongs to a different flow', async () => {
    // sessionA is on flowA. captureStepB is on flowB. The presign API would
    // have routed both through the service; the service must refuse.
    await expect(
      createCaptureForUpload({
        sessionId: sessionA.id,
        stepId: captureStepB.id,
        mode: 'audio',
        mimeType: 'audio/webm',
      })
    ).rejects.toMatchObject({
      name: 'CaptureError',
      code: 'step_not_in_flow',
      status: 403,
    })
  })

  it('blocks creating a capture against a session in a different workspace via wrong step', async () => {
    // sessionB belongs to workspaceB / flowB. captureStepA is on workspaceA.
    // Service detects flow mismatch and refuses.
    await expect(
      createCaptureForUpload({
        sessionId: sessionB.id,
        stepId: captureStepA.id,
        mode: 'audio',
        mimeType: 'audio/webm',
      })
    ).rejects.toMatchObject({ code: 'step_not_in_flow' })
  })

  it('blocks creating a capture against a non-capture step (existing flow types still work)', async () => {
    // The candidate ought to be hitting questionStepA via the existing question
    // submission path; the capture API must refuse.
    await expect(
      createCaptureForUpload({
        sessionId: sessionA.id,
        stepId: questionStepA.id,
        mode: 'audio',
        mimeType: 'audio/webm',
      })
    ).rejects.toMatchObject({ code: 'not_capture_step' })
  })

  it('refuses uploads against a finished session', async () => {
    await expect(
      createCaptureForUpload({
        sessionId: sessionAFinished.id,
        stepId: captureStepA.id,
        mode: 'audio',
        mimeType: 'audio/webm',
      })
    ).rejects.toMatchObject({ code: 'session_finished' })
  })

  it('returns session_not_found for an unknown sessionId', async () => {
    await expect(
      createCaptureForUpload({
        sessionId: '00000000-0000-0000-0000-000000000000',
        stepId: captureStepA.id,
        mode: 'audio',
        mimeType: 'audio/webm',
      })
    ).rejects.toMatchObject({ code: 'session_not_found', status: 404 })
  })
})

// ── MIME guard ──────────────────────────────────────────────────────

describe('createCaptureForUpload — MIME guard', () => {
  it('rejects video MIME on an audio step', async () => {
    await expect(
      createCaptureForUpload({
        sessionId: sessionA.id,
        stepId: captureStepA.id,
        mode: 'audio',
        mimeType: 'video/mp4',
      })
    ).rejects.toMatchObject({ code: 'mime_not_allowed', status: 400 })
  })

  it('rejects mode mismatch even if MIME is valid for the requested mode', async () => {
    // captureStepA is configured for audio. Asking for video raises mode-not-
    // configured first, before any MIME check.
    await expect(
      createCaptureForUpload({
        sessionId: sessionA.id,
        stepId: captureStepA.id,
        mode: 'video',
        mimeType: 'video/mp4',
      })
    ).rejects.toMatchObject({ code: 'mode_not_supported_phase' })
  })

  it('rejects text/upload modes on the media presign path', async () => {
    // A capture step *could* be configured for text/upload later, but the
    // media presign service explicitly refuses those modes. Use a session
    // that's still active.
    await expect(
      createCaptureForUpload({
        sessionId: sessionA.id,
        stepId: captureStepA.id,
        mode: 'text',
        mimeType: 'text/plain',
      })
    ).rejects.toMatchObject({ code: 'mode_not_supported_phase' })
  })
})

// ── Retake policy ───────────────────────────────────────────────────

describe('createCaptureForUpload — retake policy', () => {
  it('refuses a second take on a step with allowRetake=false', async () => {
    const first = await createCaptureForUpload({
      sessionId: sessionANoRetake.id,
      stepId: captureStepANoRetake.id,
      mode: 'audio',
      mimeType: 'audio/webm',
    })
    expect(first.capture.captureOrdinal).toBe(1)

    await expect(
      createCaptureForUpload({
        sessionId: sessionANoRetake.id,
        stepId: captureStepANoRetake.id,
        mode: 'audio',
        mimeType: 'audio/webm',
      })
    ).rejects.toMatchObject({ code: 'retake_not_allowed', status: 409 })
  })

  it('increments captureOrdinal on each retake up to maxRetakes', async () => {
    const session = await prisma.session.create({
      data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: `Retaker-${tag}` },
    })

    // maxRetakes=2 on captureStepA → total 3 takes allowed (1 + 2 retakes)
    const r1 = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    expect(r1.capture.captureOrdinal).toBe(1)
    const r2 = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    expect(r2.capture.captureOrdinal).toBe(2)
    const r3 = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    expect(r3.capture.captureOrdinal).toBe(3)

    await expect(
      createCaptureForUpload({
        sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
      })
    ).rejects.toMatchObject({ code: 'max_retakes_exceeded' })
  })

  it('does not count failed takes against the retake budget', async () => {
    const session = await prisma.session.create({
      data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: `Flaky-${tag}` },
    })

    const r1 = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    await failCapture({ captureId: r1.capture.id, reason: 'flaky network' })

    // The failed row shouldn't consume a slot — the candidate gets to retake
    // with captureOrdinal=2 (ordinals still monotonically increase, but the
    // "live takes" count restarts).
    const r2 = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    expect(r2.capture.captureOrdinal).toBe(2)
    // Still room for one more (the limit is total live takes including
    // initial, which is 3 with maxRetakes=2).
    const r3 = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    expect(r3.capture.captureOrdinal).toBe(3)
  })
})

// ── Status machine ──────────────────────────────────────────────────

describe('finalizeCaptureUpload — status transitions', () => {
  it('transitions uploading → processed with the observed size and duration', async () => {
    const session = await prisma.session.create({
      data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: `Finalize-${tag}` },
    })
    const r = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })

    const finalized = await finalizeCaptureUpload({
      captureId: r.capture.id,
      sessionId: session.id,
      observed: { contentLength: 12345, contentType: 'audio/webm' },
      durationSec: 22,
    })
    expect(finalized.status).toBe('processed')
    expect(finalized.fileSizeBytes).toBe(12345)
    expect(finalized.durationSec).toBe(22)
  })

  it('refuses to finalize against the wrong session', async () => {
    const session = await prisma.session.create({
      data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: `WrongSess-${tag}` },
    })
    const r = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    await expect(
      finalizeCaptureUpload({
        captureId: r.capture.id,
        // Wrong session — pretending an attacker tried to finalize someone
        // else's upload with their own session token.
        sessionId: sessionB.id,
        observed: { contentLength: 1 },
      })
    ).rejects.toMatchObject({ code: 'forbidden_workspace', status: 403 })
  })

  it('rejects a second service-level finalize on the same row (route-layer idempotency lives in the API)', async () => {
    // The capture-response.service.finalizeCaptureUpload is strict — only
    // transitions from 'uploading' are valid. The API route adds the
    // idempotency shim that turns a duplicate POST into a 200 with the
    // existing capture, which is asserted at the route level.
    const session = await prisma.session.create({
      data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: `Double-${tag}` },
    })
    const r = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    await finalizeCaptureUpload({
      captureId: r.capture.id, sessionId: session.id, observed: { contentLength: 1 },
    })
    await expect(
      finalizeCaptureUpload({
        captureId: r.capture.id, sessionId: session.id, observed: { contentLength: 1 },
      })
    ).rejects.toMatchObject({ code: 'invalid_transition', status: 409 })
  })

  it('rejects negative durationSec', async () => {
    const session = await prisma.session.create({
      data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: `NegDur-${tag}` },
    })
    const r = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    await expect(
      finalizeCaptureUpload({
        captureId: r.capture.id,
        sessionId: session.id,
        observed: { contentLength: 1 },
        durationSec: -1,
      })
    ).rejects.toMatchObject({ code: 'invalid_transition', status: 400 })
  })

  it('rejects negative fileSize via observed.contentLength', async () => {
    const session = await prisma.session.create({
      data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: `NegSize-${tag}` },
    })
    const r = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    await expect(
      finalizeCaptureUpload({
        captureId: r.capture.id,
        sessionId: session.id,
        observed: { contentLength: -1 },
      })
    ).rejects.toMatchObject({ code: 'invalid_transition', status: 400 })
  })
})

// ── Recruiter read paths ───────────────────────────────────────────

describe('loadCaptureForWorkspace — workspace scope', () => {
  it('returns the capture for the owning workspace', async () => {
    const session = await prisma.session.create({
      data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: `Load-${tag}` },
    })
    const r = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })

    const loaded = await loadCaptureForWorkspace({
      captureId: r.capture.id, workspaceId: workspaceA.id,
    })
    expect(loaded.id).toBe(r.capture.id)
  })

  it('returns 404-shape error for a recruiter from a different workspace', async () => {
    // This is THE signed-playback workspace-access check. Service must
    // refuse to load a capture for workspaceB if it belongs to workspaceA,
    // *without* leaking existence (returns capture_not_found / 404, not 403).
    const session = await prisma.session.create({
      data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: `Leak-${tag}` },
    })
    const r = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    await expect(
      loadCaptureForWorkspace({
        captureId: r.capture.id, workspaceId: workspaceB.id,
      })
    ).rejects.toMatchObject({ code: 'capture_not_found', status: 404 })
  })

  it('returns 404 for an unknown captureId', async () => {
    await expect(
      loadCaptureForWorkspace({
        captureId: '00000000-0000-0000-0000-000000000000', workspaceId: workspaceA.id,
      })
    ).rejects.toMatchObject({ code: 'capture_not_found', status: 404 })
  })
})

describe('listSessionCaptures — workspace scope + retake collapse', () => {
  it('returns only the active take per step by default', async () => {
    const session = await prisma.session.create({
      data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: `List-${tag}` },
    })

    // Two takes; the second is the one the candidate wants reviewed.
    const r1 = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    await finalizeCaptureUpload({
      captureId: r1.capture.id, sessionId: session.id, observed: { contentLength: 1 },
    })
    const r2 = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    await finalizeCaptureUpload({
      captureId: r2.capture.id, sessionId: session.id, observed: { contentLength: 2 },
    })

    const rows = await listSessionCaptures({ workspaceId: workspaceA.id, sessionId: session.id })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(r2.capture.id)
    expect(rows[0].captureOrdinal).toBe(2)
  })

  it('includeRetakes=true returns every take', async () => {
    const session = await prisma.session.create({
      data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: `Hist-${tag}` },
    })
    const r1 = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })
    await finalizeCaptureUpload({
      captureId: r1.capture.id, sessionId: session.id, observed: { contentLength: 1 },
    })
    const r2 = await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })

    const rows = await listSessionCaptures({
      workspaceId: workspaceA.id, sessionId: session.id, includeRetakes: true,
    })
    expect(rows).toHaveLength(2)
  })

  it('returns empty array when querying from another workspace', async () => {
    const session = await prisma.session.create({
      data: { workspaceId: workspaceA.id, flowId: flowA.id, candidateName: `Scope-${tag}` },
    })
    await createCaptureForUpload({
      sessionId: session.id, stepId: captureStepA.id, mode: 'audio', mimeType: 'audio/webm',
    })

    const rowsFromB = await listSessionCaptures({
      workspaceId: workspaceB.id, sessionId: session.id,
    })
    expect(rowsFromB).toHaveLength(0)
  })
})

// ── Non-regression for existing FlowStep types ─────────────────────

describe('non-regression — existing flow step types', () => {
  it('non-capture FlowStep rows continue to read back with captureConfig=null', async () => {
    const fresh = await prisma.flowStep.findUnique({ where: { id: questionStepA.id } })
    expect(fresh).toBeTruthy()
    expect(fresh!.stepType).toBe('question')
    expect(fresh!.captureConfig).toBeNull()
  })

  it('non-capture steps cannot be promoted to capture writes without explicit reconfiguration', async () => {
    // Doubles as a verify-no-foot-gun: a recruiter mis-editing captureConfig
    // on a question step without changing stepType still wouldn't enable
    // capture writes — the service refuses based on stepType.
    await prisma.flowStep.update({
      where: { id: questionStepA.id },
      data: { captureConfig: { mode: 'audio' } as any },
    })
    await expect(
      createCaptureForUpload({
        sessionId: sessionA.id,
        stepId: questionStepA.id,
        mode: 'audio',
        mimeType: 'audio/webm',
      })
    ).rejects.toMatchObject({ code: 'not_capture_step' })
    // Clean up — restore captureConfig=null so the test is idempotent.
    await prisma.flowStep.update({
      where: { id: questionStepA.id },
      data: { captureConfig: null as any },
    })
  })
})

// Surface that `CaptureError` is the public boundary the API routes branch on.
describe('CaptureError', () => {
  it('uses code+status to drive HTTP responses', () => {
    const err = new CaptureError('mime_not_allowed', 'no good', 400)
    expect(err.name).toBe('CaptureError')
    expect(err.code).toBe('mime_not_allowed')
    expect(err.status).toBe(400)
  })
})
