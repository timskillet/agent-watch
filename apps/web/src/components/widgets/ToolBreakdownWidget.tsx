import type { WidgetProps } from "../../widgets/types";
import { Select } from "../ui/Select";
import styles from "./ToolBreakdownWidget.module.css";

export function ToolBreakdownWidget({
  config,
  onConfigChange,
  isConfigOpen,
}: WidgetProps) {
  const range = (config.range as string) ?? "7d";
  const metric = (config.metric as string) ?? "count";

  if (isConfigOpen) {
    return (
      <div className={styles.configPanel}>
        <label className={styles.configLabel}>
          Range:
          <Select
            value={range}
            onChange={(e) =>
              onConfigChange({ ...config, range: e.target.value })
            }
          >
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </Select>
        </label>
        <label className={styles.configLabel}>
          Metric:
          <Select
            value={metric}
            onChange={(e) =>
              onConfigChange({ ...config, metric: e.target.value })
            }
          >
            <option value="count">Count</option>
            <option value="duration">Duration</option>
            <option value="failure_rate">Failure Rate</option>
          </Select>
        </label>
      </div>
    );
  }

  return (
    <div className={styles.placeholder}>
      <div className={styles.placeholderIcon}>📊</div>
      <div className={styles.placeholderTitle}>
        Tool Breakdown &middot; {metric} &middot; {range}
      </div>
      <div className={styles.placeholderHint}>
        Chart renders when panel API data is available
      </div>
    </div>
  );
}
