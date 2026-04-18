import { useState, type ReactNode } from "react";
import styles from "./WidgetFrame.module.css";

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
    <div className={styles.frame}>
      <div className={`widget-drag-handle ${styles.header}`}>
        <span className={styles.title}>{title}</span>
        <button
          onClick={() => setIsConfigOpen((o) => !o)}
          onMouseDown={(e) => e.stopPropagation()}
          className={`${styles.headerButton} ${isConfigOpen ? styles.headerButtonActive : ""}`}
          title="Configure"
        >
          ⚙
        </button>
        <button
          onClick={onRemove}
          onMouseDown={(e) => e.stopPropagation()}
          className={styles.headerButton}
          title="Remove"
        >
          ✕
        </button>
      </div>
      <div className={styles.body}>{children(isConfigOpen)}</div>
    </div>
  );
}
