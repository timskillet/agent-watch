import { computeDelta } from "../../lib/computeDelta";
import { DeltaCell, DeltaSummary, type DeltaValueFormat } from "./DeltaCell";
import styles from "./ComparisonTable.module.css";

export interface ComparisonRow {
  id: string;
  label: string;
  sublabel?: string;
  a: number | undefined;
  b: number | undefined;
  format: DeltaValueFormat;
  /** Default true. Set false when a smaller B is *worse* (e.g. throughput). */
  higherIsWorse?: boolean;
  /** Click handler — when present the row renders as a button-like surface. */
  onClick?: () => void;
}

export interface ComparisonTableProps {
  title: string;
  rows: ComparisonRow[];
  labelHeader: string;
  aLabel: string;
  bLabel: string;
  /** Fallback when there are no rows. */
  emptyText?: string;
}

export function ComparisonTable({
  title,
  rows,
  labelHeader,
  aLabel,
  bLabel,
  emptyText,
}: ComparisonTableProps) {
  return (
    <section className={styles.section}>
      <h3 className={styles.title}>{title}</h3>
      {rows.length === 0 ? (
        <div className={styles.empty}>{emptyText ?? "No rows to compare."}</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.labelCol}>{labelHeader}</th>
              <th className={styles.numCol}>{aLabel}</th>
              <th className={styles.numCol}>{bLabel}</th>
              <th className={styles.deltaCol}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const delta = computeDelta(row.a, row.b, {
                higherIsWorse: row.higherIsWorse ?? true,
              });
              const interactive = row.onClick !== undefined;
              const rowClass = `${styles.row} ${
                delta.diverges ? styles.rowDiverges : ""
              } ${interactive ? styles.rowClickable : ""}`.trim();
              return (
                <tr
                  key={row.id}
                  className={rowClass}
                  onClick={row.onClick}
                  tabIndex={interactive ? 0 : undefined}
                  role={interactive ? "button" : undefined}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            row.onClick?.();
                          }
                        }
                      : undefined
                  }
                >
                  <td className={styles.labelCol}>
                    <div className={styles.label}>{row.label}</div>
                    {row.sublabel !== undefined && (
                      <div className={styles.sublabel}>{row.sublabel}</div>
                    )}
                  </td>
                  <td className={styles.numCol}>
                    <DeltaCell value={row.a} format={row.format} />
                  </td>
                  <td className={styles.numCol}>
                    <DeltaCell
                      value={row.b}
                      format={row.format}
                      highlight={delta.diverges ? "diverges" : "none"}
                    />
                  </td>
                  <td className={styles.deltaCol}>
                    <DeltaSummary delta={delta} format={row.format} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
