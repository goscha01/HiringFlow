// Mock flow — a branching interview for a "Senior Product Designer" role
// Shape mirrors HiringFlow's FlowStep + StepOption + branching

const MOCK_FLOW = {
  slug: "senior-product-designer",
  name: "Senior Product Designer — Remote",
  company: "Northwind Studio",
  startLabel: "Welcome interview",
  startCopy:
    "Hey — thanks for applying. This is a short video interview with 5 quick questions. Takes about 6 minutes. You can re-record any answer.",
  recruiter: { name: "Mira Okonkwo", role: "Head of Design", initials: "MO" },
  steps: {
    welcome: {
      id: "welcome",
      kind: "intro",
      title: "Say hi",
      duration: "0:42",
      speaker: "Mira · Head of Design",
      videoLabel: "mira-welcome.mp4",
      question: "Ready when you are — shall we jump in?",
      options: [
        { id: "go", text: "Let's go", next: "work_auth", primary: true },
        { id: "maybe", text: "Tell me about the role first", next: "role_detail" },
      ],
    },
    role_detail: {
      id: "role_detail",
      kind: "intro",
      title: "About the role",
      duration: "1:18",
      speaker: "Mira · Head of Design",
      videoLabel: "role-overview.mp4",
      question: "Sound like something you'd want to do every day?",
      options: [
        { id: "yes", text: "Yes — let's continue", next: "work_auth", primary: true },
        { id: "no", text: "Not quite for me", next: "polite_end" },
      ],
    },
    work_auth: {
      id: "work_auth",
      kind: "question",
      title: "Work authorization",
      duration: "0:28",
      speaker: "Mira · Head of Design",
      videoLabel: "auth-question.mp4",
      question: "Are you authorized to work in the US without sponsorship?",
      options: [
        { id: "yes", text: "Yes", next: "experience" },
        { id: "sponsor", text: "I'll need sponsorship", next: "experience" },
        { id: "contract", text: "Contract / 1099 only", next: "experience" },
      ],
    },
    experience: {
      id: "experience",
      kind: "question",
      title: "Your background",
      duration: "1:04",
      speaker: "Mira · Head of Design",
      videoLabel: "background.mp4",
      question: "How many years have you led end-to-end product design?",
      options: [
        { id: "0-2", text: "0–2 years", next: "polite_end" },
        { id: "3-5", text: "3–5 years", next: "portfolio" },
        { id: "6-9", text: "6–9 years", next: "portfolio" },
        { id: "10+", text: "10+ years", next: "portfolio" },
      ],
    },
    portfolio: {
      id: "portfolio",
      kind: "submission_video",
      title: "Walk us through one project",
      duration: "2:10",
      speaker: "Mira · Head of Design",
      videoLabel: "portfolio-prompt.mp4",
      question:
        "Record a 90-second video walking us through one project you're proud of. What was the problem, what did you ship, what did you learn?",
      minSeconds: 30,
      maxSeconds: 180,
      options: [
        { id: "submitted", text: "Submit recording", next: "availability", primary: true },
        { id: "text", text: "I'd rather write it", next: "portfolio_text" },
      ],
    },
    portfolio_text: {
      id: "portfolio_text",
      kind: "submission_text",
      title: "Write about one project",
      duration: "0:20",
      speaker: "Mira · Head of Design",
      videoLabel: "portfolio-text-prompt.mp4",
      question:
        "No problem — write a short answer instead. 3–5 sentences about a project you're proud of.",
      minChars: 120,
      options: [
        { id: "submitted", text: "Submit", next: "availability", primary: true },
      ],
    },
    availability: {
      id: "availability",
      kind: "question",
      title: "Availability",
      duration: "0:22",
      speaker: "Mira · Head of Design",
      videoLabel: "availability.mp4",
      question: "When could you realistically start?",
      options: [
        { id: "now", text: "Within 2 weeks", next: "thanks", primary: true },
        { id: "month", text: "3–4 weeks", next: "thanks" },
        { id: "later", text: "2+ months out", next: "thanks" },
      ],
    },
    thanks: {
      id: "thanks",
      kind: "end",
      title: "That's it",
      duration: "0:35",
      speaker: "Mira · Head of Design",
      videoLabel: "thanks.mp4",
      headline: "Thanks — we'll be in touch",
      body:
        "We review every submission within 3 business days. If there's a match, Mira will reach out to schedule a 30-minute follow-up.",
      cta: { text: "Visit northwind.studio", url: "#" },
    },
    polite_end: {
      id: "polite_end",
      kind: "end",
      title: "Appreciate you",
      duration: "0:22",
      speaker: "Mira · Head of Design",
      videoLabel: "polite-end.mp4",
      headline: "Thanks for your time",
      body:
        "It sounds like this role isn't the right fit right now — but we'll keep your details on file for future openings.",
      cta: { text: "See other roles", url: "#" },
    },
  },
  startStep: "welcome",
  // For progress — an ordered "happy path" so we can show a stepper
  happyPath: ["welcome", "work_auth", "experience", "portfolio", "availability", "thanks"],
};

window.MOCK_FLOW = MOCK_FLOW;
