import { useState } from "react";
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout";
import { useLayoutPersistence } from "../../hooks/useLayoutPersistence";
import { getWidgetDefinition } from "../../widgets/registry";
import { getDefaultLayout } from "../../widgets/presets";
import { WidgetFrame } from "./WidgetFrame";
import { WidgetPicker } from "./WidgetPicker";
import { LayoutSwitcher } from "./LayoutSwitcher";

export function WidgetDashboard() {
  const { width, containerRef, mounted } = useContainerWidth();
  const {
    state,
    updateLayout,
    addWidget,
    removeWidget,
    updateWidgetConfig,
    loadPreset,
  } = useLayoutPersistence(getDefaultLayout());

  const [pickerOpen, setPickerOpen] = useState(false);

  // Build layout with min constraints from registry
  const layout: Layout = state.gridLayout
    .filter((item) => state.widgets.some((w) => w.id === item.i))
    .map((item) => {
      const widget = state.widgets.find((w) => w.id === item.i);
      const def = widget ? getWidgetDefinition(widget.type) : undefined;
      return {
        ...item,
        minW: def?.minW,
        minH: def?.minH,
      };
    });

  return (
    <div ref={containerRef}>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <button onClick={() => setPickerOpen(true)} style={addBtnStyle}>
          + Add Widget
        </button>
        <LayoutSwitcher onLoadPreset={loadPreset} />
      </div>

      {mounted && (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: 12, rowHeight: 40 }}
          dragConfig={{ handle: ".widget-drag-handle" }}
          onLayoutChange={(newLayout: Layout) => {
            const widgetIds = new Set(state.widgets.map((w) => w.id));
            updateLayout(
              newLayout
                .filter((item) => widgetIds.has(item.i))
                .map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
            );
          }}
        >
          {state.widgets.map((widget) => {
            const def = getWidgetDefinition(widget.type);
            if (!def) return null;
            const Component = def.component;
            return (
              <div key={widget.id}>
                <WidgetFrame
                  title={def.name}
                  onRemove={() => removeWidget(widget.id)}
                >
                  {(isConfigOpen) => (
                    <Component
                      config={widget.config}
                      onConfigChange={(config) =>
                        updateWidgetConfig(widget.id, config)
                      }
                      isConfigOpen={isConfigOpen}
                    />
                  )}
                </WidgetFrame>
              </div>
            );
          })}
        </GridLayout>
      )}

      {pickerOpen && (
        <WidgetPicker
          onAdd={(type) => {
            addWidget(type);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

const addBtnStyle: React.CSSProperties = {
  background: "#8b9cf7",
  color: "#1a1a2e",
  border: "none",
  borderRadius: 4,
  padding: "6px 14px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};
