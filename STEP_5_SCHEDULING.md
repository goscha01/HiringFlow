

## Task: Add Scheduling system using Calendly as the MVP booking provider

### Goal

Add a simple scheduling step to HireFunnel so candidates who complete Training can receive a booking link and schedule their interview through **Calendly**.

This step should **not** build a custom scheduling engine.
For MVP, Calendly should be treated as the external booking provider.

The purpose is to make Scheduling the next controlled step after Training:

* candidate completes training
* system sends scheduling email
* candidate books through Calendly
* candidate status is updated/tracked inside HireFunnel

---

## Product intent

HireFunnel is not trying to replace Calendly right now.

For MVP, the scheduling system should:

* let admin configure one or more Calendly links
* let automations send the right scheduling link after training completion
* track that candidate was invited to schedule
* optionally support manual status update for booked interviews
* be ready for future Calendly webhook/API integration later

---

## Scope

Build a lightweight Scheduling module with:

* Calendly link configuration
* integration with Automations
* candidate scheduling state tracking
* basic admin visibility

Do **not** build:

* internal calendar
* time slots
* availability engine
* timezone engine
* rescheduling logic
* reminder engine

---

# 1. Create Scheduling module

Add a top-level admin section:

## Scheduling

This is where admin configures interview booking links.

For MVP, support **Calendly only**.

---

# 2. Scheduling config model

Create a scheduling config entity like:

```ts
SchedulingConfig {
  id: string

  name: string
  provider: 'calendly'
  schedulingUrl: string

  isDefault: boolean
  isActive: boolean

  createdAt: Date
  updatedAt: Date
}
```

### Notes

* `name` examples:

  * General Interview
  * Cleaner Interview
  * Manager Interview
* `schedulingUrl` is the Calendly event URL
* one config can be marked default
* later you can add per-flow or per-role scheduling, but keep MVP simple

---

# 3. Admin UI for Scheduling

Build a simple CRUD UI.

## Scheduling list page

Show:

* Name
* Provider
* URL
* Default
* Status
* Updated date

Actions:

* Create
* Edit
* Delete
* Set default
* Activate/deactivate

## Create/Edit form

Fields:

* Name
* Provider (fixed to Calendly for MVP)
* Scheduling URL
* Default toggle
* Active toggle

Add basic validation:

* URL is required
* URL should look like a valid Calendly URL

---

# 4. Integrate Scheduling with Automations

This step must connect to the Step 3 automation system.

When:

* candidate completes Training

the automation system should be able to:

* send an email
* include the scheduling link

### Required variable

Support:

```text
{{schedule_link}}
```

This should resolve from:

* the selected/default `SchedulingConfig`
* or the automation rule’s assigned scheduling config if you support that now

### Recommended approach

Extend `AutomationRule` with:

```ts
schedulingConfigId: string | null
```

Then:

* if rule has `schedulingConfigId`, use that
* otherwise use default active scheduling config

---

# 5. Candidate scheduling state tracking

Extend the candidate model or candidate progression model to track scheduling stage.

Suggested candidate states:

```ts
Candidate.status:
  'applied'
  | 'completed_flow'
  | 'passed'
  | 'training_in_progress'
  | 'training_completed'
  | 'invited_to_schedule'
  | 'scheduled'
```

### Required MVP behavior

* when training is completed:

  * set status to `training_completed`
* when scheduling email is sent:

  * set status to `invited_to_schedule`
* actual `scheduled` can be set manually for now

Do not block MVP on automatic booking detection.

---

# 6. Add scheduling event/log model

Create a simple tracking table to record scheduling-related actions.

```ts
SchedulingEvent {
  id: string
  candidateId: string
  schedulingConfigId: string | null

  eventType: 'invite_sent' | 'link_clicked' | 'marked_scheduled'
  eventAt: Date

  metadataJson: string | null

  createdAt: Date
}
```

### For MVP

At minimum log:

* `invite_sent`

Optional if easy:

* `link_clicked`

This will help with:

* analytics
* pipeline visibility
* debugging

---

# 7. Candidate profile updates

Update candidate admin/profile view to show scheduling progress.

Show:

* scheduling invitation sent or not
* scheduling config/link used
* current scheduling status
* manual action: mark as scheduled

Optional later:

* store booking date/time from Calendly

For MVP, manual marking is acceptable.

---

# 8. Email template integration

Email templates should support:

* `{{candidate_name}}`
* `{{schedule_link}}`

Example scheduling email:

**Subject:** Book your interview

**Body:**
Hi {{candidate_name}},

Great job completing the training.

Please choose a time for your interview here:

{{schedule_link}}

We look forward to speaking with you.

---

# 9. Optional click tracking (MVP+ if easy)

If possible without complexity:

* wrap schedule link in an internal tracking redirect
* log `link_clicked`
* then redirect to Calendly URL

Example:

```text
/schedule/redirect/:candidateId/:configId
```

Behavior:

1. log click
2. redirect to Calendly link

This is useful but not required for MVP.
If it adds too much complexity, skip and just log `invite_sent`.

---

# 10. Keep Calendly as external system

Important architecture rule:

HireFunnel should not try to own the booking engine yet.

Calendly remains the booking provider.
HireFunnel should manage:

* which link to send
* when to send it
* how to track candidate stage around it

Do not build internal scheduling logic.

---

# 11. Prepare for future Calendly integration

Structure the code so later you can add:

* Calendly webhook ingestion
* automatic status update when booking occurs
* meeting time storage
* rescheduling and cancellations

But do not build that in this step unless trivial.

Recommended structure:

* `SchedulingService`
* `SchedulingConfigService`
* future `CalendlyWebhookService`

---

# 12. Acceptance criteria

Step 5 is complete when:

1. admin can create and manage Calendly scheduling links
2. one scheduling config can be marked as default
3. automation emails can include `{{schedule_link}}`
4. after training completion, candidate can receive scheduling email
5. candidate status is updated to `invited_to_schedule`
6. scheduling invite event is logged
7. candidate profile shows scheduling stage
8. admin can manually mark candidate as `scheduled`
9. no internal calendar/time-slot system is built
10. architecture remains ready for future Calendly webhook/API integration

---

## Non-goals for this step

Do not build:

* custom calendar system
* availability/time-slot UI
* timezone logic
* reminders
* automatic booking sync from Calendly
* reschedule/cancel workflows
* interviewer assignment engine

This step is only:

* configure Calendly links
* send them through automations
* track scheduling stage in candidate pipeline

---

## Implementation note

Use the simplest, production-usable architecture:

* SchedulingConfig for Calendly URLs
* integration with automation templates
* candidate scheduling state
* minimal scheduling events/logs

Do not overengineer.
