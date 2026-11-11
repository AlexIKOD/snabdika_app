import React, { useEffect, useState } from "react";
import { Bot, ChevronDown, ChevronRight, Scissors, Search, Trash } from "lucide-react";
import { apiClient } from "../../api/client";
import type { ClientRequest, RequestPosition, RequestPositionVariant } from "../../types/models";
import { Badge, type BadgeVariant } from "../common/Badge";
import { Button } from "../common/Button";
import { IconButton } from "../common/IconButton";
import { EmptyState } from "../common/EmptyState";
import { money, percent } from "../../lib/format";
import { errorText } from "../../lib/errors";

const STATUS: Record<RequestPosition["status"], { label: string; variant: BadgeVariant }> = {
  matched: { label: "Сопоставлено", variant: "accent" },
  needs_review: { label: "Требует проверки", variant: "warning" },
  conflict: { label: "Конфликт", variant: "danger" },
  not_found: { label: "Не найдено", variant: "danger" },
  rejected: { label: "Отклонено", variant: "neutral" },
  confirmed: { label: "Подтверждено", variant: "success" },
};

/** Источники цены продажи, которые чаще всего вводит оператор. */
const RETAIL_SOURCES = ["Согласовано с клиентом", "Прайс поставщика", "Ручной ввод оператора"];

function marginPercent(retail: number | null | undefined, purchase: number | null | undefined) {
  if (!retail || retail <= 0 || purchase == null) return null;
  return ((retail - purchase) / retail) * 100;
}

interface PositionRowProps {
  requestId: number;
  position: RequestPosition;
  selected: boolean;
  onSelect: () => void;
  onPick: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onSaved: (position: RequestPosition) => void;
  onConfirm: (positionId: number) => Promise<void>;
}

const PositionRow: React.FC<PositionRowProps> = ({
  requestId,
  position,
  selected,
  onSelect,
  onPick,
  onSplit,
  onDelete,
  onSaved,
  onConfirm,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const [qty, setQty] = useState(position.parsed_qty == null ? "" : String(position.parsed_qty));
  const [retail, setRetail] = useState(position.retail_price == null ? "" : String(position.retail_price));
  const [purchase, setPurchase] = useState(position.purchase_price == null ? "" : String(position.purchase_price));
  const [retailSource, setRetailSource] = useState(position.retail_source ?? "");
  const [purchaseSource, setPurchaseSource] = useState(position.purchase_source ?? "");
  const [supplierId, setSupplierId] = useState<number | null>(position.selected_supplier_id ?? null);

  useEffect(() => {
    setQty(position.parsed_qty == null ? "" : String(position.parsed_qty));
    setRetail(position.retail_price == null ? "" : String(position.retail_price));
    setPurchase(position.purchase_price == null ? "" : String(position.purchase_price));
    setRetailSource(position.retail_source ?? "");
    setPurchaseSource(position.purchase_source ?? "");
    setSupplierId(position.selected_supplier_id ?? null);
  }, [position]);

  const isConfirmed = position.status === "confirmed";
  const margin = marginPercent(Number(retail) || null, purchase.trim() === "" ? null : Number(purchase));
  const variantGroups = [
    { title: "Точные совпадения", items: (position.variants ?? []).filter((variant) => variant.class === "exact") },
    { title: "Возможные совпадения", items: (position.variants ?? []).filter((variant) => variant.class === "probable") },
    { title: "Аналоги: замена требует отдельного подтверждения", items: position.analogs ?? [] },
  ].filter((group) => group.items.length > 0);

  const changedFields = (): Partial<RequestPosition> => {
    const patch: Partial<RequestPosition> = {};
    const qtyValue = Number(qty);
    if (qty.trim() !== "" && Number.isFinite(qtyValue) && qtyValue !== position.parsed_qty) {
      patch.parsed_qty = qtyValue;
    }
    if (retail.trim() !== "" && Number(retail) !== position.retail_price) {
      patch.retail_price = Number(retail);
      // Источник обязателен для счёта: если оператор ввёл цену вручную, подставляем его.
      if (!retailSource.trim()) {
        patch.retail_source = "Ручной ввод оператора";
        setRetailSource("Ручной ввод оператора");
      }
    }
    if (purchase.trim() !== "" && Number(purchase) !== position.purchase_price) patch.purchase_price = Number(purchase);
    if (retailSource !== (position.retail_source ?? "")) patch.retail_source = retailSource;
    if (purchaseSource !== (position.purchase_source ?? "")) patch.purchase_source = purchaseSource;
    return patch;
  };

  const persist = async (patch: Partial<RequestPosition>) => {
    const res = await apiClient.updateRequestPosition(requestId, position.position_id, patch);
    onSaved(res.data);
    return res.data;
  };

  const saveOnBlur = async () => {
    const patch = changedFields();
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    setRowError(null);
    try {
      await persist(patch);
    } catch (err) {
      setRowError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const offerLabel = (alternative: RequestPosition["alternatives"][number]) =>
    `${alternative.supplier_name} · ${alternative.price_type === "retail" ? "розница" : "закупка"} ${money(alternative.price)}`;

  const selectSupplier = async (value: string) => {
    const nextId = value === "" ? null : Number(value);
    setSupplierId(nextId);
    const offers = position.alternatives.filter((item) => item.supplier_id === nextId);
    const alternative = offers.find((item) => item.price_type !== "retail") ?? offers[0];
    if (!alternative || nextId == null) return;

    // Один выбор поставщика подставляет обе его цены; розница — если она есть в прайсе.
    const retailOffer = offers.find((item) => item.price_type === "retail");
    const source = `Прайс: ${alternative.supplier_name}`;
    setPurchase(String(alternative.price));
    setPurchaseSource(source);
    if (retailOffer) {
      setRetail(String(retailOffer.price));
      setRetailSource("Прайс поставщика");
    }
    setBusy(true);
    setRowError(null);
    try {
      await persist({
        selected_supplier_id: nextId,
        selected_price: alternative.price,
        purchase_price: alternative.price,
        purchase_source: source,
        ...(retailOffer ? { retail_price: retailOffer.price, retail_source: "Прайс поставщика" } : {}),
      });
    } catch (err) {
      setRowError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setRowError(null);
    try {
      // Backend снимает подтверждение при любой значимой правке, поэтому правки сохраняются первыми.
      await persist(changedFields());
      await onConfirm(position.position_id);
    } catch (err) {
      setRowError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const chooseVariant = async (variant: RequestPositionVariant) => {
    if (busy) return;
    setBusy(true);
    setRowError(null);
    try {
      const res = await apiClient.selectVariant(
        requestId, position.position_id, variant.material_id, variant.class === "analog");
      onSaved(res.data);
    } catch (err) {
      setRowError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const unconfirm = async () => {
    setBusy(true);
    setRowError(null);
    try {
      await persist({ status: "needs_review" });
    } catch (err) {
      setRowError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <tr className="dt__row" data-margin={margin != null && margin < 0 ? "negative" : undefined}>
        <td>
          <input
            type="checkbox"
            className="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={`Выбрать поз. ${position.position_id}`}
          />
        </td>
        <td className="dt__muted tabular-nums">{position.position_id}</td>
        <td>
          <span className="pos-text" title={position.raw_text}>{position.raw_text}</span>
        </td>
        <td>
          {position.matched_material_name ? (
            <span className="pos-text" title={position.matched_material_name}>
              {position.matched_material_name}
            </span>
          ) : (
            <span className="text-warning">материал не выбран</span>
          )}
        </td>
        <td>
          <div className="cell-stack">
            <input
              className="cell-input cell-input--num"
              type="number"
              min="0"
              step="any"
              onWheel={(e) => e.currentTarget.blur()}
              aria-label={`Количество, поз. ${position.position_id}`}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onBlur={() => void saveOnBlur()}
              disabled={busy}
            />
            <span className="text-xs text-muted">
              {position.matched_material_unit || position.parsed_unit || "ед. не указана"}
            </span>
          </div>
        </td>
        <td>
          <div className="cell-stack">
            <input
              className="cell-input cell-input--num"
              type="number"
              min="0"
              step="any"
              onWheel={(e) => e.currentTarget.blur()}
              aria-label={`Себестоимость, поз. ${position.position_id}`}
              value={purchase}
              onChange={(e) => setPurchase(e.target.value)}
              onBlur={() => void saveOnBlur()}
              disabled={busy}
            />
            <span className="text-xs text-muted truncate" title={purchaseSource || undefined}>
              {purchaseSource || (purchase ? "источник не указан" : "—")}
            </span>
          </div>
        </td>
        <td>
          <div className="cell-stack">
            <input
              className="cell-input cell-input--num"
              type="number"
              min="0"
              step="any"
              onWheel={(e) => e.currentTarget.blur()}
              aria-label={`Розница, поз. ${position.position_id}`}
              value={retail}
              onChange={(e) => setRetail(e.target.value)}
              onBlur={() => void saveOnBlur()}
              disabled={busy}
            />
            <span className={`text-xs ${margin != null && margin < 0 ? "text-danger" : "text-muted"}`}>
              {margin == null ? "маржа —" : `маржа ${percent(margin)}`}
            </span>
          </div>
        </td>
        <td className="dt__num">
          {position.sale_price == null ? (
            <span className="text-xs text-warning" title="Нужны розница, себестоимость и количество больше нуля">
              —
            </span>
          ) : (
            <span className="tabular-nums" aria-label={`Цена к счёту, поз. ${position.position_id}`}>
              {money(position.sale_price)}
            </span>
          )}
        </td>
        <td>
          {position.alternatives.length > 0 ? (
            <select
              className="cell-input"
              aria-label={`Поставщик, поз. ${position.position_id}`}
              value={supplierId == null ? "" : String(supplierId)}
              onChange={(e) => void selectSupplier(e.target.value)}
              disabled={busy}
            >
              <option value="">не выбран</option>
              {position.alternatives.map((alternative, index) => (
                <option key={`${alternative.supplier_id ?? index}-${alternative.price}`} value={alternative.supplier_id ?? ""}>
                  {offerLabel(alternative)}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td>
          <div className="stack stack--tightest">
            <Badge pill variant={STATUS[position.status].variant}>
              {STATUS[position.status].label}
            </Badge>
            {!position.matched_material_id ? (
              <span className="text-xs text-warning">выберите материал</span>
            ) : position.confidence > 0 && position.status !== "confirmed" && (
              <span className="text-xs text-muted" title="Совпадение с материалом каталога">
                совпадение {position.confidence}%
              </span>
            )}
          </div>
        </td>
        <td className="dt__cell--sticky">
          <div className="row row--end row--tight">
            <IconButton
              size="sm"
              variant="ghost"
              icon={expanded ? <ChevronDown size={15} strokeWidth={1.75} /> : <ChevronRight size={15} strokeWidth={1.75} />}
              tooltip={`Подробнее о поз. ${position.position_id}`}
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            />
            <IconButton
              size="sm"
              variant="danger"
              icon={<Trash size={14} strokeWidth={1.75} />}
              tooltip={`Удалить поз. ${position.position_id}`}
              onClick={onDelete}
            />
            <Button
              size="sm"
              variant="secondary"
              className="pos-confirm"
              loading={busy}
              aria-label={`${isConfirmed ? "Снять подтверждение" : "Подтвердить"} поз. ${position.position_id}`}
              disabled={!position.matched_material_id}
              onClick={() => void (isConfirmed ? unconfirm() : confirm())}
            >
              {isConfirmed ? "Снять" : "Подтвердить"}
            </Button>
          </div>
        </td>
      </tr>

      {rowError && (
        <tr className="pos-details">
          <td colSpan={11}>
            <div className="inline-msg inline-msg--danger inline-msg--block">{rowError}</div>
          </td>
        </tr>
      )}

      {expanded && (
        <tr className="pos-details">
          <td colSpan={11}>
            <div className="pos-details__box">
              {(position.review_questions?.length || position.reasoning) && (
                <div className="ai-note">
                  <span className="ai-note__icon">
                    <Bot size={14} strokeWidth={1.75} />
                  </span>
                  {/* reasoning повторяет вопросы целиком, поэтому показываем его только когда вопросов нет. */}
                  <span>
                    {position.review_questions?.length
                      ? position.review_questions.join(" ")
                      : position.reasoning}
                  </span>
                </div>
              )}

              {position.flags.length > 0 && (
                <div className="row row--tight row--wrap">
                  {position.flags.map((flag) => (
                    <Badge key={flag} variant="warning" pill>
                      {flag}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="form-grid form-grid--2-1">
                <label className="field">
                  <span className="field__label">Источник цены продажи</span>
                  <select
                    className="cell-input"
                    aria-label={`Источник цены продажи, поз. ${position.position_id}`}
                    value={retailSource}
                    onChange={(e) => setRetailSource(e.target.value)}
                    onBlur={() => void saveOnBlur()}
                    disabled={busy}
                  >
                    <option value="">не указан</option>
                    {[...new Set([...RETAIL_SOURCES, retailSource].filter(Boolean))].map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Источник закупки</span>
                  <input
                    className="cell-input"
                    aria-label={`Источник закупки, поз. ${position.position_id}`}
                    value={purchaseSource}
                    onChange={(e) => setPurchaseSource(e.target.value)}
                    onBlur={() => void saveOnBlur()}
                    disabled={busy}
                  />
                </label>
              </div>

              {variantGroups.length > 0 && (
                <div className="variant-groups">
                  {variantGroups.map((group) => (
                    <div key={group.title} className="variant-group">
                      <span className="variant-group__title">{group.title}</span>
                      <div className="row row--tight row--wrap">
                        {group.items.map((variant) => (
                          <button
                            key={variant.material_id}
                            type="button"
                            className="variant-card"
                            aria-pressed={position.matched_material_id === variant.material_id}
                            disabled={busy}
                            onClick={() => void chooseVariant(variant)}
                          >
                            <span className="variant-card__name">{variant.canonical_name}</span>
                            <span className="variant-card__meta">
                              {variant.score}% · {variant.unit}
                              {variant.conflicting_fields.length > 0
                                ? ` · расходится: ${variant.conflicting_fields.join(", ")}`
                                : ""}
                            </span>
                            {variant.offers.length > 0 && (
                              <span className="variant-card__offers">
                                {variant.offers.slice(0, 3).map((offer) =>
                                  `${offer.supplier_name} ${money(offer.price)}`).join(" · ")}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {position.variant_selected_at && (
                <div className="text-xs text-muted">
                  Выбрано оператором: {position.variant_selected_class === "manual"
                    ? "вручную из каталога"
                    : `класс ${position.variant_selected_class}, ранг ${position.variant_selected_rank}`}
                  {position.variant_selected_at ? ` · ${new Date(position.variant_selected_at).toLocaleString("ru-RU")}` : ""}
                </div>
              )}

              {position.alternatives.length > 0 && (
                <div className="supplier-picks">
                  <span className="supplier-picks__label">Предложения поставщиков:</span>
                  {position.alternatives.map((alternative, index) => (
                    <button
                      key={`${alternative.supplier_id ?? index}-${alternative.price}`}
                      type="button"
                      className="chip"
                      aria-pressed={position.selected_supplier_id === alternative.supplier_id}
                      onClick={() => void selectSupplier(String(alternative.supplier_id ?? ""))}
                    >
                      {offerLabel(alternative)}
                    </button>
                  ))}
                </div>
              )}

              <div className="row row--tight">
                <Button size="sm" variant="secondary" icon={<Scissors size={14} strokeWidth={1.75} />} onClick={onSplit}>
                  Разделить строку
                </Button>
                <Button size="sm" variant="ghost" onClick={onPick}>
                  Подобрать материал
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export interface PositionsTableProps {
  request: ClientRequest;
  selectedIds: number[];
  onToggleSelect: (positionId: number) => void;
  onToggleAll: () => void;
  onPick: (position: RequestPosition) => void;
  onSplit: (position: RequestPosition) => void;
  onDelete: (position: RequestPosition) => void;
  onSaved: (position: RequestPosition) => void;
  onConfirm: (positionId: number) => Promise<void>;
}

export const PositionsTable: React.FC<PositionsTableProps> = ({
  request,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onPick,
  onSplit,
  onDelete,
  onSaved,
  onConfirm,
}) => {
  if (request.positions.length === 0) {
    return (
      <EmptyState
        icon={<Search size={24} strokeWidth={1.5} />}
        title="В документе нет позиций"
        description="Добавьте товар из каталога или позицию вручную, затем запустите сопоставление."
      />
    );
  }

  const allSelected = request.positions.every((position) => selectedIds.includes(position.position_id));

  return (
    <div className="dt pos-table">
      <div className="dt__scroll">
        <table className="dt__table">
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 40 }} />
            <col />
            <col />
            <col style={{ width: 96 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 128 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 176 }} />
          </colgroup>
          <thead className="dt__thead">
            <tr>
              <th>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="Выбрать все позиции"
                />
              </th>
              <th>№</th>
              <th>Клиент</th>
              <th>Товар</th>
              <th className="dt__num">Кол-во</th>
              <th className="dt__num">Себестоимость</th>
              <th className="dt__num">Розница</th>
              <th className="dt__num">Продажа</th>
              <th>Поставщик</th>
              <th>Статус</th>
              <th className="dt__cell--sticky"><span className="sr-only">Действия</span></th>
            </tr>
          </thead>
          <tbody>
            {request.positions.map((position) => (
              <PositionRow
                key={position.position_id}
                requestId={request.request_id}
                position={position}
                selected={selectedIds.includes(position.position_id)}
                onSelect={() => onToggleSelect(position.position_id)}
                onPick={() => onPick(position)}
                onSplit={() => onSplit(position)}
                onDelete={() => onDelete(position)}
                onSaved={onSaved}
                onConfirm={onConfirm}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
