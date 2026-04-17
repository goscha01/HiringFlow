// All admin + public screens — static mockups in Classic style.
// Each screen is a self-contained component sized to fit an artboard.

const { TopNav, PageHeader, Btn, Badge, Card, Stat, Sparkline, tokens: T } = window.UI;

// ───────────────── ANALYTICS (priority) ─────────────────
function ScreenAnalytics() {
  const M = window.MOCK;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #FAF8F5)" }}>
      <TopNav current="Analytics" />
      <PageHeader
        eyebrow="Workspace · Last 30 days"
        title="Analytics"
        description="Candidate funnel performance across all published flows."
        actions={<>
          <Btn variant="secondary" small>↓ Export CSV</Btn>
          <Btn variant="secondary" small>Last 30 days ▾</Btn>
          <Btn small>+ Custom report</Btn>
        </>}
      />
      <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
        {/* Top stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
          <Stat label="Total submissions" value="1,247" delta="+18% vs prev" deltaTone="success"
            chart={<Sparkline data={M.daily} w={220} h={36} fill="rgba(255,149,0,0.12)" />} />
          <Stat label="Completion rate" value="44%" delta="+3pt" deltaTone="success"
            chart={<Sparkline data={[40,41,42,39,43,44,45,44,43,44,42,44,43,44,45,44]} w={220} h={36} fill="rgba(255,149,0,0.12)" />} />
          <Stat label="Avg. time to complete" value="6:42" delta="−14s" deltaTone="success"
            sub="Median: 5:18" />
          <Stat label="Drop-off point" value="Video rec" delta="32% lost" deltaTone="warn"
            sub="Step 4 — portfolio prompt" />
        </div>

        {/* Funnel + chart */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginBottom: 18 }}>
          <Card padding={24}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
              <div>
                <div style={{ fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, marginBottom: 4 }}>Funnel</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>Senior Product Designer</div>
              </div>
              <Btn variant="ghost" small>Change flow ▾</Btn>
            </div>
            {M.funnel.map((f, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ fontWeight: 500 }}>{f.label}</span>
                  <span style={{ color: T.dim }}>
                    {f.value.toLocaleString()} <span style={{ fontFamily: "var(--mono-font)", marginLeft: 8, color: T.muted }}>{f.pct}%</span>
                  </span>
                </div>
                <div style={{ height: 24, background: "#F7F3EB", borderRadius: 6, overflow: "hidden", position: "relative" }}>
                  <div style={{
                    width: `${f.pct}%`, height: "100%",
                    background: `linear-gradient(90deg, var(--brand-primary), rgba(255,149,0,0.75))`,
                    borderRadius: 6, transition: "width 0.4s",
                  }} />
                  {i > 0 && (
                    <div style={{
                      position: "absolute", right: 8, top: 4,
                      fontFamily: "var(--mono-font)", fontSize: 10, color: "#A93A2C",
                    }}>
                      −{M.funnel[i-1].value - f.value}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>

          <Card padding={24}>
            <div style={{ fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, marginBottom: 4 }}>By source</div>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 18 }}>Where candidates come from</div>
            {[
              ["LinkedIn", 542, 43],
              ["Careers page", 318, 25],
              ["Indeed", 201, 16],
              ["Referral", 134, 11],
              ["Direct", 52, 4],
            ].map(([name, n, pct]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13 }}>
                <div style={{ width: 90 }}>{name}</div>
                <div style={{ flex: 1, height: 6, background: "#F7F3EB", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${pct*2.3}%`, height: "100%", background: "var(--brand-primary)" }} />
                </div>
                <div style={{ width: 56, textAlign: "right", fontFamily: "var(--mono-font)", fontSize: 12, color: T.dim }}>{n}</div>
              </div>
            ))}
          </Card>
        </div>

        {/* Flow comparison table */}
        <Card padding={0}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.divider}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Flow performance</div>
            <Btn variant="ghost" small>All flows →</Btn>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#FCFAF6", color: T.dim, textAlign: "left" }}>
                {["Flow", "Opens", "Submissions", "Completion", "Avg. time", "Trend"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", fontWeight: 500, fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: `1px solid ${T.divider}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {M.flows.filter(f => f.status === "published").map((f, i) => (
                <tr key={f.id} style={{ borderBottom: `1px solid ${T.divider}` }}>
                  <td style={{ padding: "12px 16px", fontWeight: 500 }}>{f.name}</td>
                  <td style={{ padding: "12px 16px", color: T.dim }}>{(f.candidates * 2.3).toFixed(0)}</td>
                  <td style={{ padding: "12px 16px", color: T.dim }}>{f.candidates}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 60, height: 5, background: "#F7F3EB", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${f.completionRate}%`, height: "100%", background: "var(--brand-primary)" }} />
                      </div>
                      <span style={{ fontFamily: "var(--mono-font)", fontSize: 11, color: T.dim }}>{f.completionRate}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--mono-font)", color: T.dim }}>{["5:42", "4:18", "3:02", "7:14"][i % 4]}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <Sparkline data={M.daily.slice(i*3, i*3+12)} w={80} h={22} stroke={f.completionRate > 70 ? "#1F6A3A" : "var(--brand-primary)"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ───────────────── DASHBOARD HOME ─────────────────
function ScreenDashboard() {
  const M = window.MOCK;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #FAF8F5)" }}>
      <TopNav current="Dashboard" />
      <PageHeader
        eyebrow="Thursday, April 17"
        title="Good morning, Ada"
        description="Here's what happened since you last checked in — 8 new candidates, 2 flows trending."
        actions={<><Btn variant="secondary" small>View all activity</Btn><Btn small>+ New flow</Btn></>}
      />
      <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
          <Stat label="Active candidates" value="127" delta="+8 today" deltaTone="success" />
          <Stat label="Awaiting review" value="12" delta="4 overdue" deltaTone="warn" />
          <Stat label="Interviews this week" value="9" sub="3 tomorrow" />
          <Stat label="Published flows" value="4" sub="of 6 total" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
          <Card padding={0}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.divider}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Recent candidates</div>
              <Btn variant="ghost" small>See all →</Btn>
            </div>
            {M.candidates.slice(0, 5).map(c => (
              <div key={c.id} style={{ padding: "12px 20px", borderBottom: `1px solid ${T.divider}`, display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar name={c.avatar} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.flow} · {c.stage}</div>
                </div>
                <div style={{ fontFamily: "var(--mono-font)", fontSize: 12, color: T.dim }}>{c.score}</div>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </Card>

          <Card padding={24}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>This week's interviews</div>
            {[
              ["Tue · 10:00", "Maya Thompson", "Portfolio review"],
              ["Tue · 14:30", "Priya Varma", "Technical"],
              ["Wed · 11:00", "Diego Ruiz", "Intro · 30m"],
              ["Thu · 09:00", "Kenji Nakamura", "Portfolio review"],
              ["Fri · 15:00", "Amir Haddad", "Technical"],
            ].map(([time, name, kind], i) => (
              <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 12, marginBottom: 12, borderBottom: i < 4 ? `1px solid ${T.divider}` : "none" }}>
                <div style={{ width: 70, fontFamily: "var(--mono-font)", fontSize: 11, color: T.dim, lineHeight: 1.3, flexShrink: 0 }}>{time}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
                  <div style={{ fontSize: 12, color: T.dim }}>{kind}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: T.ink, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.4, fontWeight: 600, flexShrink: 0,
    }}>{name}</div>
  );
}
function StatusBadge({ status }) {
  const map = { new: ["info", "New"], advancing: ["brand", "Advancing"], hired: ["success", "Hired"], rejected: ["danger", "Rejected"] };
  const [tone, label] = map[status] || ["neutral", status];
  return <Badge tone={tone}>{label}</Badge>;
}

// ───────────────── FLOWS LIST ─────────────────
function ScreenFlows() {
  const M = window.MOCK;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #FAF8F5)" }}>
      <TopNav current="Flows" />
      <PageHeader eyebrow="6 flows" title="Flows" description="Branching video interviews."
        actions={<><Btn variant="secondary" small>Import</Btn><Btn small>+ New flow</Btn></>} />
      <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["All", "Published", "Draft", "Archived"].map((t, i) => (
            <button key={t} style={{
              padding: "6px 14px", borderRadius: 999,
              border: `1px solid ${T.border}`,
              background: i === 0 ? T.ink : "transparent", color: i === 0 ? "#fff" : T.ink,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>{t}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {M.flows.map(f => (
            <Card key={f.id} padding={0} style={{ overflow: "hidden" }}>
              <div style={{
                height: 120, background: `linear-gradient(135deg, rgba(255,149,0,0.18), rgba(255,149,0,0.06)),
                repeating-linear-gradient(135deg, rgba(26,24,21,0.04) 0 10px, transparent 10px 20px)`,
                position: "relative",
              }}>
                <div style={{ position: "absolute", top: 12, right: 12 }}>
                  <Badge tone={f.status === "published" ? "success" : f.status === "draft" ? "warn" : "neutral"}>
                    {f.status}
                  </Badge>
                </div>
                <div style={{ position: "absolute", bottom: 12, left: 14, fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim }}>
                  {f.steps} steps · {f.branches} branches
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{f.name}</div>
                <div style={{ fontFamily: "var(--mono-font)", fontSize: 11, color: T.dim, marginBottom: 14 }}>/f/{f.slug}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.dim }}>
                  <span>{f.candidates} candidates · {f.completionRate}% done</span>
                  <span>{f.lastActive}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────── FLOW BUILDER ─────────────────
function ScreenFlowBuilder() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #FAF8F5)" }}>
      <TopNav current="Flows" />
      {/* Sub-nav */}
      <div style={{ padding: "14px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 16, background: "#fff" }}>
        <a href="#" style={{ fontSize: 13, color: T.dim, textDecoration: "none" }}>Flows /</a>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Senior Product Designer</div>
        <Badge tone="success">Published</Badge>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, background: "#F7F3EB", padding: 2, borderRadius: 8 }}>
          {["Editor", "Schema", "Branding", "Submissions"].map((t, i) => (
            <button key={t} style={{
              padding: "6px 12px", borderRadius: 6, border: "none",
              background: i === 1 ? "#fff" : "transparent",
              color: T.ink, fontSize: 12, fontWeight: 500,
              cursor: "pointer", boxShadow: i === 1 ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
            }}>{t}</button>
          ))}
        </div>
        <Btn variant="secondary" small>Preview</Btn>
        <Btn small>Publish</Btn>
      </div>
      {/* Schema canvas */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden",
        backgroundImage: `radial-gradient(circle, rgba(26,24,21,0.08) 1px, transparent 1px)`,
        backgroundSize: "20px 20px",
      }}>
        {/* Nodes */}
        <SchemaNode top={40} left={40} title="Welcome" sub="mira-welcome · 0:42" tone="start" />
        <SchemaEdge x1={220} y1={85} x2={300} y2={85} />
        <SchemaNode top={40} left={300} title="Work auth?" sub="3 options" />
        <SchemaEdge x1={480} y1={85} x2={560} y2={85} />
        <SchemaNode top={40} left={560} title="Your background" sub="4 options" />
        <SchemaEdge x1={740} y1={105} x2={820} y2={140} />
        <SchemaEdge x1={740} y1={65} x2={820} y2={270} />
        <SchemaNode top={110} left={820} title="Portfolio" sub="Video submission" active />
        <SchemaNode top={240} left={820} title="Polite end" sub="0–2 yr branch" tone="end" />
        <SchemaEdge x1={1000} y1={155} x2={1080} y2={155} />
        <SchemaNode top={110} left={1080} title="Availability" sub="3 options" />
        <SchemaEdge x1={1260} y1={155} x2={1340} y2={155} />
        <SchemaNode top={110} left={1340} title="Thanks" sub="End screen" tone="end" />

        {/* Floating editor panel */}
        <div style={{
          position: "absolute", right: 20, top: 20, bottom: 20, width: 320,
          background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14,
          padding: 20, overflow: "auto", boxShadow: "0 10px 30px -10px rgba(0,0,0,0.1)",
        }}>
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, marginBottom: 4 }}>Editing step</div>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>Portfolio</div>
          <FieldRow label="Video" value="portfolio-prompt.mp4" />
          <FieldRow label="Type" value="Video submission" />
          <FieldRow label="Question" value="Record a 90-second video walking us through one project..." multiline />
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, margin: "20px 0 8px" }}>Submission limits</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <FieldRow label="Min" value="30s" compact />
            <FieldRow label="Max" value="180s" compact />
          </div>
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, margin: "20px 0 8px" }}>Options</div>
          <OptionRow label="Submit recording" next="→ Availability" primary />
          <OptionRow label="I'd rather write it" next="→ Portfolio (text)" />
          <Btn variant="ghost" small>+ Add option</Btn>
        </div>
      </div>
    </div>
  );
}

function SchemaNode({ top, left, title, sub, tone = "mid", active }) {
  const bg = tone === "start" ? "var(--brand-primary)" : tone === "end" ? T.ink : "#fff";
  const fg = tone === "mid" ? T.ink : "#fff";
  return (
    <div style={{
      position: "absolute", top, left, width: 180,
      background: bg, color: fg,
      border: active ? `2px solid var(--brand-primary)` : `1px solid ${tone === "mid" ? T.border : "transparent"}`,
      borderRadius: 10, padding: "12px 14px",
      boxShadow: active ? "0 10px 20px -5px rgba(255,149,0,0.3)" : "0 2px 6px rgba(26,24,21,0.06)",
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, opacity: 0.75, fontFamily: "var(--mono-font)" }}>{sub}</div>
    </div>
  );
}
function SchemaEdge({ x1, y1, x2, y2 }) {
  return <svg style={{ position: "absolute", left: Math.min(x1,x2), top: Math.min(y1,y2), width: Math.abs(x2-x1)+20, height: Math.abs(y2-y1)+20, pointerEvents: "none" }}>
    <path d={`M${x1-Math.min(x1,x2)},${y1-Math.min(y1,y2)} C${(x1+x2)/2-Math.min(x1,x2)},${y1-Math.min(y1,y2)} ${(x1+x2)/2-Math.min(x1,x2)},${y2-Math.min(y1,y2)} ${x2-Math.min(x1,x2)},${y2-Math.min(y1,y2)}`}
      stroke={T.muted} strokeWidth="1.5" fill="none" strokeDasharray="4 4" />
  </svg>;
}
function FieldRow({ label, value, multiline, compact }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: T.dim, marginBottom: 4, fontFamily: "var(--mono-font)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
      <div style={{
        padding: compact ? "6px 10px" : "8px 12px",
        border: `1px solid ${T.border}`, borderRadius: 8,
        fontSize: 13, background: "#FCFAF6",
        lineHeight: multiline ? 1.4 : 1.2, minHeight: multiline ? 60 : "auto",
      }}>{value}</div>
    </div>
  );
}
function OptionRow({ label, next, primary }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 8,
      border: `1px solid ${primary ? "var(--brand-primary)" : T.border}`,
      background: primary ? "#FFF8EC" : "#FCFAF6", marginBottom: 6,
    }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: T.dim, fontFamily: "var(--mono-font)" }}>{next}</div>
    </div>
  );
}

// ───────────────── SUBMISSIONS VIEWER ─────────────────
function ScreenSubmissions() {
  const M = window.MOCK;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #FAF8F5)" }}>
      <TopNav current="Flows" />
      <PageHeader eyebrow="Senior Product Designer · 142 submissions" title="Submissions"
        actions={<><Btn variant="secondary" small>↓ Export CSV</Btn><Btn variant="secondary" small>Filter ▾</Btn></>} />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.2fr 1fr", overflow: "hidden" }}>
        <div style={{ overflow: "auto", borderRight: `1px solid ${T.border}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ position: "sticky", top: 0, background: "#FCFAF6", zIndex: 1 }}>
              <tr>{["", "Candidate", "Score", "Status", "Submitted"].map(h => (
                <th key={h} style={{ padding: "10px 16px", fontWeight: 500, fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, textAlign: "left", borderBottom: `1px solid ${T.divider}` }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {M.candidates.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${T.divider}`, background: i === 0 ? "#FFF8EC" : "transparent" }}>
                  <td style={{ padding: "10px 16px" }}><Avatar name={c.avatar} size={28} /></td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: T.dim, fontFamily: "var(--mono-font)" }}>{c.email}</div>
                  </td>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--mono-font)", fontSize: 12, fontWeight: 600, color: c.score >= 80 ? "#1F6A3A" : c.score >= 60 ? T.ink : "#A93A2C" }}>{c.score}</td>
                  <td style={{ padding: "10px 16px" }}><StatusBadge status={c.status} /></td>
                  <td style={{ padding: "10px 16px", color: T.dim, fontSize: 12 }}>{c.submitted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Detail */}
        <div style={{ padding: 24, overflow: "auto", background: "#fff" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18 }}>
            <Avatar name="MT" size={48} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 600 }}>Maya Thompson</div>
              <div style={{ fontSize: 12, color: T.dim, fontFamily: "var(--mono-font)" }}>maya.t@gmail.com · ses_jfx28ab</div>
            </div>
            <Btn small>Advance</Btn>
            <Btn variant="secondary" small>Reject</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}>
            {[["Score", "92"], ["Time", "5:18"], ["Stage", "Portfolio review"]].map(([l, v]) => (
              <div key={l} style={{ padding: 10, background: "#F7F3EB", borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: T.dim, fontFamily: "var(--mono-font)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{l}</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.dim, marginBottom: 10 }}>Answers</div>
          {[
            ["Work authorization", "Yes"],
            ["Years of experience", "6–9 years"],
            ["Portfolio", "🎥 Recorded 1:42 — transcript available"],
            ["Availability", "Within 2 weeks"],
          ].map(([q, a]) => (
            <div key={q} style={{ padding: "12px 0", borderBottom: `1px solid ${T.divider}` }}>
              <div style={{ fontSize: 12, color: T.dim, marginBottom: 4 }}>{q}</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────── CANDIDATES CRM ─────────────────
function ScreenCandidates() {
  const M = window.MOCK;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #FAF8F5)" }}>
      <TopNav current="Candidates" />
      <PageHeader eyebrow="All flows" title="Candidates" description="Everyone who's submitted across your flows."
        actions={<><Btn variant="secondary" small>Filter ▾</Btn><Btn small>+ Add manually</Btn></>} />
      <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
        {/* Pipeline view */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            ["New", "new", ["c_02", "c_06", "c_08"]],
            ["Advancing", "advancing", ["c_01", "c_03", "c_05", "c_07"]],
            ["Hired", "hired", ["c_09"]],
            ["Rejected", "rejected", ["c_04", "c_10"]],
          ].map(([label, status, ids]) => (
            <div key={label}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <StatusBadge status={status} />
                <span style={{ fontFamily: "var(--mono-font)", fontSize: 11, color: T.dim }}>{ids.length}</span>
              </div>
              {ids.map(id => {
                const c = M.candidates.find(x => x.id === id);
                return (
                  <Card key={id} padding={14} style={{ marginBottom: 8, cursor: "pointer" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                      <Avatar name={c.avatar} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.flow}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.dim }}>
                      <span style={{ fontFamily: "var(--mono-font)" }}>Score {c.score}</span>
                      <span>{c.submitted}</span>
                    </div>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.SCREENS_PART1 = { ScreenAnalytics, ScreenDashboard, ScreenFlows, ScreenFlowBuilder, ScreenSubmissions, ScreenCandidates };
