import React from "react";
import { Inbox } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

export type EmptyStateTone = "neutral" | "accent" | "warning" | "danger";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Переопределяет иконку. По умолчанию — Inbox. */
  icon?: React.ReactNode;
  /** Произвольное действие (кнопка или группа кнопок). */
  action?: React.ReactNode;
  /** Короткая форма действия: текст кнопки + обработчик. */
  actionLabel?: string;
  onAction?: () => void;
  /** Второе действие (например «Сбросить фильтры»). */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  tone?: EmptyStateTone;
  /** Уменьшенные отступы — для вложенных блоков и пустых таблиц. */
  compact?: boolean;
  className?: string;
}

/**
 * Пустое состояние.
 * Вместо голого «ничего не найдено» объясняет причину и даёт действие.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  tone = "neutral",
  compact = false,
  className,
}) => {
  const iconClass =
    tone === "neutral" ? "empty__icon" : cn("empty__icon", `empty__icon--${tone}`);

  return (
    <div className={cn("empty", compact && "empty--compact", className)}>
      <div className={iconClass}>{icon ?? <Inbox size={26} strokeWidth={1.5} />}</div>
      <h3 className="empty__title">{title}</h3>
      {description && <p className="empty__desc">{description}</p>}

      {(action || (actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction)) && (
        <div className="empty__actions">
          {action}
          {actionLabel && onAction && (
            <Button variant="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="ghost" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
