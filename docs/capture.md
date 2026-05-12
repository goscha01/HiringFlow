# Capture Engine — Operator & Browser Reference

Last updated 2026-05-12.

The Capture Engine is HireFunnel's generic candidate-response pipeline.
Phase 1 ships **audio answer** capture; the model and APIs are designed to
later host video, audio+video, file upload, and AI-call records.

This doc is the operational reference: feature flag, browser support, ops
checklist, and the metrics ops should watch in Grafana.

## Feature flag

Set on Vercel (Production + Preview):

```
CAPTURE_STEPS_ENABLED=true     # default: enabled when unset
```

When `false`:

- Public presign endpoint returns **503** (`feature_disabled`). No new uploads accepted.
- Public flow page renders an amber "temporarily unavailable" notice in place of the recorder.
- Builder hides the **Audio Answer** tile from the Add Step modal. Existing capture steps in flows are preserved; recruiters can still edit them (but the editor warns they can't be tested).
- `finalize` and `playback` endpoints **stay enabled** so in-flight uploads complete and prior recordings remain playable.

Flag is read on every request — flip it without a redeploy.

## Browser support matrix

| Browser | Audio mode | Notes |
|---|---|---|
| Chrome ≥ 90 (desktop) | ✅ supported | Default codec: `audio/webm;codecs=opus`. Playwright smoke runs here. |
| Safari ≥ 14.5 (macOS) | ✅ supported | Default codec: `audio/mp4;codecs=opus`. MIME negotiation picks mp4 first. |
| Safari (iOS ≥ 14.3) | ⚠️ supported, requires user smoke | mp4-only. **Needs a real-device smoke** before each new release. The MediaRecorder API was added in iOS 14.3; behavior on iOS 14.0–14.2 falls back to the `unsupported` denied state. |
| Firefox ≥ 90 (desktop) | ✅ supported | Default codec: `audio/webm;codecs=opus`. |
| Edge ≥ 90 | ✅ supported | Chromium-based; same path as Chrome. |
| Android Chrome | ✅ supported | Same path as desktop Chrome. |
| Samsung Internet | ⚠️ likely works | Untested. MediaRecorder support depends on Chromium version (most modern builds). |
| In-app browsers (Instagram, TikTok WebView) | ❌ unreliable | `getUserMedia` often returns `NotAllowedError` with no permission prompt. Detected categorically as `permission`. Recommend opening the link in the system browser. |
| IE 11 | ❌ not supported | No `MediaRecorder`. Recorder renders the `unsupported` denied state. |

### Known limitations

- **HTTPS required.** `getUserMedia` only works on secure origins (`https://` or `localhost`). Plain `http://` triggers the categorized `insecure` denied state with explicit copy.
- **Single PUT, not multipart.** Audio (≤ 100 MB) ships fine via a single S3 PUT. Video (≤ 500 MB, Phase 1F) will switch to multipart uploads — see TODO in `src/lib/capture/capture-storage.service.ts`.
- **In-process rate limit.** Per-IP + per-session token bucket is held in Lambda memory. A request hitting two regions doubles the effective quota. Acceptable for current scale; revisit before scaling regions.
- **No service-worker offline queue.** If the candidate goes offline mid-upload, the recorder catches the network error and shows a friendly "you're offline" message with the blob preserved in memory. The blob is **not** persisted across page reload.

## Recommended Grafana / Loki metrics

All capture events are structured with the `[capture]` prefix and JSON payload — see `src/lib/capture/capture-log.ts`. Sample LogQL queries to wire up once dashboards are built:

### Funnel + failures

```logql
# Upload failure rate (1h window)
sum by (reason) (
  count_over_time({service_name="hiringflow"} |~ "\\[capture\\]" | json | event="capture_upload_failed" [1h])
)

# Permission denied breakdown by category
sum by (reason) (
  count_over_time({service_name="hiringflow"} |~ "\\[capture\\]" | json | event="capture_permission_denied" [1h])
)

# Finalize failures
sum by (errorCode) (
  count_over_time({service_name="hiringflow"} |~ "\\[capture\\]" | json | event="capture_finalize_failed" [1h])
)
```

### Health

```logql
# Average upload size (last 24h, bytes)
avg_over_time(
  ({service_name="hiringflow"} |~ "\\[capture\\]" | json | event="capture_upload_completed" | unwrap sizeBytes)[24h]
)

# Average recording duration (seconds)
avg_over_time(
  ({service_name="hiringflow"} |~ "\\[capture\\]" | json | event="capture_recording_stopped" | unwrap durationSec)[24h]
)
```

### Browser segmentation

The client logs include `mimeType` — `audio/mp4` is Safari, `audio/webm` is Chrome/Firefox/Edge. Segment any of the above queries by `mimeType` for browser breakdown:

```logql
sum by (mimeType) (
  count_over_time({service_name="hiringflow"} |~ "\\[capture\\]" | json | event="capture_upload_completed" [1d])
)
```

### Alerting candidates

Wire alerts once thresholds are calibrated against baseline (a week of live traffic):

- `capture_upload_failed` rate > **5%** over 1h → page on-call
- `capture_finalize_failed` rate > **2%** over 1h → page on-call
- Total finalize failures with `code: "rate_limited"` > **10/min** → escalate (script abuse)
- Total `capture_permission_denied` rate > **30%** of recording starts → investigate (often signals embed/in-app browser issues)

## S3 lifecycle rules

Run once via Terraform or AWS CLI against the `S3_BUCKET` configured in env. Full TODO + rationale lives in `src/lib/capture/capture-storage.service.ts`. Summary:

1. **AbortIncompleteMultipartUpload after 24h** (prefix `captures/`) — required before Phase 1F ships video.
2. **Expiration after 30d** on `captures/failed-cleanup/` prefix — paired with the planned orphan-cleanup cron.
3. **NoncurrentVersionExpiration 30d** — only if bucket versioning is on (not today).
4. **(Optional) Transition to S3 Standard-IA after 90d, Glacier IR after 365d** — defer until recruiters' actual access patterns are known.

## Runbook: things that can go wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| `503 feature_disabled` on presign | `CAPTURE_STEPS_ENABLED=false` on Vercel | Confirm intentional; flip to `true` |
| Spike in `capture_permission_denied` (`reason: insecure`) | Site served over http somewhere | Check Vercel/proxy config; force HTTPS redirect |
| `capture_finalize_failed` with `code: mime_invalid` | Candidate's browser produced a MIME we don't allow OR a script attempted to upload a different content-type | Check the `mimeType` field in the failed log — if legitimate, add to `ALLOWED_MIME_TYPES` in `capture-config.ts`. If suspicious, ignore. |
| All uploads failing with `rate_limited` | One IP / session / workspace exceeded the bucket | Verify with the `scope` field on the failed log; investigate whether legitimate retake loop or abuse |
| Recording UI stuck in "Requesting microphone access…" | OS-level mic permission revoked or system prompt missed | Reload page; the categorized denied states fire when getUserMedia rejects. If it's hanging without rejection, suspect browser bug — log it and request a real-device smoke. |
| Orphan S3 objects accumulating | No orphan-cleanup cron yet | Track in Linear. Mitigate by Lifecycle rule #2 above once enabled. |

## Test surface

- **Unit:** `npx vitest run src/lib/capture` (79 tests at last count).
- **DB integration:** `src/lib/capture/__tests__/capture-response-db.test.ts` — requires a Postgres at `$DATABASE_URL`; covers cross-workspace blocking, retake policy, integrity guards.
- **Real browser:** `npx playwright test tests/playwright/capture-recorder.smoke.spec.ts` — uses Chromium fake audio. Run with `npm run dev` in another terminal.
- **Manual iOS smoke:** see Browser Support Matrix above. Required before each Phase 1F release.
