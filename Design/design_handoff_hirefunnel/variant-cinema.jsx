// Variant 2 — Cinema Overlay
// Full-bleed dark video stage, editorial serif display, question
// floats as a backdrop-blur card. Dots progress, quiet chrome.

const { useState: v2US, useEffect: v2UE } = React;

function VariantCinema({ flow, tweaks }) {
  const e = useFlowEngine(flow, "cinema");
  const [playing, setPlaying] = v2US(false);

  v2UE(() => {
    if (!tweaks.autoAdvance || !e.videoEnded) return;
    const s = e.step;
    if (!s?.options) return;
    const primary = s.options.find((o) => o.primary);
    if (!primary) return;
    const id = setTimeout(() => e.choose(primary), 4500);
    return () => clearTimeout(id);
  }, [e.videoEnded, e.stepId, tweaks.autoAdvance]);

  const bg = "#0a0907";
  const ink = "rgba(255,255,255,0.95)";
  const dim = "rgba(255,255,255,0.55)";

  return (
    <div
      style={{
        minHeight: "100%",
        background: bg,
        color: ink,
        fontFamily: "var(--body-font)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Soft top gradient */}
      <div
        style={{
          position: "absolute", inset: 0,
          background:
            "radial-gradient(1000px 600px at 50% -10%, rgba(255,149,0,0.08), transparent 60%)",
          pointerEvents: "none",
        }}
      />

      {/* Header */}
      <div
        style={{
          position: "relative", zIndex: 2,
          padding: "28px 40px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 20, flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: "var(--brand-primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontWeight: 700, fontSize: 14,
            }}
          >
            h
          </div>
          <div style={{ fontWeight: 500, fontSize: 15, letterSpacing: "-0.01em" }}>
            Hirefunnel
          </div>
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)" }} />
          <div
            style={{
              fontFamily: "var(--mono-font)", fontSize: 11,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: dim,
            }}
          >
            {flow.company} · {flow.name}
          </div>
        </div>

        {e.screen === "step" && (
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <ProgressIndicator
              kind={tweaks.progressKind}
              step={e.progressStep}
              total={e.progressTotal}
              theme="dark"
            />
            <button
              onClick={e.reset}
              style={{
                background: "transparent", border: "none", color: dim,
                fontFamily: "var(--mono-font)", fontSize: 11,
                letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
              }}
            >
              ↺ Restart
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, padding: "8px 40px 60px" }}>
        {e.screen === "start" && <CinemaStart flow={flow} e={e} />}
        {e.screen === "step" && e.step && (
          <CinemaStep flow={flow} e={e} playing={playing} setPlaying={setPlaying} tweaks={tweaks} />
        )}
        {e.screen === "end" && <CinemaEnd flow={flow} e={e} />}
      </div>
    </div>
  );
}

function CinemaStart({ flow, e }) {
  const [step, setStep] = v2US("welcome");
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 0" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(280px, 1fr)",
          gap: 48,
          alignItems: "center",
        }}
        className="v2-hero"
      >
        <div>
          <div
            style={{
              fontFamily: "var(--mono-font)", fontSize: 11,
              letterSpacing: "0.18em", textTransform: "uppercase",
              color: "var(--brand-primary)", marginBottom: 22,
            }}
          >
            ○ Video interview · 6 min
          </div>
          <h1
            style={{
              fontFamily: "var(--display-font)",
              fontSize: "clamp(44px, 6.5vw, 92px)",
              lineHeight: 0.98,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              margin: "0 0 22px",
              textWrap: "balance",
            }}
          >
            Let's meet, <em style={{ fontStyle: "italic", color: "var(--brand-primary)" }}>over video.</em>
          </h1>
          <p
            style={{
              fontSize: 19, lineHeight: 1.55,
              color: "rgba(255,255,255,0.7)",
              margin: "0 0 32px",
              maxWidth: 520,
            }}
          >
            {flow.startCopy}
          </p>

          {step === "welcome" ? (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button style={btnPrimary()} onClick={() => setStep("form")}>Begin →</button>
              <button style={btnSecondary("dark")}>How it works</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14, maxWidth: 420 }}>
              <CinemaField
                label="Your name"
                value={e.form.name}
                onChange={(v) => e.setForm({ ...e.form, name: v })}
                error={e.formErrors.name}
              />
              <CinemaField
                label="Email"
                type="email"
                value={e.form.email}
                onChange={(v) => e.setForm({ ...e.form, email: v })}
                error={e.formErrors.email}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button style={btnSecondary("dark")} onClick={() => setStep("welcome")}>← Back</button>
                <button style={btnPrimary()} onClick={e.submitForm}>Continue</button>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            aspectRatio: "3/4",
            borderRadius: 20,
            overflow: "hidden",
            background:
              "repeating-linear-gradient(135deg, rgba(255,149,0,0.2) 0 12px, rgba(255,149,0,0.08) 12px 24px), linear-gradient(160deg, #2a2016, #0a0907)",
            position: "relative",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              justifyContent: "flex-end", padding: 24,
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
                color: "rgba(255,255,255,0.6)", marginBottom: 6,
              }}
            >
              Your host
            </div>
            <div
              style={{
                fontFamily: "var(--display-font)",
                fontSize: 32, fontWeight: 400, letterSpacing: "-0.02em",
              }}
            >
              {flow.recruiter.name}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
              {flow.recruiter.role}, {flow.company}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CinemaField({ label, value, onChange, type = "text", error }) {
  return (
    <label>
      <div
        style={{
          fontFamily: "var(--mono-font)",
          fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)", marginBottom: 6,
        }}
      >
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        style={{
          width: "100%", padding: "13px 0",
          background: "transparent",
          border: "none",
          borderBottom: `1px solid ${error ? "#F87171" : "rgba(255,255,255,0.2)"}`,
          color: "white", fontSize: 17, fontFamily: "inherit",
          outline: "none", boxSizing: "border-box",
        }}
      />
      {error && (
        <div style={{ color: "#F87171", fontSize: 11, marginTop: 4, fontFamily: "var(--mono-font)" }}>
          {error}
        </div>
      )}
    </label>
  );
}

function CinemaStep({ flow, e, playing, setPlaying, tweaks }) {
  const s = e.step;
  const isRecord = s.kind === "submission_video";
  const isText = s.kind === "submission_text";
  const pos = tweaks.panelPosition;

  const videoEl = isRecord ? (
    <RecorderPanel
      step={s}
      onSubmit={() => e.choose(s.options.find((o) => o.id === "submitted") || s.options[0])}
      onCancel={() => e.choose(s.options.find((o) => o.id === "text") || s.options[0])}
      theme="dark"
    />
  ) : (
    <VideoSurface
      label={s.videoLabel}
      speaker={s.speaker}
      duration={s.duration}
      playing={playing}
      setPlaying={setPlaying}
      onEnded={() => e.setVideoEnded(true)}
      tint="dark"
      radius={18}
    />
  );

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <div
        style={{
          marginBottom: 16,
          display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontFamily: "var(--mono-font)", fontSize: 11,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          {String(e.progressStep + 1).padStart(2, "0")} · {s.speaker}
        </div>
        <h2
          style={{
            fontFamily: "var(--display-font)",
            fontSize: "clamp(26px, 3.4vw, 42px)",
            fontWeight: 400, letterSpacing: "-0.02em",
            margin: 0,
            textWrap: "balance",
          }}
        >
          {s.title}
        </h2>
      </div>

      {pos === "below" ? (
        <>
          {videoEl}
          {!isRecord && <CinemaPanel step={s} e={e} />}
        </>
      ) : pos === "sidebar" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) minmax(320px, 1fr)",
            gap: 28, alignItems: "start",
          }}
          className="v2-grid"
        >
          <div>{videoEl}</div>
          {!isRecord && (
            <div
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 18,
                padding: 28,
                position: "sticky", top: 24,
              }}
            >
              <CinemaPanel step={s} e={e} inline />
            </div>
          )}
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          {videoEl}
          {!isRecord && (
            <div
              style={{
                position: "absolute", inset: "auto 24px 24px",
                padding: 24,
                borderRadius: 18,
                background: "rgba(10, 9, 7, 0.72)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <CinemaPanel step={s} e={e} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CinemaPanel({ step, e, compact, inline }) {
  const isText = step.kind === "submission_text";

  if (isText) {
    const ok = e.textAnswer.length >= step.minChars;
    return (
      <div style={{ marginTop: inline ? 0 : 28 }}>
        <div
          style={{
            fontFamily: "var(--mono-font)", fontSize: 11,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.5)", marginBottom: 8,
          }}
        >
          Your answer
        </div>
        <p style={{ fontSize: 18, lineHeight: 1.4, color: "rgba(255,255,255,0.92)", margin: "0 0 14px" }}>
          {step.question}
        </p>
        <textarea
          value={e.textAnswer}
          onChange={(ev) => e.setTextAnswer(ev.target.value)}
          placeholder="Start typing..."
          rows={5}
          style={{
            width: "100%", padding: 14, borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "white", fontFamily: "inherit", fontSize: 15,
            outline: "none", resize: "vertical", boxSizing: "border-box",
          }}
        />
        <div
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginTop: 12, gap: 10, flexWrap: "wrap",
          }}
        >
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            {e.textAnswer.length} / {step.minChars}+ chars
          </div>
          <button
            style={{ ...btnPrimary(), opacity: ok ? 1 : 0.4, cursor: ok ? "pointer" : "not-allowed" }}
            onClick={() => ok && e.choose(step.options[0])}
            disabled={!ok}
          >
            Submit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: inline || compact ? 0 : 28 }}>
      <div
        style={{
          fontFamily: "var(--mono-font)", fontSize: 11,
          letterSpacing: "0.12em", textTransform: "uppercase",
          color: "rgba(255,255,255,0.5)", marginBottom: 10,
        }}
      >
        Question
      </div>
      <p
        style={{
          fontFamily: "var(--display-font)",
          fontSize: compact ? 22 : 26,
          lineHeight: 1.2,
          fontWeight: 400, letterSpacing: "-0.01em",
          color: "white", margin: "0 0 18px",
          textWrap: "balance",
        }}
      >
        {step.question}
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {step.options.map((opt, i) => (
          <button
            key={opt.id}
            onClick={() => e.choose(opt)}
            className="v2-opt"
            style={{
              textAlign: "left", padding: "12px 16px",
              borderRadius: "var(--btn-radius, 10px)",
              border: `1px solid ${opt.primary ? "var(--brand-primary)" : "rgba(255,255,255,0.12)"}`,
              background: opt.primary ? "var(--brand-primary)" : "rgba(255,255,255,0.03)",
              color: "white",
              fontSize: 15, fontWeight: opt.primary ? 600 : 500,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10, transition: "all 0.15s ease",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontFamily: "var(--mono-font)",
                  fontSize: 10,
                  color: opt.primary ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)",
                  minWidth: 18,
                }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              {opt.text}
            </span>
            <span style={{ opacity: 0.7 }}>→</span>
          </button>
        ))}
      </div>
      {e.history.length > 0 && (
        <button
          onClick={e.back}
          style={{
            marginTop: 12, background: "transparent", border: "none",
            color: "rgba(255,255,255,0.5)", cursor: "pointer",
            fontFamily: "var(--mono-font)", fontSize: 11,
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}
        >
          ← Previous
        </button>
      )}
    </div>
  );
}

function CinemaEnd({ flow, e }) {
  const s = e.step;
  return (
    <div style={{ maxWidth: 720, margin: "80px auto", textAlign: "center" }}>
      <div
        style={{
          fontFamily: "var(--mono-font)", fontSize: 11,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: "var(--brand-primary)", marginBottom: 20,
        }}
      >
        ◎ Submitted
      </div>
      <h1
        style={{
          fontFamily: "var(--display-font)",
          fontSize: "clamp(40px, 6vw, 78px)",
          lineHeight: 1,
          fontWeight: 400, letterSpacing: "-0.02em",
          margin: "0 0 22px",
          textWrap: "balance",
        }}
      >
        {s.headline}<em style={{ fontStyle: "italic", color: "var(--brand-primary)" }}>.</em>
      </h1>
      <p
        style={{
          fontSize: 19, lineHeight: 1.55, color: "rgba(255,255,255,0.65)",
          margin: "0 auto 36px", maxWidth: 520, textWrap: "pretty",
        }}
      >
        {s.body}
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {s.cta && <button style={btnPrimary()}>{s.cta.text}</button>}
        <button style={btnSecondary("dark")} onClick={e.reset}>Start over</button>
      </div>
    </div>
  );
}

window.VariantCinema = VariantCinema;
