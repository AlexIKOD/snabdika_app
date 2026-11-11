import React from "react";
import { cn } from "../../lib/cn";

export type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "accent"
  | "violet"
  | "outline";

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  icon?: React.ReactNode;
  strikeThrough?: boolean;
  title?: string;
  /** Скруглённая «пилюля» вместо прямоугольника. */
  pill?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  children,
  icon,
  strikeThrough = false,
  title,
  pill = false,
  className,
  style,
}) => {
  return (
    <span
      title={title}
      style={style}
      className={cn(
        "badge",
        `badge--${variant}`,
        pill && "badge--pill",
        strikeThrough && "badge--strike",
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
};

/** Компактная пилюля-счётчик (количество записей, бейдж меню). */
export const CountPill: React.FC<{
  children: React.ReactNode;
  active?: boolean;
  title?: string;
  className?: string;
}> = ({ children, active = false, title, className }) => (
  <span title={title} className={cn("count-pill", active && "count-pill--active", className)}>
    {children}
  </span>
);
