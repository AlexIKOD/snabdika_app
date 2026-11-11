import React from "react";
import { Modal } from "./Modal";
import { Button, type ButtonVariant } from "./Button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  message?: string;
  /** Текст последствия: «Действие необратимо…». Приоритетнее `message`. */
  consequenceText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  loading?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

/**
 * Диалог подтверждения.
 * Заменяет нативный window.confirm(), который в Tauri/WebView2 блокирует
 * поток рендеринга и выглядит чужеродно в десктопном окне.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  message,
  consequenceText,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  variant = "primary",
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const handleClose = (val: boolean) => {
    if (!val) {
      onCancel?.();
      onOpenChange?.(false);
    }
  };

  const handleCancelClick = () => {
    onCancel?.();
    onOpenChange?.(false);
  };

  const bodyText = consequenceText || message;

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title={title}
      description={bodyText}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleCancelClick} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
};
