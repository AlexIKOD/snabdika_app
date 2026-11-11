import React, { useState } from "react";
import { Search, Check } from "lucide-react";
import type { Material } from "../../types/models";
import { Modal } from "../common/Modal";
import { Input } from "../common/Input";
import { Button } from "../common/Button";
import { money } from "../../lib/format";
import { apiClient } from "../../api/client";

export interface ManualMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rawText: string;
  onSelectMaterial: (material: Material) => void;
}

export const ManualMatchModal: React.FC<ManualMatchModalProps> = ({
  open,
  onOpenChange,
  rawText,
  onSelectMaterial,
}) => {
  const [searchQuery, setSearchQuery] = useState(rawText);
  const [results, setResults] = useState<Material[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await apiClient.getMaterials({ query: searchQuery.trim() });
      setResults(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Ручной подбор материала из каталога"
      description={rawText ? `Исходная строка клиента: «${rawText}»` : "Найдите материал во внутренней базе"}
      maxWidth="680px"
    >
      <form onSubmit={handleSearch} className="row row--tight mb-4">
        <div className="grow">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Введите наименование, бренд или код..."
            icon={<Search size={15} strokeWidth={1.75} />}
            autoFocus
          />
        </div>
        <Button variant="primary" type="submit" loading={searching} icon={<Search size={16} />}>
          Найти
        </Button>
      </form>

      <div className="stack stack--tighter scroll-360">
        {results.length === 0 && !searching && (
          <div className="centered-note">
            Введите поисковый запрос и нажмите «Найти»
          </div>
        )}

        {results.map((mat) => (
          <div
            key={mat.material_id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "var(--space-3)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-bg-elevated)",
            }}
          >
            <div>
              <div className="row row--tight">
                <span className="mono text-xs text-muted">
                  #{mat.material_id}
                </span>
                <span className="text-strong">{mat.canonical_name}</span>
              </div>
              <div className="text-xs text-muted mt-1">
                {mat.category} · {mat.unit} {mat.weight_kg ? `· ${mat.weight_kg} кг` : ""}
              </div>
              <div className="row text-xs mt-1">
                {mat.offers.slice(0, 2).map((off) => (
                  <span key={off.offer_id} className="text-muted">
                    {off.supplier_name}: <strong>{money(off.price)}</strong>
                  </span>
                ))}
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              icon={<Check size={14} />}
              onClick={() => {
                onSelectMaterial(mat);
                onOpenChange(false);
              }}
            >
              Выбрать
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
};
