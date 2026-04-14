## Task: Adjust the existing Flow system to become the core candidate intake/evaluation module

The current system already supports a strong flow architecture with reusable Flows, FlowSteps, StepOptions, Sessions, SessionAnswers, CandidateSubmissions, public flow URLs, and a builder that mixes video, question, and form steps. The goal is **not** to rebuild it, but to reposition and refine it so Flows become the main entry and evaluation system for candidates, not just “video interviews.” The existing architecture already supports question, submission, and form steps, plus public `/f/{slug}` access and candidate sessions.  

### Goal

Adjust the current Flow system so that one Flow can act as:

* a video interview
* an application form
* a qualification questionnaire
* or a mixed intake flow combining all of the above

The system should remain centered on the existing Flow / FlowStep / Session structure, but the UX, step model, and output should be aligned with the MVP hiring funnel. The current system already defines FlowStep as supporting video, questions, and forms, so the main work is to unify and clarify this behavior in the product and code.  

---

## What to change

### 1. Reposition Flows in the UI and product language

The existing product describes Flows as “video interview flows,” but the step model already supports:

* question steps
* submission steps
* form steps 

Update the admin UX and naming so Flows are presented as:

* candidate application flows
* evaluation flows
* interview/application builders

Do not restrict the concept of a Flow to video only.

#### Required UX changes

* Replace “video interview flow” wording with more generic “Flow” or “Application Flow”
* In the builder, make step creation centered around **Add Step**
* Step types should be clearly shown as:

  * Form Step
  * Question Step
  * Submission Step
  * Video Step or Video Question if needed by current UX
  * Info Step if easy to add now

If the current internal model already merges video and question in one step, keep the DB model stable and adjust the UI language first.

---

### 2. Make candidate data capture mandatory and first-class

The current system already supports form steps with built-in name, email, and phone plus custom fields. 

Adjust flow behavior so candidate identity capture becomes a standard part of the flow system.

#### Required behavior

* Every production flow must support collecting candidate identity data
* Recommended default first step or early step:

  * name
  * email
  * phone
* Support custom application questions after that
* The builder should make it easy to add these fields without treating them as an edge case

#### Required validation

* Required fields must be enforced at the step level
* Form submission must be saved into the session/submission records
* Candidate cannot complete the flow without completing required identity fields

---

### 3. Standardize the step model around intake + evaluation

The current architecture supports steps with video, question, and form content, and answer options can branch to different next steps. 

Refine the builder so step behavior is clear and predictable.

#### MVP step types

Implement or normalize around these step types:

##### Form Step

Used for:

* name
* email
* phone
* custom application fields

##### Question Step

Used for:

* yes/no
* single choice
* multiple choice
* short text if already easy to support

##### Submission Step

Used for:

* video recording
* text submission

##### Optional Info Step

Used for:

* instructions
* transition text
* welcome or next-step notice

If introducing a brand new step type is too heavy, keep the current schema and map these cleanly in the UI layer.

---

### 4. Make flow outcomes explicit

The flow currently routes candidates through a branching tree and ends on an end screen. 

For the hiring MVP, each flow needs a clearer business outcome.

#### Add explicit outcome handling

Each completed flow should resolve into one of:

* completed
* passed
* failed
* abandoned later if needed

At minimum:

* add flow-level completion status
* add pass/fail outcome support based on logic or terminal step
* expose outcome in admin submissions view

If pass/fail already exists implicitly through branching, formalize it in the final step or session state.

---

### 5. Normalize session output so later modules can use it

The system already has:

* Session
* SessionAnswer
* CandidateSubmission
* public session creation and answer APIs  

Now adjust this output so later modules can depend on it.

#### Required output after a candidate completes a flow

A completed flow must produce a stable candidate/session record containing:

* flow id
* flow slug
* session id
* candidate name/email/phone when provided
* all answers
* all submissions
* completion timestamp
* pass/fail/completed status
* source attribution placeholders for future step 2

  * ad_id nullable
  * campaign_id nullable
  * source nullable

You do not need to fully implement ad tracking in this step, but prepare the flow/session layer so attribution can be attached cleanly next.

---

### 6. Improve the public candidate flow experience

The current system already exposes the flow publicly at `/f/{slug}` and uses `/api/public/flows/:slug`, `/api/public/sessions`, `/api/public/sessions/:id/step`, `/api/public/sessions/:id/answer`, and `/api/public/sessions/:id/submit`. 

Refine the public UX so it behaves like a proper application funnel.

#### Candidate-facing expectations

* clear start screen
* consistent step progression
* clear form/question/submission transitions
* mobile-friendly data entry
* reliable progress state
* clean final completion screen

#### Important

Do not break the existing public route structure unless necessary. Reuse the current `/f/{slug}` and public session API design.

---

### 7. Keep Branding compatibility intact

The system already has a Branding module for per-flow customization including colors, typography, buttons, layout, logo position, form style, and start/end screens. 

This step must preserve branding compatibility.

#### Requirement

Any Flow adjustments must continue to work with:

* start screen branding
* form styling
* video/question layout
* end screen branding

Do not move branding into flow logic. Just ensure the refined flow builder and public experience still use the existing branding settings.

---

## Deliverables

### A. UX / Product adjustments

* Update admin terminology from “video interview” to broader “flow/application”
* Update builder UI to make step types clear
* Make identity capture easy and standard
* Make completion/pass/fail states explicit

### B. Backend / data adjustments

* Ensure session output includes enough data for later candidate pipeline and automations
* Normalize saving of form fields, answers, and submission outputs
* Add explicit status/outcome fields if missing
* Prepare nullable attribution fields for future ad/source linking

### C. Public experience adjustments

* Keep current public routes
* Improve candidate progression clarity
* Ensure required fields and completion states behave reliably

### D. Non-goals for this step

Do **not** build yet:

* source/ad link generation
* campaign management
* email automation
* gated training
* scheduling
* analytics dashboards

This step is only about making the existing Flow system a strong MVP foundation for all later modules.

---

## Acceptance criteria

Step 1 is complete when:

1. A flow can clearly function as a mixed application flow, not only a video interview
2. Admin can add form, question, and submission/video steps in a clear builder UX
3. Candidate identity can be collected reliably inside the flow
4. A candidate session ends with a clear outcome:

   * completed / passed / failed
5. All candidate responses are saved in a normalized way for future automations and analytics
6. Public flow pages still work under the existing route structure
7. Existing branding support continues to apply to flow pages

