import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: SelectOption[];
  hint?: string;
  error?: string;
}

/**
 * Нативный <select> в дизайн-коде приложения.
 * Нативный элемент сохранён сознательно: в Tauri/WebView2 он корректно
 * работает с клавиатурой и системным скроллом, а Radix Select в десктопном
 * WebView2 теряет фокус при быстром выборе.
 */
export const Select: React.FC<SelectProps> = ({
  label,
  options = [],
  value,
  onChange,
  children,
  hint,
  error,
  disabled,
  className,
  id,
  ...rest
}) => {
  const autoId = React.useId();
  const fieldId = id ?? autoId;

  return (
    <div className={cn("field", className)}>
      {label && (
        <label htmlFor={fieldId} className="field__label">
          {label}
        </label>
      )}

      <div className="select-shell">
        <select
          {...rest}
          id={fieldId}
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className={cn("select", error && "select--error")}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          {children}
        </select>
        <span className="select__chevron">
          <ChevronDown size={15} strokeWidth={1.75} />
        </span>
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
};
