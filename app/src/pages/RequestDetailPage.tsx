import { toast } from "sonner";
import { date as formatDate, money } from "../lib/format";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, X, Receipt, Trash, Sparkles, Plus, PackageSearch } from "lucide-react";
import { apiClient } from "../api/client";
import type { ClientRequest, RequestPosition, RequestPricing, RequestPricingResult, Material } from "../types/models";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { Modal } from "../components/common/Modal";
import { Input } from "../components/common/Input";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { ErrorState } from "../components/common/ErrorState";
import { Alert } from "../components/common/Alert";
import { ManualMatchModal } from "../components/requests/ManualMatchModal";
import { SplitPositionModal } from "../components/requests/SplitPositionModal";
import { PositionsTable } from "../components/requests/PositionsTable";
import { RequestStatusBadge } from "../components/requests/requestMeta";
import { readyCount as countReady, requestSaleSum } from "../lib/requestMeta";
import { InvoicePreviewModal } from "../components/invoices/InvoicePreviewModal";
import { errorText } from "../lib/errors";

export const RequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [request, setRequest] = useState<ClientRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Прогресс AI-сопоставления
  const [matchingInProgress, setMatchingInProgress] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [positionToDelete, setPositionToDelete] = useState<RequestPosition | null>(null);

  // Модалка предпросмотра счета
  const [previewOpen, setPreviewOpen] = useState(false);

  // Модалка ручного подбора
  const [manualMatchModalOpen, setManualMatchModalOpen] = useState(false);
  const [activePositionForMatch, setActivePositionForMatch] = useState<RequestPosition | null>(null);

  // Модалка разделения строки
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [activePositionForSplit, setActivePositionForSplit] = useState<RequestPosition | null>(null);

  // Модалка ручного добавления позиции
  const [addPosModalOpen, setAddPosModalOpen] = useState(false);
  const [newPosText, setNewPosText] = useState("");
  const [newPosQty, setNewPosQty] = useState("1");
  const [newPosUnit, setNewPosUnit] = useState("шт.");

  // Модалка добавления товара из каталога
  const [addFromCatalogOpen, setAddFromCatalogOpen] = useState(false);

  const [selectedPositionIds, setSelectedPositionIds] = useState<number[]>([]);
  const [attentionOnly, setAttentionOnly] = useState(false);

  // Настройки расчёта живут в шапке заявки; сервер пересчитывает цены к счёту.
  const [pricing, setPricing] = useState<RequestPricingResult | null>(null);
  const [percentDraft, setPercentDraft] = useState("0");

  const toggleSelection = (id: number) => {
    setSelectedPositionIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const requestIdRef = useRef<number | null>(null);

  /** Цены к счёту считает сервер; после любой правки позиций их нужно перечитать. */
  const refreshPricing = useCallback((reqId: number) => {
    // Ответ для уже закрытой заявки не должен перекрыть текущую.
    apiClient.getRequestPricing(reqId)
      .then((view) => {
        if (requestIdRef.current !== reqId) return;
        setPricing(view.data);
        const prices = new Map(view.data.positions.map((row) => [row.position_id, row.sale_price]));
        setRequest((current) => current && current.request_id === reqId ? {
          ...current,
          positions: current.positions.map((position) => ({
            ...position, sale_price: prices.get(position.position_id) ?? null,
          })),
        } : current);
      })
      .catch(() => { if (requestIdRef.current === reqId) setPricing(null); });
  }, []);

  const loadRequest = useCallback(async (reqId: number, silent = false) => {
    requestIdRef.current = reqId;
    try {
      // Тихая перезагрузка не размонтирует таблицу и не теряет ошибку в строке.
      if (!silent) setLoading(true);
      setError(null);
      const res = await apiClient.getRequestById(reqId);
      setRequest(res.data);
      setPricing(null);
      refreshPricing(reqId);
      setPercentDraft(String(res.data.pricing?.target_percent ?? 0));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [refreshPricing]);

  useEffect(() => {
    if (id) loadRequest(parseInt(id, 10));
  }, [id, loadRequest]);

  // Запуск AI-сопоставления с пошаговой индикацией (§7.6 ТЗ)
  const handleRunMatching = async () => {
    if (!request || request.positions.length === 0 || matchingInProgress) return;

    setMatchingInProgress(true);
    try {
      const res = await apiClient.runMatching(request.request_id);
      setRequest(res.data);
      refreshPricing(request.request_id);
    } catch (err) {
      toast.error(`Ошибка сопоставления: ${errorText(err)}`);
    } finally { setMatchingInProgress(false); }
  };

  const handleDeleteRequest = async () => {
    if (!request || deleting) return;
    setDeleting(true);
    try {
      await apiClient.deleteRequest(request.request_id);
      toast.success("Заявка удалена");
      navigate("/requests");
    } catch (err) {
      toast.error(`Не удалось удалить заявку: ${errorText(err)}`);
    } finally { setDeleting(false); }
  };

  /** Закупка — из лучшего предложения, розница — из прайса того же поставщика; оператор правит, а не вводит. */
  const pricePatch = (material: Material) => {
    const priced = material.offers.filter((o) => o.price != null && o.price > 0);
    const purchase = priced.filter((o) => o.price_type === "purchase").sort((a, b) => a.price! - b.price!)[0]
      ?? priced[0];
    const retail = purchase
      ? priced.filter((o) => o.price_type === "retail" && o.supplier_id === purchase.supplier_id)
          .sort((a, b) => a.price! - b.price!)[0]
      : undefined;
    return {
      selected_supplier_id: purchase?.supplier_id ?? null,
      selected_price: purchase?.price ?? null,
      purchase_price: purchase?.price ?? null,
      purchase_source: purchase ? `Прайс: ${purchase.supplier_name}` : "",
      ...(retail ? { retail_price: retail.price!, retail_source: "Прайс поставщика" } : {}),
      alternatives: priced.map((o) => ({
        material_id: material.material_id,
        name: `${material.canonical_name} (${o.supplier_name})`,
        score: 100,
        supplier_name: o.supplier_name,
        supplier_id: o.supplier_id,
        price: o.price!,
        price_type: o.price_type,
      })),
    };
  };

  const handleManualMatchSelect = async (material: Material) => {
    if (!request || !activePositionForMatch) return;
    try {
      await apiClient.updateRequestPosition(request.request_id, activePositionForMatch.position_id, {
        matched_material_id: material.material_id,
        matched_material_name: material.canonical_name,
        matched_material_unit: material.unit,
        confidence: 100,
        status: "needs_review",
        reasoning: "Выбрано вручную оператором из каталога",
        ...pricePatch(material),
      });
      loadRequest(request.request_id);
    } catch (err) {
      toast.error(`Ошибка привязки материала: ${errorText(err)}`);
    }
  };

  const mergePosition = (position: RequestPosition) => {
    setRequest((current) =>
      current
        ? {
            ...current,
            positions: current.positions.map((item) =>
              item.position_id === position.position_id ? position : item
            ),
          }
        : current
    );
    if (request) refreshPricing(request.request_id);
  };

  const handleAddMaterialToRequest = async (material: Material) => {
    if (!request) return;
    try {
      const added = await apiClient.addPosition(
        request.request_id,
        material.canonical_name,
        1,
        material.unit || "шт."
      );
      const created = added.data.positions[added.data.positions.length - 1];
      await apiClient.updateRequestPosition(request.request_id, created.position_id, {
        matched_material_id: material.material_id,
        confidence: 100,
        reasoning: "Добавлено оператором из каталога",
        status: "needs_review",
        ...pricePatch(material),
      });
      await loadRequest(request.request_id);
    } catch (err) {
      toast.error(`Не удалось добавить товар: ${errorText(err)}`);
    }
  };

  const handleSplitPosition = async (
    part1: { text: string; qty: number; unit: string },
    part2: { text: string; qty: number; unit: string }
  ) => {
    if (!request || !activePositionForSplit) return;
    try {
      const res = await apiClient.splitPosition(request.request_id, activePositionForSplit.position_id, part1, part2);
      setRequest(res.data);
    } catch (err) {
      toast.error(`Ошибка разделения позиции: ${errorText(err)}`);
    }
  };

  const handleDeletePosition = async (posId: number) => {
    if (!request) return;
    try {
      const res = await apiClient.deletePosition(request.request_id, posId);
      setRequest(res.data);
      setPositionToDelete(null);
      toast.success("Позиция удалена из заявки");
    } catch (err) {
      toast.error(`Ошибка удаления позиции: ${errorText(err)}`);
    }
  };

  const handleAddPositionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request || !newPosText.trim()) return;

    try {
      const res = await apiClient.addPosition(
        request.request_id,
        newPosText.trim(),
        parseFloat(newPosQty) || 1,
        newPosUnit.trim()
      );
      setRequest(res.data);
      setAddPosModalOpen(false);
      setNewPosText("");
      setNewPosQty("1");
      setNewPosUnit("шт.");
    } catch (err) {
      toast.error(`Ошибка добавления позиции: ${errorText(err)}`);
    }
  };

  const savePricing = async (patch: Partial<RequestPricing>) => {
    if (!request) return;
    try {
      const res = await apiClient.saveRequestPricing(request.request_id, patch);
      const prices = new Map(res.data.positions.map((row) => [row.position_id, row.sale_price]));
      setPricing(res.data);
      setRequest((current) => (current ? {
        ...current,
        pricing: res.data.pricing,
        positions: current.positions.map((position) => ({
          ...position, sale_price: prices.get(position.position_id) ?? null,
        })),
      } : current));
    } catch (err) {
      toast.error(`Не удалось пересчитать: ${errorText(err)}`);
    }
  };

  /** Подтверждаются отмеченные галочками строки; если отметок нет — только эта строка. */
  const confirmPositions = async (clickedId: number) => {
    if (!request) return;
    const targets = selectedPositionIds.length > 0 ? selectedPositionIds : [clickedId];
    const results = await Promise.allSettled(
      targets.map(async (positionId) => {
        await apiClient.updateRequestPosition(request.request_id, positionId, {
          quantity_confirmed: true,
          unit_confirmed: true,
        });
        return apiClient.updateRequestPosition(request.request_id, positionId, { status: "confirmed" });
      })
    );
    const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    setSelectedPositionIds([]);
    await loadRequest(request.request_id, true);
    // Одна строка показывает причину отказа у себя; тост нужен только для группы.
    if (targets.length > 1) {
      if (failed.length > 0) toast.warning(`Подтверждено: ${results.length - failed.length}, отклонено валидацией: ${failed.length}`);
      else toast.success(`Подтверждено позиций: ${results.length}`);
    }
    if (failed.length > 0) throw failed[0].reason;
  };


  if (loading) {
    return (
      <div className="stack">
        <style>
          {`
            @keyframes pulse {
              0% { opacity: 0.6; }
              50% { opacity: 0.3; }
              100% { opacity: 0.6; }
            }
            .skeleton {
              background-color: var(--color-bg-elevated);
              border-radius: var(--radius-md);
              animation: pulse 1.5s infinite;
              border: 1px solid var(--color-border);
            }
          `}
        </style>
        <div className="skeleton" style={{ height: "48px", width: "100%" }} />
        <div className="skeleton" style={{ height: "80px", width: "100%" }} />
        <div className="skeleton" style={{ height: "400px", width: "100%" }} />
      </div>
    );
  }

  if (error || !request) {
    return (
      <ErrorState
        message="Заявка не найдена"
        details={error || ""}
        onRetry={() => id && loadRequest(parseInt(id, 10))}
      />
    );
  }

  const readyCount = countReady(request);
  const canCreateInvoice = readyCount > 0;

  const visiblePositions = attentionOnly
    ? request.positions.filter(
        (p) => p.status !== "confirmed" || !p.retail_price || !p.purchase_price
      )
    : request.positions;

  const selectedInvoiceIds = selectedPositionIds.filter((positionId) =>
    request.positions.some(
      (p) => p.position_id === positionId && p.status === "confirmed" && !p.invoiced_operation_id
    )
  );

  const { sum: saleSum, unpriced } = requestSaleSum(request);
  const invoiceHint = request.positions.length === 0
    ? "В заявке нет позиций"
    : "Подтвердите хотя бы одну строку, чтобы сформировать счёт";

  const currentPricing: RequestPricing = pricing?.pricing ?? request.pricing ?? {
    pricing_mode: "discount", target_percent: 0, vat_enabled: false, vat_included: false, vat_rate: 0,
  };
  const createdLabel = formatDate(request.created_at);

  return (
    <div className="stack">
      {/* Топбар детального экрана */}
      <div className="detail-topbar">
        <Button
          variant="ghost"
          icon={<ArrowLeft size={16} strokeWidth={1.5} />}
          onClick={() => navigate("/requests")}
        >
          Назад к списку заявок
        </Button>

        <div className="detail-topbar__actions">
          <Button
            variant="secondary"
            icon={<Sparkles size={16} color="var(--color-accent)" strokeWidth={1.5} />}
            loading={matchingInProgress}
            disabled={request.positions.length === 0 || deleting}
            onClick={handleRunMatching}
          >
            Запустить сопоставление ИИ
          </Button>

          <Button
            variant="primary"
            disabled={!canCreateInvoice}
            aria-describedby={canCreateInvoice ? undefined : "invoice-hint"}
            icon={<Receipt size={16} strokeWidth={1.5} />}
            onClick={() => setPreviewOpen(true)}
          >
            Сформировать счёт покупателю
          </Button>
          <Button variant="danger-ghost" icon={<Trash size={16} />} disabled={matchingInProgress || deleting}
            onClick={() => setDeleteOpen(true)}>Удалить заявку</Button>
        </div>
      </div>

      {/* Индикатор хода сопоставления (§7.6 ТЗ) */}
      {matchingInProgress && (
        <Alert
          tone="accent"
          icon={<Sparkles size={16} strokeWidth={1.75} />}
          title="Идёт сопоставление позиций с каталогом"
        >
          Поиск товаров и предложений поставщиков. Дождитесь ответа сервера.
        </Alert>
      )}

      {request.positions.length === 0 && (
        <Alert tone="warning" title="В заявке пока нет позиций">
          Название «{request.client_name}» указано в поле клиента. Добавьте товар кнопкой «Добавить вручную», затем запустите сопоставление.
        </Alert>
      )}

      <ConfirmDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}
        title="Удалить заявку?"
        consequenceText={`Заявка ${request.doc_number} и все её позиции будут удалены без возможности восстановления. Заявку со связанным счётом удалить нельзя.`}
        confirmLabel="Удалить" variant="danger" loading={deleting} onConfirm={() => void handleDeleteRequest()} />

      <ConfirmDialog open={positionToDelete !== null}
        onOpenChange={(open) => { if (!open) setPositionToDelete(null); }}
        title="Удалить позицию?"
        consequenceText={`Позиция №${positionToDelete?.position_id ?? ""} «${positionToDelete?.raw_text ?? ""}» будет удалена из заявки.`}
        confirmLabel="Удалить" variant="danger"
        onConfirm={() => positionToDelete && void handleDeletePosition(positionToDelete.position_id)} />

      {/* Паспорт заявки */}
      <div className="panel panel--spaced request-passport">
        <div>
          <div className="passport-head__row">
            <h1 className="page__title">{request.doc_number}</h1>
            <RequestStatusBadge request={request} />
          </div>
          <div className="request-passport__meta">
            Контрагент: <strong>{request.client_name || "—"}</strong> · Создан: {createdLabel} · Файлов: {request.files.length}
          </div>
        </div>

        <div className="request-passport__sum">
          <div className="request-passport__metric">
            <span className="request-passport__sum-label">Готово к счёту</span>
            <span className="tabular-nums request-passport__sum-value">
              {readyCount} из {request.positions.length}
            </span>
            {!canCreateInvoice && <span id="invoice-hint" className="text-xs text-muted">{invoiceHint}</span>}
          </div>
          <div className="request-passport__metric">
            <span className="request-passport__sum-label">Сумма продажи</span>
            <span className="tabular-nums request-passport__sum-value">{saleSum > 0 ? money(saleSum) : "—"}</span>
            {unpriced > 0 && <span className="text-xs text-warning">без цены продажи: {unpriced}</span>}
          </div>
        </div>
      </div>

      {/* Настройки расчёта: один объект на заявку, пересчёт выполняет сервер */}
      <div className="panel panel--spaced pricing-bar">
        <span className="pricing-bar__label">Расчёт счёта</span>
        <label className="field">
          <span className="field__label">Режим</span>
          <select
            value={currentPricing.pricing_mode}
            onChange={(e) => void savePricing({ pricing_mode: e.target.value as RequestPricing["pricing_mode"] })}
          >
            <option value="discount">Скидка от розницы</option>
            <option value="margin">Целевая маржа</option>
          </select>
        </label>
        <Input
          label={currentPricing.pricing_mode === "discount" ? "Скидка, %" : "Маржа, %"}
          type="number"
          min="0"
          max="99.99"
          step="any"
          suffixText="%"
          value={percentDraft}
          onChange={(e) => setPercentDraft(e.target.value)}
          onBlur={() => void savePricing({ target_percent: Number(percentDraft) || 0 })}
        />
        <label className="field">
          <span className="field__label">НДС</span>
          <select
            value={currentPricing.vat_enabled ? String(currentPricing.vat_rate) : "none"}
            onChange={(e) => void savePricing({
              vat_enabled: e.target.value !== "none",
              vat_rate: e.target.value === "none" ? 0 : Number(e.target.value),
              vat_included: e.target.value === "none" ? false : currentPricing.vat_included,
            })}
          >
            <option value="none">Без НДС</option>
            {[0, 5, 7, 10, 20, 22].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
          </select>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            disabled={!currentPricing.vat_enabled}
            checked={currentPricing.vat_included}
            onChange={(e) => void savePricing({ vat_included: e.target.checked })}
          />
          НДС включён в цену
        </label>
        <span className="pricing-bar__total">
          К счёту: <strong className="tabular-nums">{pricing ? money(pricing.sum_total) : "—"}</strong>
        </span>
      </div>

      {/* Панель массовых действий */}
      <div className="toolbar">
        <div className="toolbar__group">
          <button
            type="button"
            className="chip"
            aria-pressed={attentionOnly}
            onClick={() => setAttentionOnly((value) => !value)}
          >
            Только требующие внимания
          </button>

        </div>

        <div className="toolbar__end">
          <Button
            variant="secondary"
            size="sm"
            icon={<PackageSearch size={15} strokeWidth={1.75} />}
            onClick={() => setAddFromCatalogOpen(true)}
          >
            Добавить из каталога
          </Button>

          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={15} strokeWidth={1.75} />}
            onClick={() => setAddPosModalOpen(true)}
          >
            Добавить вручную
          </Button>
        </div>
      </div>

      {/* Таблица позиций документа */}
      <Card
        title={`Позиции документа (${request.positions.length})`}
        flush
      >
        <PositionsTable
          request={{ ...request, positions: visiblePositions }}
          selectedIds={selectedPositionIds}
          onToggleSelect={toggleSelection}
          onToggleAll={() =>
            setSelectedPositionIds(
              visiblePositions.every((position) => selectedPositionIds.includes(position.position_id))
                ? []
                : visiblePositions.map((position) => position.position_id)
            )
          }
          onPick={(position) => {
            setActivePositionForMatch(position);
            setManualMatchModalOpen(true);
          }}
          onSplit={(position) => {
            setActivePositionForSplit(position);
            setSplitModalOpen(true);
          }}
          onDelete={setPositionToDelete}
          onSaved={mergePosition}
          onConfirm={confirmPositions}
        />
        {pricing && (pricing.excluded.length > 0 || pricing.warnings.length > 0 || pricing.blocking_reasons.length > 0) && (
          <div className="stack stack--tightest pricing-summary">
            {pricing.excluded.length > 0 && (
              <span className="text-xs text-warning">
                Не рассчитаны позиции: {pricing.excluded.join(", ")} — нужны розница, себестоимость и количество.
              </span>
            )}
            {pricing.warnings.map((warning) => <Alert key={warning} tone="warning">{warning}</Alert>)}
            {pricing.blocking_reasons.map((reason) => <Alert key={reason} tone="danger">{reason}</Alert>)}
            <span className="text-xs text-muted">
              Без НДС: {money(pricing.sum_without_vat)} · НДС: {money(pricing.sum_vat)} · Прибыль: {money(pricing.profit)}
            </span>
          </div>
        )}
      </Card>

      {/* Модальное окно предпросмотра и создания счёта (§7.7 ТЗ) */}
      <InvoicePreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        request={request}
        positionIds={selectedInvoiceIds.length > 0 ? selectedInvoiceIds : undefined}
        onInvoiceCreated={() => {
          apiClient.getRequestById(request.request_id).then(res => setRequest(res.data))
            .catch(err => toast.error(errorText(err)));
        }}
        onNavigateToInvoices={() => navigate("/invoices")}
      />

      {/* Модальное окно ручного подбора */}
      <ManualMatchModal
        open={manualMatchModalOpen}
        onOpenChange={setManualMatchModalOpen}
        rawText={activePositionForMatch?.raw_text || ""}
        onSelectMaterial={handleManualMatchSelect}
      />

      {/* Модальное окно добавления товара из каталога */}
      <ManualMatchModal
        open={addFromCatalogOpen}
        onOpenChange={setAddFromCatalogOpen}
        rawText=""
        onSelectMaterial={handleAddMaterialToRequest}
      />

      {/* Модальное окно разделения строки */}
      <SplitPositionModal
        open={splitModalOpen}
        onOpenChange={setSplitModalOpen}
        position={activePositionForSplit}
        onSplit={handleSplitPosition}
      />

      {/* Модальное окно добавления позиции вручную */}
      <Modal
        open={addPosModalOpen}
        onOpenChange={setAddPosModalOpen}
        title="Добавление позиции в заявку"
        description="Введите текст позиции, требуемое количество и единицу измерения"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddPosModalOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={15} strokeWidth={1.75} />}
              onClick={handleAddPositionSubmit}
              disabled={!newPosText.trim() || !newPosQty}
            >
              Добавить позицию
            </Button>
          </>
        }
      >
        <form
          onSubmit={handleAddPositionSubmit}
          className="form-stack"
        >
          <Input
            label="Текст позиции"
            requiredMark
            placeholder="Например: Саморезы по дереву 3.5х35 (1000 шт)"
            value={newPosText}
            onChange={(e) => setNewPosText(e.target.value)}
            autoFocus
          />
          <div className="form-grid form-grid--1-1">
            <Input
              type="number"
              step="any"
              label="Количество"
              requiredMark
              value={newPosQty}
              onChange={(e) => setNewPosQty(e.target.value)}
            />
            <Input
              label="Ед. изм."
              requiredMark
              value={newPosUnit}
              onChange={(e) => setNewPosUnit(e.target.value)}
            />
          </div>
        </form>
      </Modal>

      {/* Плавающая панель массовых действий над выбранными позициями */}
      {selectedPositionIds.length > 0 && (
        <div className="action-bar" role="region" aria-label="Действия над выбранными позициями">
          <span className="action-bar__count">Выбрано: {selectedPositionIds.length}</span>
          <span className="action-bar__divider" />

          <Button
            variant="secondary"
            size="sm"
            icon={<Check size={15} strokeWidth={2} />}
            onClick={() => {
              confirmPositions(selectedPositionIds[0]).catch((err) => toast.error(errorText(err)));
            }}
          >
            Подтвердить
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Trash size={15} strokeWidth={1.75} />}
            onClick={() => {
              Promise.all(selectedPositionIds.map(id => apiClient.deletePosition(request.request_id, id)))
                .then(() => { setSelectedPositionIds([]); loadRequest(request.request_id); })
                .catch(e => toast.error(errorText(e)));
            }}
          >
            Удалить
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<X size={15} strokeWidth={1.75} />}
            onClick={() => setSelectedPositionIds([])}
          >
            Отмена
          </Button>
        </div>
      )}
    </div>
  );
};
