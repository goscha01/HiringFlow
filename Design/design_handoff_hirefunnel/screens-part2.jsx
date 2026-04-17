// Part 2 of screens — candidates scheduling, videos, trainings, branding, auth, marketing.
const { TopNav, PageHeader, Btn, Badge, Card, Stat, tokens: T } = window.UI;

// ───────────────── SCHEDULING ─────────────────
function ScreenScheduling() {
  const days = ["Mon 14", "Tue 15", "Wed 16", "Thu 17", "Fri 18"];
  const slots = ["9:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
  // meeting map: [dayIdx, slotIdx, name, kind]
  const booked = [
    [0, 1, "Maya Thompson", "Portfolio"],
    [1, 4, "Priya Varma", "Technical"],
    [2, 2, "Diego Ruiz", "Intro"],
    [3, 0, "Kenji Nakamura", "Portfolio"],
    [4, 6, "Amir Haddad", "Technical"],
  ];
  const bookedMap = Object.fromEntries(booked.map(b => [`${b[0]}-${b[1]}`, b]));
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #FAF8F5)" }}>
      <TopNav current="Scheduling" />
      <PageHeader eyebrow="Apr 14 – 18" title="This week"
        actions={<><Btn variant="secondary" small>◀</Btn><Btn variant="secondary" small>▶</Btn><Btn small>+ Availability</Btn></>} />
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        <Card padding={0}>
          <div style={{ display: "grid", gridTemplateColumns: "70px repeat(5, 1fr)", borderBottom: `1px solid ${T.border}` }}>
            <div />
            {days.map(d => (
              <div key={d} style={{ padding: "14px 10px", textAlign: "center", borderLeft: `1px solid ${T.divider}`, fontSize: 12, fontWeight: 600 }}>
                {d}
              </div>
            ))}
          </div>
          {slots.map((s, si) => (
            <div key={s} style={{ display: "grid", gridTemplateColumns: "70px repeat(5, 1fr)", borderBottom: si < slots.length-1 ? `1px solid ${T.divider}` : "none", minHeight: 54 }}>
              <div style={{ padding: "8px 10px", fontFamily: "var(--mono-font)", fontSize: 11, color: T.dim, textAlign: "right" }}>{s}</div>
              {days.map((_, di) => {
                const b = bookedMap[`${di}-${si}`];
                return (
                  <div key={di} style={{ borderLeft: `1px solid ${T.divider}`, padding: 4, position: "relative" }}>
                    {b && (
                      <div style={{
                        background: "#FFF3DF", border: "1px solid var(--brand-primary)",
                        borderRadius: 6, padding: "6px 8px", fontSize: 11, height: "100%",
                      }}>
                        <div style={{ fontWeight: 600, color: "#C2710A" }}>{b[2]}</div>
                        <div style={{ color: T.dim, fontFamily: "var(--mono-font)" }}>{b[3]}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ───────────────── VIDEOS LIBRARY ─────────────────
function ScreenVideos() {
  const M = window.MOCK;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #FAF8F5)" }}>
      <TopNav current="Videos" />
      <PageHeader eyebrow="12 of 2GB used" title="Video library"
        actions={<><Btn variant="secondary" small>Record</Btn><Btn small>+ Upload</Btn></>} />
      <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {M.videos.map((v, i) => (
            <Card key={v.id} padding={0} style={{ overflow: "hidden" }}>
              <div style={{
                aspectRatio: "16/10",
                background: `linear-gradient(135deg, hsl(${(i*47)%360}, 30%, 25%), hsl(${(i*47+60)%360}, 40%, 15%))`,
                position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "rgba(255,255,255,0.9)", color: T.ink,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                }}>▶</div>
                <div style={{
                  position: "absolute", bottom: 8, right: 8,
                  background: "rgba(0,0,0,0.7)", color: "#fff",
                  padding: "2px 6px", borderRadius: 4,
                  fontFamily: "var(--mono-font)", fontSize: 10,
                }}>{v.duration}</div>
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--mono-font)" }}>{v.name}</div>
                <div style={{ fontSize: 11, color: T.dim, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                  <span>{v.size}</span>
                  {v.transcribed && <Badge tone="success">Transcribed</Badge>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────── TRAININGS LIST ─────────────────
function ScreenTrainings() {
  const M = window.MOCK;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #FAF8F5)" }}>
      <TopNav current="Trainings" />
      <PageHeader title="Trainings" eyebrow="Paid & free courses" description="Self-paced video content for candidates and hires."
        actions={<Btn small>+ New training</Btn>} />
      <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {M.trainings.map((t, i) => (
            <Card key={t.id} padding={0} style={{ overflow: "hidden" }}>
              <div style={{
                aspectRatio: "16/9",
                background: ["linear-gradient(135deg, #2d4a3e, #567d65)", "linear-gradient(135deg, #4a3c2d, #8a6b3f)", "linear-gradient(135deg, #2d2d4a, #4f4f8a)"][i],
                position: "relative",
              }}>
                <div style={{ position: "absolute", top: 12, right: 12 }}>
                  <Badge tone={t.pricing === "Free" ? "neutral" : "brand"}>{t.pricing}</Badge>
                </div>
                <div style={{ position: "absolute", bottom: 14, left: 16, color: "#fff" }}>
                  <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>{t.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.85, fontFamily: "var(--mono-font)", marginTop: 4 }}>
                    {t.sections} sections · {t.enrolled} enrolled
                  </div>
                </div>
              </div>
              <div style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: T.dim, fontFamily: "var(--mono-font)" }}>/t/{t.id}</div>
                <Btn variant="ghost" small>Open →</Btn>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────── TRAINING EDITOR ─────────────────
function ScreenTrainingEditor() {
  const sections = [
    { n: 1, title: "Welcome & overview", dur: "4:12", active: false },
    { n: 2, title: "De-escalation fundamentals", dur: "18:40", active: true },
    { n: 3, title: "Tier-2 escalation paths", dur: "12:08", active: false },
    { n: 4, title: "Case study: refund disputes", dur: "9:54", active: false },
    { n: 5, title: "Quiz & certification", dur: "—", active: false },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #FAF8F5)" }}>
      <TopNav current="Trainings" />
      <div style={{ padding: "14px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 16, background: "#fff" }}>
        <a href="#" style={{ fontSize: 13, color: T.dim, textDecoration: "none" }}>Trainings /</a>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Customer Support Onboarding</div>
        <Badge tone="brand">Draft</Badge>
        <div style={{ flex: 1 }} />
        <Btn variant="secondary" small>Preview</Btn>
        <Btn small>Publish</Btn>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "300px 1fr 340px", overflow: "hidden" }}>
        {/* Sections */}
        <div style={{ borderRight: `1px solid ${T.border}`, overflow: "auto", padding: 16, background: "#fff" }}>
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, marginBottom: 10 }}>
            Sections · 5
          </div>
          {sections.map(s => (
            <div key={s.n} style={{
              padding: "10px 12px", borderRadius: 8, marginBottom: 4,
              background: s.active ? "#FFF3DF" : "transparent",
              border: s.active ? `1px solid var(--brand-primary)` : "1px solid transparent",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: s.active ? "var(--brand-primary)" : "#F1EBE1",
                color: s.active ? "#fff" : T.dim,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--mono-font)", fontSize: 11, fontWeight: 600,
              }}>{s.n}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                <div style={{ fontSize: 11, color: T.dim, fontFamily: "var(--mono-font)" }}>{s.dur}</div>
              </div>
            </div>
          ))}
          <Btn variant="ghost" small>+ Add section</Btn>
        </div>

        {/* Content */}
        <div style={{ overflow: "auto", padding: 32 }}>
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, marginBottom: 4 }}>
            Section 2 · 18:40
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 20px", letterSpacing: "-0.02em" }}>De-escalation fundamentals</h2>
          <div style={{ aspectRatio: "16/9", background: "linear-gradient(135deg, #2d4a3e, #1a2d26)", borderRadius: 12, marginBottom: 20, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>▶</div>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: T.ink }}>
            <p>Walk candidates through the three core techniques used to de-escalate tense customer calls:
            active listening, mirroring, and offering a path forward. Includes two roleplay scenarios.</p>
          </div>
        </div>

        {/* Settings */}
        <div style={{ borderLeft: `1px solid ${T.border}`, padding: 20, background: "#fff", overflow: "auto" }}>
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, marginBottom: 12 }}>Section settings</div>
          <SmallField label="Video source" value="intro-deescalation.mp4" />
          <SmallField label="Gate" value="Must watch ≥80%" />
          <SmallField label="Quiz" value="None" />
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, margin: "24px 0 12px" }}>Enrollment</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <MiniStat label="Enrolled" value="24" />
            <MiniStat label="Completed" value="7" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SmallField({ label, value }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: T.dim, marginBottom: 4, fontFamily: "var(--mono-font)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ padding: "7px 10px", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, background: "#FCFAF6" }}>{value}</div>
    </div>
  );
}
function MiniStat({ label, value }) {
  return (
    <div style={{ padding: 10, background: "#F7F3EB", borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: T.dim, fontFamily: "var(--mono-font)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ───────────────── PUBLIC TRAINING (/t/[slug]) ─────────────────
function ScreenPublicTraining() {
  return (
    <div style={{ height: "100%", overflow: "auto", background: "#FAF8F5" }}>
      {/* Hero */}
      <div style={{
        minHeight: 280, padding: "60px 80px",
        background: `linear-gradient(135deg, #2d4a3e, #567d65)`,
        color: "#fff", position: "relative",
      }}>
        <div style={{ maxWidth: 900 }}>
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7, marginBottom: 14 }}>
            Northwind Logistics · Training course
          </div>
          <h1 style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 16px", maxWidth: 700 }}>
            Customer Support Onboarding
          </h1>
          <p style={{ fontSize: 17, opacity: 0.9, maxWidth: 560, lineHeight: 1.5, margin: 0 }}>
            A 90-minute walkthrough of our Tier-1 workflows, de-escalation practice, and tools — before your first shift.
          </p>
          <div style={{ display: "flex", gap: 20, marginTop: 28, fontSize: 13, opacity: 0.85 }}>
            <div>⏱ 5 sections · 90 min</div>
            <div>🎥 4 videos</div>
            <div>✓ Certificate on completion</div>
          </div>
        </div>
      </div>
      {/* Course outline */}
      <div style={{ padding: "50px 80px", maxWidth: 900 }}>
        <div style={{ fontFamily: "var(--mono-font)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.dim, marginBottom: 8 }}>
          Course outline
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 28px", letterSpacing: "-0.01em" }}>What you'll learn</h2>
        {[
          ["01", "Welcome & overview", "4 min", "Meet your trainer and the shape of the week ahead."],
          ["02", "De-escalation fundamentals", "18 min", "Three techniques: active listening, mirroring, forward paths."],
          ["03", "Tier-2 escalation paths", "12 min", "When to hand off, how to write a clean handoff ticket."],
          ["04", "Case study: refund disputes", "10 min", "Roleplay a difficult call with redux commentary."],
          ["05", "Quiz & certification", "—", "Short knowledge check. Retake as needed."],
        ].map(([n, title, dur, desc]) => (
          <div key={n} style={{ display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 20, padding: "20px 0", borderBottom: `1px solid ${T.divider}`, alignItems: "center" }}>
            <div style={{ fontFamily: "var(--mono-font)", fontSize: 13, color: T.dim, letterSpacing: "0.1em" }}>{n}</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 3 }}>{title}</div>
              <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.4 }}>{desc}</div>
            </div>
            <div style={{ fontFamily: "var(--mono-font)", fontSize: 12, color: T.dim, textAlign: "right" }}>{dur}</div>
          </div>
        ))}
        <div style={{ marginTop: 36, display: "flex", gap: 12 }}>
          <Btn>Start course →</Btn>
          <Btn variant="secondary">Save for later</Btn>
        </div>
      </div>
    </div>
  );
}

// ───────────────── BRANDING SETTINGS ─────────────────
function ScreenBranding() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #FAF8F5)" }}>
      <TopNav current="Flows" />
      <div style={{ padding: "14px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 16, background: "#fff" }}>
        <a href="#" style={{ fontSize: 13, color: T.dim, textDecoration: "none" }}>Flows /</a>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Senior Product Designer</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, background: "#F7F3EB", padding: 2, borderRadius: 8 }}>
          {["Editor", "Schema", "Branding", "Submissions"].map((t, i) => (
            <button key={t} style={{
              padding: "6px 12px", borderRadius: 6, border: "none",
              background: i === 2 ? "#fff" : "transparent",
              color: T.ink, fontSize: 12, fontWeight: 500, cursor: "pointer",
              boxShadow: i === 2 ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
            }}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "400px 1fr", overflow: "hidden" }}>
        <div style={{ padding: 28, overflow: "auto", borderRight: `1px solid ${T.border}`, background: "#fff" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>Branding</h2>
          <p style={{ fontSize: 13, color: T.dim, margin: "0 0 24px" }}>Customize how your flow feels to candidates.</p>
          <Setting label="Logo">
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, border: `1px dashed ${T.border}`, borderRadius: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "#1a2d26", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>N</div>
              <div style={{ flex: 1, fontSize: 12, color: T.dim, fontFamily: "var(--mono-font)" }}>northwind-mark.svg</div>
              <Btn variant="ghost" small>Change</Btn>
            </div>
          </Setting>
          <Setting label="Primary color">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["#2D4A3E", "#1A73E8", "#D13438", "#7C4DFF", "#FF9500", "#1F6A3A"].map((c, i) => (
                <div key={c} style={{ width: 36, height: 36, borderRadius: 8, background: c, border: i === 0 ? `3px solid #fff` : "1px solid transparent", boxShadow: i === 0 ? `0 0 0 2px ${c}` : "none" }} />
              ))}
            </div>
          </Setting>
          <Setting label="Typography">
            <div style={{ padding: "10px 12px", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13 }}>
              Inter — Sans-serif, modern
            </div>
          </Setting>
          <Setting label="Corner radius">
            <div style={{ display: "flex", gap: 6 }}>
              {["Sharp", "Soft", "Pill"].map((r, i) => (
                <button key={r} style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${i === 1 ? T.ink : T.border}`,
                  background: i === 1 ? "#FFF3DF" : "transparent", fontSize: 12, fontWeight: 500, cursor: "pointer",
                }}>{r}</button>
              ))}
            </div>
          </Setting>
          <Setting label="Custom domain">
            <div style={{ padding: "10px 12px", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, fontFamily: "var(--mono-font)", color: T.dim }}>
              apply.northwind.com
            </div>
          </Setting>
        </div>
        {/* Preview */}
        <div style={{ padding: 40, overflow: "auto", background: "#F7F3EB" }}>
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, marginBottom: 12 }}>Live preview</div>
          <div style={{
            background: "#2d4a3e", color: "#fff", borderRadius: 16,
            padding: 44, aspectRatio: "16/10", display: "flex", flexDirection: "column",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "auto" }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "#fff", color: "#2d4a3e", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>N</div>
              <div style={{ fontWeight: 600 }}>Northwind</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--mono-font)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7, marginBottom: 10 }}>
                Step 1 of 6 · Welcome
              </div>
              <h1 style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 12px", maxWidth: 600 }}>
                Hi, I'm Mira — let me show you around.
              </h1>
              <p style={{ fontSize: 15, opacity: 0.85, maxWidth: 500, margin: "0 0 20px" }}>
                This'll take about seven minutes. There are no right answers — we just want to get to know you.
              </p>
              <button style={{
                padding: "12px 22px", borderRadius: 10, border: "none",
                background: "#fff", color: "#2d4a3e", fontWeight: 600, fontSize: 14,
              }}>Begin →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function Setting({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, color: T.dim, marginBottom: 8, fontFamily: "var(--mono-font)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
      {children}
    </div>
  );
}

// ───────────────── PLATFORM ADMIN ─────────────────
function ScreenPlatformAdmin() {
  const orgs = [
    ["Northwind Logistics", "Growth", 4, 127, "Active"],
    ["Lumen Studios", "Scale", 12, 589, "Active"],
    ["Forge & Fern", "Starter", 2, 18, "Trial"],
    ["Parallax Robotics", "Scale", 8, 341, "Active"],
    ["Kestrel Health", "Growth", 5, 202, "Past due"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #FAF8F5)" }}>
      {/* Platform nav (different) */}
      <div style={{ height: 52, background: T.ink, color: "#fff", display: "flex", alignItems: "center", padding: "0 24px", gap: 20, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Hirefunnel Platform</div>
        <Badge tone="warn">Admin</Badge>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, opacity: 0.7, fontFamily: "var(--mono-font)" }}>you@hirefunnel.co</div>
      </div>
      <PageHeader eyebrow="5 active orgs · 1 trial" title="Organizations" description="All customer workspaces." />
      <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
          <Stat label="Active orgs" value="5" delta="+1 mo" deltaTone="success" />
          <Stat label="MRR" value="$8,420" delta="+12%" deltaTone="success" />
          <Stat label="Submissions (mo)" value="12,477" sub="Across all orgs" />
          <Stat label="Support tickets" value="3" delta="1 new" deltaTone="warn" />
        </div>
        <Card padding={0}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#FCFAF6" }}>
                {["Org", "Plan", "Users", "Subs 30d", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontFamily: "var(--mono-font)", fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, borderBottom: `1px solid ${T.divider}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgs.map(([name, plan, users, subs, status]) => (
                <tr key={name} style={{ borderBottom: `1px solid ${T.divider}` }}>
                  <td style={{ padding: "14px 16px", fontWeight: 500 }}>{name}</td>
                  <td style={{ padding: "14px 16px" }}><Badge tone={plan === "Scale" ? "brand" : plan === "Growth" ? "info" : "neutral"}>{plan}</Badge></td>
                  <td style={{ padding: "14px 16px", color: T.dim, fontFamily: "var(--mono-font)" }}>{users}</td>
                  <td style={{ padding: "14px 16px", color: T.dim, fontFamily: "var(--mono-font)" }}>{subs.toLocaleString()}</td>
                  <td style={{ padding: "14px 16px" }}><Badge tone={status === "Active" ? "success" : status === "Trial" ? "warn" : "danger"}>{status}</Badge></td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}><Btn variant="ghost" small>Impersonate →</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ───────────────── AUTH / LOGIN ─────────────────
function ScreenAuth() {
  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", background: "#FAF8F5" }}>
      <div style={{ padding: 60, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 48 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--brand-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>h</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Hirefunnel</div>
        </div>
        <div style={{ maxWidth: 380 }}>
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.dim, marginBottom: 10 }}>Welcome back</div>
          <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 10px" }}>Sign in to Hirefunnel</h1>
          <p style={{ fontSize: 14, color: T.dim, margin: "0 0 32px" }}>Run branching video interviews without losing anyone at the top of the funnel.</p>

          <button style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${T.border}`, background: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--mono-font)" }}>G</span> Continue with Google
          </button>
          <button style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${T.border}`, background: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 20, cursor: "pointer" }}>
            Continue with Microsoft
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0", color: T.dim, fontSize: 12 }}>
            <div style={{ flex: 1, height: 1, background: T.divider }} />
            OR
            <div style={{ flex: 1, height: 1, background: T.divider }} />
          </div>

          <div style={{ fontSize: 11, color: T.dim, fontFamily: "var(--mono-font)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 6 }}>Email</div>
          <input style={{ width: "100%", padding: "11px 12px", border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 14, marginBottom: 16, background: "#fff", fontFamily: "inherit" }} defaultValue="ada@northwind.com" />
          <Btn style={{ width: "100%", padding: "12px", justifyContent: "center" }}>Send magic link →</Btn>

          <div style={{ marginTop: 24, fontSize: 12, color: T.dim }}>
            No account? <a href="#" style={{ color: "var(--brand-primary)" }}>Start a free trial</a>
          </div>
        </div>
      </div>
      {/* Decorative side */}
      <div style={{
        background: "linear-gradient(135deg, #1a2d26, #2d4a3e)",
        padding: 60, color: "#fff",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
      }}>
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.3, marginBottom: 20, maxWidth: 440 }}>
          "We doubled our qualified pipeline by letting candidates actually *meet* the team before the interview."
        </div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Priya Shah · Head of Talent, Parallax Robotics
        </div>
      </div>
    </div>
  );
}

// ───────────────── MARKETING LANDING ─────────────────
function ScreenMarketing() {
  return (
    <div style={{ height: "100%", overflow: "auto", background: "#FAF8F5" }}>
      {/* Nav */}
      <div style={{ padding: "18px 40px", display: "flex", alignItems: "center", gap: 24, borderBottom: `1px solid ${T.divider}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--brand-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>h</div>
          <div style={{ fontWeight: 600 }}>Hirefunnel</div>
        </div>
        <nav style={{ display: "flex", gap: 22, flex: 1, fontSize: 13, color: T.dim }}>
          {["Product", "Pricing", "Customers", "Changelog"].map(i => <a key={i} href="#" style={{ color: "inherit", textDecoration: "none" }}>{i}</a>)}
        </nav>
        <Btn variant="ghost" small>Sign in</Btn>
        <Btn small>Start free</Btn>
      </div>
      {/* Hero */}
      <div style={{ padding: "80px 40px 60px", textAlign: "center", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ fontFamily: "var(--mono-font)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: T.dim, marginBottom: 20 }}>
          Video interviews · Branching logic · Anti-AI screening
        </div>
        <h1 style={{ fontSize: 64, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "0 0 20px" }}>
          Hire people, not <span style={{ color: "var(--brand-primary)", fontStyle: "italic" }}>résumés</span>.
        </h1>
        <p style={{ fontSize: 18, color: T.dim, maxWidth: 620, margin: "0 auto 32px", lineHeight: 1.5 }}>
          Replace the top of your funnel with short video interviews that branch based on how candidates answer. No more screening 400 résumés to find five real humans.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Btn>Start free — 14 days</Btn>
          <Btn variant="secondary">Watch a demo →</Btn>
        </div>
        {/* Hero product image placeholder */}
        <div style={{
          marginTop: 60, aspectRatio: "16/9", borderRadius: 16,
          background: `linear-gradient(135deg, rgba(255,149,0,0.2), rgba(255,149,0,0.05)),
            repeating-linear-gradient(135deg, rgba(26,24,21,0.04) 0 12px, transparent 12px 24px)`,
          border: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ fontFamily: "var(--mono-font)", color: T.dim, fontSize: 12 }}>[ Product screenshot ]</div>
        </div>
      </div>
      {/* Features */}
      <div style={{ padding: "60px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 28 }}>
          {[
            ["Branching video flows", "Ask different questions based on how candidates answer. Stop wasting their time with irrelevant questions."],
            ["Anti-AI screening", "Video answers are harder to fake. Built-in liveness checks flag obvious AI submissions."],
            ["Paid training funnels", "Turn your top-of-funnel into self-paced training. Warm candidates who already know your product."],
          ].map(([title, desc]) => (
            <div key={title}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--brand-dim, #FFF3DF)", marginBottom: 16 }} />
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, letterSpacing: "-0.01em" }}>{title}</div>
              <p style={{ fontSize: 14, color: T.dim, lineHeight: 1.5, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.SCREENS_PART2 = {
  ScreenScheduling, ScreenVideos, ScreenTrainings, ScreenTrainingEditor,
  ScreenPublicTraining, ScreenBranding, ScreenPlatformAdmin, ScreenAuth, ScreenMarketing,
};
