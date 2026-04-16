# Google Meet Integration v2 — Setup Guide

This guide walks through the one-time GCP Console setup required to enable the
Meet integration v2 flow. Everything here is operator-side — individual
workspace owners just hit **Connect Google** in the dashboard once the
platform is configured.

The integration is loosely coupled: every entry point is gated by the
`meetIntegrationV2Enabled` workspace flag and the `MEET_INTEGRATION_KILLSWITCH`
env var. If anything breaks, flip the kill switch and the rest of the app
keeps running.

## 1. Enable GCP APIs

In the Google Cloud project that owns the HireFunnel OAuth client (or create a
new project `hirefunnel-prod`):

```bash
gcloud services enable \
  meet.googleapis.com \
  calendar-json.googleapis.com \
  workspaceevents.googleapis.com \
  pubsub.googleapis.com \
  drive.googleapis.com
```

## 2. Expand OAuth consent screen

In the OAuth consent screen, add these scopes to the allowlist:

- `https://www.googleapis.com/auth/meetings.space.created`
- `https://www.googleapis.com/auth/meetings.space.settings`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/drive.meet.readonly`

Submit for verification. Meet / Drive scopes are *sensitive* and take 2–6
weeks to approve. Do this first.

If artifact fetching proves inconsistent under `drive.meet.readonly`, add
`https://www.googleapis.com/auth/drive.readonly` and submit again. Flip the
`DRIVE_ARTIFACT_SCOPE_ESCALATION=1` env to start requesting it.

## 3. Create Pub/Sub topic + push subscription

```bash
PROJECT=hirefunnel-prod
TOPIC=meet-events
SUB=meet-events-push
WEBHOOK_URL=https://www.hirefunnel.app/api/webhooks/google-meet

# Secret that will also be stored as GOOGLE_MEET_WEBHOOK_TOKEN
TOKEN=$(openssl rand -hex 32)

gcloud pubsub topics create $TOPIC --project=$PROJECT

# Dedicated service account for push auth (verified by webhook JWT check)
SA=meet-webhook-pusher
gcloud iam service-accounts create $SA --project=$PROJECT
SA_EMAIL=$SA@$PROJECT.iam.gserviceaccount.com

gcloud pubsub subscriptions create $SUB \
  --project=$PROJECT \
  --topic=$TOPIC \
  --push-endpoint="$WEBHOOK_URL?token=$TOKEN" \
  --push-auth-service-account=$SA_EMAIL \
  --push-auth-token-audience="$WEBHOOK_URL" \
  --ack-deadline=30
```

## 4. Grant Workspace Events publisher role

Workspace Events publishes via a specific Google-owned service account. It
must have Publisher on the topic:

```bash
gcloud pubsub topics add-iam-policy-binding $TOPIC \
  --project=$PROJECT \
  --member="serviceAccount:workspaceevents-publisher@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

## 5. Environment variables

Set these in Vercel (production) and any staging environment:

| Name | Value | Notes |
| --- | --- | --- |
| `GCP_PROJECT_ID` | `hirefunnel-prod` | Project owning the topic. |
| `GCP_MEET_PUBSUB_TOPIC` | `projects/hirefunnel-prod/topics/meet-events` | Fully qualified topic name. |
| `GOOGLE_MEET_WEBHOOK_TOKEN` | matches `?token=` on push URL | Shared secret, layer 1 auth. |
| `GOOGLE_MEET_WEBHOOK_SA_EMAIL` | `meet-webhook-pusher@...` | Asserted `email` claim in Pub/Sub JWT. |
| `GOOGLE_MEET_WEBHOOK_AUDIENCE` | `https://www.hirefunnel.app/api/webhooks/google-meet` | Expected `aud` claim. Only set if different from APP_URL + path. |
| `GOOGLE_MEET_WEBHOOK_REQUIRE_JWT` | `1` (prod) | Force JWT presence. |
| `GOOGLE_DRIVE_RECORDING_SIGNING_SECRET` | random 32+ bytes | HMAC signer for artifact-proxy tokens. |
| `DRIVE_ARTIFACT_SCOPE_ESCALATION` | `1` only if fallback needed | Requests `drive.readonly` on next consent. |
| `MEET_INTEGRATION_KILLSWITCH` | `1` to disable | Rollback lever. |

Existing OAuth env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`) stay as-is.

## 6. Turn on the feature flag per workspace

```sql
UPDATE workspaces SET meet_integration_v2_enabled = true WHERE id = '<workspace-id>';
```

Ask the workspace owner to reconnect Google from Settings → Integrations so
the new scopes are granted.

## 7. Smoke test

1. Reconnect Google as a Workspace Business Standard user.
2. Open a candidate → **Schedule interview** → toggle Record → submit.
3. The candidate gets a Calendar invite with the Meet link.
4. Join the Meet; a minute later the UI's `InterviewPanel` shows "In progress".
5. End the meeting; within ~60 s the panel flips to "Ended".
6. Within ~10 min the recording appears inline in the panel.

## Rollback

- Workspace-specific: `UPDATE workspaces SET meet_integration_v2_enabled = false`.
- Global: set `MEET_INTEGRATION_KILLSWITCH=1` in Vercel. Existing meetings
  stay in the DB; no webhook processing occurs until it's removed.

## Troubleshooting

- **403 from `spaces.create`** — user's plan doesn't support the requested
  config. The app caches `recordingCapable=false` and retries without
  recording. Surfaces `recordingCapabilityReason` in the settings card.
- **Pub/Sub webhook 401** — check `GOOGLE_MEET_WEBHOOK_TOKEN` matches the
  subscription URL, and that `GOOGLE_MEET_WEBHOOK_SA_EMAIL` matches the SA
  configured on the subscription.
- **Subscription expired** — `/api/cron/meet-subscriptions-renew` runs daily
  as a backup. The primary path is the in-band `expirationReminder`
  CloudEvent; a healthy steady state has `renewed=0` on the cron.
