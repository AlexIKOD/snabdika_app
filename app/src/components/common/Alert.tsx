import React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, Sparkles } from "lucide-react";
import { cn } from "../../lib/cn";

export type AlertTone = "info" | "success" | "warning" | "danger" | "neutral" | "accent";

export interface AlertProps {
  tone?: AlertTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode | false;
  action?: React.ReactNode;
  className?: string;
}

const TONE_ICON: Record<AlertTone, React.ReactNode> = {
  info: <Info size={16} strokeWidth={1.75} />,
  success: <CheckCircle2 size={16} strokeWidth={1.75} />,
  warning: <AlertTriangle size={16} strokeWidth={1.75} />,
  danger: <XCircle size={16} strokeWidth={1.75} />,
  neutral: <Info size={16} strokeWidth={1.75} />,
  accent: <Sparkles size={16} strokeWidth={1.75} />,
};

/**
 * Информационный баннер. Используется для блокирующих предупреждений
 * (нет ИНН, нулевая цена) и подтверждающих сообщений.
 */
export const Alert: React.FC<AlertProps> = ({
  tone = "info",
  title,
  children,
  icon,
  action,
  className,
}) => {
  const resolvedIcon = icon === false ? null : icon ?? TONE_ICON[tone];

  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("alert", `alert--${tone}`, className)}
    >
      {resolvedIcon && (
        <span className="alert__icon" aria-hidden="true">
          {resolvedIcon}
        </span>
      )}

      <div className="alert__content">
        {title && <div className="alert__title">{title}</div>}
        {children && <div className="alert__body">{children}</div>}
      </div>

      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
};
