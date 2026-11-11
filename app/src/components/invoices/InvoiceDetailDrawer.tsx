import React, { useEffect, useState } from "react";
import { Copy, Check, X, ExternalLink, RefreshCw, Truck, Wallet, TrendingUp } from "lucide-react";
import type { Invoice } from "../../types/models";
import { date as formatDate, money, percent } from "../../lib/format";
import { Badge, CountPill } from "../common/Badge";
import { Button } from "../common/Button";
import { IconButton } from "../common/IconButton";
import { EmptyState } from "../common/EmptyState";
import { Alert } from "../common/Alert";

export interface InvoiceDetailDrawerProps {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
  onRetry?: (invoiceId: number) => Promise<void>;
  retrying?: boolean;
  /** Переход к документу, из которого собран счёт. */
  onOpenSource?: () => void;
}

/** Карточка сводного показателя: иконка + подпись + значение. */
const MetricTile: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "accent" | "neutral" | "success";
}> = ({ label, value, icon, tone = "neutral" }) => (
  <div className="metric" data-tone={tone}>
    <span className="metric__icon" aria-hidden="true">
      {icon}
    </span>
    <span className="metric__label">{label}</span>
    <span className="metric__value">{value}</span>
  </div>
);

/** Строка «подпись — значение» в паспорте документа. */
const PassportRow: React.FC<{ label: string; value: React.ReactNode; wide?: boolean }> = ({
  label,
  value,
  wide,
}) => (
  <div className="passport__row" data-wide={wide ? "true" : "false"}>
    <span className="passport__label">{label}</span>
    <span className="passport__value">{value}</span>
  </div>
);

export const InvoiceDetailDrawer: React.FC<InvoiceDetailDrawerProps> = ({
  invoice,
  open,
  onClose,
  onRetry,
  retrying = false,
  onOpenSource,
}) => {
  const [copySuccess, setCopySuccess] = useState(false);

  // Esc закрывает шторку — стандартное поведение для overlay-поверхностей
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !invoice) return null;

  const handleCopyLink = () => {
    if (invoice.moysklad_href) {
      void navigator.clipboard.writeText(invoice.moysklad_href);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const getStatusBadge = (status: Invoice["status"]) => {
    switch (status) {
      case "created":
        return (
          <Badge variant="success" icon={<Check size={12} strokeWidth={2.25} />} pill>
            Создан в «МойСклад»
          </Badge>
        );
      case "paid":
        return (
          <Badge variant="accent" icon={<Wallet size={12} strokeWidth={1.75} />} pill>
            Оплачен
          </Badge>
        );
      case "shipped":
        return (
          <Badge variant="violet" icon={<Truck size={12} strokeWidth={1.75} />} pill>
            Отгружен
          </Badge>
        );
      case "error":
        return <Badge variant="danger" pill>Ошибка отправки</Badge>;
      default:
        return <Badge variant="neutral" pill>Черновик</Badge>;
    }
  };

  const totalMarginSum = (invoice.positions || []).reduce((acc, p) => acc + (p.margin_sum || 0), 0);
  const totalMarginPct =
    invoice.actual_margin ?? (invoice.sum_without_vat ? totalMarginSum / invoice.sum_without_vat * 100 : 0);

  const fmt = (n: number) => money(n);
  const positions = invoice.positions ?? [];

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />
      <aside
        className="drawer drawer--wide"
        role="dialog"
        aria-modal="true"
        aria-label={`Счёт ${invoice.number}`}
      >
        <header className="drawer__header">
          <div className="invoice-drawer__title">
            <div className="invoice-drawer__title-row">
              <span className="invoice-drawer__number">{invoice.number}</span>
              {getStatusBadge(invoice.status)}
            </div>
            <div className="invoice-drawer__subtitle">
              Счёт покупателю от {formatDate(invoice.doc_date)} · заявка № {invoice.request_id}
            </div>
          </div>
          <IconButton
            icon={<X size={18} strokeWidth={1.75} />}
            tooltip="Закрыть"
            onClick={onClose}
          />
        </header>

        <div className="drawer__body">
          {onOpenSource && (
            <div className="row">
              <Button variant="secondary" size="sm" onClick={onOpenSource}>
                Открыть исходный документ
              </Button>
            </div>
          )}

          {invoice.status === "error" && (
            <Alert
              tone="danger"
              title="Ошибка при синхронизации с «МойСклад»"
              action={
                onRetry ? (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={retrying}
                    icon={<RefreshCw size={14} strokeWidth={1.75} />}
                    onClick={() => void onRetry(invoice.invoice_id)}
                  >
                    Отправить повторно
                  </Button>
                ) : undefined
              }
            >
              {invoice.error_text || "Неизвестная ошибка API"}
            </Alert>
          )}

          {invoice.moysklad_href && (
            <div className="invoice-drawer__link panel panel--pad">
              <a
                className="invoice-drawer__link-anchor"
                href={invoice.moysklad_href}
                target="_blank"
                rel="noreferrer"
              >
                Открыть в «МойСклад»
                <ExternalLink size={15} strokeWidth={1.75} aria-hidden="true" />
              </a>
              <Button
                variant="secondary"
                size="sm"
                icon={
                  copySuccess ? (
                    <Check size={14} strokeWidth={2.25} />
                  ) : (
                    <Copy size={14} strokeWidth={1.75} />
                  )
                }
                onClick={handleCopyLink}
              >
                {copySuccess ? "Скопировано" : "Копировать ссылку"}
              </Button>
            </div>
          )}

          {/* Паспорт документа */}
          <section className="panel">
            <div className="panel__header">
              <h3 className="panel__title">Паспорт документа</h3>
            </div>
            <div className="passport">
              {invoice.operation_state && <PassportRow label="Состояние операции" value={invoice.operation_state} />}
              {invoice.settings && <>
                <PassportRow label="Режим / цель" value={`${invoice.settings.pricing_mode === 'discount' ? 'Скидка' : 'Маржа'} / ${invoice.settings.target_percent}%`} />
                <PassportRow label="НДС включён в цену" value={invoice.settings.vat_included ? 'Да' : 'Нет'} />
                <PassportRow label="Скидка / маржа фактически" value={`${percent(invoice.actual_discount)} / ${percent(invoice.actual_margin)}`} />
              </>}
              <PassportRow label="Контрагент" value={<strong>{invoice.client_name}</strong>} />
              <PassportRow label="Организация" value={invoice.organization || "—"} />
              <PassportRow label="Склад" value={invoice.warehouse || "—"} />
              <PassportRow label="НДС / Валюта" value={`${invoice.vat_rate || "—"} / RUB (₽)`} />
              {invoice.comment && (
                <PassportRow label="Комментарий" value={<em>{invoice.comment}</em>} wide />
              )}
            </div>
          </section>

          {/* Сводные показатели */}
          <div className="metrics">
            <MetricTile
              label="Сумма с НДС"
              value={fmt(invoice.sum_total)}
              icon={<Wallet size={14} strokeWidth={1.75} />}
              tone="accent"
            />
            <MetricTile
              label="Закупка"
              value={invoice.sum_purchase == null ? "—" : fmt(invoice.sum_purchase)}
              icon={<Truck size={14} strokeWidth={1.75} />}
            />
            <MetricTile
              label="Маржа"
              value={percent(totalMarginPct)}
              icon={<TrendingUp size={14} strokeWidth={1.75} />}
              tone="success"
            />
          </div>

          {/* Состав позиций */}
          <section className="panel">
            <div className="panel__header">
              <h3 className="panel__title">Состав документа</h3>
              <CountPill>{positions.length || invoice.positions_count}</CountPill>
            </div>

            {positions.length > 0 ? (
              <div className="dt dt--flush">
                <div className="dt__scroll">
                  <table className="dt__table dt--compact">
                    <colgroup>
                      <col />
                      <col style={{ width: 84 }} />
                      <col style={{ width: 96 }} />
                      <col style={{ width: 104 }} />
                    </colgroup>
                    <thead className="dt__thead">
                      <tr>
                        <th scope="col">Наименование</th>
                        <th scope="col" className="dt__right">Кол-во</th>
                        <th scope="col" className="dt__right">Цена</th>
                        <th scope="col" className="dt__right">Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos, idx) => (
                        <tr key={pos.position_id || idx} className="dt__row">
                          <td>
                            <div className="dt__strong dt__truncate">{pos.name}</div>
                            <div className="dt__muted">
                              {pos.supplier} · {pos.code}
                            </div>
                          </td>
                          <td className="dt__right dt__numeric">
                            {pos.qty} {pos.unit}
                          </td>
                          <td className="dt__right dt__numeric">
                            {money(pos.price_final)}
                          </td>
                          <td className="dt__right dt__numeric dt__strong">
                            {money(pos.sum_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <EmptyState
                compact
                icon={<Truck size={24} strokeWidth={1.5} />}
                title="Детализация строк не загружена"
                description="Состав документа появится после синхронизации с «МойСклад»"
              />
            )}
          </section>
        </div>
      </aside>
    </>
  );
};
