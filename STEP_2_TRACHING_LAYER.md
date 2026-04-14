

## Task: Add Ads / Source Tracking Layer on Top of Existing Flows

### Goal

Build the MVP layer that lets one reusable Flow be entered from multiple tracked public links, so we can identify:

* source
* ad variation
* campaign/grouping
* candidate origin for analytics and automation later

Do **not** rebuild Flows.
Do **not** duplicate Flows per source.
This step is about adding a tracked entry-point layer on top of the existing public Flow system.

The current system already has public Flow access and session creation. This new layer should sit above that.

---

## Product intent

The user should be able to:

1. create one Flow
2. create multiple Ads pointing to that Flow
3. get a unique public link for each Ad
4. send/post different links to Indeed, Facebook groups, Craigslist, etc.
5. have every candidate session automatically store attribution

From the user perspective, this is not a “links manager.”
This is an **Ads / Sources** layer for hiring traffic.

---

## What to build

# 1. Add a new top-level concept: Ad

For MVP, one **Ad** should represent all of this in one object:

* source
* variation
* public tracked link
* assigned Flow
* optional grouping label/campaign

Do not create separate user-facing menus for:

* Links
* Sources
* Variants

Those can remain separate internally later if needed, but for MVP the user should manage a single object: **Ad**.

---

# 2. New menu / section structure

Add a new section:

## Ads

This is where the user creates tracked entry points into Flows.

For MVP, keep it simple.

Each Ad should include:

* Ad Name
* Source
* optional Campaign / Group label
* assigned Flow
* public tracked URL
* status: active / paused

Optional later:

* ad text
* notes
* tags

For now the core purpose is tracking + link generation.

---

# 3. DB model

Create a new entity for Ads.

Suggested MVP fields:

```ts
Ad {
  id: string
  name: string
  source: 'indeed' | 'facebook' | 'craigslist' | 'other'
  campaign: string | null
  flowId: string
  slug: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
```

Optional later:

* ad text
* locale
* market/location
* recruiter/workspace

Important:

* `slug` must be unique
* one Flow can have many Ads
* one Ad points to exactly one Flow

---

# 4. Public tracked route

Add a new public route:

```text
/a/:slug
```

This route should be the tracked ad entry point.

Behavior:

1. resolve Ad by slug
2. get its assigned Flow
3. create or initialize candidate session with attribution
4. render the same public flow experience
   or redirect into the existing public flow route/session flow

Do not duplicate the public flow renderer.

Reuse the existing public Flow experience.

---

# 5. Session attribution

Extend session creation so a session can carry source attribution.

When a candidate enters through an Ad link, store on session:

* adId
* source
* campaign
* flowId

If the current session model is the right place, store it there.
If attribution belongs better on CandidateSubmission or a related tracking table, that is acceptable too.

But for MVP, attribution must be easy to query for:

* analytics
* candidate profile
* automations later

Minimum required attribution fields on the final candidate/session record:

* `adId`
* `source`
* `campaign` nullable
* `flowId`

If a candidate enters the direct flow link without an Ad:

* attribution can remain null
* source can be “direct” later if useful

---

# 6. Admin UI for Ads

Build a clean MVP CRUD interface for Ads.

## Ads list page

Show:

* Name
* Source
* Flow
* Campaign/group label
* Public URL
* Status
* Created date

Actions:

* Create
* Edit
* Copy link
* Pause/activate
* Delete

## Create/Edit form

Fields:

* Name
* Source
* Campaign / Group label (optional)
* Flow selector
* Status

Auto-generate slug from name, but allow regeneration or manual edit if needed.

Show the final generated public link.

---

# 7. Candidate/session connection

When a candidate starts a Flow through an Ad link:

* the system must create the same session as normal
* but with attribution attached automatically

This attribution should then be visible later in:

* candidate record
* analytics
* automation context

For MVP, even if candidate UI is not fully polished yet, the data must be saved correctly now.

---

# 8. Keep Flows reusable

Important architectural rule:

* Flow = reusable application/evaluation logic
* Ad = tracked public entry point into a Flow

Do not add source logic into the Flow builder.
Do not make the Flow aware of specific ads.
Do not create copies of Flow per source.

The relation must be:

```text
Flow 1 -> many Ads
Ad -> one Flow
```

---

# 9. Backward compatibility

Do not break the current direct public flow access.

Existing public flow access should still work.

The system should support both:

* direct flow link
* tracked ad link

So:

* existing flows remain usable
* new ads layer is additive

---

# 10. Prepare for Step 3 (Automations)

Even though automations are not being built in this step, make sure the saved attribution data can later be used in automation conditions and variables.

Future examples:

* send different email depending on source
* show source in candidate timeline
* compare ad performance

No automation UI required yet. Just store attribution properly.

---

## UX rules

Keep the user-facing mental model simple:

* user creates a Flow
* user creates Ads pointing to that Flow
* each Ad gives a unique tracked link
* candidates who use the link are attributed automatically

Do not expose separate technical concepts like:

* entry link objects
* attribution layer
* tracking IDs

All of that stays behind the scenes.

---

## Acceptance criteria

Step 2 is complete when:

1. user can create an Ad in the admin UI
2. each Ad is assigned to exactly one Flow
3. each Ad generates a unique public URL
4. opening that public URL starts the assigned Flow
5. candidate session/submission stores ad attribution automatically
6. one Flow can be reused by many Ads
7. existing direct public Flow links still work
8. Ads can be listed, edited, paused, copied, and deleted

---

## Non-goals for this step

Do not build yet:

* full campaign analytics dashboard
* ad text template library
* source-specific automations
* scheduling
* training gating
* advanced grouping/reporting
* A/B optimization UI

This step is only:

* tracked Ads
* public links
* attribution storage
* clean admin management

---

## Implementation note

Use the simplest architecture that reuses the current public Flow runtime.
Prefer adding a tracked entry route and attribution-aware session creation over introducing a second flow engine.

-