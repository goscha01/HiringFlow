/**
 * Provider-agnostic MeetingRecorder interface. Phase 1 ships the GoogleMeet
 * implementation only; RecallAiRecorder is sketched here so the schema's
 * `recordingProvider` enum is consistent across phases.
 *
 * Selection policy (applied at schedule time):
 *   - record=true + capability=true          → google_meet
 *   - record=true + capability=false + workspace has Recall.ai enabled
 *                                            → recall_ai (future)
 *   - record=true + capability=false + no Recall.ai → recorded=false
 *   - record=false                           → disabled
 */

import type { OAuth2Client } from 'google-auth-library'

export type RecordingProvider = 'google_meet' | 'recall_ai'

export interface RecorderStartInput {
  meetingUri: string
  workspaceId: string
}

export interface RecorderStartResult {
  /**
   * Opaque per-provider reference used to fetch artifacts later. For
   * google_meet this is unused (the Meet space itself is the reference);
   * for recall_ai this is the bot id.
   */
  recordingRef: string | null
}

export interface RecorderArtifacts {
  videoUrl?: string       // absolute URL, possibly signed
  transcriptUrl?: string
  endedAt?: Date
}

export interface MeetingRecorder {
  readonly provider: RecordingProvider
  start(input: RecorderStartInput): Promise<RecorderStartResult>
  fetchArtifacts(ref: string | null): Promise<RecorderArtifacts>
  cancel?(ref: string | null): Promise<void>
}

/**
 * Google Meet native recording — controlled by the Meet space's
 * autoRecordingGeneration flag, not by a separate start() call. So start() is
 * a no-op (recording begins when the conference starts), and fetchArtifacts
 * is a thin query of InterviewMeeting's cached drive file ids.
 */
export class GoogleMeetRecorder implements MeetingRecorder {
  readonly provider = 'google_meet' as const
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async start(_input: RecorderStartInput): Promise<RecorderStartResult> {
    return { recordingRef: null }
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchArtifacts(_ref: string | null): Promise<RecorderArtifacts> {
    // Actual artifact retrieval is handled by the Workspace Events webhook
    // plus the /api/interview-meetings/:id/recording proxy — this stub exists
    // so callers get a consistent interface.
    return {}
  }
}

/**
 * Placeholder — no network calls made. Left as a structural contract so the
 * schema enum and selection logic can refer to 'recall_ai' without a broken
 * implementation reference.
 */
export class RecallAiRecorderStub implements MeetingRecorder {
  readonly provider = 'recall_ai' as const
  async start(_input: RecorderStartInput): Promise<RecorderStartResult> {
    throw new Error('Recall.ai integration not yet implemented')
  }
  async fetchArtifacts(_ref: string | null): Promise<RecorderArtifacts> {
    throw new Error('Recall.ai integration not yet implemented')
  }
}

export type RecorderSelectionInput = {
  record: boolean
  capable: boolean | null
  recallAiEnabled?: boolean
}

export type RecorderSelection =
  | { provider: RecordingProvider; recordingEnabled: true }
  | { provider: null; recordingEnabled: false; reason: 'not_requested' | 'capability_denied' }

export function selectRecorder(input: RecorderSelectionInput): RecorderSelection {
  if (!input.record) return { provider: null, recordingEnabled: false, reason: 'not_requested' }
  if (input.capable === true) return { provider: 'google_meet', recordingEnabled: true }
  if (input.recallAiEnabled) return { provider: 'recall_ai', recordingEnabled: true }
  return { provider: null, recordingEnabled: false, reason: 'capability_denied' }
}

// Unused types suppressed in runtime — keep narrow imports.
export type { OAuth2Client }
