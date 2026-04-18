import { useRef, useState } from "react";
import type { TimeRange, TimeRangePreset } from "@agentwatch/types";
import { TIME_RANGE_PRESETS, formatTimeRangeLabel } from "../../lib/timeRange";
import { Button } from "./Button";
import { Popover } from "./Popover";
import styles from "./TimeRangePicker.module.css";

interface TimeRangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  includePresets?: TimeRangePreset[];
  size?: "sm" | "md";
}

function toDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export function TimeRangePicker({
  value,
  onChange,
  includePresets,
  size = "sm",
}: TimeRangePickerProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const initialSince =
    value.kind === "custom" ? toDatetimeLocal(value.since) : "";
  const initialUntil =
    value.kind === "custom" ? toDatetimeLocal(value.until) : "";

  const [sinceInput, setSinceInput] = useState(initialSince);
  const [untilInput, setUntilInput] = useState(initialUntil);
  const [error, setError] = useState<string | null>(null);

  const visiblePresets =
    includePresets != null
      ? TIME_RANGE_PRESETS.filter((p) => includePresets.includes(p.value))
      : TIME_RANGE_PRESETS;

  function handleOpen() {
    // Sync custom inputs to current value when opening
    if (value.kind === "custom") {
      setSinceInput(toDatetimeLocal(value.since));
      setUntilInput(toDatetimeLocal(value.until));
    } else {
      setSinceInput("");
      setUntilInput("");
    }
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    setError(null);
  }

  function handlePreset(preset: TimeRangePreset) {
    onChange({ kind: "preset", value: preset });
    setOpen(false);
  }

  function handleApply() {
    const since = new Date(sinceInput).getTime();
    const until = new Date(untilInput).getTime();

    if (!sinceInput || !untilInput || isNaN(since) || isNaN(until)) {
      setError("Both dates are required.");
      return;
    }
    if (since > until) {
      setError("Start must be before end.");
      return;
    }

    onChange({ kind: "custom", since, until });
    setOpen(false);
  }

  const triggerCls = [
    styles.trigger,
    size === "sm" ? styles.triggerSm : styles.triggerMd,
  ].join(" ");

  return (
    <>
      <button
        ref={triggerRef}
        className={triggerCls}
        onClick={handleOpen}
        type="button"
      >
        {formatTimeRangeLabel(value)}
        <span className={styles.chevron}>&#8964;</span>
      </button>
      <Popover
        open={open}
        onClose={handleClose}
        anchorRef={triggerRef}
        placement="bottom-start"
      >
        <div className={styles.body}>
          <div className={styles.presets}>
            {visiblePresets.map((p) => {
              const isActive =
                value.kind === "preset" && value.value === p.value;
              return (
                <button
                  key={p.value}
                  className={[
                    styles.presetBtn,
                    isActive ? styles.presetBtnActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handlePreset(p.value)}
                  type="button"
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className={styles.custom}>
            <span className={styles.customLabel}>Custom range</span>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>From</span>
              <input
                type="datetime-local"
                className={styles.dateInput}
                value={sinceInput}
                onChange={(e) => {
                  setSinceInput(e.target.value);
                  setError(null);
                }}
              />
            </label>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>To</span>
              <input
                type="datetime-local"
                className={styles.dateInput}
                value={untilInput}
                onChange={(e) => {
                  setUntilInput(e.target.value);
                  setError(null);
                }}
              />
            </label>
            {error != null && <span className={styles.errorText}>{error}</span>}
            <div className={styles.applyRow}>
              <Button
                size="sm"
                variant="primary"
                onClick={handleApply}
                type="button"
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </Popover>
    </>
  );
}
