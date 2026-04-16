/**
 * Google Workspace Events API v1 client — subscribes to Meet space events
 * (conference.started / ended / participant.joined|left / recording|transcript
 * fileGenerated) and delivers them to our Pub/Sub topic. The topic then
 * forwards to /api/webhooks/google-meet via a push subscription.
 *
 * Subscription lifecycle (per-space):
 *   1. `subscribeSpace` — created immediately after a Meet space is created.
 *   2. `renewSubscription` — invoked on the in-band
 *      google.workspace.events.subscription.v1.expirationReminder event.
 *   3. `deleteSubscription` — invoked by the renewal cron as GC when the
 *      meeting has ended and artifacts are resolved.
 *
 * TTL defaults to 7 days; renewal attempts to extend by the same amount.
 */

import type { OAuth2Client } from 'google-auth-library'

const BASE = 'https://workspaceevents.googleapis.com/v1'

export type MeetEventType =
  | 'google.workspace.meet.conference.v2.started'
  | 'google.workspace.meet.conference.v2.ended'
  | 'google.workspace.meet.recording.v2.fileGenerated'
  | 'google.workspace.meet.transcript.v2.fileGenerated'
  | 'google.workspace.meet.participant.v2.joined'
  | 'google.workspace.meet.participant.v2.left'

export const ALL_MEET_EVENT_TYPES: MeetEventType[] = [
  'google.workspace.meet.conference.v2.started',
  'google.workspace.meet.conference.v2.ended',
  'google.workspace.meet.recording.v2.fileGenerated',
  'google.workspace.meet.transcript.v2.fileGenerated',
  'google.workspace.meet.participant.v2.joined',
  'google.workspace.meet.participant.v2.left',
]

export interface WorkspaceEventsSubscription {
  name: string                // projects/X/subscriptions/Y
  targetResource: string      // //meet.googleapis.com/spaces/abc...
  eventTypes: string[]
  expireTime?: string
  state?: string
  notificationEndpoint?: { pubsubTopic?: string }
}

export class WorkspaceEventsError extends Error {
  readonly status: number
  readonly details: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'WorkspaceEventsError'
    this.status = status
    this.details = details
  }
}

function getPubsubTopic(): string {
  const t = process.env.GCP_MEET_PUBSUB_TOPIC
  if (!t) throw new WorkspaceEventsError(500, 'GCP_MEET_PUBSUB_TOPIC env var not set')
  return t
}

async function token(client: OAuth2Client): Promise<string> {
  const t = await client.getAccessToken()
  if (!t?.token) throw new WorkspaceEventsError(401, 'No access token')
  return t.token
}

async function wseFetch<T>(client: OAuth2Client, path: string, init: RequestInit = {}): Promise<T> {
  const bearer = await token(client)
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    let body: unknown = undefined
    try { body = await res.json() } catch { /* ignore */ }
    const err = (body as { error?: { message?: string } })?.error?.message || res.statusText
    throw new WorkspaceEventsError(res.status, err, body)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export async function subscribeSpace(
  client: OAuth2Client,
  meetSpaceName: string,
  opts: { ttlSeconds?: number; eventTypes?: MeetEventType[] } = {},
): Promise<WorkspaceEventsSubscription> {
  const body = {
    targetResource: `//meet.googleapis.com/${meetSpaceName.startsWith('spaces/') ? meetSpaceName : 'spaces/' + meetSpaceName}`,
    eventTypes: opts.eventTypes ?? ALL_MEET_EVENT_TYPES,
    notificationEndpoint: { pubsubTopic: getPubsubTopic() },
    payloadOptions: { includeResource: true },
    ttl: `${opts.ttlSeconds ?? 604800}s`,
  }
  return wseFetch<WorkspaceEventsSubscription>(client, '/subscriptions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function renewSubscription(
  client: OAuth2Client,
  subscriptionName: string,
  ttlSeconds = 604800,
): Promise<WorkspaceEventsSubscription> {
  const path = subscriptionName.startsWith('/') ? subscriptionName : `/${subscriptionName}`
  return wseFetch<WorkspaceEventsSubscription>(client, `${path}?updateMask=ttl`, {
    method: 'PATCH',
    body: JSON.stringify({ ttl: `${ttlSeconds}s` }),
  })
}

export async function getSubscription(
  client: OAuth2Client,
  subscriptionName: string,
): Promise<WorkspaceEventsSubscription> {
  const path = subscriptionName.startsWith('/') ? subscriptionName : `/${subscriptionName}`
  return wseFetch<WorkspaceEventsSubscription>(client, path)
}

export async function deleteSubscription(
  client: OAuth2Client,
  subscriptionName: string,
): Promise<void> {
  const path = subscriptionName.startsWith('/') ? subscriptionName : `/${subscriptionName}`
  await wseFetch<void>(client, path, { method: 'DELETE' })
}
