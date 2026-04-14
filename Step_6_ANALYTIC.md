

## Task: Build Analytics module for HireFunnel with proper multi-tenant / workspace-scoped architecture

### Goal

Build the MVP Analytics module for HireFunnel so each business/workspace can see **its own hiring funnel performance** across:

* sources
* ads
* flows
* candidate progression
* training completion
* scheduling progression

This must work correctly in the new **multi-business/workspace-scoped architecture**.

Analytics is a core MVP feature, not a later add-on. The purpose is to help each business answer:

* which source brings candidates
* which ad variation performs best
* where candidates drop off
* how many pass screening
* how many complete training
* how many reach scheduling

Do **not** build a giant BI system.
Do **not** build cross-tenant analytics.
Do **not** build overly complex dashboards.

This is a practical, tenant-safe MVP analytics layer.

---

## Product intent

Each business using HireFunnel should be able to understand its own funnel from first click to interview-ready candidate.

The Analytics module should give visibility into:

1. **Funnel performance**
2. **Source performance**
3. **Ad performance**
4. **Training progression**
5. **Scheduling progression**

All analytics must be scoped to the current workspace/business only.

No business should ever see data from another business.

---

# 1. Add top-level Analytics section

Create a top-level admin section:

## Analytics

For MVP, keep it simple with a few focused views/tabs.

Recommended MVP tabs:

* Funnel
* Sources
* Ads

Optional if easy:

* Training
* Scheduling

If separate tabs are too much, use one page with clear sections.

---

# 2. Multi-tenant / workspace scoping (critical)

This is the most important requirement.

All analytics queries, aggregations, counts, and filters must be scoped by:

* `workspaceId`
  or
* `businessId`

according to the chosen app terminology.

### Requirements

* every analytics query must filter by current workspace/business
* backend must enforce tenant scoping
* frontend filtering alone is not enough
* no cross-tenant aggregation should be visible in business-facing analytics

If platform-level analytics are desired later, that is a different feature and not part of this step.

---

# 3. Define MVP funnel stages

Build analytics around the actual HireFunnel candidate lifecycle.

Recommended funnel stages:

* Ad entry / flow started
* Flow completed
* Flow passed
* Training started
* Training completed
* Scheduling invited
* Scheduled

Use the fields and state transitions already implemented in:

* sessions/submissions
* candidate status
* training progress
* scheduling events

Do not invent a second parallel state system if one already exists.

### Requirements

Create a clear mapping from existing records/statuses into funnel metrics.

For example:

* Flow started = session created
* Flow completed = session status completed
* Flow passed = session/candidate outcome passed
* Training started = candidate training status in_progress
* Training completed = candidate training status completed
* Scheduling invited = scheduling invite event or candidate status
* Scheduled = candidate manually marked scheduled for MVP

---

# 4. Funnel analytics view

Build a Funnel analytics view that shows stage progression for the current business.

## Metrics to display

At minimum, show counts for:

* Started
* Completed
* Passed
* Training Started
* Training Completed
* Invited to Schedule
* Scheduled

Optional if easy:

* conversion percentages between stages

### Example display

A simple horizontal or vertical funnel is enough.
No need for advanced charting if that slows development.

### Requirements

* counts must be based on tenant-scoped data only
* date filtering is optional but recommended if already easy
* avoid double-counting candidates if possible; define whether stage counts are session-based or candidate-based and apply consistently

---

# 5. Source analytics view

Build a Source analytics section that groups performance by source.

Sources come from the Ads layer, for example:

* Indeed
* Facebook
* Craigslist
* Other

## Metrics per source

At minimum:

* total started
* completed
* passed
* training completed
* invited to schedule
* scheduled

Optional:

* conversion percentages

### Requirements

* source analytics should be computed from candidate/session attribution data
* if candidates entered directly without an Ad, you may include:

  * source = direct
    or
  * source = unknown
* source data must be tenant-scoped

---

# 6. Ad analytics view

Build an Ads analytics section that compares performance by Ad.

Each Ad already represents:

* source
* variation
* tracked link
* assigned Flow

## Metrics per Ad

At minimum:

* started
* completed
* passed
* training completed
* invited to schedule
* scheduled

Optional:

* completion rate
* pass rate

### Requirements

* only show Ads belonging to the current workspace/business
* metrics must roll up candidate/session/training/scheduling data tied to that Ad
* handle ads with zero activity gracefully

---

# 7. Training analytics section

Add a lightweight Training analytics view or subsection.

## Metrics

At minimum:

* training invited count optional if available
* training started
* training completed

Optional:

* completion rate

### Requirements

* derive from candidate training records
* scoped to current workspace/business
* if there are multiple trainings per business later, support grouping by training if easy; otherwise aggregate overall for MVP

---

# 8. Scheduling analytics section

Add a lightweight Scheduling analytics view or subsection.

## Metrics

At minimum:

* invited to schedule
* scheduled

Optional if click tracking exists:

* scheduling link clicked

### Requirements

* derive from candidate status and/or scheduling events
* scoped to current workspace/business
* use manual scheduled status for MVP if no Calendly sync exists yet

---

# 9. Data source strategy

Do not create a separate analytics database for MVP.

Instead, build analytics from the operational data already in the system:

* Ads
* Flows
* Sessions / CandidateSubmissions
* Candidates
* CandidateTraining
* SchedulingEvent
* Candidate status

### Requirements

* use efficient aggregation queries where possible
* if some counts are too expensive live, you may add lightweight cached summaries later
* but do not overengineer analytics pipelines now

---

# 10. Date filtering (recommended MVP feature)

If feasible without major complexity, add simple date filtering to Analytics.

Recommended presets:

* Last 7 days
* Last 30 days
* All time

### Requirements

* filters apply only within current business/workspace data
* if date filtering adds too much complexity, ship All time first and structure code so filters can be added next

---

# 11. Admin UI requirements

Build the UI for clarity, not complexity.

## Recommended structure

### Analytics page

Tabs or sections:

* Funnel
* Sources
* Ads
* Optional: Training / Scheduling

### Funnel section

* counts per stage
* maybe simple percentages

### Sources table

Columns:

* Source
* Started
* Completed
* Passed
* Training Completed
* Scheduled

### Ads table

Columns:

* Ad Name
* Source
* Started
* Completed
* Passed
* Training Completed
* Scheduled

Keep tables readable and sortable if easy.

Do not build complicated graphs if that delays MVP.

---

# 12. Definitions must be explicit and consistent

This is important for trust in analytics.

Choose and document whether metrics are:

* candidate-based
  or
* session-based

Recommended MVP approach:

* use **candidate-based** metrics for later funnel stages
* use session-based only if your current data model makes that much easier

Whatever you choose, apply it consistently across all analytics views.

Examples:

* Started = number of candidate sessions started
* Passed = number of candidates/sessions marked passed
* Training Completed = number of candidate training enrollments completed

Document this in code/comments or internal notes.

---

# 13. Tenant-safe backend queries

This is a hard requirement.

All analytics endpoints/services must enforce workspace/business scope at the backend layer.

Recommended structure:

* `AnalyticsService`
* methods like:

  * `getFunnelMetrics(workspaceId, filters)`
  * `getSourceMetrics(workspaceId, filters)`
  * `getAdMetrics(workspaceId, filters)`

Do not expose raw global counts to the frontend and then filter there.

---

# 14. Prepare for future platform analytics, but do not build it

Structure the code so platform-wide analytics could be added later for internal admin use.

But for now:

* business-facing analytics only
* tenant isolation first

Do not create mixed endpoints that can accidentally return global data.

---

# 15. Acceptance criteria

This step is complete when:

1. there is a top-level Analytics section
2. analytics is fully scoped to current workspace/business
3. Funnel view shows stage counts for the business
4. Source view groups results by source
5. Ad view groups results by ad
6. Training progression is reflected in analytics
7. Scheduling progression is reflected in analytics
8. no cross-tenant data is exposed
9. metrics are based on real operational records, not hardcoded/demo data
10. definitions are consistent across views

---

## Non-goals for this step

Do not build:

* cross-tenant platform analytics
* advanced BI dashboards
* forecasting
* custom report builder
* export engine
* cohort analysis
* advanced visualizations
* attribution modeling beyond current Ad/source data
* revenue analytics

This step is only:

* core tenant-safe funnel analytics for the MVP

---

## Implementation note

Use the existing business-scoped operational data and build the smallest useful analytics layer first.

Prioritize:

1. correct tenant isolation
2. accurate counts
3. clear UI
4. simple maintainable queries

Do not overengineer charts or pipelines before the numbers themselves are trustworthy.

