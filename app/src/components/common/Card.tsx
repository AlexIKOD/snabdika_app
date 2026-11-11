import React from "react";
import { cn } from "../../lib/cn";

export interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Убрать внутренние отступы (для таблиц и списков вплотную). */
  flush?: boolean;
  /** Подъём и акцентная рамка при наведении. */
  hoverable?: boolean;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  actions,
  children,
  footer,
  className,
  flush = false,
  hoverable = false,
  style,
}) => {
  return (
    <section className={cn("card", hoverable && "card--hoverable", className)} style={style}>
      {(title || actions) && (
        <header className="card__header">
          <div className="card__heading">
            {title && (
              <div className="card__title">
                <span>{title}</span>
              </div>
            )}
            {subtitle && <div className="card__subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}

      <div className={cn("card__body", flush && "card__body--flush")}>{children}</div>

      {footer && <footer className="card__footer">{footer}</footer>}
    </section>
  );
};
