import React, { useEffect, useState, useCallback } from "react";
import { Check, AlertTriangle, ExternalLink, Copy, Receipt, Warehouse, Store, Calendar } from "lucide-react";
import { money, percent } from "../../lib/format";
import { apiClient } from "../../api/client";
import type { Invoice, ClientRequest } from "../../types/models";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { Badge } from "../common/Badge";
import { Alert } from "../common/Alert";
import { Spinner } from "../common/Spinner";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { errorText } from "../../lib/errors";

export interface InvoicePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ClientRequest;
  onInvoiceCreated: (invoice: Invoice) => void;
  onNavigateToInvoices?: () => void;
  /** Строки, выбранные оператором для частичного счёта. */
  positionIds?: number[];
}

export const DemoInvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  open,
  onOpenChange,
  request,
  onInvoiceCreated,
  onNavigateToInvoices,
}) => {
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    invoice_preview: Invoice;
    blocking_reasons: string[];
    warnings: string[];
    existing_invoice?: Invoice;
  } | null>(null);

  // Реквизиты
  const [clientName, setClientName] = useState(request.client_name || "");
  const [organization, setOrganization] = useState("ООО «Снабдика»");
  const [warehouse, setWarehouse] = useState("Основной склад СПБ");
  const [docDate, setDocDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [comment, setComment] = useState(`Счёт по клиентскому запросу №${request.doc_number}`);
  // Настройки расчёта живут в шапке заявки; демо-окно только читает их.
  const pricing = request.pricing ?? {
    pricing_mode: "discount" as const, target_percent: 0, vat_enabled: false, vat_included: false, vat_rate: 0,
  };
  const vatRate = pricing.vat_enabled ? `${pricing.vat_rate}%` : "Без НДС";
  const [simulateError, setSimulateError] = useState(false);

  // Состояние создания
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPreview = useCallback(
    async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const res = await apiClient.previewInvoice(request.request_id);
        setPreviewData(res.data);
      } catch (err) {
        setErrorMessage(errorText(err));
      } finally {
        setLoading(false);
      }
    },
    [request.request_id]
  );

  useEffect(() => {
    if (open) {
      setCreatedInvoice(null);
      setErrorMessage(null);
      setClientName(request.client_name || "");
      loadPreview();
    }
  }, [open, request.client_name, request.pricing, loadPreview]);

  const handleCreateConfirmed = async () => {
    try {
      setSubmitting(true);
      setErrorMessage(null);
      const res = await apiClient.createInvoice({
        request_id: request.request_id,
        client_name: clientName,
        organization,
        warehouse,
        doc_date: docDate,
        vat_rate: vatRate,
        comment,
        simulate_error: simulateError,
      });

      setCreatedInvoice(res.data);
      onInvoiceCreated(res.data);
    } catch (err) {
      setErrorMessage(errorText(err));
    } finally {
      setSubmitting(false);
      setConfirmSubmitOpen(false);
    }
  };

  const handleCopyLink = () => {
    if (createdInvoice?.moysklad_href) {
      navigator.clipboard.writeText(createdInvoice.moysklad_href);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const invoice = previewData?.invoice_preview;
  const isExistingInvoice = Boolean(previewData?.existing_invoice);
  const missingInn = !clientName.match(/\d{10,12}/);
  const hasZeroPrice = invoice?.positions?.some(p => p.price_retail === 0 || p.sum_total === 0);
  const hasBlockingReasons = (previewData?.blocking_reasons.length || 0) > 0 || !clientName.trim();

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title="Счёт: предпросмотр и создание"
    description="Контроль реквизитов документа и маржинальности до отправки в «МойСклад»"
        maxWidth="960px"
      >
        {createdInvoice ? (
          <div className="result-screen">
            {createdInvoice.status === "created" ? (
              <>
                <div className="result-screen__icon" data-tone="success">
                  <Check size={32} strokeWidth={2.5} />
                </div>
                <h3 className="result-screen__title">
                  Счёт успешно создан в «МойСклад»!
                </h3>
                <p className="result-screen__text">
                  Документ зарегистрирован под номером{" "}
                  <strong className="mono">
                    {createdInvoice.number}
                  </strong>{" "}
                  от {createdInvoice.doc_date} на сумму{" "}
                  <strong className="tabular-nums result-screen__accent">
                    {money(createdInvoice.sum_total)}
                  </strong>
                </p>

                {createdInvoice.moysklad_href && (
                  <div className="result-screen__actions">
                    <a
                      href={createdInvoice.moysklad_href}
                      target="_blank"
                      rel="noreferrer"
                      className="link-button"
                    >
                      Открыть документ в МойСклад <ExternalLink size={16} />
                    </a>
                    <Button variant="secondary" icon={<Copy size={16} />} onClick={handleCopyLink}>
                      {copySuccess ? "Скопировано!" : "Скопировать ссылку"}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="result-screen__icon" data-tone="danger">
                  <AlertTriangle size={32} strokeWidth={2.5} />
                </div>
                <h3 className="result-screen__title">
                  Счёт сохранён с ошибкой отправки
                </h3>
                <p className="result-screen__error">
                  {createdInvoice.error_text}
                </p>
                <p className="result-screen__note">
                  Документ сохранён со статусом «Ошибка» под номером {createdInvoice.number}. Вы можете отправить его повторно
                  из реестра счетов.
                </p>
              </>
            )}

            <div className="result-screen__actions">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Закрыть
              </Button>
              {onNavigateToInvoices && (
                <Button
                  variant="primary"
                  icon={<Receipt size={16} />}
                  onClick={() => {
                    onOpenChange(false);
                    onNavigateToInvoices();
                  }}
                >
                  Перейти в раздел «Счета»
                </Button>
              )}
            </div>
          </div>
        ) : loading ? (
          <div className="modal__loader">
            <Spinner size={32} />
          </div>
        ) : errorMessage ? (
          <Alert tone="danger">
            {errorMessage}
          </Alert>
        ) : invoice ? (
          <div className="stack">
            {/* Paper Document Preview */}
            <div className="paper-doc">
              {missingInn && (
                <Alert tone="danger" title="Не указан ИНН контрагента">
                  Без ИНН документ не будет принят в «МойСклад». Укажите 10 или 12 цифр ИНН в
                  наименовании контрагента.
                </Alert>
              )}
              {hasZeroPrice && (
                <Alert tone="danger" title="В счёте есть позиции с нулевой ценой">
                  Отправка документа с нулевыми ценами приведёт к ошибке выгрузки. Проверьте
                  строки, по которым не определена цена закупки.
                </Alert>
              )}
            {/* Блокирующие ошибки */}
            {previewData?.blocking_reasons && previewData.blocking_reasons.length > 0 && (
       <Alert tone="danger" title="Блокирующие условия создания счёта">
                <ul className="alert__list">
                  {previewData.blocking_reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {/* Предупреждения (например, отрицательная маржа) */}
            {previewData?.warnings && previewData.warnings.length > 0 && (
              <Alert tone="warning" title="Предупреждения по рентабельности строк">
                <ul className="alert__list">
                  {previewData.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {/* Блок 1: Реквизиты документа */}
            <div className="requisites-grid">
              <div>
                <Input
                  label="Контрагент (покупатель)"
                  requiredMark
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Наименование организации или ФИО"
                  icon={<Store size={15} strokeWidth={1.75} />}
                  error={
                    missingInn && clientName.trim()
                      ? "В наименовании не найден ИНН (10 или 12 цифр)"
                      : undefined
                  }
                />
              </div>

              <div>
                <Input
                  label="Организация (продавец)"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  icon={<Store size={15} strokeWidth={1.75} />}
                />
              </div>

              <div>
                <Input
                  label="Склад отгрузки"
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  icon={<Warehouse size={15} strokeWidth={1.75} />}
                />
              </div>

              <div>
                <Input
                  label="Дата документа"
                  type="date"
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                  icon={<Calendar size={15} strokeWidth={1.75} />}
                />
              </div>

              <div className="field">
                <span className="field__label">Расчёт счёта</span>
                <div className="readonly-value">
                  {pricing.pricing_mode === "discount" ? "Скидка" : "Маржа"} {pricing.target_percent}% · НДС {vatRate}
                  {pricing.vat_included ? " включён в цену" : ""}
                </div>
              </div>

              <div className="field">
                <span className="field__label">Валюта расчётов</span>
                <div className="readonly-value">
                  Российский рубль (RUB, ₽)
                </div>
              </div>

              <div className="grid-full">
                <Input
                  label="Комментарий к счёту"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Дополнительные условия или реквизиты объекта"
                />
              </div>
            </div>

            {/* Блок 2: Таблица позиций */}
            <div className="dt">
              <div className="dt__scroll dt__scroll--260">
                <table className="dt__table dt--compact">
                  <colgroup>
                    <col style={{ width: 36 }} />
                    <col />
                    <col style={{ width: 74 }} />
                    <col style={{ width: 54 }} />
                    <col style={{ width: 96 }} />
                    <col style={{ width: 96 }} />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 92 }} />
                    <col style={{ width: 104 }} />
                  </colgroup>
                  <thead className="dt__thead">
                    <tr>
                      <th scope="col">№</th>
                      <th scope="col">Наименование / Код</th>
                      <th scope="col" className="dt__right">Кол-во</th>
                      <th scope="col">Ед.</th>
                      <th scope="col" className="dt__right">Цена прод.</th>
                      <th scope="col" className="dt__right">Сумма</th>
                      <th scope="col">Поставщик</th>
                      <th scope="col" className="dt__right">Закупка</th>
                      <th scope="col" className="dt__right">Маржа (%)</th>
                    </tr>
                  </thead>
                <tbody>
                  {invoice.positions && invoice.positions.length > 0 ? (
                    invoice.positions.map((pos, idx) => {
                      const isNegativeMargin = pos.margin_sum < 0;
                      const isLowMargin = pos.margin_percent < 10 && pos.margin_percent >= 0;
                      return (
                        <tr
                          key={pos.position_id}
                          className="dt__row"
                          data-margin={isNegativeMargin ? "negative" : isLowMargin ? "low" : undefined}
                        >
                          <td className="dt__muted">{idx + 1}</td>
                          <td>
                            <div className="dt__strong dt__truncate">{pos.name}</div>
                            <div className="dt__muted dt__mono">{pos.code}</div>
                          </td>
                          <td className="dt__right dt__numeric dt__strong">{pos.qty}</td>
                          <td className="dt__muted">{pos.unit}</td>
                          <td className="dt__right dt__numeric">
                            {money(pos.price_retail)}
                          </td>
                          <td className="dt__right dt__numeric dt__strong">
                            {money(pos.sum_total)}
                          </td>
                          <td>
                            <Badge variant="neutral" pill>{pos.supplier}</Badge>
                          </td>
                          <td className="dt__right dt__numeric dt__muted">
                            {money(pos.price_purchase)}
                          </td>
                          <td className="dt__right">
                            <span
                              className={
                                isNegativeMargin
                                  ? "price-warn"
                                  : isLowMargin
                                  ? "margin-low"
                                  : "margin-ok"
                              }
                              title={
                                isNegativeMargin
                                  ? "Отрицательная маржа — строка убыточна"
                                  : isLowMargin
                                  ? "Маржа ниже 10% — требуется подтверждение"
                                  : undefined
                              }
                            >
                              {percent(pos.margin_percent)} ({money(pos.margin_sum)})
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="dt__empty" colSpan={9}>
                        Нет позиций для формирования счёта
                      </td>
                    </tr>
                  )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Блок 3: Итоги документа */}
            <div className="totals-grid">
              <div className="totals-grid__cell">
                <span className="totals-grid__label">Позиций / Единиц</span>
                <span className="tabular-nums totals-grid__value">{invoice.positions_count} поз.</span>
              </div>

              <div className="totals-grid__cell">
                <span className="totals-grid__label">Сумма без НДС</span>
                <span className="tabular-nums totals-grid__value">
                  {money(invoice.sum_without_vat)}
                </span>
              </div>

              <div className="totals-grid__cell">
                <span className="totals-grid__label">Сумма НДС ({vatRate})</span>
                <span className="tabular-nums totals-grid__value">
                  {money(invoice.sum_vat)}
                </span>
              </div>

              <div className="totals-grid__cell">
                <span className="totals-grid__label">Сумма закупки (себест.)</span>
                <span className="tabular-nums totals-grid__value totals-grid__value--muted">
                  {money(invoice.sum_purchase)}
                </span>
              </div>

              <div className="totals-grid__cell">
                <span className="totals-grid__label">ИТОГО К ОПЛАТЕ</span>
                <span className="tabular-nums totals-grid__total">
                  {money(invoice.sum_total)}
                </span>
              </div>
            </div>

            </div>
            {/* Нижняя панель действий */}
            <div className="action-row">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={simulateError}
                  onChange={(e) => setSimulateError(e.target.checked)}
                />
                Имитировать сбой API «МойСклад»
              </label>

              <div className="action-row__actions">
                <Button variant="secondary" onClick={() => onOpenChange(false)}>
                  Отмена
                </Button>
                <Button
                  variant="primary"
                  icon={<Receipt size={16} />}
                  disabled={hasBlockingReasons || isExistingInvoice}
                  onClick={() => setConfirmSubmitOpen(true)}
                >
                  Создать счёт в «МойСклад»
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Диалог подтверждения создания (§7.7 п. 5 ТЗ) */}
      <ConfirmDialog
        open={confirmSubmitOpen}
        title="Подтверждение создания счёта"
        message={`Будет создан счёт покупателю «${clientName}» на сумму ${money(invoice?.sum_total)} в сервисе «МойСклад». Счёт зафиксирует сопоставленные позиции заявки. Продолжить?`}
        confirmLabel="Создать счёт"
        cancelLabel="Вернуться"
        onConfirm={handleCreateConfirmed}
        onCancel={() => setConfirmSubmitOpen(false)}
        loading={submitting}
      />
    </>
  );
};

