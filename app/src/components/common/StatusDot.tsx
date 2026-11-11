import React from "react";
import { cn } from "../../lib/cn";

export type StatusTone = "success" | "warning" | "danger" | "neutral";

export interface StatusDotProps {
  tone?: StatusTone;
  /** Пульсирующее кольцо — «идёт синхронизация». */
  pulse?: boolean;
  size?: number;
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  tone = "neutral",
  pulse = false,
  size = 8,
  className,
}) => (
  <span
    className={cn("status-dot", `status-dot--${tone}`, className)}
    style={{ width: size, height: size, color: "currentColor" }}
    aria-hidden="true"
  >
    {pulse && <span className="status-dot__ping" />}
  </span>
);

export interface StatusPillProps {
  tone?: StatusTone;
  pulse?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  className?: string;
}

/** Компактная «пилюля» статуса для статус-бара и шапок. */
export const StatusPill: React.FC<StatusPillProps> = ({
  tone = "neutral",
  pulse = false,
  children,
  onClick,
  title,
  className,
}) => {
  const content = (
    <>
      <span
        style={{
          display: "inline-flex",
          color:
            tone === "success"
              ? "var(--color-success)"
              : tone === "warning"
              ? "var(--color-warning)"
              : tone === "danger"
              ? "var(--color-danger)"
              : "var(--color-text-subtle)",
        }}
      >
        <StatusDot tone={tone} pulse={pulse} />
      </span>
      {children}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={cn("status-pill", className)}
      >
        {content}
      </button>
    );
  }

  return (
    <span title={title} className={cn("status-pill", className)}>
      {content}
    </span>
  );
};
