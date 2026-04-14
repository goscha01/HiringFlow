

## Task: Build email automations using Twilio SendGrid for next-step emails after candidate flow completion

### Goal

Add a lightweight automation system that automatically sends emails through **Twilio SendGrid** when a candidate completes or passes a Flow.

This is MVP automation, not a full workflow engine.

The main purpose is to connect the existing Flow system to the next stages by automatically sending:

* training invitation emails
* scheduling emails later
* other next-step emails in future

Do not overbuild this into a visual automation builder.

---

## Product intent

When a candidate finishes the application/interview Flow, the system should automatically send the next-step email without manual follow-up.

Initial MVP use case:

* candidate completes or passes Flow
* system sends email through SendGrid
* email includes link to the next step

Examples:

* send Training link
* send Scheduling link later

This must work with:

* existing Flow/session/candidate data
* existing or upcoming Ads/source attribution
* a reusable template system

---

# 1. Build Automations module

Add a top-level admin section:

## Automations

This is where the user defines what happens after candidate events.

For MVP:

* use a simple rule-based CRUD interface
* no visual automation canvas
* no multi-step workflow builder

---

# 2. Supported MVP triggers

Implement these triggers:

* **Flow Completed**
* **Flow Passed**

Optional placeholder if easy:

* Training Completed

But Step 3 must fully support:

* Flow Completed
* Flow Passed

These triggers should fire when the candidate/session outcome is updated.

---

# 3. Supported MVP action

Implement one action type:

* **Send Email via Twilio SendGrid**

Do not build SMS yet.
Do not build multi-action chains yet.

---

# 4. Automation rule model

Create an automation rule entity like:

```ts
AutomationRule {
  id: string
  name: string

  triggerType: 'flow_completed' | 'flow_passed'
  flowId: string | null

  actionType: 'send_email'
  emailTemplateId: string

  nextStepType: 'training' | 'scheduling' | null
  nextStepUrl: string | null

  isActive: boolean

  createdAt: Date
  updatedAt: Date
}
```

### Notes

* `flowId` can be scoped to one Flow for MVP
* keep rule matching simple
* later this can be expanded with source/ad filters or delays

Do not build advanced conditions yet.

---

# 5. Build Email Templates support

Create or extend a **Content / Email Templates** section.

## EmailTemplate model

```ts
EmailTemplate {
  id: string
  name: string
  subject: string
  bodyHtml: string
  bodyText: string | null
  isActive: boolean

  createdAt: Date
  updatedAt: Date
}
```

For MVP:

* support rich HTML body
* optional plain text fallback
* keep template editor simple

---

# 6. Support template variables

Email templates must support variable replacement.

Required MVP variables:

* `{{candidate_name}}`
* `{{flow_name}}`
* `{{training_link}}`
* `{{schedule_link}}`

Optional if easy:

* `{{source}}`
* `{{ad_name}}`

Variables should be rendered from:

* candidate/session data
* automation rule next-step config
* ad/source attribution if available

If variable value is missing:

* render empty string or fallback safely
* do not crash the send

---

# 7. Twilio SendGrid integration

Use **Twilio SendGrid** as the email provider.

Implement a dedicated email service layer, for example:

* `SendGridEmailService`
* `TemplateRenderer`
* `AutomationService`

Do not send emails directly from Flow controllers.

### Configuration

Read SendGrid config from environment variables, for example:

* `SENDGRID_API_KEY`
* `SENDGRID_FROM_EMAIL`
* `SENDGRID_FROM_NAME` optional

### Requirements

* initialize SendGrid SDK in service layer
* send email using rendered subject/body
* support HTML email
* optional plain-text part if available

### Error handling

* catch SendGrid API errors
* log failed sends
* do not break candidate flow completion if email fails

---

# 8. Trigger execution logic

When a candidate/session status changes to:

* completed
* passed

the system should:

1. find active automation rules matching:

   * trigger type
   * flowId
2. load candidate/session/flow data
3. render template variables
4. send email through SendGrid
5. log execution result

Important:

* prevent duplicate sends for the same candidate/session + automation rule
* if the same trigger fires twice, do not re-send unless explicitly supported later

---

# 9. Add automation execution log

Create a log table like:

```ts
AutomationExecution {
  id: string
  automationRuleId: string
  candidateId: string | null
  sessionId: string | null

  status: 'pending' | 'sent' | 'failed' | 'skipped'
  errorMessage: string | null

  provider: 'sendgrid'
  providerMessageId: string | null

  sentAt: Date | null
  createdAt: Date
}
```

Purpose:

* deduplicate sends
* track delivery attempts
* debug failures

For MVP, basic execution logging is enough.

---

# 10. Admin UI for Automations

Build a simple list + create/edit form.

## Automation list

Show:

* Name
* Trigger
* Flow
* Action
* Email template
* Next-step type
* Status

Actions:

* Create
* Edit
* Activate/deactivate
* Delete

## Create/Edit form

Fields:

* Name
* Trigger type
* Flow selector
* Email template selector
* Next-step type
* Next-step URL
* Active toggle

Keep it simple and production-focused.

---

# 11. Admin UI for Email Templates

Build a simple Email Templates page.

## Template list

Show:

* Name
* Subject
* Updated date
* Status

## Template form

Fields:

* Name
* Subject
* HTML Body
* Plain Text Body optional

Also show available variables:

* `{{candidate_name}}`
* `{{flow_name}}`
* `{{training_link}}`
* `{{schedule_link}}`

Optional:

* preview with mock data

---

# 12. Candidate data requirements

Before sending email, verify:

* candidate email exists
* trigger condition matches current session/candidate state

If no email is present:

* do not send
* create execution log with skipped or failed state

---

# 13. Initial MVP use cases

These must work:

## Use case 1

* candidate passes Flow
* automation triggers
* SendGrid sends email
* email contains training link

## Use case 2

* candidate completes Flow
* automation triggers
* SendGrid sends generic next-step email

Optional later:

* training completed → send scheduling link

Do not block Step 3 on that if training status logic is not finalized yet.

---

# 14. Architecture rules

Do not:

* hardcode email logic in public flow endpoints
* break existing Flow completion behavior
* tightly couple templates to Flow builder

Do:

* centralize sending in SendGrid email service
* centralize trigger handling in automation service
* keep automations independent from flow-building UI

Flow handles candidate intake.
Automations handle what happens next.

---

## Acceptance criteria

Step 3 is complete when:

1. admin can create an automation rule
2. rule can target a specific Flow
3. rule can trigger on:

   * Flow Completed
   * Flow Passed
4. rule can send email via Twilio SendGrid
5. reusable templates can be created and selected
6. templates support variables
7. email can include next-step link
8. duplicate sends are prevented
9. execution result is logged
10. email failures do not break flow completion

---

## Non-goals for this step

Do not build yet:

* SMS
* visual automation builder
* delays/waits
* source/ad conditional logic
* multi-step chains
* training access gating
* scheduler integration
* advanced delivery analytics

This step is only:

* trigger on flow outcome
* send email through SendGrid
* include next-step link
* log execution safely


