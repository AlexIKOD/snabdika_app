import React from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "subtle"
  | "danger"
  | "danger-soft"
  | "danger-ghost"
  | "success";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  block?: boolean;
}

/**
 * Кнопка дизайн-системы.
 * Полный набор состояний (default / hover / active / focus-visible / disabled /
 * loading) реализован в ui.css через класс .btn и его модификаторы —
 * инлайновые стили не способны описать псевдоклассы.
 */
export const Button: React.FC<ButtonProps> = ({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  iconPosition = "left",
  block = false,
  children,
  disabled,
  className,
  type = "button",
  ...props
}) => {
  const isDisabled = Boolean(disabled) || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      data-loading={loading ? "true" : undefined}
      className={cn(
        "btn",
        `btn--${variant}`,
        `btn--${size}`,
        block && "btn--block",
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="btn__spinner" aria-hidden="true" />
      ) : icon && iconPosition === "left" ? (
        <span className="btn__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}

      {children}

      {!loading && icon && iconPosition === "right" && (
        <span className="btn__icon" aria-hidden="true">
          {icon}
        </span>
      )}
    </button>
  );
};
