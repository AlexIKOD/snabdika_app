import React from "react";
import { TriangleAlert, RefreshCw, Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

export interface ErrorStateProps {
  message: string;
  details?: string;
  onRetry?: () => void;
  /** Компактный вид — без большой иконки, для вложенных блоков. */
  compact?: boolean;
  className?: string;
}

/**
 * Состояние ошибки загрузки.
 * Технические подробности скрыты за `<details>`, чтобы не пугать пользователя,
 * но остаются доступными для диагностики и копирования в Bug Report.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  message,
  details,
  onRetry,
  compact = false,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!details) return;
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* буфер обмена недоступен — молча игнорируем */
    }
  };

  return (
    <div className={cn("empty", compact && "empty--compact", className)} role="alert">
      <div className="empty__icon empty__icon--danger">
        <TriangleAlert size={26} strokeWidth={1.5} />
      </div>
      <h3 className="empty__title">{message}</h3>

      {details && (
        <details className="json-view" style={{ marginTop: "var(--space-2)", maxWidth: 520 }}>
          <summary style={{ cursor: "pointer", fontSize: "var(--text-xs)" }}>
            Технические подробности
          </summary>
          <pre className="json-view__pre">{details}</pre>
          <Button
            variant="ghost"
            size="sm"
            icon={copied ? <Check size={14} strokeWidth={1.75} /> : <Copy size={14} strokeWidth={1.75} />}
            onClick={handleCopy}
          >
            {copied ? "Скопировано" : "Скопировать"}
          </Button>
        </details>
      )}

      {onRetry && (
        <div className="empty__actions">
          <Button
            variant="secondary"
            icon={<RefreshCw size={15} strokeWidth={1.75} />}
            onClick={onRetry}
          >
            Повторить попытку
          </Button>
        </div>
      )}
    </div>
  );
};
