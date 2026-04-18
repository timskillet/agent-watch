import type { WidgetProps } from "../../widgets/types";
import { Select } from "../ui/Select";
import styles from "./CostTrendWidget.module.css";

export function CostTrendWidget({
  config,
  onConfigChange,
  isConfigOpen,
}: WidgetProps) {
  const range = (config.range as string) ?? "7d";

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
      </div>
    );
  }

  return (
    <div className={styles.placeholder}>
      <div className={styles.placeholderIcon}>📈</div>
      <div className={styles.placeholderTitle}>Cost Trend &middot; {range}</div>
      <div className={styles.placeholderHint}>
        Chart renders when panel API data is available
      </div>
    </div>
  );
}
