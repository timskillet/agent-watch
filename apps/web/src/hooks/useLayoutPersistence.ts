import { useState, useCallback, useEffect } from "react";
import type { DashboardState, WidgetType } from "../widgets/types";
import { getDefaultConfig, getDefaultSize } from "../widgets/registry";

const STORAGE_KEY = "agentwatch-dashboard-layout";

function loadFromStorage(): DashboardState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.widgets) && Array.isArray(parsed?.gridLayout)) {
      return parsed as DashboardState;
    }
    return null;
  } catch {
    return null;
  }
}

function saveToStorage(state: DashboardState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useLayoutPersistence(defaultState: DashboardState) {
  const [state, setState] = useState<DashboardState>(
    () => loadFromStorage() ?? defaultState,
  );

  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const updateLayout = useCallback(
    (gridLayout: DashboardState["gridLayout"]) => {
      setState((prev) => ({ ...prev, gridLayout }));
    },
    [],
  );

  const addWidget = useCallback((type: WidgetType) => {
    setState((prev) => {
      const id = crypto.randomUUID();
      const widget = { id, type, config: getDefaultConfig(type) };
      const { defaultW, defaultH } = getDefaultSize(type);
      const maxY = prev.gridLayout.reduce(
        (max, item) => Math.max(max, item.y + item.h),
        0,
      );
      const layoutItem = { i: id, x: 0, y: maxY, w: defaultW, h: defaultH };
      return {
        widgets: [...prev.widgets, widget],
        gridLayout: [...prev.gridLayout, layoutItem],
      };
    });
  }, []);

  const removeWidget = useCallback((id: string) => {
    setState((prev) => ({
      widgets: prev.widgets.filter((w) => w.id !== id),
      gridLayout: prev.gridLayout.filter((l) => l.i !== id),
    }));
  }, []);

  const updateWidgetConfig = useCallback(
    (id: string, config: Record<string, unknown>) => {
      setState((prev) => ({
        ...prev,
        widgets: prev.widgets.map((w) => (w.id === id ? { ...w, config } : w)),
      }));
    },
    [],
  );

  const loadPreset = useCallback((preset: DashboardState) => {
    setState(preset);
  }, []);

  return {
    state,
    updateLayout,
    addWidget,
    removeWidget,
    updateWidgetConfig,
    loadPreset,
  };
}
