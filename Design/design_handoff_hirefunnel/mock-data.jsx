// Mock data — shared across all screens.
window.MOCK = {
  flows: [
    { id: "fl_01", name: "Senior Product Designer", slug: "senior-product-designer", status: "published", candidates: 142, completionRate: 68, lastActive: "2h ago", steps: 6, branches: 3 },
    { id: "fl_02", name: "Customer Support — Tier 2", slug: "support-t2", status: "published", candidates: 89, completionRate: 74, lastActive: "5h ago", steps: 5, branches: 2 },
    { id: "fl_03", name: "Account Executive · NYC", slug: "ae-nyc", status: "draft", candidates: 0, completionRate: 0, lastActive: "yesterday", steps: 4, branches: 1 },
    { id: "fl_04", name: "Warehouse Associate", slug: "warehouse", status: "published", candidates: 312, completionRate: 81, lastActive: "12m ago", steps: 3, branches: 1 },
    { id: "fl_05", name: "Sr. Data Engineer", slug: "sr-data-eng", status: "published", candidates: 47, completionRate: 55, lastActive: "1d ago", steps: 7, branches: 4 },
    { id: "fl_06", name: "Brand Writer — Contract", slug: "brand-writer", status: "archived", candidates: 58, completionRate: 62, lastActive: "3w ago", steps: 4, branches: 1 },
  ],
  candidates: [
    { id: "c_01", name: "Maya Thompson", email: "maya.t@gmail.com", flow: "Senior Product Designer", status: "advancing", score: 92, submitted: "Today, 10:14", avatar: "MT", stage: "Portfolio review" },
    { id: "c_02", name: "Diego Ruiz", email: "diego.ruiz@hey.com", flow: "Senior Product Designer", status: "new", score: 88, submitted: "Today, 09:42", avatar: "DR", stage: "New" },
    { id: "c_03", name: "Priya Varma", email: "priya@varma.co", flow: "Sr. Data Engineer", status: "advancing", score: 95, submitted: "Yesterday", avatar: "PV", stage: "Interview scheduled" },
    { id: "c_04", name: "Sam Okafor", email: "sam.o@fastmail.com", flow: "Customer Support — Tier 2", status: "rejected", score: 42, submitted: "Yesterday", avatar: "SO", stage: "Rejected" },
    { id: "c_05", name: "Lina Petersen", email: "lina.p@icloud.com", flow: "Warehouse Associate", status: "advancing", score: 78, submitted: "2d ago", avatar: "LP", stage: "Offer sent" },
    { id: "c_06", name: "Kenji Nakamura", email: "kenji@nakamura.jp", flow: "Senior Product Designer", status: "new", score: 81, submitted: "2d ago", avatar: "KN", stage: "New" },
    { id: "c_07", name: "Rachel Green", email: "rachel.g@gmail.com", flow: "Customer Support — Tier 2", status: "advancing", score: 74, submitted: "3d ago", avatar: "RG", stage: "Phone screen" },
    { id: "c_08", name: "Amir Haddad", email: "amir.h@proton.me", flow: "Sr. Data Engineer", status: "new", score: 86, submitted: "3d ago", avatar: "AH", stage: "New" },
    { id: "c_09", name: "Jules Fontaine", email: "jules@fontaine.fr", flow: "Warehouse Associate", status: "hired", score: 91, submitted: "1w ago", avatar: "JF", stage: "Hired ✓" },
    { id: "c_10", name: "Theo Walsh", email: "theo.walsh@outlook.com", flow: "Senior Product Designer", status: "rejected", score: 38, submitted: "1w ago", avatar: "TW", stage: "Rejected" },
  ],
  videos: [
    { id: "v_01", name: "mira-welcome.mp4", duration: "0:42", size: "14 MB", created: "Oct 2", transcribed: true },
    { id: "v_02", name: "role-overview.mp4", duration: "1:18", size: "28 MB", created: "Oct 2", transcribed: true },
    { id: "v_03", name: "portfolio-prompt.mp4", duration: "2:10", size: "46 MB", created: "Oct 3", transcribed: true },
    { id: "v_04", name: "work-auth-question.mp4", duration: "0:28", size: "10 MB", created: "Oct 3", transcribed: true },
    { id: "v_05", name: "availability.mp4", duration: "0:22", size: "8 MB", created: "Oct 4", transcribed: false },
    { id: "v_06", name: "thank-you.mp4", duration: "0:35", size: "12 MB", created: "Oct 4", transcribed: true },
  ],
  trainings: [
    { id: "t_01", name: "Customer Support Onboarding", sections: 5, enrolled: 24, pricing: "Free", cover: "support" },
    { id: "t_02", name: "Safety & Compliance — Warehouse", sections: 8, enrolled: 112, pricing: "Free", cover: "safety" },
    { id: "t_03", name: "Advanced Product Design", sections: 12, enrolled: 8, pricing: "$299", cover: "design" },
  ],
  // Funnel for analytics
  funnel: [
    { label: "Link opened", value: 1247, pct: 100 },
    { label: "Form submitted", value: 892, pct: 71 },
    { label: "Q1 answered", value: 864, pct: 69 },
    { label: "Video recorded", value: 612, pct: 49 },
    { label: "Completed", value: 548, pct: 44 },
  ],
  // Daily submissions last 30 days
  daily: [23, 34, 29, 31, 42, 45, 28, 18, 24, 38, 52, 48, 41, 56, 62, 58, 44, 49, 61, 67, 58, 52, 64, 71, 68, 74, 69, 78, 84, 79],
};
