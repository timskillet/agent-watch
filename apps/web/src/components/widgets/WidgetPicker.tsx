import { widgetRegistry } from "../../widgets/registry";
import type { WidgetType } from "../../widgets/types";
import { Button } from "../ui/Button";
import styles from "./WidgetPicker.module.css";

export function WidgetPicker({
  onAdd,
  onClose,
}: {
  onAdd: (type: WidgetType) => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Add Widget</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>
        {widgetRegistry.map((def) => (
          <div key={def.type} className={styles.row}>
            <div className={styles.rowInfo}>
              <div className={styles.rowName}>{def.name}</div>
              <div className={styles.rowDescription}>{def.description}</div>
            </div>
            <Button variant="primary" size="sm" onClick={() => onAdd(def.type)}>
              Add
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
