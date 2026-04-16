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
  name: string                // "subscriptions/<id>"
  targetResource: string      // "//meet.googleapis.com/spaces/abc..."
  eventTypes: string[]
  expireTime?: string
  state?: string
  notificationEndpoint?: { pubsubTopic?: string }
}

interface Operation {
  name: string
  done?: boolean
  error?: { code?: number; message?: string }
  response?: WorkspaceEventsSubscription & { '@type'?: string }
  metadata?: { '@type'?: string; targetResource?: string }
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
  // Meet target resources do not support payloadOptions.includeResource — the
  // Workspace Events API rejects it with "include_resource is not supported".
  const target = `//meet.googleapis.com/${meetSpaceName.startsWith('spaces/') ? meetSpaceName : 'spaces/' + meetSpaceName}`
  const body = {
    targetResource: target,
    eventTypes: opts.eventTypes ?? ALL_MEET_EVENT_TYPES,
    notificationEndpoint: { pubsubTopic: getPubsubTopic() },
    ttl: `${opts.ttlSeconds ?? 604800}s`,
  }
  // subscriptions.create returns a long-running Operation. If it's done
  // inline (typical case), we can extract the Subscription directly.
  // Otherwise fall back to listing subscriptions filtered by target resource.
  const op = await wseFetch<Operation>(client, '/subscriptions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (op.done && op.response && op.response.name) {
    return op.response
  }
  return await findSubscriptionByTarget(client, target)
}

/**
 * Fetch the current Subscription for a Meet target resource. Used to resolve
 * the final subscription resource name after subscriptions.create returns an
 * async operation that hasn't completed inline, and for diagnostics.
 */
export async function findSubscriptionByTarget(
  client: OAuth2Client,
  targetResource: string,
): Promise<WorkspaceEventsSubscription> {
  // The API filter is on event_types (not target_resource), so we scan the
  // user's subscriptions looking for a matching target. For realistic loads
  // (one subscription per active meeting) this is cheap.
  const filter = encodeURIComponent('event_types:"google.workspace.meet.conference.v2.started"')
  const body = await wseFetch<{ subscriptions?: WorkspaceEventsSubscription[] }>(
    client,
    `/subscriptions?filter=${filter}`,
  )
  const subs = body.subscriptions || []
  const match = subs.find((s) => s.targetResource === targetResource)
  if (!match) {
    throw new WorkspaceEventsError(404, `No subscription found for target ${targetResource}`)
  }
  return match
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
