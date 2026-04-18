import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Checkbox.module.css";

interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> {
  label?: ReactNode;
}

export function Checkbox({ label, className, id, ...props }: CheckboxProps) {
  const inputEl = (
    <input
      id={id}
      type="checkbox"
      className={[styles.input, className].filter(Boolean).join(" ")}
      {...props}
    />
  );
  if (label == null) return inputEl;
  return (
    <label className={styles.wrapper} htmlFor={id}>
      {inputEl}
      <span className={styles.label}>{label}</span>
    </label>
  );
}
