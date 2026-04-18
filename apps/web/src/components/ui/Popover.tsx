import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import styles from "./Popover.module.css";

export type PopoverPlacement =
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  placement?: PopoverPlacement;
  matchAnchorWidth?: boolean;
  children: ReactNode;
}

export function Popover({
  open,
  onClose,
  anchorRef,
  placement = "bottom-start",
  matchAnchorWidth = false,
  children,
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const applyPosition = useCallback(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;

    const rect = anchor.getBoundingClientRect();

    // Reset inline styles before recomputing
    popover.style.top = "";
    popover.style.bottom = "";
    popover.style.left = "";
    popover.style.right = "";

    if (matchAnchorWidth) {
      popover.style.width = `${rect.width}px`;
    }

    switch (placement) {
      case "bottom-start":
        popover.style.top = `${rect.bottom + 4}px`;
        popover.style.left = `${rect.left}px`;
        break;
      case "bottom-end":
        popover.style.top = `${rect.bottom + 4}px`;
        popover.style.right = `${window.innerWidth - rect.right}px`;
        break;
      case "top-start":
        popover.style.bottom = `${window.innerHeight - rect.top + 4}px`;
        popover.style.left = `${rect.left}px`;
        break;
      case "top-end":
        popover.style.bottom = `${window.innerHeight - rect.top + 4}px`;
        popover.style.right = `${window.innerWidth - rect.right}px`;
        break;
    }
  }, [anchorRef, placement, matchAnchorWidth]);

  useEffect(() => {
    if (!open) return;

    applyPosition();

    let rafId: number | null = null;

    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        applyPosition();
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (
        anchor &&
        !anchor.contains(target) &&
        popover &&
        !popover.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, { capture: true });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, { capture: true });
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [open, onClose, anchorRef, applyPosition]);

  if (!open) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className={styles.popover}
      role="dialog"
      tabIndex={-1}
    >
      {children}
    </div>,
    document.body,
  );
}
