

## Task: Refactor existing HireFunnel MVP modules to support multi-business / workspace-scoped architecture

### Goal

Refactor the existing and in-progress HireFunnel MVP implementation so it works correctly as a **multi-business SaaS**, not a single-business system.

Earlier implementation steps may have been designed implicitly as if the platform served only one business. That is incorrect for the actual product.

The correct architecture is:

* each business/workspace has its **own**

  * flows
  * ads / source links
  * candidates
  * automations
  * training
  * scheduling links
  * branding
  * content/templates
  * analytics scope

No business should ever see, modify, or accidentally use another business’s data.

This task is a **cross-cutting refactor**.
It is not about adding new product features.
It is about correcting ownership, scoping, lookup logic, and data boundaries across the modules already designed and/or being built.

---

## Product correction

HireFunnel is a platform used by multiple businesses.

Each business should be able to:

1. create its own hiring flows
2. create its own source/ad links
3. receive its own candidates
4. send its own automations
5. gate its own training
6. send its own scheduling links
7. apply its own branding
8. see only its own analytics

That means almost every business-owned object must belong to a **business/workspace**.

Use the existing system term consistently:

* if the app already uses `workspaceId`, use `workspaceId`
* if it uses `businessId`, use `businessId`

Do not introduce both.

---

# 1. Apply business/workspace ownership to all business-owned entities

Refactor the following entities to be scoped to a business/workspace:

* Flow
* Ad
* Candidate
* Session / CandidateSubmission / session-like intake records
* AutomationRule
* EmailTemplate / Content records
* Training
* TrainingAccessToken
* CandidateTraining / training enrollment/progress
* SchedulingConfig
* Branding / BrandKit config
* analytics queries/models where applicable

### General rule

Every business-owned entity must have:

```ts
workspaceId: string
```

or

```ts
businessId: string
```

according to the app’s chosen terminology.

### Requirements

* every record must belong to exactly one workspace/business unless it is intentionally platform-global
* all reads/writes must be filtered by the current workspace/business
* no cross-business references should be allowed

---

# 2. Refactor Step 1 module: Flows

Flows must no longer behave as platform-global resources.

## Correct model

A Flow belongs to one workspace/business.

That means:

* flow builder only shows flows for current business
* public flow access resolves to the correct flow and business
* candidate sessions created from a flow belong to that same business
* branding applied to a flow should come from that same business or flow-specific config within that business

### Requirements

* add workspace/business ownership to Flow
* ensure any public flow slug lookup resolves within the correct business context
* if slugs are globally unique today, that is acceptable for MVP, but ownership must still be preserved
* all session/submission records created from a Flow must inherit the same workspace/business

Do not duplicate flows across businesses during migration unless necessary.

---

# 3. Refactor Step 2 module: Ads / source tracking

Ads must belong to the business/workspace that owns the hiring funnel.

## Correct model

* one business can create many Ads
* each Ad points to one Flow owned by the same business
* candidates entering through an Ad must inherit that business context

### Requirements

* add workspace/business ownership to Ad
* enforce that `Ad.flowId` references a Flow from the same business only
* public ad links must resolve to an Ad and then to a Flow within the same business
* sessions created from `/a/:slug` or equivalent must store:

  * workspace/business ownership
  * ad attribution
  * flow ownership consistently

### Important

Do not allow an Ad from Business A to point to a Flow from Business B.

---

# 4. Refactor Step 3 module: Automations + email templates

Automations must be business-scoped.

## Correct model

Each business has its own:

* automation rules
* email templates/content
* follow-up behavior

### Requirements

* add workspace/business ownership to `AutomationRule`
* add workspace/business ownership to `EmailTemplate` / Content entities
* automation rule must only reference:

  * Flow from same business
  * EmailTemplate from same business
  * SchedulingConfig from same business if applicable
* automation execution must resolve candidate/session/business correctly before sending

### Email sending behavior

For MVP, the platform can still send from the platform’s SendGrid domain setup, but:

* templates
* automation rules
* candidate selection
  must all remain business-scoped

Optional:

* support business display name / reply-to per workspace if already planned
* but do not block refactor on this

---

# 5. Refactor Step 4 module: Training + access tokens

Training must be business/workspace scoped.

## Correct model

Each business has its own training content or onboarding path, and invited candidates should only access the training of the business they are applying to.

### Requirements

* add workspace/business ownership to Training
* add workspace/business ownership to `TrainingAccessToken`
* add workspace/business ownership to `CandidateTraining`
* ensure training access token belongs to:

  * one candidate
  * one training
  * one business/workspace

### Access validation

When candidate opens:

```text
/training/:slug?token=...
```

the system must validate that:

* token is valid
* token belongs to the correct training
* token belongs to candidate
* token belongs to same business/workspace

Do not allow cross-business token resolution.

---

# 6. Refactor Step 5 module: Scheduling

Scheduling has already been identified as needing business scope. Make sure the refactor is consistent with the rest.

### Requirements

* `SchedulingConfig` belongs to workspace/business
* business users only see/edit their own scheduling links
* automation resolves `{{schedule_link}}` from candidate’s business/workspace
* no platform-global scheduling config should remain active in business logic

If a previous AI job created global scheduling config logic, refactor it rather than duplicate it.

---

# 7. Refactor Branding / Brand Kit

Branding must also be business-scoped.

## Correct model

Each business should control:

* logo
* colors
* fonts if supported
* candidate-facing page appearance

### Requirements

* add workspace/business ownership to Branding config if not already present
* flows/training/public candidate pages must resolve branding from the correct business
* no shared global branding should leak into another business’s funnel unless explicitly intended as a fallback

---

# 8. Refactor Candidates / sessions / submissions

Candidates and their pipeline data must be business-scoped.

## Correct model

A candidate record belongs to the business they applied to.

### Requirements

* add workspace/business ownership to Candidate if missing
* add workspace/business ownership to session/submission records if missing
* candidate statuses and pipeline state are scoped to that business only
* same real-world person may theoretically exist in multiple businesses; do not assume one global candidate identity for MVP

### Candidate flow inheritance

Candidate/session should inherit business context from:

* Flow
  or
* Ad entry point

This should happen automatically at creation time.

---

# 9. Refactor all admin queries and UI filters

This is critical.

Even if DB models are scoped correctly, the app will still leak data if queries are not filtered.

### Requirements

Every admin UI listing/query/mutation for business-owned data must filter by current workspace/business.

This includes:

* Flows list
* Ads list
* Candidates list
* Automations list
* Email templates/content list
* Training list
* Scheduling list
* Branding settings
* analytics queries later

### Important

Do not rely only on frontend filtering.
Apply backend-level scoping too.

---

# 10. Enforce same-business reference constraints

Add service-level and/or DB-level validation so business-owned entities cannot cross-reference other businesses’ objects.

Examples that must be blocked:

* AutomationRule from Business A using EmailTemplate from Business B
* Ad from Business A pointing to Flow from Business B
* TrainingAccessToken using candidate from Business A and training from Business B
* SchedulingConfig from Business B used in Business A automation

This is a key data integrity rule.

---

# 11. Migrate existing in-progress data safely

Because some implementation work may already be underway, refactor with migration in mind.

### Migration strategy

* if records already exist without workspace/business ownership:

  * assign them to current/default business/workspace where possible
* update foreign keys/references to remain valid
* avoid destructive resets unless unavoidable

### Important

Do not leave the system in a mixed state where:

* some modules are global
* some modules are workspace-scoped

The end state should be consistent.

---

# 12. Define what remains platform-global

Not everything must be business-owned.

These can remain platform-level if already implemented that way:

* enum-like source types (`indeed`, `facebook`, `craigslist`)
* provider metadata/constants
* system-level roles/permissions framework
* default starter templates/examples if intentionally shared

But anything that a customer edits/owns/uses operationally should be workspace/business scoped.

---

# 13. Public route behavior

Public candidate-facing routes must still work, but the data they resolve must map to the correct business.

Examples:

* flow public route
* ad entry route
* training invitation route

### Requirements

Public route resolution must preserve workspace/business ownership internally, even if the route itself does not visibly include workspace in the URL.

If slug uniqueness is global, that is acceptable for MVP.
But once resolved, all downstream entities/actions must stay within the correct business.

---

# 14. Update service architecture, not just models

Do not limit this refactor to adding `workspaceId` columns.

Refactor service-layer resolution logic so:

* current workspace/business is always part of admin queries
* public resolution propagates workspace/business context correctly
* automation execution uses candidate/workspace ownership
* email template resolution is workspace-aware
* scheduling/training/branding resolution is workspace-aware

---

# 15. Acceptance criteria

This refactor is complete when:

1. all business-owned entities are scoped by `workspaceId` / `businessId`
2. Flows are business-scoped
3. Ads are business-scoped
4. Candidates and sessions/submissions are business-scoped
5. Automations and email templates are business-scoped
6. Training and training access are business-scoped
7. Scheduling configs are business-scoped
8. Branding is business-scoped
9. all admin queries filter by current business/workspace
10. no cross-business references are allowed
11. public flows/ad/training routes preserve correct business ownership internally
12. existing in-progress implementation is refactored consistently rather than partially patched

---

## Non-goals for this refactor

Do not build now:

* full multi-tenant billing
* custom sender domains per business
* Calendly OAuth/API integration
* advanced role/permission matrix
* cross-business shared template marketplace
* complex global identity matching for candidates across businesses

This task is only:

* correct entity ownership
* correct lookup/scoping rules
* correct data isolation across all MVP modules

---

## Implementation note

Prefer the smallest safe refactor that makes the architecture consistently workspace/business scoped.

Do not redesign the whole product.
Refactor ownership and query logic so all previously designed MVP steps become valid in a multi-business SaaS model.

