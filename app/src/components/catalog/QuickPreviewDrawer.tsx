import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, ExternalLink, Store, Weight, Ruler, Tag, Tags } from "lucide-react";
import type { Material } from "../../types/models";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import { IconButton } from "../common/IconButton";
import { Alert } from "../common/Alert";
import { money } from "../../lib/format";

export interface QuickPreviewDrawerProps {
  material: Material | null;
  onClose: () => void;
}

/**
 * Шторка быстрого просмотра позиции каталога.
 * Закрывается по Esc и по клику на крестик; при смене материала фокус
 * возвращается в документ, чтобы не «залипать» на скрытом элементе.
 */
export const QuickPreviewDrawer: React.FC<QuickPreviewDrawerProps> = ({ material, onClose }) => {
  const navigate = useNavigate();
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!material) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    const previousFocus = document.activeElement as HTMLElement | null;
    drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector<HTMLButtonElement>('.catalog-material-button')?.focus();
    };
  }, [material]);

  if (!material) return null;

  const props: Array<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = [
    { icon: <Ruler size={13} strokeWidth={1.75} />, label: "Ед. изм.", value: material.unit },
    {
      icon: <Weight size={13} strokeWidth={1.75} />,
      label: "Вес",
      value: material.weight_kg ? `${material.weight_kg} кг` : "—",
    },
    { icon: <Tag size={13} strokeWidth={1.75} />, label: "Бренд", value: material.brand || "—" },
    {
      icon: <Tags size={13} strokeWidth={1.75} />,
      label: "Синонимов",
      value: material.aliases_count,
    },
  ];

  return (
    <aside
      ref={drawerRef}
      className="drawer drawer--inset"
      style={{ width: 420 }}
      role="complementary"
      aria-label="Быстрый просмотр позиции"
    >
      {/* Шапка шторки */}
      <div className="drawer__header">
        <div className="row row--tight row--minw0">
          <span className="pos-card__id">ID: {material.material_id}</span>
          <Badge variant="success" pill>
            Нормализован
          </Badge>
        </div>
        <IconButton
          tooltip="Закрыть шторку (Esc)"
          icon={<X size={16} strokeWidth={1.75} />}
          onClick={onClose}
        />
      </div>

      {/* Содержимое */}
      <div className="drawer__body">
        <div>
          <span className="text-xs text-muted">
            {material.category} / {material.subcategory}
          </span>
          <h3
            style={{
              fontSize: "var(--text-lg)",
              fontWeight: 700,
              color: "var(--color-text)",
              margin: "4px 0 0",
              lineHeight: "var(--line-lg)",
            }}
          >
            {material.canonical_name}
          </h3>
        </div>

        {/* Свойства */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-3)",
            backgroundColor: "var(--color-bg-subtle)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
          }}
        >
          {props.map((p) => (
            <div key={p.label} className="minw-0">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: "var(--text-2xs)",
                  color: "var(--color-text-muted)",
                  marginBottom: 2,
                }}
              >
                {p.icon}
                {p.label}
              </div>
              <strong className="tabular-nums" style={{ fontSize: "var(--text-sm)" }}>
                {p.value}
              </strong>
            </div>
          ))}
        </div>

        {/* Лучшая закупка */}
        {material.best_purchase && (
          <Alert
            tone="success"
            title="Лучшая цена закупки"
            action={
              <span
                style={{
                  fontSize: "var(--text-lg)",
                  fontWeight: 700,
                  fontFamily: "var(--font-family)",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--color-success)",
                }}
              >
                {money(material.best_purchase.price)}
              </span>
            }
          >
            {material.best_purchase.supplier_name}
          </Alert>
        )}

        {/* Предложения поставщиков */}
        <div>
          <div
            style={{
              fontWeight: 600,
              fontSize: "var(--text-sm)",
              marginBottom: "var(--space-2)",
              color: "var(--color-text)",
            }}
          >
            Предложения поставщиков ({material.offers.length})
          </div>
          <div className="stack stack--tighter">
            {material.offers.map((off) => (
              <div
                key={off.offer_id}
                className="dz-file row row--between"
              >
                <div className="minw-0">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-1)",
                      fontWeight: 600,
                      color: "var(--color-text)",
                    }}
                  >
                    <Store size={13} strokeWidth={1.75} className="text-accent" />
                    {off.supplier_name}
                  </div>
                  <div
                    style={{
                      color: "var(--color-text-muted)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-2xs)",
                      marginTop: 2,
                    }}
                  >
                    Код: {off.supplier_code || "—"} · {off.external_id || off.article || off.ean ? `ID: ${off.external_id || off.article || off.ean}` : "ID не указан"} ·{" "}
                    {off.price_type === "retail" ? "Розница" : "Закупка"}
                  </div>
                  {off.raw_name && <div className="text-xs text-muted wrap-anywhere" style={{ marginTop: 3 }}>{off.raw_name}</div>}
                  {off.source_file && <div className="text-2xs text-muted" style={{ marginTop: 2 }}>Источник: {off.source_file} · {off.imported_at || off.updated_at}</div>}
                </div>
                <span
                  className="price-plain"
                  style={{ fontWeight: 700, fontFamily: "var(--font-family)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
                >
                  {money(off.price)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Футер шторки */}
      <div className="drawer__footer">
        <Button
          variant="primary"
          size="sm"
          icon={<ExternalLink size={14} strokeWidth={1.75} />}
          onClick={() => navigate(`/materials/${material.material_id}`)}
        >
          Открыть полную карточку
        </Button>
      </div>
    </aside>
  );
};
