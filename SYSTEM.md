# HiringFlow — System Architecture & Functionality

## Overview

HiringFlow is a video-based interview and training platform. It enables businesses to create branching video interview flows and interactive training programs with quizzes, captions, and full branding customization.

**Tech Stack:** Next.js 14 (App Router) · React 18 · TypeScript · PostgreSQL · Prisma · TailwindCSS · Vercel

**Live URL:** https://hiringflow-kappa.vercel.app

---

## Core Modules

### 1. Video Interview Flows

**Purpose:** Create multi-step video interviews with branching logic based on candidate answers.

**How it works:**
1. Admin creates a Flow (name, slug, start/end messages)
2. Adds Steps — each step has a video, question, and answer options
3. Each option routes to a different next step (branching tree)
4. Steps can be: Question (single/multi/button), Submission (video/text recording), or Form (collect info)
5. Flow is published with a unique URL (`/f/{slug}`)
6. Candidate opens the link → sees start screen → watches video → answers questions → gets routed through the tree → reaches end screen

**Key Features:**
- Schema view: visual node-based flow editor with drag-and-drop
- Auto-transcription via Deepgram with timestamped captions
- AI-generated titles and question suggestions (GPT-4o-mini)
- Caption styling: font, size, color, background palette, draggable position
- Form fields: built-in (name, email, phone) + custom fields
- Desktop: video left + questions sidebar right
- Mobile: questions overlay on video

### 2. Training Programs

**Purpose:** Create structured learning programs with video lessons, text content, and graded quizzes.

**How it works:**
1. Admin creates a Training (title, cover image, pricing, time limit)
2. Adds Sections (chapters/modules)
3. Each section has: Video content, Text content, and/or a Quiz
4. Quizzes have questions with multiple-choice options, correct answers, and hints
5. Training is published at `/t/{slug}`
6. Learner opens the landing page → browses sections → watches videos inline → takes quizzes → sees score with pass/fail

**Key Features:**
- Landing page matches Figma e-learning design (2-column section grid, big numbers, lesson rows)
- Inline video player on landing page — click any lesson to play
- Quiz grading: server-side verification (correct answers never exposed to client)
- Hints shown per-option after submission
- Cover image upload
- Pricing: Free or Paid
- Time limits: Unlimited, X days, or calendar date

### 3. Branding System

**Purpose:** Per-flow and per-training visual customization.

**Settings:**
- **Colors:** Primary, background, text, secondary text, accent (8 presets + custom)
- **Typography:** Google Fonts (Be Vietnam Pro, Inter, Roboto, etc.), heading/body size
- **Buttons:** Shape (rounded/pill/square), size, filled/outline, hover effect
- **Background:** Solid or gradient with direction
- **Logo:** Upload + draggable position per screen (start/step/end)
- **Form:** Position, style (card/minimal/floating), input style, label position
- **Layout:** Video position, question panel (sidebar/overlay), video format (horizontal/vertical/square)
- **Screens:** Start CTA text, end redirect URL + CTA
- **Custom CSS:** Raw CSS for power users

**Preview:** 4 switchable screens (Start, Form, Video Step, End) with desktop/mobile toggle. Live preview updates instantly via local state with debounced API save.

### 4. Video Management

**Storage pipeline:**
- **Development:** Local filesystem (`public/uploads/`)
- **Production:** S3 presigned URLs for direct browser upload (no server size limit)
- **Legacy:** Vercel Blob (still works for existing uploads)

**Analysis pipeline:**
1. Video uploaded → stored in S3/Blob
2. Deepgram transcribes audio → returns transcript + timestamped segments
3. GPT-4o-mini generates: display name, summary, bullet points
4. Segments stored for synchronized captions
5. Captions: draggable, customizable font/size/color/background

### 5. AI Features

- **Auto-transcription:** Deepgram Nova-2 model, accepts any video size via URL
- **Title generation:** GPT-4o-mini generates descriptive section headings from transcript
- **Question suggestions:** GPT-4o-mini generates interview questions + answer options from video context
- **Caption generation:** Deepgram segments with start/end timestamps

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   FRONTEND                       │
│  Next.js 14 (App Router) · React 18 · Tailwind  │
│                                                  │
│  /admin/*          Admin pages (flows, trainings,│
│                    videos, branding)              │
│  /f/[slug]/*       Candidate interview flow      │
│  /t/[slug]         Public training page          │
│  /login            Authentication                │
└────────────────────┬────────────────────────────┘
                     │ API Routes
┌────────────────────▼────────────────────────────┐
│                   BACKEND                        │
│  Next.js API Routes (serverless functions)       │
│                                                  │
│  /api/flows/*       Flow CRUD + step management  │
│  /api/trainings/*   Training CRUD + sections     │
│  /api/videos/*      Upload, transcribe, analyze  │
│  /api/ai/*          Title + question generation  │
│  /api/public/*      Candidate-facing endpoints   │
│  /api/auth/*        NextAuth session management  │
│  /api/uploads/*     File serving (dev)           │
└──┬──────┬──────┬──────┬─────────────────────────┘
   │      │      │      │
   ▼      ▼      ▼      ▼
┌─────┐ ┌─────┐ ┌──────┐ ┌────────┐
│ DB  │ │ S3  │ │ Deep │ │ OpenAI │
│ PG  │ │     │ │ gram │ │ GPT-4o │
└─────┘ └─────┘ └──────┘ └────────┘
```

### Database

**PostgreSQL** via Prisma ORM

**15 models:**

| Model | Purpose |
|-------|---------|
| User | Authentication, ownership |
| Video | Uploaded videos with transcripts |
| Flow | Interview flow definitions |
| FlowStep | Steps with video, questions, forms |
| StepOption | Answer options with branching |
| Session | Candidate interview session |
| SessionAnswer | Candidate's answers |
| CandidateSubmission | Video/text responses |
| Training | Training program definitions |
| TrainingSection | Chapters/modules |
| TrainingContent | Video or text in sections |
| TrainingQuiz | Section quizzes |
| TrainingQuestion | Quiz questions + options |
| TrainingEnrollment | Learner tracking |

### External Services

| Service | Purpose | Config |
|---------|---------|--------|
| PostgreSQL (Railway) | Production database | `DATABASE_URL` |
| S3 (us-east-1) | Video storage, presigned uploads | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` |
| Vercel Blob | Legacy file storage | `BLOB_READ_WRITE_TOKEN` |
| Deepgram | Speech-to-text transcription | `DEEPGRAM_API_KEY` |
| OpenAI | AI title/question generation | `OPENAI_API_KEY` |
| NextAuth | Session management | `NEXTAUTH_SECRET`, `NEXTAUTH_URL` |
| LogHub | Production logging (optional) | `LOGHUB_URL`, `LOGHUB_KEY` |

### Authentication

- Email/password credentials via NextAuth.js
- bcrypt password hashing
- JWT session tokens in HTTP-only cookies
- Protected admin routes via `getServerSession()`
- Public routes (`/api/public/*`) accessible without auth
- Default admin: `admin@example.com` / `changeme123` (seeded)

---

## API Endpoints (32+)

### Flows (Admin, authenticated)
```
GET    /api/flows                          List flows
POST   /api/flows                          Create flow
GET    /api/flows/:id                      Get flow with steps
PATCH  /api/flows/:id                      Update flow
DELETE /api/flows/:id                      Delete flow
POST   /api/flows/:id/steps               Add step
GET    /api/flows/:id/submissions          Get submissions
```

### Steps & Options (Admin)
```
PATCH  /api/steps/:stepId                  Update step
DELETE /api/steps/:stepId                  Delete step
POST   /api/steps/:stepId/options          Add option
PATCH  /api/options/:optionId              Update option
DELETE /api/options/:optionId              Delete option
```

### Videos (Admin)
```
GET    /api/videos                         List videos
POST   /api/videos                         Upload video (dev)
POST   /api/videos/upload-url              Get S3 presigned URL
POST   /api/videos/register                Register uploaded video
POST   /api/videos/:id/transcribe          Transcribe via Deepgram
POST   /api/videos/:id/analyze             Full analysis (transcript + AI)
```

### Trainings (Admin)
```
GET    /api/trainings                      List trainings
POST   /api/trainings                      Create training
GET    /api/trainings/:id                  Get with sections
PATCH  /api/trainings/:id                  Update training
DELETE /api/trainings/:id                  Delete training
POST   /api/trainings/:id/sections         Add section
PATCH  /api/trainings/:id/sections/:sid    Update section
DELETE /api/trainings/:id/sections/:sid    Delete section
POST   /api/trainings/:id/.../contents     Add content
PATCH  /api/trainings/:id/.../contents     Update content
DELETE /api/trainings/:id/.../contents     Delete content
POST   /api/trainings/:id/.../quiz         Create/update quiz
PATCH  /api/trainings/:id/.../quiz         Quiz actions (add/update/delete question)
DELETE /api/trainings/:id/.../quiz         Delete quiz
```

### Public (Candidate/Learner, no auth)
```
GET    /api/public/flows/:slug             Get flow metadata
POST   /api/public/sessions                Create session
GET    /api/public/sessions/:id/step       Get current step
POST   /api/public/sessions/:id/answer     Submit answer
POST   /api/public/sessions/:id/submit     Submit recording/text
GET    /api/public/trainings/:slug         Get training data
POST   /api/public/trainings/:slug         Submit quiz answers
```

### AI
```
POST   /api/ai/suggest-questions           Generate questions from transcript
POST   /api/ai/generate-title              Generate descriptive title
```

---

## File Structure

```
HiringFlow/
├── prisma/
│   ├── schema.prisma              15 models
│   └── seed.ts                    Admin user seeder
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   ├── layout.tsx         Admin nav (Flows, Videos, Branding, Trainings)
│   │   │   ├── flows/page.tsx     Flow list (card grid)
│   │   │   ├── flows/[id]/
│   │   │   │   ├── builder/       Flow builder (editor, schema, branding views)
│   │   │   │   └── submissions/   Candidate responses viewer
│   │   │   ├── videos/page.tsx    Video library
│   │   │   ├── branding/page.tsx  Branding editor (flows + trainings tabs)
│   │   │   └── trainings/
│   │   │       ├── page.tsx       Training list
│   │   │       └── [id]/page.tsx  Training editor (sections, content, quiz)
│   │   ├── api/                   32+ API routes (see above)
│   │   ├── f/[slug]/              Public flow pages (start, session, done)
│   │   ├── t/[slug]/page.tsx      Public training page
│   │   ├── login/page.tsx         Login
│   │   ├── globals.css            Design tokens (Be Vietnam Pro, orange theme)
│   │   └── layout.tsx             Root layout
│   ├── components/
│   │   ├── FlowSchemaView.tsx     Canvas-based flow diagram editor
│   │   ├── StepEditorPanel.tsx    Step configuration form
│   │   ├── StepPreviewModal.tsx   Step preview simulation
│   │   ├── CaptionedVideo.tsx     Video player with synced captions
│   │   ├── VideoRecorder.tsx      WebRTC video recording
│   │   └── BrandingEditor.tsx     Visual branding customization
│   └── lib/
│       ├── auth.ts                NextAuth config
│       ├── prisma.ts              DB client singleton
│       ├── storage.ts             File storage (Blob/local)
│       ├── s3.ts                  AWS S3 presigned URLs
│       ├── deepgram.ts            Speech-to-text
│       ├── openai.ts              AI client
│       ├── branding.ts            Branding types + defaults
│       ├── upload-client.ts       Browser upload logic (S3/local)
│       └── logger.ts              LogHub integration
├── tailwind.config.js             Design tokens (brand orange, greys, surfaces)
├── docker-compose.yml             Local PostgreSQL
└── package.json                   Dependencies
```

---

## Design System

Extracted from Figma (e-learning template):

| Token | Value |
|-------|-------|
| Font | Be Vietnam Pro (400, 500, 600, 700, 800) |
| Primary | `#FF9500` (orange) |
| Grey/15 | `#262626` |
| Grey/20 | `#333333` |
| Grey/35 | `#59595A` |
| Grey/40 | `#656567` |
| White/97 | `#F7F7F8` (surface) |
| White/99 | `#FCFCFD` (surface-light) |
| White/95 | `#F1F1F3` (borders) |
| White/90 | `#E4E4E7` (dividers) |
| Radius | 8px (buttons/inputs), 12px (cards) |
| Max width | 1596px (content), 80px side padding |

---

## Deployment

| Layer | Service | Details |
|-------|---------|---------|
| Frontend + API | Vercel | Auto-deploy from GitHub `main` branch |
| Database | Railway | PostgreSQL, production |
| Video storage | AWS S3 | `hiringflow-uploads` bucket, us-east-1 |
| Domain | Vercel | hiringflow-kappa.vercel.app |
| Monitoring | LogHub + Grafana | Optional, via `@geos/loghub-client` |

**Local development:**
```bash
docker compose up -d          # Start PostgreSQL
npm run db:push               # Push schema
npm run db:seed               # Create admin user
npm run dev                   # Start Next.js (port 3000)
```

**Production deploy:**
```bash
git push origin main          # Vercel auto-deploys
```
