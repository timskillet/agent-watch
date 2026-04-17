import { useState, type ReactNode } from "react";

export function WidgetFrame({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: (isConfigOpen: boolean) => ReactNode;
}) {
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#16162a",
        border: "1px solid #333",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <div
        className="widget-drag-handle"
        style={{
          display: "flex",
          alignItems: "center",
          padding: "4px 10px",
          background: "#1e1e38",
          cursor: "grab",
          userSelect: "none",
          borderBottom: "1px solid #333",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 600,
            color: "#ccc",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        <button
          onClick={() => setIsConfigOpen((o) => !o)}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            ...headerBtn,
            color: isConfigOpen ? "#8b9cf7" : "#888",
          }}
          title="Configure"
        >
          ⚙
        </button>
        <button
          onClick={onRemove}
          onMouseDown={(e) => e.stopPropagation()}
          style={headerBtn}
          title="Remove"
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
        {children(isConfigOpen)}
      </div>
    </div>
  );
}

const headerBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#888",
  cursor: "pointer",
  padding: "2px 4px",
  fontSize: 12,
  lineHeight: 1,
};
