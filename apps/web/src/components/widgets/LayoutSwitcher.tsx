import { useState, useEffect, useRef } from "react";
import { presets } from "../../widgets/presets";
import type { DashboardState } from "../../widgets/types";
import { Button } from "../ui/Button";
import styles from "./LayoutSwitcher.module.css";

export function LayoutSwitcher({
  onLoadPreset,
}: {
  onLoadPreset: (state: DashboardState) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  return (
    <div ref={containerRef} className={styles.container}>
      <Button variant="secondary" size="md" onClick={() => setOpen((o) => !o)}>
        Layouts ▾
      </Button>
      {open && (
        <div className={styles.dropdown}>
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onLoadPreset(p.createState());
                setOpen(false);
              }}
              className={styles.item}
            >
              <div className={styles.itemName}>{p.name}</div>
              <div className={styles.itemDescription}>{p.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
