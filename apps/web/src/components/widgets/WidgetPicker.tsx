import { widgetRegistry } from "../../widgets/registry";
import type { WidgetType } from "../../widgets/types";

export function WidgetPicker({
  onAdd,
  onClose,
}: {
  onAdd: (type: WidgetType) => void;
  onClose: () => void;
}) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <span style={{ color: "#e0e0e0", fontSize: 16, fontWeight: 600 }}>
            Add Widget
          </span>
          <button onClick={onClose} style={closeBtnStyle}>
            ✕
          </button>
        </div>
        {widgetRegistry.map((def) => (
          <div key={def.type} style={rowStyle}>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#ccc", fontSize: 13, fontWeight: 500 }}>
                {def.name}
              </div>
              <div style={{ color: "#888", fontSize: 11, marginTop: 2 }}>
                {def.description}
              </div>
            </div>
            <button onClick={() => onAdd(def.type)} style={addBtnStyle}>
              Add
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const panelStyle: React.CSSProperties = {
  background: "#1e1e38",
  border: "1px solid #444",
  borderRadius: 8,
  padding: 20,
  width: 420,
  maxHeight: "80vh",
  overflow: "auto",
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "10px 0",
  borderBottom: "1px solid #333",
  gap: 12,
};
const addBtnStyle: React.CSSProperties = {
  background: "#8b9cf7",
  color: "#1a1a2e",
  border: "none",
  borderRadius: 4,
  padding: "5px 14px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  flexShrink: 0,
};
const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#888",
  cursor: "pointer",
  fontSize: 16,
};
