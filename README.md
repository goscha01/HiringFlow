# HiringFlow
upload video → create a flow → conditional routing by single-choice answers
Here’s a **ready-to-paste task** for an AI code agent to build a minimal **VideoAsk clone** with only: **upload video → create a flow → conditional routing by single-choice answers**.

---

## Task: Build “VideoFlow” (Minimal VideoAsk Clone)

### Goal (MVP)

Build a web app where an admin can:

1. Upload short videos
2. Create a “flow” (a sequence of video steps)
3. For each step, define a **single-choice question** with options
4. Each option routes to the **next step** (conditional branching)
5. A candidate can open a share link, watch videos, answer, and be routed accordingly
6. Store each candidate’s answers + timestamps

This is **not** a full VideoAsk clone. No payments. No team roles. No transcripts. No analytics beyond basic session log.

---

# Product Requirements

## Roles

### Admin

* Login (simple email+password, single admin is fine for MVP)
* Upload/manage videos
* Build flows:

  * Create steps
  * Assign a video to a step
  * Configure question + single-choice answers
  * Set routing: each answer → next step (or “End”)
* Share a public link to the flow
* View submissions (sessions) and answers

### Candidate (Public)

* Opens flow link
* Enters name + email (or skip email if faster; but save at least a session id)
* Watches video step
* Answers single-choice question
* Is routed to next step based on answer
* At the end, sees “Done” page

---

# Core Objects / Data Model (DB)

Use Postgres.

### tables

**users**

* id (uuid)
* email (unique)
* password_hash
* created_at

**videos**

* id (uuid)
* owner_user_id (fk users)
* filename
* storage_key (s3 key or local path)
* mime_type
* size_bytes
* duration_seconds (optional)
* created_at

**flows**

* id (uuid)
* owner_user_id (fk users)
* name
* slug (unique, used in share URL)
* is_published (bool)
* created_at

**flow_steps**

* id (uuid)
* flow_id (fk flows)
* title
* video_id (fk videos)
* question_text
* step_order (int, optional; branching is graph-based anyway)
* created_at

**step_options**

* id (uuid)
* step_id (fk flow_steps)
* option_text
* next_step_id (nullable fk flow_steps)  // null means END
* created_at

**sessions**

* id (uuid)
* flow_id
* candidate_name (nullable)
* candidate_email (nullable)
* started_at
* finished_at (nullable)
* last_step_id (nullable)

**session_answers**

* id (uuid)
* session_id
* step_id
* option_id
* answered_at

Constraints:

* step_options.step_id + option_text unique (optional)
* session_answers unique(session_id, step_id) to prevent duplicates

---

# Storage

Video storage options (pick one for MVP):

1. **S3-compatible** (recommended): AWS S3 or Cloudflare R2
2. Local disk (only if deploying single server)

Upload flow:

* Admin uploads video → backend stores file → create `videos` row → returns a playable URL (signed or public)

---

# Backend API (Minimal)

Base: `/api`

## Auth

* `POST /auth/login` → JWT
* `POST /auth/logout` (optional)
* `GET /auth/me`

## Videos (Admin)

* `POST /videos` (multipart upload)
* `GET /videos`
* `GET /videos/:id` (metadata)

## Flows (Admin)

* `POST /flows` (name)
* `GET /flows`
* `GET /flows/:id`
* `PATCH /flows/:id` (name, is_published)
* `POST /flows/:id/steps`
* `PATCH /steps/:stepId`
* `POST /steps/:stepId/options`
* `PATCH /options/:optionId` (option_text, next_step_id)
* `DELETE /options/:optionId` (optional)
* `GET /flows/:id/submissions` (sessions + answers)

## Public (Candidate)

* `GET /public/flows/:slug` → flow metadata + start_step_id
* `POST /public/flows/:slug/sessions` → create session (name/email)
* `GET /public/sessions/:sessionId/step` → returns current step payload (video_url, question, options)
* `POST /public/sessions/:sessionId/answer` → { step_id, option_id } → stores answer, updates session.last_step_id to next, returns next step or END

Step payload example:

```json
{
  "stepId": "uuid",
  "title": "1099 Confirmation",
  "videoUrl": "https://.../signed-url.mp4",
  "questionText": "Are you comfortable proceeding under these terms?",
  "options": [
    { "optionId": "uuid", "text": "Yes", "nextStepId": "uuid" },
    { "optionId": "uuid", "text": "No", "nextStepId": null }
  ]
}
```

---

# Frontend Pages (Simple)

## Admin

1. `/admin/login`
2. `/admin/videos` (upload + list)
3. `/admin/flows` (list + create)
4. `/admin/flows/:id/builder`

   * left panel: steps list
   * step editor: choose video, edit question text
   * options editor: add options, choose next step from dropdown (or END)
   * publish toggle
   * share link display
5. `/admin/flows/:id/submissions` (table of sessions, click to view answers)

## Candidate

1. `/f/:slug` start page (name/email form + Start)
2. `/f/:slug/s/:sessionId` player page

   * video player
   * after video ends (or allow anytime), show question + buttons
   * on choose option → load next step
3. `/f/:slug/s/:sessionId/done`

---

# Builder Logic (Important)

* Flow is a **directed graph**.
* Must enforce:

  * Only steps within same flow can be linked
  * Detect obvious invalid references (optional)
* Start step:

  * first created step is default start, OR admin selects start step

---

# Non-Functional Requirements

* Mobile-friendly
* Videos should stream (use `<video>` tag)
* Prevent skipping data:

  * When candidate clicks an option, write answer immediately
* Security:

  * Admin endpoints require JWT
  * Public endpoints only access published flows
* Basic rate limiting (optional)

---

# Tech Stack (Recommended)

* **Backend:** Node.js + Fastify (or NestJS) + Prisma ORM + Postgres
* **Frontend:** Next.js (minimal UI) OR plain server-rendered pages
* **Storage:** S3/R2
* **Deploy:** single VPS or Railway/Fly.io + Postgres

(If you want to avoid React, use server-rendered templates + HTMX; but Next.js is fastest for a builder UI.)

---

# Acceptance Criteria

1. Admin can upload mp4 and see it playable in admin UI
2. Admin can create a flow with at least 5 steps and branching options
3. Candidate link works on mobile and routes correctly based on answer
4. All sessions and answers are saved and visible in admin “Submissions”
5. “END” routes show Done page and mark session finished_at

---

# Nice-to-Have (Only if MVP done)

* Allow “show options only after video ends” toggle
* Add “No pressure / finished” reusable end screens
* Export submissions to CSV

---

If you tell me what stack you prefer (Node vs Python, Next.js vs no-React), I’ll rewrite this task as a **repo-ready spec** with:

* folder structure,
* Prisma schema,
* endpoint contract,
* and UI wireframe notes for the agent.
