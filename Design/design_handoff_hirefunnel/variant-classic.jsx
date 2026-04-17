// Variant 1 — Classic Sidebar
// Warm off-white, Be Vietnam Pro, video left + question sidebar right.
// The most "by-the-book" option — familiar VideoAsk-like flow, polished.

const { useState: v1US, useEffect: v1UE } = React;

function VariantClassic({ flow, tweaks }) {
  const e = useFlowEngine(flow, "classic");
  const [playing, setPlaying] = v1US(false);

  // Auto-advance: once video ends AND options appear, if there's a single
  // "primary" option we highlight with a soft countdown.
  const [autoT, setAutoT] = v1US(null);
  v1UE(() => {
    if (!tweaks.autoAdvance || !e.videoEnded) return;
    const s = e.step;
    if (!s || !s.options) return;
    const primary = s.options.find((o) => o.primary) || s.options[0];
    if (s.options.length > 1 && !s.options.find((o) => o.primary)) return;
    const id = setTimeout(() => e.choose(primary), 4200);
    setAutoT(id);
    return () => clearTimeout(id);
  }, [e.videoEnded, e.stepId, tweaks.autoAdvance]);

  const isDark = tweaks.theme === "dark";
  const panelPos = tweaks.panelPosition; // "sidebar" | "overlay" | "below"

  // Theme tokens
  const bg = isDark ? "#15120f" : "#FAF8F5";
  const card = isDark ? "#1c1814" : "#FFFFFF";
  const ink = isDark ? "rgba(255,255,255,0.94)" : "#1a1815";
  const dim = isDark ? "rgba(255,255,255,0.6)" : "#59595A";
  const border = isDark ? "rgba(255,255,255,0.08)" : "#EDE6D9";

  return (
    <div
      className="v1-root"
      style={{
        minHeight: "100%",
        background: bg,
        color: ink,
        fontFamily: "var(--body-font)",
        padding: "32px 24px 80px",
        boxSizing: "border-box",
      }}
    >
      <Header variant="classic" flow={flow} e={e} tweaks={tweaks} />

      <div style={{ maxWidth: 1280, margin: "32px auto 0" }}>
        {e.screen === "start" && (
          <StartCard flow={flow} e={e} card={card} ink={ink} dim={dim} border={border} isDark={isDark} tweaks={tweaks} />
        )}
        {e.screen === "step" && e.step && (
          <StepLayout
            flow={flow}
            e={e}
            playing={playing}
            setPlaying={setPlaying}
            tweaks={tweaks}
            card={card}
            ink={ink}
            dim={dim}
            border={border}
            isDark={isDark}
            panelPos={panelPos}
          />
        )}
        {e.screen === "end" && (
          <EndCard flow={flow} e={e} card={card} ink={ink} dim={dim} border={border} isDark={isDark} />
        )}
      </div>
    </div>
  );
}

// ───────────── Header ─────────────
function Header({ flow, e, tweaks }) {
  const isDark = tweaks.theme === "dark";
  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Wordmark isDark={isDark} />
        <div
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: isDark ? "rgba(255,255,255,0.55)" : "#808080",
            padding: "4px 10px",
            borderRadius: 999,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "#EDE6D9"}`,
          }}
        >
          {flow.company}
        </div>
      </div>
      {e.screen === "step" && (
        <div style={{ flex: "0 1 320px", minWidth: 200 }}>
          <ProgressIndicator
            kind={tweaks.progressKind}
            step={e.progressStep}
            total={e.progressTotal}
            theme={isDark ? "dark" : "light"}
          />
        </div>
      )}
      {(e.screen !== "start" || Object.keys(e.answers).length > 0) && (
        <button
          onClick={e.reset}
          style={{
            background: "transparent",
            border: "none",
            color: isDark ? "rgba(255,255,255,0.6)" : "#808080",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "var(--mono-font)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          ↺ Restart
        </button>
      )}
    </div>
  );
}

function Wordmark({ isDark }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 32, height: 32, borderRadius: 9,
          background: "var(--brand-primary)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white", fontWeight: 700, fontSize: 17,
          boxShadow: "0 6px 14px rgba(255,149,0,0.28)",
        }}
      >
        h
      </div>
      <div style={{ fontWeight: 600, fontSize: 18, color: isDark ? "white" : "#1a1815", letterSpacing: "-0.01em" }}>
        Hirefunnel
      </div>
    </div>
  );
}

// ───────────── Start + Form (combined) ─────────────
function StartCard({ flow, e, card, ink, dim, border, isDark, tweaks }) {
  const [step, setStep] = v1US("welcome"); // welcome | form
  return (
    <div
      style={{
        background: card,
        border: `1px solid ${border}`,
        borderRadius: 20,
        padding: "clamp(28px, 4vw, 56px)",
        maxWidth: 760,
        margin: "40px auto",
        boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.4)" : "0 20px 60px rgba(26,24,21,0.06)",
      }}
    >
      {step === "welcome" && (
        <>
          <div
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--brand-primary)",
              marginBottom: 14,
            }}
          >
            Video Interview · ~6 min
          </div>
          <h1
            style={{
              fontSize: "clamp(32px, 4.5vw, 52px)",
              lineHeight: 1.05,
              margin: "0 0 20px",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              textWrap: "balance",
            }}
          >
            Hi — thanks for applying to {flow.name}.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: dim, margin: "0 0 28px", maxWidth: 560 }}>
            {flow.startCopy}
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 28 }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "var(--brand-primary)",
                color: "white", fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15,
              }}
            >
              {flow.recruiter.initials}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{flow.recruiter.name}</div>
              <div style={{ fontSize: 13, color: dim }}>{flow.recruiter.role}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={btnPrimary()} onClick={() => setStep("form")}>Start interview →</button>
            <button style={btnSecondary(isDark ? "dark" : "light")}>Preview in 30 seconds</button>
          </div>
        </>
      )}

      {step === "form" && (
        <>
          <div
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: dim,
              marginBottom: 14,
            }}
          >
            Step 0 · Who's applying
          </div>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 34px)", margin: "0 0 8px", fontWeight: 600, letterSpacing: "-0.02em" }}>
            Let's get your details
          </h2>
          <p style={{ color: dim, margin: "0 0 28px", fontSize: 16 }}>
            We'll use these to send updates about your application.
          </p>
          <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
            <Field
              label="Full name"
              value={e.form.name}
              onChange={(v) => e.setForm({ ...e.form, name: v })}
              placeholder="Ada Lovelace"
              error={e.formErrors.name}
              isDark={isDark}
            />
            <Field
              label="Email"
              type="email"
              value={e.form.email}
              onChange={(v) => e.setForm({ ...e.form, email: v })}
              placeholder="ada@domain.com"
              error={e.formErrors.email}
              isDark={isDark}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <button style={btnSecondary(isDark ? "dark" : "light")} onClick={() => setStep("welcome")}>
                ← Back
              </button>
              <button style={btnPrimary()} onClick={e.submitForm}>
                Start the interview
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, error, isDark }) {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 6,
          color: isDark ? "rgba(255,255,255,0.8)" : "#333333",
        }}
      >
        {label}
      </div>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(ev) => onChange(ev.target.value)}
        style={{
          width: "100%",
          padding: "13px 14px",
          borderRadius: "var(--btn-radius, 10px)",
          border: `1px solid ${error ? "#EF4444" : isDark ? "rgba(255,255,255,0.15)" : "#E4DFD3"}`,
          background: isDark ? "#0F0C09" : "#FCFAF6",
          color: isDark ? "white" : "#1a1815",
          fontSize: 15,
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color 0.15s",
        }}
      />
      {error && (
        <div style={{ color: "#EF4444", fontSize: 12, marginTop: 6, fontFamily: "var(--mono-font)" }}>
          {error}
        </div>
      )}
    </label>
  );
}

// ───────────── Step layout ─────────────
function StepLayout({ flow, e, playing, setPlaying, tweaks, card, ink, dim, border, isDark, panelPos }) {
  const s = e.step;
  const isRecord = s.kind === "submission_video";
  const isText = s.kind === "submission_text";

  const panel = (
    <QuestionPanel
      step={s}
      e={e}
      tweaks={tweaks}
      dim={dim}
      ink={ink}
      isDark={isDark}
      border={border}
      card={card}
    />
  );

  const videoEl = isRecord ? (
    <RecorderPanel
      step={s}
      onSubmit={() => e.choose(s.options.find((o) => o.id === "submitted") || s.options[0])}
      onCancel={() => e.choose(s.options.find((o) => o.id === "text") || s.options[0])}
      theme={isDark ? "dark" : "light"}
    />
  ) : (
    <VideoSurface
      label={s.videoLabel}
      speaker={s.speaker}
      duration={s.duration}
      playing={playing}
      setPlaying={setPlaying}
      onEnded={() => e.setVideoEnded(true)}
      tint={isDark ? "dark" : "orange"}
      radius={16}
    />
  );

  if (panelPos === "overlay") {
    return (
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <StepHeader step={s} dim={dim} ink={ink} />
        <div style={{ position: "relative" }}>
          {videoEl}
          {!isRecord && (
            <div
              style={{
                position: "absolute",
                inset: "auto 20px 20px",
                borderRadius: 14,
                background:
                  isDark
                    ? "rgba(15,12,9,0.88)"
                    : "rgba(255,255,255,0.94)",
                backdropFilter: "blur(16px)",
                padding: 18,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(26,24,21,0.08)"}`,
                maxHeight: "55%",
                overflow: "auto",
              }}
            >
              {panel}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (panelPos === "below") {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <StepHeader step={s} dim={dim} ink={ink} />
        {videoEl}
        {!isRecord && (
          <div
            style={{
              marginTop: 24,
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 16,
              padding: 28,
            }}
          >
            {panel}
          </div>
        )}
      </div>
    );
  }

  // sidebar (default)
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.45fr) minmax(300px, 1fr)",
        gap: 24,
        alignItems: "start",
      }}
      className="v1-grid"
    >
      <div>
        <StepHeader step={s} dim={dim} ink={ink} />
        {videoEl}
      </div>
      {!isRecord && (
        <div
          style={{
            background: card,
            border: `1px solid ${border}`,
            borderRadius: 16,
            padding: 28,
            position: "sticky",
            top: 24,
          }}
        >
          {panel}
        </div>
      )}
    </div>
  );
}

function StepHeader({ step, dim, ink }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontFamily: "var(--mono-font)",
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: dim,
          marginBottom: 8,
        }}
      >
        {step.speaker} · {step.duration}
      </div>
      <h2
        style={{
          fontSize: "clamp(22px, 2.6vw, 30px)",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          margin: 0,
          color: ink,
          textWrap: "balance",
        }}
      >
        {step.title}
      </h2>
    </div>
  );
}

function QuestionPanel({ step, e, tweaks, dim, ink, isDark, border, card }) {
  const isText = step.kind === "submission_text";

  if (isText) {
    const ok = e.textAnswer.length >= step.minChars;
    return (
      <div>
        <div
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: dim,
            marginBottom: 10,
          }}
        >
          Your answer
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 17, lineHeight: 1.45, color: ink, fontWeight: 500 }}>
          {step.question}
        </p>
        <textarea
          value={e.textAnswer}
          onChange={(ev) => e.setTextAnswer(ev.target.value)}
          placeholder="Start typing..."
          rows={6}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 10,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#E4DFD3"}`,
            background: isDark ? "#0F0C09" : "#FCFAF6",
            color: isDark ? "white" : "#1a1815",
            fontFamily: "inherit",
            fontSize: 15,
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: dim, fontFamily: "var(--mono-font)" }}>
          <span>{e.textAnswer.length} / {step.minChars}+ chars</span>
          <span>{ok ? "Ready" : "Keep going"}</span>
        </div>
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => ok && e.choose(step.options[0])}
            disabled={!ok}
            style={{ ...btnPrimary(), opacity: ok ? 1 : 0.4, cursor: ok ? "pointer" : "not-allowed", width: "100%" }}
          >
            Submit answer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontFamily: "var(--mono-font)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: dim,
          marginBottom: 10,
        }}
      >
        Question
      </div>
      <p style={{ margin: "0 0 20px", fontSize: 18, lineHeight: 1.4, color: ink, fontWeight: 500, textWrap: "balance" }}>
        {step.question}
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {step.options.map((opt) => (
          <OptionButton key={opt.id} opt={opt} onClick={() => e.choose(opt)} isDark={isDark} />
        ))}
      </div>
      {e.history.length > 0 && (
        <button
          onClick={e.back}
          style={{
            marginTop: 14, background: "transparent", border: "none", cursor: "pointer",
            color: dim, fontFamily: "var(--mono-font)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em",
          }}
        >
          ← Previous question
        </button>
      )}
    </div>
  );
}

function OptionButton({ opt, onClick, isDark }) {
  return (
    <button
      onClick={onClick}
      className="v1-option"
      style={{
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: "var(--btn-radius, 10px)",
        border: `1px solid ${
          opt.primary
            ? "var(--brand-primary)"
            : isDark
            ? "rgba(255,255,255,0.14)"
            : "#E4DFD3"
        }`,
        background: opt.primary
          ? "var(--brand-primary)"
          : isDark
          ? "rgba(255,255,255,0.04)"
          : "#FCFAF6",
        color: opt.primary ? "white" : isDark ? "rgba(255,255,255,0.92)" : "#1a1815",
        fontSize: 15,
        fontWeight: opt.primary ? 600 : 500,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        transition: "all 0.15s ease",
      }}
    >
      <span>{opt.text}</span>
      <span style={{ fontSize: 14, opacity: 0.7 }}>→</span>
    </button>
  );
}

// ───────────── End ─────────────
function EndCard({ flow, e, card, ink, dim, border, isDark }) {
  const s = e.step;
  return (
    <div
      style={{
        background: card,
        border: `1px solid ${border}`,
        borderRadius: 20,
        padding: "clamp(28px, 4vw, 56px)",
        maxWidth: 680,
        margin: "60px auto",
        textAlign: "center",
        boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.4)" : "0 20px 60px rgba(26,24,21,0.06)",
      }}
    >
      <div
        style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--brand-primary)",
          color: "white",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, marginBottom: 20,
        }}
      >
        ✓
      </div>
      <h2
        style={{
          fontSize: "clamp(28px, 4vw, 42px)",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          margin: "0 0 14px",
          textWrap: "balance",
        }}
      >
        {s.headline}
      </h2>
      <p style={{ color: dim, fontSize: 17, lineHeight: 1.55, margin: "0 0 28px", textWrap: "pretty" }}>
        {s.body}
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {s.cta && <button style={btnPrimary()}>{s.cta.text}</button>}
        <button style={btnSecondary(isDark ? "dark" : "light")} onClick={e.reset}>
          Start over
        </button>
      </div>
      <div
        style={{
          marginTop: 32, paddingTop: 20,
          borderTop: `1px solid ${border}`,
          fontFamily: "var(--mono-font)", fontSize: 11,
          color: dim, letterSpacing: "0.08em", textTransform: "uppercase",
        }}
      >
        Session ID · ses_{Math.random().toString(36).slice(2, 10)}
      </div>
    </div>
  );
}

window.VariantClassic = VariantClassic;
