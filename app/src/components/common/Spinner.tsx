import React from "react";
import { cn } from "../../lib/cn";

export interface SpinnerProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Индикатор загрузки. Ранее использовал @keyframes spin, который не был
 * нигде объявлен — анимация не работала. Кадры описаны в globals.css.
 */
export const Spinner: React.FC<SpinnerProps> = ({
  size = 20,
  color = "var(--color-accent)",
  className,
}) => (
  <span
    role="status"
    aria-label="Загрузка"
    className={cn("spinner", className)}
    style={{
      width: `${size}px`,
      height: `${size}px`,
      borderColor: color,
      borderRightColor: "transparent",
      borderWidth: 2,
    }}
  />
);

/** Центрированный по контейнеру индикатор для первичной загрузки экрана. */
export const CenteredSpinner: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      minHeight: 120,
      padding: "var(--space-12) 0",
    }}
  >
    <Spinner size={size} />
  </div>
);

export interface ProgressBarProps {
  /** 0..100. Если не передан — индетерминированный режим. */
  value?: number;
  progress?: number;
  max?: number;
  height?: number;
  variant?: "accent" | "success" | "warning" | "danger";
  animated?: boolean;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  progress,
  max = 100,
  height = 6,
  variant = "accent",
  animated = false,
  className,
}) => {
  const raw = value ?? progress;
  const isIndeterminate = raw === undefined || raw === null;
  const percentage = isIndeterminate
    ? 40
    : Math.min(100, Math.max(0, Math.round((raw / max) * 100)));

  return (
    <div
      role="progressbar"
      aria-valuenow={isIndeterminate ? undefined : percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("progress", className)}
      style={{ height: `${height}px` }}
    >
      <div
        className={cn(
          "progress__bar",
          variant !== "accent" && `progress__bar--${variant}`,
          isIndeterminate && "progress__bar--indeterminate"
        )}
        style={{
          width: `${percentage}%`,
          transition: isIndeterminate || !animated ? "none" : undefined,
        }}
      />
    </div>
  );
};
