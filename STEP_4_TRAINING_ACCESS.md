
## Task: Add gated Training access for candidates invited through automations

### Goal

Connect the existing Training module to the hiring funnel so that **only candidates who were invited through the system** can access onboarding/training.

Training already exists or is close to finished. This step is **not** about rebuilding training content. It is about adding the access-control layer that turns Training into a controlled next step after candidate screening.

The desired behavior is:

* candidate completes or passes a Flow
* automation sends an email with a Training link
* only that invited candidate can open Training
* training progress and completion are tracked
* completion can later trigger Scheduling

Do **not** require full account creation or login for MVP.

---

## Product intent

Training should not be a public page anyone can open.

It should behave like a gated stage in the hiring funnel:

* only qualified candidates move into it
* every training session is tied to a real candidate
* progress and completion feed the pipeline and later automations

For MVP, the best experience is:

* candidate clicks email
* candidate enters training directly
* no password needed
* access is granted by secure invitation token

---

## What to build

# 1. Add invitation-based Training access

Build a token-based access system for training.

Instead of using a generic public training link, the system should generate a **candidate-specific invitation link**.

Example:

```text
/training/:trainingSlug?token=abc123
```

The token should identify:

* candidate
* training
* invitation/access rights

For MVP, token-based access is enough. No login required.

---

# 2. Create Training access token model

Add a new entity for invitation/access tokens.

Suggested model:

```ts
TrainingAccessToken {
  id: string
  token: string

  candidateId: string
  trainingId: string

  sourceType: 'automation'
  sourceRefId: string | null

  status: 'active' | 'used' | 'expired' | 'revoked'

  expiresAt: Date | null
  usedAt: Date | null

  createdAt: Date
  updatedAt: Date
}
```

### Notes

* `token` must be unique and securely generated
* `candidateId` links access to one candidate
* `trainingId` links access to one training
* `sourceRefId` can store automation rule id or execution id if useful
* `expiresAt` can be optional for MVP, but support it in the model if easy

---

# 3. Generate Training access token when sending invitation email

This step must integrate with Step 3 automations.

When an automation sends a Training invitation email:

1. create a `TrainingAccessToken`
2. generate training link with token
3. inject that link into the email template variable

The template variable `{{training_link}}` should resolve to a candidate-specific gated link, not a public generic training page.

Important:

* create one valid token per candidate invitation
* avoid generating duplicate active tokens unnecessarily for the same candidate/training unless intended

---

# 4. Protect Training pages with token validation

Update public training access behavior.

When a user opens:

```text
/training/:trainingSlug?token=abc123
```

the backend must:

1. resolve training by slug
2. validate token
3. ensure token:

   * exists
   * is active
   * belongs to this training
   * belongs to a valid candidate
   * is not expired/revoked
4. grant access only if valid

If invalid:

* show a clear “Access unavailable or expired” page
* do not expose training content

Do not allow public anonymous access to gated onboarding training once this step is implemented.

---

# 5. Create candidate-training enrollment/progress link

Training must be connected to the candidate record.

If a candidate-training enrollment model already exists, extend it.
If not, create one.

Suggested model:

```ts
CandidateTraining {
  id: string
  candidateId: string
  trainingId: string

  status: 'not_started' | 'in_progress' | 'completed'
  startedAt: Date | null
  completedAt: Date | null

  accessTokenId: string | null

  createdAt: Date
  updatedAt: Date
}
```

### Requirements

* when candidate first enters training with valid token:

  * create enrollment if missing
  * set status to `in_progress`
  * set `startedAt`
* when training is completed:

  * set status to `completed`
  * set `completedAt`

This record will be used later for:

* candidate profile
* analytics
* automation triggers
* scheduling eligibility

---

# 6. Mark Training completion in a structured way

At the moment training is completed, the system must update candidate training state in a reliable, queryable way.

This should not just be inferred from front-end progress.

There must be a clear backend completion event/state that later can trigger:

* send scheduling link
* move candidate status
* update analytics funnel

If there is already a training completion concept, reuse it.
If not, add one explicitly.

---

# 7. Prepare training completion trigger for next step

You do not need to build Scheduling in this step, but you must prepare the system so it can react to:

* `training_completed`

This can be done by:

* event emission
* status update hook
* automation trigger readiness

At minimum, make sure later automations can detect that candidate training status changed to completed.

---

# 8. Admin visibility

Add enough admin visibility so the system is usable operationally.

At minimum:

* candidate profile should show training status
* training/admin view should show candidate access/enrollment status
* token errors or invalid attempts should be debuggable if possible

You do not need a full token management UI yet, but the data must be inspectable in admin or logs.

---

# 9. UX requirements for candidate experience

The candidate experience should be smooth:

* candidate gets email
* clicks training link
* enters training directly
* no signup or password required
* training opens in branded/public-friendly view
* progress is saved
* completion is acknowledged clearly

If access fails:

* show friendly error
* avoid generic server error pages

---

# 10. Security rules

For MVP, keep it practical but safe.

Required:

* use securely generated random tokens
* validate token server-side
* tie token to both candidate and training
* do not expose training content without valid token
* allow safe repeated access if candidate returns later, unless you intentionally enforce single-use

Optional:

* expiration support
* revoke/disable support

Do not overcomplicate with full auth yet.

---

# 11. Keep branding compatibility

Training already or eventually uses branding/custom presentation similar to flows.

This step must preserve:

* training branding
* candidate-facing presentation
* public-friendly access experience

Do not mix access control logic into branding logic.

---

# 12. Backward compatibility / migration note

If training currently has public access, this step will likely change behavior for onboarding training used in the hiring funnel.

If there are other use cases for public training in the future:

* support a flag like `accessMode = public | invitation_only`

For MVP hiring onboarding, use:

* `invitation_only`

If the system already supports multiple training types, preserve flexibility.

---

## Suggested implementation pieces

### Backend services

* `TrainingAccessService`
* `TrainingTokenService`
* reuse existing `TrainingService` if possible

### Public endpoint examples

* validate token on training page load
* create/update `CandidateTraining` progress
* mark completion explicitly

### Template integration

* `{{training_link}}` should resolve from access token + training slug

---

## Acceptance criteria

Step 4 is complete when:

1. training invitation email contains a candidate-specific gated link
2. a secure token is generated and stored for invited candidates
3. training cannot be opened without valid token
4. valid token opens the correct training for the correct candidate
5. candidate training enrollment/progress is stored
6. training start and completion are recorded
7. candidate profile can show training status
8. the system is ready to trigger next automation after training completion
9. no login is required for invited candidates
10. public anonymous access to invitation-only onboarding is blocked

---

## Non-goals for this step

Do not build yet:

* full user accounts/login system
* scheduling module
* advanced token management UI
* multi-tenant custom email sender domains
* advanced analytics dashboards
* complex permissions/roles for candidates

This step is only:

* invitation token generation
* gated training access
* candidate-linked training progress
* completion state for next-step automation

---

## Implementation note

Use the simplest secure invitation model that fits the existing system:

* tokenized access
* candidate-linked progress
* explicit completion state

Do not rebuild Training.
Wrap the existing Training module in the hiring-funnel access model.

