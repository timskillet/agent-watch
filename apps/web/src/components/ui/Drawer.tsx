import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { useDrawerStackRegister } from "./DrawerStack";
import styles from "./Drawer.module.css";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Width in px or CSS length. Default 480. */
  width?: number | string;
  children: ReactNode;
}

interface DrawerSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hidden);
}

function DrawerInner({
  onClose,
  title,
  width,
  children,
}: Omit<DrawerProps, "open">) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { isTop } = useDrawerStackRegister(true);

  // Slide-in: start closed, apply open class after first paint
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // Force browser to recognise the initial closed state before transition
    panel.getBoundingClientRect();
    panel.classList.add(styles.panelOpen);
    panel.classList.remove(styles.panelClosed);
    panel.focus();
  }, []);

  // Save focus on mount; restore on unmount
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      previous?.focus();
    };
  }, []);

  // Key handler: Escape closes the topmost drawer only; Tab traps focus
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isTop) onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = getFocusable(panelRef.current);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, isTop]);

  const resolvedWidth = typeof width === "number" ? `${width}px` : width;
  const generatedId = useId();
  const titleId = typeof title === "string" ? generatedId : undefined;

  return (
    <div className={styles.root}>
      <div className={styles.backdrop} onClick={onClose} />
      <div
        ref={panelRef}
        className={`${styles.panel} ${styles.panelClosed}`}
        style={{ width: resolvedWidth }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.header}>
          {title !== undefined && (
            <span id={titleId} className={styles.title}>
              {title}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </Button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ open, ...rest }: DrawerProps) {
  if (!open) return null;
  return createPortal(<DrawerInner {...rest} />, document.body);
}

export function DrawerSection({
  title,
  defaultOpen = true,
  children,
}: DrawerSectionProps) {
  return (
    <details className={styles.section} open={defaultOpen}>
      <summary className={styles.sectionSummary}>
        <span className={styles.sectionChevron} aria-hidden="true" />
        {title}
      </summary>
      <div className={styles.sectionBody}>{children}</div>
    </details>
  );
}
