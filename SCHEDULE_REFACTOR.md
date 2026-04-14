
## Task: Refactor Scheduling to support business-level Calendly links instead of one global scheduling config

### Goal

Refactor the current Scheduling implementation so HireFunnel works correctly as a **multi-business system**.

Right now the Scheduling step may have been designed as a single platform-level scheduling config. That is wrong for the actual product direction.

The correct model is:

* each business/workspace has its **own** scheduling configuration
* each business can use its **own Calendly link**
* candidates who complete that business’s training receive **that business’s** scheduling link
* scheduling state is tracked per candidate inside that business’s funnel

Do **not** build a shared platform Calendly account model.
Do **not** build OAuth/API integration yet.
For MVP, each business should simply paste its own scheduling URL.

---

## Product correction

HireFunnel is not scheduling interviews from one central account.

Instead, each business using HireFunnel should be able to:

1. create its own flow
2. send its own candidates through the funnel
3. configure its own interview booking link
4. send that link automatically after training completion

This means Scheduling must belong to the **business/workspace layer**, not to the platform globally.

---

## Refactor objective

Update the existing Scheduling module and related automation logic so that:

* SchedulingConfig belongs to a business/workspace
* Automations resolve scheduling links from the candidate’s business/workspace
* Candidate scheduling state remains business-specific
* Existing in-progress Step 5 work is adapted, not thrown away unnecessarily

Reuse as much of the current implementation as possible, but correct the data model and lookup behavior.

---

# 1. Refactor SchedulingConfig to be business-scoped

If the current model looks like a global config, change it.

## Correct model

```ts
SchedulingConfig {
  id: string

  businessId: string

  name: string
  provider: 'calendly'
  schedulingUrl: string

  isDefault: boolean
  isActive: boolean

  createdAt: Date
  updatedAt: Date
}
```

### Requirements

* every scheduling config belongs to exactly one business/workspace
* one business can have one or more scheduling configs
* one config can be marked default for that business
* configs from one business must not be visible/usable by another business

If your system uses `workspaceId` instead of `businessId`, use that existing term consistently.

---

# 2. Refactor admin Scheduling UI to be workspace/business-specific

If Scheduling is currently global, move it into the business/workspace context.

## Desired behavior

When a business user is managing their account, they should only see and edit **their own** scheduling links.

### Scheduling page should support:

* list scheduling configs for current business
* create scheduling config
* edit scheduling config
* delete scheduling config
* set one as default
* activate/deactivate

### Fields

* Name
* Provider (Calendly for MVP)
* Scheduling URL
* Default toggle
* Active toggle

Keep the UI simple.

---

# 3. Refactor automation resolution of `{{schedule_link}}`

This is the most important behavior change.

The current or planned logic may use a single global scheduling config. Replace that.

## Correct behavior

When an automation sends a scheduling email to a candidate:

1. determine which business/workspace the candidate belongs to
2. resolve the scheduling config for that business
3. use:

   * explicitly assigned scheduling config if rule supports it
   * otherwise the default active scheduling config for that business

### Important

`{{schedule_link}}` must resolve to the scheduling URL of the candidate’s business, not a platform-wide URL.

---

# 4. Refactor AutomationRule if needed

If your current AutomationRule references a global scheduling config, update it.

## Recommended model

```ts
AutomationRule {
  id: string

  businessId: string

  name: string
  triggerType: 'flow_completed' | 'flow_passed' | 'training_completed'
  flowId: string | null

  actionType: 'send_email'
  emailTemplateId: string

  schedulingConfigId: string | null

  isActive: boolean

  createdAt: Date
  updatedAt: Date
}
```

### Requirements

* automation rules belong to a business/workspace
* optional `schedulingConfigId` must reference a config from the same business only
* if null, fallback to default active config for that business

Do not allow cross-business references.

---

# 5. Candidate scheduling state remains per business funnel

Keep or update candidate state tracking so scheduling remains part of that candidate’s own business pipeline.

Suggested candidate states can stay like:

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

### Required behavior

* after training completion → candidate belongs to same business/workspace as before
* scheduling invite sent → update status to `invited_to_schedule`
* manual mark scheduled → update to `scheduled`

No cross-business leakage.

---

# 6. Refactor SchedulingEvent / tracking to include business context

If SchedulingEvent was added or planned, make sure it aligns with the business model.

## Suggested model

```ts
SchedulingEvent {
  id: string
  businessId: string
  candidateId: string
  schedulingConfigId: string | null

  eventType: 'invite_sent' | 'link_clicked' | 'marked_scheduled'
  eventAt: Date

  metadataJson: string | null

  createdAt: Date
}
```

### Requirements

* event belongs to candidate’s business
* event links to that business’s scheduling config if applicable

---

# 7. Keep Calendly as pasted URL for MVP

Do not build full Calendly account integration.

For MVP, each business should simply paste its own Calendly event link.

Examples:

* `https://calendly.com/business-a/interview`
* `https://calendly.com/business-b/cleaner-screen`

### Do not build now

* platform-owned central Calendly account
* OAuth
* API sync
* webhook ingestion
* availability sync

This refactor is only about making the existing scheduling layer correctly business-scoped.

---

# 8. Refactor candidate-facing flow

Correct final behavior should be:

1. candidate completes Flow for Business A
2. candidate completes Training for Business A
3. automation for Business A sends scheduling email
4. `{{schedule_link}}` resolves to Business A’s Calendly link
5. candidate books using Business A’s link

This must work independently for every business/workspace in the system.

---

# 9. Data migration / backward compatibility

Because an AI job may already be in progress, refactor carefully.

### If there is already a global SchedulingConfig table:

* add `businessId`
* migrate existing records if possible to current/default business/workspace
* update service lookups accordingly

### If automation rules already reference scheduling config:

* make sure references remain valid after adding business scope
* enforce same-business constraints

### Important

Do not leave the system in a mixed global/business state.

There must be one clear rule:

* scheduling configs are business-scoped

---

# 10. Admin UX requirements

From the user perspective, Scheduling should feel like:

> “Add your interview booking link”

Not:

> “Connect to the platform’s Calendly account”

### Business user should be able to:

* paste their own Calendly link
* choose default link
* use it in automations
* send it only to their candidates

Keep that setup extremely simple.

---

# 11. Acceptance criteria

This refactor is complete when:

1. SchedulingConfig belongs to a business/workspace
2. business users only see their own scheduling links
3. automations resolve `{{schedule_link}}` from the candidate’s business
4. optional schedulingConfig selection is restricted to the same business
5. candidate scheduling state remains tied to the same business funnel
6. scheduling invite emails use the correct business Calendly link
7. no shared global platform scheduling config remains in active logic
8. existing implementation is refactored, not duplicated
9. system remains ready for future Calendly API/webhook integration
10. no full custom calendar/scheduling engine is introduced

---

## Non-goals for this refactor

Do not build:

* Calendly OAuth
* booking sync
* webhook listener
* custom availability engine
* internal calendar UI
* reminder system
* timezone system

This refactor is only:

* move scheduling from global scope to business/workspace scope
* ensure automations and candidates use the correct business-specific Calendly link

---

## Implementation note

Prefer the smallest safe refactor:

* scope existing scheduling entities/services to business/workspace
* update automation lookup logic
* preserve current admin UI patterns where possible

Do not redesign the whole module if simple scoping fixes it.


