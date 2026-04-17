// Variant 3 — Paper Studio
// Cream / paper canvas, warm olive accent, tactile "index card" chips for
// options, horizontal stepper with labels, monospace sprinkled throughout.
// The most unexpected / editorial of the three.

const { useState: v3US, useEffect: v3UE } = React;

function VariantPaper({ flow, tweaks }) {
  const e = useFlowEngine(flow, "paper");
  const [playing, setPlaying] = v3US(false);

  v3UE(() => {
    if (!tweaks.autoAdvance || !e.videoEnded) return;
    const s = e.step;
    if (!s?.options) return;
    const primary = s.options.find((o) => o.primary);
    if (!primary) return;
    const id = setTimeout(() => e.choose(primary), 4500);
    return () => clearTimeout(id);
  }, [e.videoEnded, e.stepId, tweaks.autoAdvance]);

  const isDark = tweaks.theme === "dark";
  const bg = isDark ? "#17140f" : "#F1EBE1";
  const paper = isDark ? "#1f1b15" : "#FAF5EA";
  const ink = isDark ? "rgba(255,248,235,0.95)" : "#2a2520";
  const dim = isDark ? "rgba(255,248,235,0.55)" : "#6B6254";
  const line = isDark ? "rgba(255,248,235,0.1)" : "rgba(42,37,32,0.12)";

  return (
    <div
      style={{
        minHeight: "100%",
        background: bg,
        color: ink,
        fontFamily: "var(--body-font)",
        padding: "28px clamp(16px, 4vw, 48px) 80px",
        boxSizing: "border-box",
        backgroundImage:
          isDark
            ? "radial-gradient(circle at 20% 0%, rgba(255,149,0,0.04), transparent 50%)"
            : "radial-gradient(circle at 20% 0%, rgba(255,149,0,0.06), transparent 55%)",
      }}
    >
      {/* Header */}
      <div
        style={{
          maxWidth: 1240, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 20, flexWrap: "wrap",
          paddingBottom: 22,
          borderBottom: `1px dashed ${line}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 34, height: 34, borderRadius: 8,
              background: ink, color: bg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 18, fontFamily: "var(--display-font)",
            }}
          >
            h
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>
              Hirefunnel
            </div>
            <div
              style={{
                fontFamily: "var(--mono-font)", fontSize: 10,
                letterSpacing: "0.12em", textTransform: "uppercase",
                color: dim, marginTop: 1,
              }}
            >
              A hiring studio
            </div>
          </div>
        </div>
        <div
          style={{
            fontFamily: "var(--mono-font)", fontSize: 11,
            letterSpacing: "0.1em", textTransform: "uppercase",
            color: dim,
          }}
        >
          {flow.company} / {flow.name}
        </div>
      </div>

      {/* Stepper */}
      {e.screen === "step" && (
        <div style={{ maxWidth: 1240, margin: "22px auto 0" }}>
          <PaperStepper e={e} flow={flow} tweaks={tweaks} ink={ink} dim={dim} line={line} />
        </div>
      )}

      <div style={{ maxWidth: 1240, margin: "32px auto 0" }}>
        {e.screen === "start" && (
          <PaperStart flow={flow} e={e} paper={paper} ink={ink} dim={dim} line={line} isDark={isDark} />
        )}
        {e.screen === "step" && e.step && (
          <PaperStep
            flow={flow} e={e}
            playing={playing} setPlaying={setPlaying}
            tweaks={tweaks} paper={paper} ink={ink} dim={dim} line={line} isDark={isDark}
          />
        )}
        {e.screen === "end" && (
          <PaperEnd flow={flow} e={e} paper={paper} ink={ink} dim={dim} line={line} isDark={isDark} />
        )}
      </div>
    </div>
  );
}

function PaperStepper({ e, flow, tweaks, ink, dim, line }) {
  // Override dots/bar with our own horizontal stepper with labels,
  // but honor tweaks.progressKind for the top bar view.
  if (tweaks.progressKind === "bar") {
    return (
      <ProgressIndicator
        kind="bar" step={e.progressStep} total={e.progressTotal}
        theme={ink.includes("255") ? "dark" : "light"}
      />
    );
  }
  const labels = flow.happyPath.map((id) => flow.steps[id]?.title || id);
  return (
    <div
      style={{
        display: "flex", gap: 10, alignItems: "center",
        overflow: "auto", paddingBottom: 6,
      }}
    >
      {labels.map((label, i) => {
        const done = i < e.progressStep;
        const current = i === e.progressStep;
        return (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              flex: "0 0 auto",
            }}
          >
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px",
                borderRadius: 999,
                border: `1px ${current ? "solid" : "dashed"} ${
                  current ? "var(--brand-primary)" : line
                }`,
                background: done ? "var(--brand-primary)" : "transparent",
                color: done ? "white" : current ? ink : dim,
                fontFamily: "var(--mono-font)",
                fontSize: 11,
                letterSpacing: "0.05em",
                whiteSpace: "nowrap",
                transition: "all 0.2s ease",
              }}
            >
              <span style={{ fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ textTransform: "uppercase" }}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div style={{ width: 14, height: 1, background: line }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PaperStart({ flow, e, paper, ink, dim, line, isDark }) {
  const [step, setStep] = v3US("welcome");
  return (
    <div style={{ maxWidth: 920, margin: "24px auto 0" }}>
      <div
        style={{
          background: paper,
          border: `1px solid ${line}`,
          borderRadius: 20,
          padding: "clamp(28px, 4vw, 56px)",
          position: "relative",
          boxShadow: isDark ? "none" : "0 1px 0 rgba(42,37,32,0.04), 0 20px 40px -20px rgba(42,37,32,0.2)",
        }}
      >
        {/* Top stamp */}
        <div
          style={{
            position: "absolute", top: 20, right: 20,
            padding: "6px 10px",
            borderRadius: 4,
            border: `1px solid var(--brand-primary)`,
            color: "var(--brand-primary)",
            fontFamily: "var(--mono-font)", fontSize: 10,
            letterSpacing: "0.14em", textTransform: "uppercase",
            transform: "rotate(2deg)",
          }}
        >
          File no. 2410 / Open
        </div>

        {step === "welcome" && (
          <>
            <div
              style={{
                fontFamily: "var(--mono-font)", fontSize: 11,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: dim, marginBottom: 18,
              }}
            >
              Case file · Applicant intake
            </div>
            <h1
              style={{
                fontFamily: "var(--display-font)",
                fontSize: "clamp(38px, 5.5vw, 68px)",
                lineHeight: 1,
                fontWeight: 400, letterSpacing: "-0.02em",
                margin: "0 0 22px", textWrap: "balance",
              }}
            >
              Welcome to the studio.
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.55, color: dim, margin: "0 0 32px", maxWidth: 560, textWrap: "pretty" }}>
              {flow.startCopy}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 14, marginBottom: 32,
              }}
            >
              {[
                ["05", "Quick questions"],
                ["01", "90s recorded answer"],
                ["~06", "Minutes, tops"],
              ].map(([num, label]) => (
                <div
                  key={label}
                  style={{
                    padding: 16,
                    background: isDark ? "rgba(255,255,255,0.03)" : "rgba(42,37,32,0.03)",
                    borderRadius: 12,
                    border: `1px dashed ${line}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--display-font)",
                      fontSize: 34, fontWeight: 500, lineHeight: 1,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {num}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontFamily: "var(--mono-font)", fontSize: 11,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      color: dim,
                    }}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button style={btnPrimary()} onClick={() => setStep("form")}>
                Open the file →
              </button>
              <button style={btnSecondary(isDark ? "dark" : "light")}>
                Read the role first
              </button>
            </div>
          </>
        )}

        {step === "form" && (
          <>
            <div
              style={{
                fontFamily: "var(--mono-font)", fontSize: 11,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: dim, marginBottom: 14,
              }}
            >
              Field 00 · Applicant
            </div>
            <h2
              style={{
                fontFamily: "var(--display-font)",
                fontSize: "clamp(28px, 4vw, 44px)",
                fontWeight: 400, letterSpacing: "-0.02em",
                margin: "0 0 28px",
              }}
            >
              Let's fill in the top of the file.
            </h2>
            <div style={{ display: "grid", gap: 18, maxWidth: 480 }}>
              <PaperField
                label="Name"
                value={e.form.name}
                onChange={(v) => e.setForm({ ...e.form, name: v })}
                placeholder="Ada Lovelace"
                error={e.formErrors.name}
                isDark={isDark}
                dim={dim}
                line={line}
              />
              <PaperField
                label="Email"
                type="email"
                value={e.form.email}
                onChange={(v) => e.setForm({ ...e.form, email: v })}
                placeholder="ada@domain.com"
                error={e.formErrors.email}
                isDark={isDark}
                dim={dim}
                line={line}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <button style={btnSecondary(isDark ? "dark" : "light")} onClick={() => setStep("welcome")}>
                  ← Back
                </button>
                <button style={btnPrimary()} onClick={e.submitForm}>
                  Begin interview
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PaperField({ label, value, onChange, type = "text", placeholder, error, isDark, dim, line }) {
  return (
    <label>
      <div
        style={{
          fontFamily: "var(--mono-font)", fontSize: 11,
          letterSpacing: "0.14em", textTransform: "uppercase",
          color: dim, marginBottom: 6,
        }}
      >
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "12px 0",
          background: "transparent",
          border: "none",
          borderBottom: `1.5px solid ${error ? "#D84A3B" : line}`,
          color: isDark ? "white" : "#2a2520",
          fontFamily: "var(--display-font)",
          fontSize: 22, letterSpacing: "-0.01em",
          outline: "none", boxSizing: "border-box",
        }}
      />
      {error && (
        <div style={{ color: "#D84A3B", fontSize: 11, marginTop: 4, fontFamily: "var(--mono-font)", letterSpacing: "0.05em" }}>
          {error}
        </div>
      )}
    </label>
  );
}

function PaperStep({ flow, e, playing, setPlaying, tweaks, paper, ink, dim, line, isDark }) {
  const s = e.step;
  const isRecord = s.kind === "submission_video";
  const isText = s.kind === "submission_text";
  const pos = tweaks.panelPosition;

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
      tint={isDark ? "dark" : "paper"}
      radius={16}
    />
  );

  const panel = <PaperPanel step={s} e={e} isDark={isDark} dim={dim} ink={ink} line={line} />;

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            fontFamily: "var(--mono-font)", fontSize: 11,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: dim, marginBottom: 8,
          }}
        >
          {s.speaker} · {s.duration} · Chapter {String(e.progressStep + 1).padStart(2, "0")}
        </div>
        <h2
          style={{
            fontFamily: "var(--display-font)",
            fontSize: "clamp(28px, 3.6vw, 46px)",
            fontWeight: 400, letterSpacing: "-0.02em",
            margin: 0, textWrap: "balance",
          }}
        >
          {s.title}
        </h2>
      </div>

      {pos === "below" ? (
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          {videoEl}
          {!isRecord && (
            <div
              style={{
                marginTop: 28, padding: 28, borderRadius: 16,
                background: paper, border: `1px solid ${line}`,
              }}
            >
              {panel}
            </div>
          )}
        </div>
      ) : pos === "overlay" ? (
        <div style={{ maxWidth: 1040, margin: "0 auto", position: "relative" }}>
          {videoEl}
          {!isRecord && (
            <div
              style={{
                position: "absolute", inset: "auto 20px 20px",
                padding: 22, borderRadius: 14,
                background: isDark ? "rgba(20,17,13,0.88)" : "rgba(250,245,234,0.95)",
                backdropFilter: "blur(20px)",
                border: `1px solid ${line}`,
                maxHeight: "58%", overflow: "auto",
              }}
            >
              {panel}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
            gap: 28, alignItems: "start",
          }}
          className="v3-grid"
        >
          <div>{videoEl}</div>
          {!isRecord && (
            <div
              style={{
                padding: 28, borderRadius: 16,
                background: paper, border: `1px solid ${line}`,
                position: "sticky", top: 24,
              }}
            >
              {panel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PaperPanel({ step, e, isDark, dim, ink, line }) {
  const isText = step.kind === "submission_text";

  if (isText) {
    const ok = e.textAnswer.length >= step.minChars;
    return (
      <div>
        <div
          style={{
            fontFamily: "var(--mono-font)", fontSize: 11,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: dim, marginBottom: 10,
          }}
        >
          Prompt
        </div>
        <p
          style={{
            fontFamily: "var(--display-font)",
            fontSize: 24, lineHeight: 1.2, margin: "0 0 18px",
            letterSpacing: "-0.01em",
          }}
        >
          {step.question}
        </p>
        <textarea
          value={e.textAnswer}
          onChange={(ev) => e.setTextAnswer(ev.target.value)}
          placeholder="Write freely..."
          rows={6}
          style={{
            width: "100%", padding: 16, borderRadius: 10,
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(42,37,32,0.03)",
            border: `1px solid ${line}`,
            color: isDark ? "white" : "#2a2520",
            fontFamily: "inherit", fontSize: 15,
            outline: "none", resize: "vertical", boxSizing: "border-box",
            lineHeight: 1.5,
          }}
        />
        <div
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginTop: 12, gap: 10, flexWrap: "wrap",
          }}
        >
          <div style={{ fontFamily: "var(--mono-font)", fontSize: 11, color: dim, letterSpacing: "0.05em" }}>
            {e.textAnswer.length} / {step.minChars}+ chars · {ok ? "ready" : "keep going"}
          </div>
          <button
            style={{ ...btnPrimary(), opacity: ok ? 1 : 0.4, cursor: ok ? "pointer" : "not-allowed" }}
            onClick={() => ok && e.choose(step.options[0])}
            disabled={!ok}
          >
            File answer →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontFamily: "var(--mono-font)", fontSize: 11,
          letterSpacing: "0.14em", textTransform: "uppercase",
          color: dim, marginBottom: 10,
        }}
      >
        Prompt
      </div>
      <p
        style={{
          fontFamily: "var(--display-font)",
          fontSize: 26, lineHeight: 1.15,
          letterSpacing: "-0.015em",
          margin: "0 0 22px",
          textWrap: "balance",
        }}
      >
        {step.question}
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {step.options.map((opt, i) => (
          <PaperOption key={opt.id} opt={opt} index={i} isDark={isDark} line={line} dim={dim} onClick={() => e.choose(opt)} />
        ))}
      </div>
      {e.history.length > 0 && (
        <button
          onClick={e.back}
          style={{
            marginTop: 14, background: "transparent", border: "none",
            color: dim, cursor: "pointer",
            fontFamily: "var(--mono-font)", fontSize: 11,
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}
        >
          ↶ Previous chapter
        </button>
      )}
    </div>
  );
}

function PaperOption({ opt, index, isDark, line, dim, onClick }) {
  return (
    <button
      onClick={onClick}
      className="v3-opt"
      style={{
        textAlign: "left", padding: "14px 16px",
        borderRadius: "var(--btn-radius, 10px)",
        border: `1px solid ${opt.primary ? "var(--brand-primary)" : line}`,
        background: opt.primary
          ? "var(--brand-primary)"
          : isDark
          ? "rgba(255,255,255,0.03)"
          : "rgba(42,37,32,0.02)",
        color: opt.primary ? "white" : isDark ? "white" : "#2a2520",
        fontFamily: "inherit", fontSize: 15,
        fontWeight: opt.primary ? 600 : 500,
        cursor: "pointer",
        display: "flex", alignItems: "center", gap: 12,
        transition: "all 0.15s ease",
      }}
    >
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, borderRadius: "50%",
          border: `1px solid ${opt.primary ? "rgba(255,255,255,0.45)" : line}`,
          fontFamily: "var(--mono-font)", fontSize: 10,
          color: opt.primary ? "rgba(255,255,255,0.9)" : dim,
          flexShrink: 0,
        }}
      >
        {String.fromCharCode(65 + index)}
      </span>
      <span style={{ flex: 1 }}>{opt.text}</span>
      <span style={{ opacity: 0.7 }}>→</span>
    </button>
  );
}

function PaperEnd({ flow, e, paper, ink, dim, line, isDark }) {
  const s = e.step;
  return (
    <div style={{ maxWidth: 680, margin: "40px auto 0" }}>
      <div
        style={{
          background: paper,
          border: `1px solid ${line}`,
          borderRadius: 20,
          padding: "clamp(32px, 5vw, 60px)",
          position: "relative",
          textAlign: "center",
        }}
      >
        <div
          style={{
            position: "absolute", top: 18, right: 18,
            padding: "6px 10px", borderRadius: 4,
            border: `1px solid var(--brand-primary)`,
            color: "var(--brand-primary)",
            fontFamily: "var(--mono-font)", fontSize: 10,
            letterSpacing: "0.14em", textTransform: "uppercase",
            transform: "rotate(-2deg)",
          }}
        >
          Filed ✓
        </div>
        <div
          style={{
            fontFamily: "var(--mono-font)", fontSize: 11,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: dim, marginBottom: 18,
          }}
        >
          Case closed
        </div>
        <h1
          style={{
            fontFamily: "var(--display-font)",
            fontSize: "clamp(36px, 5vw, 60px)",
            fontWeight: 400, letterSpacing: "-0.02em",
            lineHeight: 1, margin: "0 0 20px",
            textWrap: "balance",
          }}
        >
          {s.headline}.
        </h1>
        <p
          style={{
            fontSize: 17, lineHeight: 1.55, color: dim,
            margin: "0 0 32px", textWrap: "pretty",
            maxWidth: 440, marginLeft: "auto", marginRight: "auto",
          }}
        >
          {s.body}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {s.cta && <button style={btnPrimary()}>{s.cta.text}</button>}
          <button style={btnSecondary(isDark ? "dark" : "light")} onClick={e.reset}>Start over</button>
        </div>
        <div
          style={{
            marginTop: 36, paddingTop: 20,
            borderTop: `1px dashed ${line}`,
            fontFamily: "var(--mono-font)", fontSize: 10,
            color: dim, letterSpacing: "0.1em", textTransform: "uppercase",
          }}
        >
          Session ref · ses_{Math.random().toString(36).slice(2, 10)} · archived
        </div>
      </div>
    </div>
  );
}

window.VariantPaper = VariantPaper;
