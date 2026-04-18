import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./TextInput.module.css";

type TextInputSize = "sm" | "md";

interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  size?: TextInputSize;
  leadingIcon?: ReactNode;
}

export function TextInput({
  size = "sm",
  leadingIcon,
  className,
  ...props
}: TextInputProps) {
  if (leadingIcon == null) {
    return (
      <input
        className={[styles.input, styles[size], className]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    );
  }
  return (
    <span className={[styles.wrapper, styles[size]].join(" ")}>
      <span className={styles.icon}>{leadingIcon}</span>
      <input
        className={[styles.input, styles.withIcon, styles[size], className]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    </span>
  );
}
