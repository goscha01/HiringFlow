# Step 6 — Meeting Sync (Calendly + Google Calendar)

Log scheduled meetings on the candidate timeline and surface them on the Scheduling page. Use Google Calendar as the sync layer so no Calendly paid plan or Calendly API is required.

## Architecture

```
Candidate clicks email button
  → HireFunnel redirect (/schedule/redirect/:sessionId/:configId)
    → logs link_clicked, prefills name/email/utm_content
    → 302 to Calendly (candidate's own URL)

Candidate books on Calendly
  → Calendly writes event to user's connected Google Calendar
    (with invitee details + Meet link + utm_content preserved)

Google Calendar push notification
  → HireFunnel webhook (/api/webhooks/google)
    → fetch changed events (syncToken)
    → match to session via utm_content in event description
    → create SchedulingEvent { type: meeting_scheduled, scheduledAt, meetingUrl, rawPayload }
    → update pipelineStatus = "scheduled"

Timeline + Scheduling page read SchedulingEvent.
```

## Data model (additions)

```prisma
model GoogleIntegration {
  id              String   @id @default(uuid())
  workspaceId     String   @unique @map("workspace_id")
  workspace       Workspace @relation(fields: [workspaceId], references: [id])
  googleEmail     String   @map("google_email")
  refreshToken    String   @map("refresh_token")       // encrypted
  accessToken     String?  @map("access_token")
  accessExpiresAt DateTime? @map("access_expires_at")
  calendarId      String   @default("primary") @map("calendar_id")
  watchChannelId  String?  @map("watch_channel_id")
  watchResourceId String?  @map("watch_resource_id")
  watchExpiresAt  DateTime? @map("watch_expires_at")
  syncToken       String?  @map("sync_token")
  createdAt       DateTime @default(now())
  @@map("google_integrations")
}
```

`SchedulingEvent.eventType` gains: `meeting_scheduled`, `meeting_rescheduled`, `meeting_cancelled`.
`SchedulingEvent.metadata` carries: `{ scheduledAt, endAt, meetingUrl, googleEventId, attendeeEmail, source }`.

## Work items

### 1. Prefill Calendly link with candidate context — DONE
[src/app/api/public/schedule/redirect/route.ts](src/app/api/public/schedule/redirect/route.ts) appends `name`, `email`, `utm_content=<sessionId>`, `utm_source=hirefunnel` to the Calendly URL before 302. Basis for all downstream matching.

### 2. Manual "Log meeting" fallback (~15 min)
Button on candidate page + API to create `SchedulingEvent{ type: 'meeting_scheduled', metadata: { scheduledAt, meetingUrl? } }` manually. Works today for any scheduler, no OAuth required. Ship first.

### 3. Timeline surfacing (~30 min)
Candidate detail page renders `SchedulingEvent` rows alongside other timeline items: invite sent → link clicked → meeting scheduled → meeting rescheduled / cancelled. Already partially wired — just add the new event types.

### 4. Scheduling page listing (~30 min)
Dashboard → Scheduling gains a "Scheduled Meetings" section below the configs table. Lists upcoming bookings across the workspace with: candidate name, time, Meet link, config used, status. Reads from `SchedulingEvent` joined to `Session`.

### 5. Google Calendar OAuth (~2 hr)
- Register OAuth app in Google Cloud Console (scopes: `calendar.readonly`, `calendar.events.readonly`)
- `/api/integrations/google/connect` redirects to Google consent
- `/api/integrations/google/callback` stores refresh token in `GoogleIntegration`
- Dashboard → Settings → Integrations: Connect / Disconnect button + connected email
- Token refresh helper

### 6. Calendar watch subscription (~1 hr)
- On connect, POST `events.watch` to subscribe to `primary` calendar
- Store channel ID, resource ID, expiry
- Daily Vercel cron renews any watch expiring within 24h
- On disconnect: stop channel

### 7. Webhook handler (~2 hr)
- `/api/webhooks/google` — validates `X-Goog-Channel-Token` against stored workspace marker
- On `sync` resource state: call `events.list` with stored `syncToken`, get only changed events
- For each event:
  - Match session: utm_content in description (deterministic) → fallback to invitee email match → fallback to unmatched log
  - Extract: `start.dateTime`, `hangoutLink` (Meet) or `location`, attendee email
  - Upsert `SchedulingEvent` keyed on `(googleEventId, sessionId)`
  - Event types: created → `meeting_scheduled`; updated → `meeting_rescheduled`; cancelled → `meeting_cancelled`
- Update `Session.pipelineStatus` accordingly

### 8. Fire automation trigger `meeting_scheduled` (~30 min)
New automation trigger type so users can chain: "When meeting scheduled → send prep email 24h before" (combines with existing delayMinutes).

## Matching rules (in order)

1. `utm_content=<sessionId>` found in event description → deterministic match
2. Invitee email equals `session.candidateEmail` in this workspace with recent `invite_sent` → high confidence
3. No match → log to `SchedulingEvent` with `sessionId: null` and flag for manual review in dashboard

## Security

- Refresh tokens encrypted at rest (reuse existing `encrypt`/`decrypt` helpers in [src/lib](src/lib))
- Watch channel token is per-workspace secret, verified on every webhook hit
- Webhook payload signature not provided by Google — rely on channel token + HTTPS

## Rollout order

1. Step 2 (manual log) — ship today, covers all schedulers
2. Step 3 + 4 (timeline + list) — read path works for both manual and auto
3. Step 5 + 6 + 7 (Google Calendar auto-sync) — the main feature
4. Step 8 (new automation trigger)

## Open questions

- Do we encrypt `refreshToken` with app-level key or per-workspace key? Default: app-level (simpler; rotate via env var).
- How do we handle users who haven't connected Google Calendar? Fallback: rely on manual log + link_clicked signal for pipeline movement.
- Multi-calendar: v1 ships primary calendar only. V2 could let users pick which calendar to watch.
