import type { Trace } from "@agentwatch/types";
import styles from "./PromptPreviewSection.module.css";

export interface PromptPreviewSectionProps {
  trace: Trace;
}

export function PromptPreviewSection({ trace }: PromptPreviewSectionProps) {
  if (trace.promptPreview !== undefined && trace.promptPreview.length > 0) {
    return (
      <div className={styles.preview}>
        <p className={styles.text}>{trace.promptPreview}</p>
        {trace.promptLength > trace.promptPreview.length && (
          <p className={styles.truncated}>
            (truncated — full prompt is {trace.promptLength} chars)
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={styles.hint}>
      <p>Prompt text not captured ({trace.promptLength} chars).</p>
      <p className={styles.hintDetail}>
        To show prompt text as the trace headline, set{" "}
        <code>capturePromptContent: true</code> in{" "}
        <code>agentwatch.config.json</code> in the session cwd.
      </p>
    </div>
  );
}
