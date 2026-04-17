// Shared primitives used by all three variants.
// Each is styled to inherit CSS variables so variants can re-theme them.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ───────────────────── Placeholder video ─────────────────────
// A "video surface" — diagonal stripes + mono label. Not a real video.
// Fakes playback: progress bar advances over `duration`, fires onEnded.
function VideoSurface({
  label = "video.mp4",
  speaker = "interviewer",
  duration = "1:00",
  aspect = "16/9",
  playing,
  setPlaying,
  onEnded,
  tint = "orange",
  radius = 16,
  cover = true,
  showChrome = true,
}) {
  const [progress, setProgress] = useState(0);
  const totalMs = useMemo(() => {
    const [m, s] = duration.split(":").map(Number);
    return (m * 60 + s) * 1000;
  }, [duration]);

  useEffect(() => {
    if (!playing) return;
    const start = Date.now() - progress * totalMs;
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / totalMs);
      setProgress(p);
      if (p >= 1) {
        clearInterval(id);
        setPlaying(false);
        onEnded?.();
      }
    }, 50);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [playing]);

  const fmt = (p) => {
    const s = Math.floor((p * totalMs) / 1000);
    return `${String(Math.floor(s / 60)).padStart(1, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  const stripe =
    tint === "orange"
      ? "repeating-linear-gradient(135deg, rgba(255,149,0,0.18) 0 14px, rgba(255,149,0,0.08) 14px 28px), linear-gradient(140deg, #2a2420, #1a1815)"
      : tint === "dark"
      ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 14px, rgba(255,255,255,0.02) 14px 28px), linear-gradient(140deg, #1a1815, #0a0908)"
      : "repeating-linear-gradient(135deg, rgba(70,60,40,0.12) 0 14px, rgba(70,60,40,0.05) 14px 28px), linear-gradient(140deg, #e8e0d2, #d8cfbd)";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: aspect,
        background: stripe,
        borderRadius: radius,
        overflow: "hidden",
        color: tint === "paper" ? "#3a3530" : "rgba(255,255,255,0.9)",
        cursor: "pointer",
      }}
      onClick={() => setPlaying(!playing)}
    >
      {/* Center caption — name of speaker */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          textAlign: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            width: cover ? 72 : 56,
            height: cover ? 72 : 56,
            borderRadius: "50%",
            background:
              tint === "paper"
                ? "rgba(58, 53, 48, 0.12)"
                : "rgba(255, 255, 255, 0.08)",
            border: tint === "paper"
              ? "1px solid rgba(58, 53, 48, 0.2)"
              : "1px solid rgba(255,255,255,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--mono-font)",
            fontSize: 13,
            letterSpacing: "0.05em",
            opacity: 0.8,
          }}
        >
          VIDEO
        </div>
        {showChrome && (
          <div
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.65,
            }}
          >
            {speaker} · {label}
          </div>
        )}
      </div>

      {/* Play button overlay when paused */}
      {!playing && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: "50%",
              background: "var(--brand-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "16px solid white",
                borderTop: "10px solid transparent",
                borderBottom: "10px solid transparent",
                marginLeft: 5,
              }}
            />
          </div>
        </div>
      )}

      {/* Scrub bar */}
      {showChrome && (
        <div
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            bottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: "var(--mono-font)",
            fontSize: 11,
            color: tint === "paper" ? "#3a3530" : "white",
          }}
        >
          <span style={{ opacity: 0.85 }}>{fmt(progress)}</span>
          <div
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background:
                tint === "paper" ? "rgba(58,53,48,0.2)" : "rgba(255,255,255,0.18)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress * 100}%`,
                height: "100%",
                background: "var(--brand-primary)",
                transition: "width 0.05s linear",
              }}
            />
          </div>
          <span style={{ opacity: 0.85 }}>{duration}</span>
        </div>
      )}
    </div>
  );
}

// ───────────────────── Progress indicators ─────────────────────
function ProgressIndicator({ kind, step, total, theme = "light" }) {
  const pct = total ? (step / total) * 100 : 0;
  const fg = theme === "dark" ? "rgba(255,255,255,0.9)" : "#1a1815";
  const dim =
    theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(26,24,21,0.12)";

  if (kind === "none") return null;

  if (kind === "bar") {
    return (
      <div
        style={{
          width: "100%",
          height: 3,
          borderRadius: 2,
          background: dim,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--brand-primary)",
            transition: "width 0.4s cubic-bezier(.2,.7,.2,1)",
          }}
        />
      </div>
    );
  }

  if (kind === "dots") {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i < step ? 24 : 8,
              height: 8,
              borderRadius: 999,
              background:
                i < step
                  ? "var(--brand-primary)"
                  : i === step
                  ? fg
                  : dim,
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
    );
  }

  // stepper
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        fontFamily: "var(--mono-font)",
        fontSize: 11,
        color: theme === "dark" ? "rgba(255,255,255,0.7)" : "#59595A",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      <span style={{ color: "var(--brand-primary)", fontWeight: 600 }}>
        {String(step + 1).padStart(2, "0")}
      </span>
      <span style={{ opacity: 0.4 }}>/</span>
      <span style={{ opacity: 0.7 }}>{String(total).padStart(2, "0")}</span>
    </div>
  );
}

// ───────────────────── Recorder mock ─────────────────────
// Fake WebRTC-style recording UI. Tracks elapsed, respects min/max.
function RecorderPanel({ step, onSubmit, onCancel, theme = "light" }) {
  const [state, setState] = useState("idle"); // idle | countdown | recording | review
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef(null);

  useEffect(() => {
    if (state === "countdown") {
      const id = setInterval(() => {
        setCount((c) => {
          if (c <= 1) {
            clearInterval(id);
            setState("recording");
            return 3;
          }
          return c - 1;
        });
      }, 800);
      return () => clearInterval(id);
    }
    if (state === "recording") {
      const start = Date.now();
      tickRef.current = setInterval(() => {
        const e = (Date.now() - start) / 1000;
        setElapsed(e);
        if (e >= step.maxSeconds) {
          clearInterval(tickRef.current);
          setState("review");
        }
      }, 100);
      return () => clearInterval(tickRef.current);
    }
  }, [state, step.maxSeconds]);

  const stopRecording = () => {
    clearInterval(tickRef.current);
    if (elapsed >= step.minSeconds) setState("review");
    else setState("idle");
  };

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(1, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const bg = theme === "dark" ? "#15120f" : "#fff";
  const border =
    theme === "dark" ? "1px solid rgba(255,255,255,0.08)" : "1px solid #EDE6D9";
  const text = theme === "dark" ? "rgba(255,255,255,0.92)" : "#1a1815";
  const dim = theme === "dark" ? "rgba(255,255,255,0.55)" : "#59595A";

  return (
    <div
      style={{
        background: bg,
        border,
        borderRadius: 16,
        padding: 20,
        color: text,
      }}
    >
      {/* "Camera" surface */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16/9",
          borderRadius: 12,
          overflow: "hidden",
          background:
            "repeating-linear-gradient(135deg, rgba(255,149,0,0.12) 0 14px, rgba(255,149,0,0.04) 14px 28px), linear-gradient(140deg, #2a2420, #0f0d0b)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Corner badge */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            fontFamily: "var(--mono-font)",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "rgba(255,255,255,0.7)",
            textTransform: "uppercase",
          }}
        >
          WEBCAM · {state.toUpperCase()}
        </div>
        {state === "recording" && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(239,68,68,0.95)",
              color: "white",
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              letterSpacing: "0.08em",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "white",
                animation: "pulse 1s infinite",
              }}
            />
            REC {fmt(elapsed)}
          </div>
        )}
        {state === "idle" && (
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
            Camera ready
          </div>
        )}
        {state === "countdown" && (
          <div
            style={{
              fontFamily: "var(--display-font)",
              fontSize: 96,
              color: "white",
              fontWeight: 600,
            }}
          >
            {count}
          </div>
        )}
        {state === "recording" && (
          <div
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 13,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            speaking...
          </div>
        )}
        {state === "review" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 4 }}>✓</div>
            <div
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 12,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              RECORDED {fmt(elapsed)}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 16,
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: dim }}>
          {state === "idle" && `${step.minSeconds}–${step.maxSeconds} seconds`}
          {state === "recording" &&
            (elapsed < step.minSeconds
              ? `Keep going — need ${Math.ceil(step.minSeconds - elapsed)}s more`
              : `You can stop whenever`)}
          {state === "review" && `Looks good — submit when you're ready`}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {state === "idle" && (
            <>
              <button
                onClick={onCancel}
                style={btnSecondary(theme)}
              >
                Write instead
              </button>
              <button
                onClick={() => setState("countdown")}
                style={btnPrimary()}
              >
                Start recording
              </button>
            </>
          )}
          {state === "recording" && (
            <button
              onClick={stopRecording}
              disabled={elapsed < step.minSeconds}
              style={{
                ...btnPrimary(),
                opacity: elapsed < step.minSeconds ? 0.4 : 1,
                cursor: elapsed < step.minSeconds ? "not-allowed" : "pointer",
              }}
            >
              Stop
            </button>
          )}
          {state === "review" && (
            <>
              <button
                onClick={() => {
                  setState("idle");
                  setElapsed(0);
                }}
                style={btnSecondary(theme)}
              >
                Re-record
              </button>
              <button
                onClick={() => onSubmit(elapsed)}
                style={btnPrimary()}
              >
                Submit answer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────── Button helpers ─────────────────────
function btnPrimary() {
  return {
    padding:
      "var(--btn-py, 14px) var(--btn-px, 22px)",
    borderRadius: "var(--btn-radius, 10px)",
    background: "var(--brand-primary)",
    color: "white",
    border: "none",
    fontFamily: "inherit",
    fontWeight: 600,
    fontSize: 15,
    cursor: "pointer",
    transition: "all 0.2s ease",
    boxShadow: "0 6px 16px rgba(255,149,0,0.25)",
  };
}
function btnSecondary(theme = "light") {
  return {
    padding:
      "var(--btn-py, 14px) var(--btn-px, 22px)",
    borderRadius: "var(--btn-radius, 10px)",
    background: "transparent",
    color:
      theme === "dark" ? "rgba(255,255,255,0.88)" : "var(--ink, #1a1815)",
    border:
      theme === "dark"
        ? "1px solid rgba(255,255,255,0.18)"
        : "1px solid rgba(26,24,21,0.15)",
    fontFamily: "inherit",
    fontWeight: 500,
    fontSize: 15,
    cursor: "pointer",
    transition: "all 0.2s ease",
  };
}

Object.assign(window, {
  VideoSurface,
  ProgressIndicator,
  RecorderPanel,
  btnPrimary,
  btnSecondary,
});
