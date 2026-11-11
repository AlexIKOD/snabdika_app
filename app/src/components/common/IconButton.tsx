import React from "react";
import { cn } from "../../lib/cn";
import { Tooltip } from "./Tooltip";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Подпись тултипа. Одновременно служит aria-label — иконки не несут текста. */
  tooltip: string;
  icon: React.ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "secondary" | "danger" | "accent";
  /** Отключить тултип (например, внутри уже подписанного элемента). */
  hideTooltip?: boolean;
  tooltipSide?: "top" | "right" | "bottom" | "left";
}

export const IconButton: React.FC<IconButtonProps> = ({
  tooltip,
  icon,
  size = "md",
  variant = "ghost",
  hideTooltip = false,
  tooltipSide = "top",
  className,
  type = "button",
  ...props
}) => {
  const button = (
    <button
      type={type}
      aria-label={tooltip}
      className={cn("icon-btn", `icon-btn--${size}`, `icon-btn--${variant}`, className)}
      {...props}
    >
      {icon}
    </button>
  );

  if (hideTooltip) return button;

  return (
    <Tooltip content={tooltip} side={tooltipSide}>
      {button}
    </Tooltip>
  );
};
