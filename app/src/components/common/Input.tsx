import React from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Иконка слева. Передавайте готовый элемент lucide, например <Search size={15} />. */
  icon?: React.ReactNode;
  error?: string;
  hint?: string;
  /** Единица измерения справа: «кг», «₽/шт», «%». */
  suffixText?: string;
  /** Моноширинный шрифт и табличные цифры — для кодов, артикулов, ID. */
  mono?: boolean;
  requiredMark?: boolean;
  inputClassName?: string;
}

/**
 * Текстовое поле.
 * Все семь состояний (default / hover / active / focus-visible / disabled /
 * error / readonly) реализованы через `.input-shell` в ui.css — инлайновые
 * стили не способны описать `:focus-within`, поэтому оболочка вынесена в CSS.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      icon,
      error,
      hint,
      suffixText,
      mono = false,
      requiredMark = false,
      disabled,
      className,
      inputClassName,
      id,
      ...rest
    },
    ref
  ) => {
    const autoId = React.useId();
    const fieldId = id ?? autoId;

    return (
      <div className={cn("field", className)}>
        {label && (
          <label htmlFor={fieldId} className="field__label">
            {label}
            {requiredMark && <span className="field__label-req" aria-hidden="true">*</span>}
          </label>
        )}

        <div
          className="input-shell"
          data-error={error ? "true" : undefined}
          data-disabled={disabled ? "true" : undefined}
        >
          {icon && <span className="input__icon">{icon}</span>}
          <input
            {...rest}
            ref={ref}
            id={fieldId}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-required={requiredMark || undefined}
            aria-describedby={error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined}
            className={cn("input", mono && "input--mono", inputClassName)}
          />
          {suffixText && <span className="input__affix">{suffixText}</span>}
        </div>

        {error ? (
          <span id={`${fieldId}-err`} className="field__error" role="alert">
            {error}
          </span>
        ) : hint ? (
          <span id={`${fieldId}-hint`} className="field__hint">
            {hint}
          </span>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  mono?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, mono = false, disabled, className, id, ...rest }, ref) => {
    const autoId = React.useId();
    const fieldId = id ?? autoId;

    return (
      <div className={cn("field", className)}>
        {label && (
          <label htmlFor={fieldId} className="field__label">
            {label}
          </label>
        )}
        <div
          className="input-shell input-shell--textarea"
          data-error={error ? "true" : undefined}
          data-disabled={disabled ? "true" : undefined}
        >
          <textarea
            {...rest}
            ref={ref}
            id={fieldId}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            className={cn("textarea", mono && "textarea--mono")}
          />
        </div>
        {error ? (
          <span className="field__error" role="alert">
            {error}
          </span>
        ) : hint ? (
          <span className="field__hint">{hint}</span>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
