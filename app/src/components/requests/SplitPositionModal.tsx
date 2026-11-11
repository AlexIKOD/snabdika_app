import React, { useState } from "react";
import { Scissors } from "lucide-react";
import type { RequestPosition } from "../../types/models";
import { Modal } from "../common/Modal";
import { Input } from "../common/Input";
import { Button } from "../common/Button";

export interface SplitPositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: RequestPosition | null;
  onSplit: (part1: { text: string; qty: number; unit: string }, part2: { text: string; qty: number; unit: string }) => void;
}

export const SplitPositionModal: React.FC<SplitPositionModalProps> = ({
  open,
  onOpenChange,
  position,
  onSplit,
}) => {
  const [part1Text, setPart1Text] = useState("");
  const [part1Qty, setPart1Qty] = useState("1");
  const [part1Unit, setPart1Unit] = useState("шт.");

  const [part2Text, setPart2Text] = useState("");
  const [part2Qty, setPart2Qty] = useState("1");
  const [part2Unit, setPart2Unit] = useState("шт.");

  React.useEffect(() => {
    if (position) {
      setPart1Text(position.raw_text);
      setPart1Qty(String(position.parsed_qty || 1));
      setPart1Unit(position.parsed_unit || "шт.");
      setPart2Text("");
      setPart2Qty("1");
      setPart2Unit("шт.");
    }
  }, [position]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!part1Text.trim() || !part2Text.trim()) return;

    onSplit(
      { text: part1Text.trim(), qty: parseFloat(part1Qty) || 1, unit: part1Unit.trim() },
      { text: part2Text.trim(), qty: parseFloat(part2Qty) || 1, unit: part2Unit.trim() }
    );
    onOpenChange(false);
  };

  if (!position) return null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Разделение строки заявки"
      description="Разделите позицию на два отдельных товара для точного сопоставления"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="primary"
            icon={<Scissors size={16} strokeWidth={1.75} />}
            disabled={!part1Text.trim() || !part2Text.trim()}
            onClick={() => void handleSubmit()}
          >
            Разделить на 2 позиции
          </Button>
        </>
      }
    >
      <form className="form-stack" onSubmit={(e) => void handleSubmit(e)}>
        <div className="ai-note">
          <span className="ai-note__icon">
            <Scissors size={14} strokeWidth={1.75} />
          </span>
          <span>
            Исходная строка клиента: <strong>«{position.raw_text}»</strong>
          </span>
        </div>

        {/* Часть 1 */}
        <fieldset className="panel panel--pad fieldset-stack">
          <legend className="field__label legend--accent">
            Позиция 1
          </legend>
          <Input
            label="Текст товара 1"
            requiredMark
            value={part1Text}
            onChange={(e) => setPart1Text(e.target.value)}
          />
          <div className="form-grid form-grid--1-1">
            <Input
              type="number"
              step="any"
              label="Количество"
              requiredMark
              value={part1Qty}
              onChange={(e) => setPart1Qty(e.target.value)}
            />
            <Input
              label="Ед. изм."
              requiredMark
              value={part1Unit}
              onChange={(e) => setPart1Unit(e.target.value)}
            />
          </div>
        </fieldset>

        {/* Часть 2 */}
        <fieldset className="panel panel--pad fieldset-stack">
          <legend className="field__label legend--success">
            Позиция 2
          </legend>
          <Input
            label="Текст товара 2"
            requiredMark
            value={part2Text}
            onChange={(e) => setPart2Text(e.target.value)}
            placeholder="Второй товар из строки..."
          />
          <div className="form-grid form-grid--1-1">
            <Input
              type="number"
              step="any"
              label="Количество"
              requiredMark
              value={part2Qty}
              onChange={(e) => setPart2Qty(e.target.value)}
            />
            <Input
              label="Ед. изм."
              requiredMark
              value={part2Unit}
              onChange={(e) => setPart2Unit(e.target.value)}
            />
          </div>
        </fieldset>
      </form>
    </Modal>
  );
};
