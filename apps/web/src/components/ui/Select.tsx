import type { SelectHTMLAttributes } from "react";
import styles from "./Select.module.css";

type SelectSize = "sm" | "md";

interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  size?: SelectSize;
}

export function Select({ size = "sm", className, ...props }: SelectProps) {
  const cls = [styles.select, styles[size], className]
    .filter(Boolean)
    .join(" ");

  return <select className={cls} {...props} />;
}
