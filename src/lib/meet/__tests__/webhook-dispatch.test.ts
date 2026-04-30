/**
 * Webhook dispatch test — verifies that each Workspace Events CloudEvent type
 * produces the expected sequence of state transitions without touching a
 * database or Google. We mock the prisma client and the Google-authed client,
 * then invoke the POST handler with a synthetic Pub/Sub push body.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// --- Mock prisma ---
const interviewMeeting = {
  id: 'meet-1',
  workspaceId: 'ws-1',
  sessionId: 'sess-1',
  meetSpaceName: 'spaces/ABC',
  recordingState: 'requested',
  transcriptState: 'processing',
  rawEvents: [],
  participants: [],
  workspaceEventsSubName: 'projects/p/subscriptions/s',
}
const state: Record<string, unknown> = { ...interviewMeeting }
const prismaMock = {
  interviewMeeting: {
    findUnique: vi.fn(async (args: { where: { id?: string; meetSpaceName?: string } }) => {
      if (args.where.id === 'meet-1' || args.where.meetSpaceName === 'spaces/ABC') return { ...state }
      return null
    }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(state, data)
      return state
    }),
  },
  processedWorkspaceEvent: {
    create: vi.fn(async () => ({ id: 'p1' })),
  },
  schedulingEvent: {
    create: vi.fn(async () => ({ id: 'se1' })),
    findFirst: vi.fn(async () => null),
  },
  session: {
    findUnique: vi.fn(async () => ({ id: 'sess-1', workspaceId: 'ws-1', flowId: 'f-1', flow: { name: 'F' }, ad: null, candidateName: 'C', candidateEmail: 'c@example.com' })),
  },
  automationRule: { findMany: vi.fn(async () => []) },
  automationExecution: { findMany: vi.fn(async () => []) },
  googleIntegration: {
    findUnique: vi.fn(async (): Promise<{ googleUserId: string | null }> => ({ googleUserId: 'HOST_USER_ID' })),
    update: vi.fn(async () => ({ id: 'gi-1' })),
  },
}

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/google', () => ({
  getAuthedClientForWorkspace: vi.fn(async () => ({ client: {} as unknown, integration: {} as unknown })),
  getAppUrl: () => 'https://test.local',
  hasMeetScopes: () => true,
  fetchUserId: vi.fn(async () => 'HOST_USER_ID'),
}))
vi.mock('@/lib/meet/google-drive', () => ({ getFileMeta: vi.fn(async () => ({ id: 'drive-abc', name: 'recording.mp4', mimeType: 'video/mp4' })) }))
vi.mock('@/lib/meet/workspace-events', async () => {
  const actual = await vi.importActual<typeof import('../workspace-events')>('../workspace-events')
  return { ...actual, renewSubscription: vi.fn(async () => ({ name: 'sub', expireTime: new Date(Date.now() + 7*24*3600*1000).toISOString() })) }
})
vi.mock('@/lib/automation', () => ({
  fireMeetingLifecycleAutomations: vi.fn(async () => {}),
}))

// Build a synthetic Pub/Sub push body for a given CloudEvent type + payload
function buildPush(type: string, data: unknown, id = 'ce-' + type) {
  const envelope = { id, type, source: 'meet', time: new Date().toISOString(), data }
  const b64 = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64')
  return { message: { data: b64, messageId: 'm' + Math.random() } }
}

function makeRequest(body: object) {
  const url = 'https://test.local/api/webhooks/google-meet?token=T'
  const req = new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return req
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(state, interviewMeeting, { rawEvents: [], participants: [] })
  process.env.GOOGLE_MEET_WEBHOOK_TOKEN = 'T'
  process.env.GOOGLE_MEET_WEBHOOK_ALLOW_UNSIGNED = '1'
  delete process.env.GOOGLE_MEET_WEBHOOK_REQUIRE_JWT
})

describe('Meet webhook dispatch', () => {
  it('rejects bad tokens', async () => {
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')
    const req = new NextRequest('https://test.local/api/webhooks/google-meet?token=WRONG', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('acks pushes for unknown Meet spaces without error', async () => {
    prismaMock.interviewMeeting.findUnique.mockImplementationOnce(async () => null)
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')
    const req = makeRequest(buildPush('google.workspace.meet.conference.v2.started', { space: { name: 'spaces/UNKNOWN' } }))
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ignored: 'unknown_space' })
  })

  it('dedupes duplicate CloudEvent ids', async () => {
    prismaMock.processedWorkspaceEvent.create
      .mockImplementationOnce(async () => ({ id: 'p1' }))
      .mockImplementationOnce(async () => {
        const err: Error & { code?: string } = new Error('dup')
        err.code = 'P2002'
        // Mimic Prisma's known-request-error
        const { Prisma } = await import('@prisma/client')
        throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' })
      })
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')

    const first = await POST(makeRequest(buildPush('google.workspace.meet.conference.v2.started', { space: { name: 'spaces/ABC' } }, 'same-id')))
    expect((await first.json()).ok).toBe(true)

    const second = await POST(makeRequest(buildPush('google.workspace.meet.conference.v2.started', { space: { name: 'spaces/ABC' } }, 'same-id')))
    expect((await second.json()).duplicate).toBe(true)
  })

  it('conference.started sets actualStart and writes a meeting_started SchedulingEvent', async () => {
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')
    const res = await POST(makeRequest(buildPush(
      'google.workspace.meet.conference.v2.started',
      { conferenceRecord: { name: 'conferenceRecords/x', space: { name: 'spaces/ABC' }, startTime: '2030-01-01T10:00:00Z' } },
    )))
    expect(res.status).toBe(200)
    expect(prismaMock.schedulingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'meeting_started' }) })
    )
    expect(prismaMock.interviewMeeting.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actualStart: expect.any(Date) }) })
    )
  })

  it('conference.ended sets actualEnd and writes meeting_ended (does NOT flip recordingState to ready)', async () => {
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')
    const res = await POST(makeRequest(buildPush(
      'google.workspace.meet.conference.v2.ended',
      { conferenceRecord: { name: 'conferenceRecords/x', space: { name: 'spaces/ABC' }, endTime: '2030-01-01T10:30:00Z' } },
    )))
    expect(res.status).toBe(200)
    expect(prismaMock.schedulingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'meeting_ended' }) })
    )
    // Recording state should not be 'ready' yet — that requires a separate recording.fileGenerated event
    expect(state.recordingState).not.toBe('ready')
  })

  it('conference.ended with empty participants logs meeting_no_show', async () => {
    state.participants = []
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')
    const res = await POST(makeRequest(buildPush(
      'google.workspace.meet.conference.v2.ended',
      { conferenceRecord: { name: 'conferenceRecords/x', space: { name: 'spaces/ABC' }, endTime: '2030-01-01T10:30:00Z' } },
    )))
    expect(res.status).toBe(200)
    const calls = prismaMock.schedulingEvent.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { eventType: string } }).data.eventType)
    expect(calls).toContain('meeting_ended')
    expect(calls).toContain('meeting_no_show')
  })

  it('conference.ended with only host in participants logs meeting_no_show', async () => {
    // signedinUser.user is `users/{id}` — what Workspace Events actually sends.
    state.participants = [{ email: 'users/HOST_USER_ID', displayName: 'Host', joinTime: '2030-01-01T10:00:00Z' }]
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')
    const res = await POST(makeRequest(buildPush(
      'google.workspace.meet.conference.v2.ended',
      { conferenceRecord: { name: 'conferenceRecords/x', space: { name: 'spaces/ABC' }, endTime: '2030-01-01T10:30:00Z' } },
    )))
    expect(res.status).toBe(200)
    const calls = prismaMock.schedulingEvent.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { eventType: string } }).data.eventType)
    expect(calls).toContain('meeting_no_show')
  })

  it('conference.ended with candidate present does NOT log meeting_no_show', async () => {
    state.participants = [
      { email: 'users/HOST_USER_ID', displayName: 'Host' },
      { email: 'users/CANDIDATE_USER_ID', displayName: 'Candidate' },
    ]
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')
    const res = await POST(makeRequest(buildPush(
      'google.workspace.meet.conference.v2.ended',
      { conferenceRecord: { name: 'conferenceRecords/x', space: { name: 'spaces/ABC' }, endTime: '2030-01-01T10:30:00Z' } },
    )))
    expect(res.status).toBe(200)
    const calls = prismaMock.schedulingEvent.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { eventType: string } }).data.eventType)
    expect(calls).toContain('meeting_ended')
    expect(calls).not.toContain('meeting_no_show')
  })

  it('recording.fileGenerated marks recordingState=ready and writes recording_ready', async () => {
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')
    const res = await POST(makeRequest(buildPush(
      'google.workspace.meet.recording.v2.fileGenerated',
      { space: { name: 'spaces/ABC' }, recording: { driveDestination: { file: 'drive-file-id' } } },
    )))
    expect(res.status).toBe(200)
    expect(state.recordingState).toBe('ready')
    expect(state.driveRecordingFileId).toBe('drive-file-id')
    expect(prismaMock.schedulingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'recording_ready' }) })
    )
  })

  it('transcript.fileGenerated marks transcriptState=ready', async () => {
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')
    const res = await POST(makeRequest(buildPush(
      'google.workspace.meet.transcript.v2.fileGenerated',
      { space: { name: 'spaces/ABC' }, transcript: { docsDestination: { document: 'docs-id' } } },
    )))
    expect(res.status).toBe(200)
    expect(state.transcriptState).toBe('ready')
    expect(state.driveTranscriptFileId).toBe('docs-id')
  })

  it('participant.joined appends signedinUser.user verbatim (it is users/{id}, not an email)', async () => {
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')
    await POST(makeRequest(buildPush(
      'google.workspace.meet.participant.v2.joined',
      { space: { name: 'spaces/ABC' }, participant: { signedinUser: { displayName: 'Alice', user: 'users/ALICE_ID' }, earliestStartTime: '2030-01-01T10:00:30Z' } },
    )))
    expect(Array.isArray(state.participants)).toBe(true)
    expect((state.participants as Array<{ email: string }>)[0].email).toBe('users/ALICE_ID')
  })

  it('host-only meeting (host joined via signed-in event) is detected as no-show', async () => {
    // Regression: previously the host was stored as `users/{id}` but compared
    // against googleEmail, so they were misclassified as a non-host attendee
    // and meeting_no_show never fired.
    state.participants = [{ email: 'users/HOST_USER_ID', displayName: 'Host' }]
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')
    const res = await POST(makeRequest(buildPush(
      'google.workspace.meet.conference.v2.ended',
      { conferenceRecord: { name: 'conferenceRecords/x', space: { name: 'spaces/ABC' }, endTime: '2030-01-01T10:30:00Z' } },
    )))
    expect(res.status).toBe(200)
    const calls = prismaMock.schedulingEvent.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { eventType: string } }).data.eventType)
    expect(calls).toContain('meeting_no_show')
  })

  it('older integration with null googleUserId self-heals from userinfo before evaluating no-show', async () => {
    // Force the lookup to return null this once — webhook should fall through
    // to fetchUserId, persist the result, then evaluate.
    prismaMock.googleIntegration.findUnique.mockImplementationOnce(async () => ({ googleUserId: null }))
    state.participants = [{ email: 'users/HOST_USER_ID', displayName: 'Host' }]
    const { POST } = await import('../../../app/api/webhooks/google-meet/route')
    const res = await POST(makeRequest(buildPush(
      'google.workspace.meet.conference.v2.ended',
      { conferenceRecord: { name: 'conferenceRecords/x', space: { name: 'spaces/ABC' }, endTime: '2030-01-01T10:30:00Z' } },
    )))
    expect(res.status).toBe(200)
    expect(prismaMock.googleIntegration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ googleUserId: 'HOST_USER_ID' }) })
    )
    const calls = prismaMock.schedulingEvent.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { eventType: string } }).data.eventType)
    expect(calls).toContain('meeting_no_show')
  })
})
