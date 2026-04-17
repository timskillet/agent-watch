import { useState } from "react";
import { presets } from "../../widgets/presets";
import type { DashboardState } from "../../widgets/types";

export function LayoutSwitcher({
  onLoadPreset,
}: {
  onLoadPreset: (state: DashboardState) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={triggerStyle}>
        Layouts ▾
      </button>
      {open && (
        <div style={dropdownStyle}>
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onLoadPreset(p.createState());
                setOpen(false);
              }}
              style={itemStyle}
            >
              <div style={{ fontWeight: 500, color: "#ccc" }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                {p.description}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const triggerStyle: React.CSSProperties = {
  background: "#2a2a3e",
  color: "#ccc",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "5px 12px",
  cursor: "pointer",
  fontSize: 12,
};
const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: 4,
  background: "#1e1e38",
  border: "1px solid #444",
  borderRadius: 6,
  padding: 4,
  minWidth: 240,
  zIndex: 100,
};
const itemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  padding: "8px 10px",
  cursor: "pointer",
  borderRadius: 4,
  fontSize: 12,
};
