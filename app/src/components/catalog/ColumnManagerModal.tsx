import React from "react";
import { Eye, EyeOff, RotateCcw, Check } from "lucide-react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";

export interface ColumnManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: { id: string; header: string; visible: boolean }[];
  onToggleColumn: (columnId: string) => void;
  onReset: () => void;
}

export const ColumnManagerModal: React.FC<ColumnManagerModalProps> = ({
  open,
  onOpenChange,
  columns,
  onToggleColumn,
  onReset,
}) => {
  const visibleCount = columns.filter((c) => c.visible).length;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Настройка отображения колонок таблицы"
      description="Выберите колонки номенклатуры для отображения в рабочей области"
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={15} strokeWidth={1.75} />}
            onClick={onReset}
          >
            Сбросить по умолчанию
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Check size={15} strokeWidth={2} />}
            onClick={() => onOpenChange(false)}
          >
            Готово
          </Button>
        </>
      }
    >
      <div className="col-manager">
        <div className="col-manager__meta">
          Показано {visibleCount} из {columns.length} колонок
        </div>

        <ul className="col-manager__list" role="list">
          {columns.map((col) => (
            <li key={col.id}>
              <button
                type="button"
                className="col-toggle"
                data-on={col.visible ? "true" : "false"}
                aria-pressed={col.visible}
                onClick={() => onToggleColumn(col.id)}
              >
                <span className="col-toggle__label">{col.header}</span>
                <span className="col-toggle__icon" aria-hidden="true">
                  {col.visible ? (
                    <Eye size={17} strokeWidth={1.75} />
                  ) : (
                    <EyeOff size={17} strokeWidth={1.75} />
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
};
