import styles from "./Skeleton.module.css";

type SkeletonVariant = "line" | "block" | "row";

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function Skeleton({
  variant = "line",
  width,
  height,
  lines = 3,
}: SkeletonProps) {
  if (variant === "row") {
    return (
      <div className={styles.rows}>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={styles.row}>
            <div className={styles.pulse} style={{ width: "30%" }} />
            <div className={styles.pulse} style={{ width: "15%" }} />
            <div className={styles.pulse} style={{ width: "10%" }} />
            <div className={styles.pulse} style={{ width: "12%" }} />
            <div className={styles.pulse} style={{ width: "18%" }} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "block") {
    return (
      <div
        className={styles.pulse}
        style={{
          width: width ?? "100%",
          height: height ?? 80,
          borderRadius: "var(--radius-md)",
        }}
      />
    );
  }

  return (
    <div
      className={styles.pulse}
      style={{ width: width ?? "100%", height: height ?? 12 }}
    />
  );
}
