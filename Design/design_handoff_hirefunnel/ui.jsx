// Shared UI kit for all admin + public screens.
// All screens use the same tokens driven by the top-level Tweaks.

window.UI = (function () {
  const tokens = {
    // Will be overridden via CSS vars
    // but defaults match Classic.
    bg: "#FAF8F5",
    card: "#FFFFFF",
    ink: "#1a1815",
    dim: "#59595A",
    muted: "#808080",
    border: "#EDE6D9",
    divider: "#F1EBE1",
    brand: "#FF9500",
    brandDim: "#FFF3DF",
  };

  // ───────────── Top nav ─────────────
  function TopNav({ current = "Dashboard", user = { name: "Ada Lovelace", initials: "AL" }, condensed }) {
    const items = [
      "Dashboard", "Flows", "Candidates", "Trainings", "Videos", "Analytics", "Scheduling",
    ];
    return (
      <div
        style={{
          height: 60,
          borderBottom: `1px solid ${tokens.border}`,
          background: "var(--card, #fff)",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 28,
          color: tokens.ink,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: "var(--brand-primary)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 15,
              boxShadow: "0 4px 10px rgba(255,149,0,0.25)",
            }}
          >
            h
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>Hirefunnel</div>
          <div
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              border: `1px solid ${tokens.border}`,
              fontFamily: "var(--mono-font)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: tokens.dim,
              marginLeft: 6,
            }}
          >
            Northwind
          </div>
        </div>

        <nav style={{ display: "flex", gap: 2, flex: 1, alignItems: "center" }}>
          {items.map((it) => (
            <a
              key={it}
              href="#"
              style={{
                padding: "8px 12px",
                fontSize: 14,
                fontWeight: 500,
                borderRadius: 8,
                textDecoration: "none",
                color: it === current ? tokens.ink : tokens.dim,
                background: it === current ? "var(--brand-dim, #FFF3DF)" : "transparent",
              }}
            >
              {it}
            </a>
          ))}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button
            style={{
              padding: "7px 14px",
              borderRadius: "var(--btn-radius, 10px)",
              border: `1px solid ${tokens.border}`,
              background: "transparent",
              color: tokens.ink,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            ⌘ K  Search
          </button>
          <button
            style={{
              padding: "7px 14px",
              borderRadius: "var(--btn-radius, 10px)",
              background: "var(--brand-primary)",
              color: "#fff",
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + New flow
          </button>
          <div
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: tokens.ink, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 600,
            }}
          >
            {user.initials}
          </div>
        </div>
      </div>
    );
  }

  function PageHeader({ eyebrow, title, description, actions }) {
    return (
      <div
        style={{
          padding: "28px 32px 20px",
          borderBottom: `1px solid ${tokens.divider}`,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          {eyebrow && (
            <div
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: tokens.dim,
                marginBottom: 6,
              }}
            >
              {eyebrow}
            </div>
          )}
          <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>{title}</h1>
          {description && (
            <p style={{ margin: "6px 0 0", color: tokens.dim, fontSize: 14, maxWidth: 620 }}>{description}</p>
          )}
        </div>
        {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
      </div>
    );
  }

  function Btn({ variant = "primary", children, icon, small, ...rest }) {
    const base = {
      padding: small ? "6px 12px" : "9px 16px",
      borderRadius: "var(--btn-radius, 10px)",
      fontSize: small ? 12 : 13,
      fontWeight: variant === "primary" ? 600 : 500,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      border: "1px solid transparent",
      fontFamily: "inherit",
      transition: "all 0.15s ease",
    };
    if (variant === "primary")
      return <button {...rest} style={{ ...base, background: "var(--brand-primary)", color: "#fff", border: "none" }}>{icon}{children}</button>;
    if (variant === "secondary")
      return <button {...rest} style={{ ...base, background: "transparent", color: tokens.ink, borderColor: tokens.border }}>{icon}{children}</button>;
    if (variant === "ghost")
      return <button {...rest} style={{ ...base, background: "transparent", color: tokens.dim, border: "none" }}>{icon}{children}</button>;
    return <button {...rest} style={base}>{children}</button>;
  }

  function Badge({ tone = "neutral", children }) {
    const tones = {
      neutral: { bg: "#F1EBE1", color: "#59595A" },
      brand: { bg: "#FFF3DF", color: "#C2710A" },
      success: { bg: "#E6F4EA", color: "#1F6A3A" },
      warn: { bg: "#FEF2D0", color: "#8A6500" },
      danger: { bg: "#FDE4E1", color: "#A93A2C" },
      info: { bg: "#E6EFF8", color: "#2E5A88" },
    };
    const t = tones[tone] || tones.neutral;
    return (
      <span
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 8px", borderRadius: 999,
          background: t.bg, color: t.color,
          fontSize: 11, fontWeight: 600,
          fontFamily: "var(--mono-font)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.color, opacity: 0.8 }} />
        {children}
      </span>
    );
  }

  function Card({ children, padding = 20, style }) {
    return (
      <div
        style={{
          background: "var(--card, #fff)",
          border: `1px solid ${tokens.border}`,
          borderRadius: 14,
          padding,
          ...style,
        }}
      >
        {children}
      </div>
    );
  }

  function Stat({ label, value, delta, deltaTone = "success", sub, chart }) {
    return (
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
          <div
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
              color: tokens.dim,
            }}
          >
            {label}
          </div>
          {delta && <Badge tone={deltaTone}>{delta}</Badge>}
        </div>
        <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ color: tokens.dim, fontSize: 12, marginTop: 6 }}>{sub}</div>}
        {chart && <div style={{ marginTop: 12 }}>{chart}</div>}
      </Card>
    );
  }

  // Tiny inline sparkline
  function Sparkline({ data, w = 120, h = 32, stroke = "var(--brand-primary)", fill }) {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return [x, y];
    });
    const d = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
    const area = `${d} L${w},${h} L0,${h} Z`;
    return (
      <svg width={w} height={h} style={{ display: "block" }}>
        {fill && <path d={area} fill={fill} />}
        <path d={d} stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return { tokens, TopNav, PageHeader, Btn, Badge, Card, Stat, Sparkline };
})();
