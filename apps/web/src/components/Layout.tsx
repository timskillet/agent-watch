import { Outlet, Link, useLocation } from "react-router-dom";

const SIDEBAR_WIDTH = 200;

const NAV_LINKS = [
  { to: "/", label: "Runs" },
  { to: "/compare", label: "Compare" },
];

const PLACEHOLDER_RUNS = [
  { id: "sess-a1b2c3", time: "2m ago" },
  { id: "sess-d4e5f6", time: "1h ago" },
  { id: "sess-g7h8i9", time: "3h ago" },
];

export function Layout() {
  const { pathname } = useLocation();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          borderRight: "1px solid #333",
          background: "#1a1a2e",
          padding: "16px 12px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Link
          to="/"
          style={{
            textDecoration: "none",
            color: "#e0e0e0",
            fontWeight: "bold",
            fontSize: 15,
            marginBottom: 20,
            display: "block",
          }}
        >
          AgentWatch
        </Link>

        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Navigation</div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV_LINKS.map(({ to, label }) => {
              const active =
                to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  style={{
                    color: active ? "#8b9cf7" : "#888",
                    textDecoration: "none",
                    fontSize: 13,
                    padding: "6px 8px",
                    borderRadius: 4,
                    background: active
                      ? "rgba(139,156,247,0.1)"
                      : "transparent",
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Recent Runs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {PLACEHOLDER_RUNS.map(({ id, time }) => (
              <div
                key={id}
                style={{
                  color: "#ccc",
                  fontSize: 12,
                  padding: "5px 8px",
                  borderRadius: 4,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {id}
                </span>
                <span style={{ color: "#666", fontSize: 10, flexShrink: 0 }}>
                  {time}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: "auto" }}>
          <div style={sectionLabel}>Project</div>
          <div
            style={{
              color: "#aaa",
              fontSize: 12,
              border: "1px solid #333",
              padding: "6px 8px",
              borderRadius: 4,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>All Projects</span>
            <span style={{ color: "#555" }}>{"\u25BE"}</span>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, padding: 16 }}>
        <Outlet />
      </main>
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  color: "#555",
  letterSpacing: 1,
  marginBottom: 6,
};
