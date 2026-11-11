import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Тело модального окна. Может отсутствовать, если всё содержимое в `footer`. */
  children?: React.ReactNode;
  /** Ширина модального окна. По умолчанию 560px. */
  maxWidth?: string | number;
  /** Предзаданные размеры: sm 420 / md 560 / lg 760 / xl 980. */
  size?: "sm" | "md" | "lg" | "xl";
  footer?: React.ReactNode;
  /** Скрыть крестик в шапке (для обязательных сценариев). */
  hideClose?: boolean;
  className?: string;
}

const SIZE_MAP: Record<NonNullable<ModalProps["size"]>, number> = {
  sm: 420,
  md: 560,
  lg: 760,
  xl: 980,
};

/**
 * Модальное окно на Radix Dialog.
 * Оверлей, тень, анимация появления, фокус-ринг и крестик описаны в ui.css —
 * инлайновые стили не умеют псевдоклассы и keyframes.
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  maxWidth,
  size,
  footer,
  hideClose = false,
  className,
}) => {
  const resolvedWidth = maxWidth ?? SIZE_MAP[size ?? "md"];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className={cn("modal", className)}
          style={{
            maxWidth: typeof resolvedWidth === "number" ? `${resolvedWidth}px` : resolvedWidth,
          }}
        >
          <div className="modal__header">
            <div className="modal__heading">
              <Dialog.Title className="modal__title">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="modal__desc">{description}</Dialog.Description>
              )}
            </div>
            {!hideClose && (
              <Dialog.Close asChild>
                <button type="button" className="modal__close" aria-label="Закрыть">
                  <X size={18} strokeWidth={1.75} />
                </button>
              </Dialog.Close>
            )}
          </div>

          {children && <div className="modal__body">{children}</div>}

          {footer && <div className="modal__footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
