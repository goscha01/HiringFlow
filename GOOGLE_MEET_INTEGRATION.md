Update the existing Google Meet integration plan to reflect the revised architecture and capability logic below. Do not rebuild the whole proposal from scratch. Edit the current 12-phase plan so it stays in the same structure and level of detail, but apply these changes precisely.

Goal:
Support full Google Meet integration for HiringFlow so a user can connect either a personal Google account or a Google Workspace account, create Google Meet links, track when meetings actually start/end, and optionally enable recording when the connected Google account supports it. If the account does not support recording, the UI must clearly explain that recording requires a qualifying Google plan.

Required plan changes

1. Keep the new InterviewMeeting table

* Do not collapse this into SchedulingEvent.metadata.
* Preserve the typed InterviewMeeting model approach.
* Make sure the plan explicitly says this table is required for:

  * unique lookup by Meet space name / conference resource
  * webhook event correlation
  * recording/transcript artifact tracking
  * participant lifecycle tracking
  * clean joins to candidate / scheduling records
* Keep the Workspace feature flag.

2. Fix OAuth scopes

* Update the scope plan.
* Add Meet settings scope so the app can configure meeting artifact behavior.
* The plan must explicitly include:

  * meetings.space.created
  * meetings.space.settings
  * calendar event write scope
  * a Meet-specific Drive artifact read scope as primary
* Do not keep drive.file as the main recording access strategy.
* Mention that broader Drive readonly access can be considered only as a fallback if artifact visibility proves inconsistent.

3. Change recording capability detection logic

* Remove the assumption that hostedDomain / userinfo.hd is enough to determine recording support.
* The plan must say that domain/business detection is only a soft UX signal, not the source of truth.
* Replace the current “fast-path from userinfo.hd” idea with this logic:

  * store granted scopes
  * store hosted domain if available
  * infer likely free vs paid for messaging only
  * confirm recording capability by attempting a Meet settings/configuration operation or equivalent first-write capability check
  * cache the result with fields like:

    * recordingCapable
    * recordingCapabilityCheckedAt
    * recordingCapabilityReason
* Re-check capability periodically, for example every 30 days or on reconnect.

4. Update recording product behavior

* The Record toggle in the UI should not say only “business account required.”
* Replace that wording with something like:

  * “Recording requires a qualifying Google plan”
  * or equivalent upgrade guidance
* The plan must support:

  * toggle enabled when recordingCapable=true
  * toggle disabled when recordingCapable=false
  * clear explanation in UI when unavailable
* Keep the future fallback abstraction for external recorder providers.

5. Refine meeting lifecycle / automation logic

* The plan must clearly separate:

  * meeting scheduled
  * meeting started
  * meeting ended
  * recording ready
  * transcript ready
* Do not treat meeting ended and recording availability as the same milestone.
* Keep the automation trigger for meeting_ended.
* Keep optional waitForRecording behavior, but define it as a delayed follow-up state that waits for recording-ready/file-generated rather than assuming the file exists immediately after conference end.

6. Improve Workspace Events subscription handling

* Keep one Workspace Events subscription per Meet space.
* Keep the app-owned central GCP project approach unless there is a specific blocker.
* But revise the lifecycle strategy:

  * do not rely only on daily cron renewal
  * the plan must also handle subscription expiration reminder / lifecycle events when available
  * cron should remain as backup / cleanup
* Keep GC of finished meetings’ subscriptions.

7. Tighten webhook plan

* Keep /api/webhooks/google-meet with shared-token + Pub/Sub verification.
* Keep idempotency by CloudEvent id.
* Expand the webhook section so it explicitly says to normalize and persist:

  * raw event metadata
  * mapped interview state transitions
  * artifact-ready transitions
* Make sure the webhook routing covers:

  * conference.started
  * conference.ended
  * participant.joined
  * participant.left
  * recording events
  * transcript events

8. Adjust Drive / artifact retrieval phase

* Rewrite the artifact retrieval phase to reflect the new scope strategy.
* The plan should say:

  * Meet-generated recording/transcript artifacts are fetched through backend-controlled endpoints
  * playback/download should be proxied through the app
  * signed URL / Range support remains desirable
  * artifact access should first use the Meet-specific Drive artifact scope
  * only escalate to broader Drive access if real testing proves necessary

9. Preserve existing rollout structure

* Keep:

  * feature flag rollout
  * rollback plan
  * matrix across free Gmail / lower Workspace tiers / recording-capable paid tiers
  * email templates
  * follow-up automation
  * future Recall.ai abstraction
* But update wording everywhere so “recording unavailable” is treated as a supported product path, not an error condition.

Output requirements

* Return the revised 12-phase plan only.
* Keep the same phase numbering format.
* Keep the existing architecture where still valid.
* Do not remove good parts of the original plan unless they conflict with the requirements above.
* Where a phase changes, rewrite it cleanly rather than appending messy notes.
* At the end, include a short section called “Key plan changes from previous draft” with 5–8 bullets summarizing what was corrected.
