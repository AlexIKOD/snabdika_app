import React, { useRef, useState } from "react";
import { UploadCloud, FileText, FileSpreadsheet, Image as ImageIcon, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { IconButton } from "./IconButton";
import { fileSize } from "../../lib/format";

export interface UploadedFileItem {
  id?: string;
  name: string;
  size: number;
  type?: string;
  file?: File;
}

export interface DropZoneProps {
  files?: UploadedFileItem[];
  onFilesChange?: (files: UploadedFileItem[]) => void;
  accept?: string;
  multiple?: boolean;
  /** Прогресс загрузки 0..100 — рисуется тонкой полосой под зоной. */
  progress?: number;
  disabled?: boolean;
  hint?: string;
  className?: string;
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["xlsx", "xls", "csv"].includes(ext)) {
    return <FileSpreadsheet size={15} strokeWidth={1.75} style={{ color: "var(--color-success)" }} />;
  }
  if (["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) {
    return <ImageIcon size={15} strokeWidth={1.75} style={{ color: "var(--color-warning)" }} />;
  }
  return <FileText size={15} strokeWidth={1.75} className="dz-file__icon-fallback" />;
}

function formatSize(bytes: number): string {
  return fileSize(bytes);
}

/**
 * Зона перетаскивания файлов.
 * Доступна с клавиатуры (Enter / Space открывает диалог выбора файла),
 * имеет выраженное состояние drag-over и корректно показывает тип файла.
 */
export const DropZone: React.FC<DropZoneProps> = ({
  files = [],
  onFilesChange,
  accept = ".xlsx,.xls,.pdf,.jpg,.jpeg,.png",
  multiple = true,
  progress,
  disabled = false,
  hint = "Excel (.xlsx, .xls), PDF или фото сметы (до 50 МБ)",
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming || !onFilesChange) return;
    const added: UploadedFileItem[] = Array.from(incoming).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: f.name,
      size: f.size,
      type: f.type,
      file: f,
    }));
    onFilesChange(multiple ? [...files, ...added] : added.slice(0, 1));
  };

  const removeFile = (idx: number) => {
    if (!onFilesChange) return;
    onFilesChange(files.filter((_, i) => i !== idx));
  };

  return (
    <div className={cn("field", className)}>
      <div
        className="dropzone"
        data-over={isDragging ? "true" : undefined}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />

        <span className="dropzone__icon">
          <UploadCloud size={24} strokeWidth={1.75} />
        </span>

        <div>
          <div className="dropzone__title">
            Перетащите файлы сюда или{" "}
            <span className="text-accent">выберите файл</span>
          </div>
          <div className="dropzone__hint">{hint}</div>
        </div>
      </div>

      {typeof progress === "number" && (
        <div
          className="progress"
          style={{ marginTop: "var(--space-2)" }}
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="progress__bar" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}

      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {files.map((file, idx) => (
            <div key={file.id || idx} className="dz-file">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
                <span className="dz-file__icon">{fileIcon(file.name)}</span>
                <span
                  className="dz-file__name"
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {file.name}
                </span>
                <span className="dz-file__size">{formatSize(file.size)}</span>
              </div>
              <IconButton
                icon={<X size={14} strokeWidth={1.75} />}
                tooltip="Удалить файл"
                aria-label={`Удалить файл ${file.name}`}
                size="sm"
                variant="ghost"
                onClick={() => removeFile(idx)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

